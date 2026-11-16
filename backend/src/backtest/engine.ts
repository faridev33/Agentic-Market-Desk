import { AppError } from "../lib/errors.js";
import { atr, rsi, sma } from "../lib/indicators.js";
import { round } from "../lib/math.js";
import type { Candle } from "../types.js";
import {
  computeMetrics,
  type BacktestMetrics,
  type EquityPoint,
  type ExitReason,
  type TradeRecord,
} from "./metrics.js";

export interface StrategyParams {
  fastSma: number;
  slowSma: number;
  rsiPeriod: number;
  rsiEntryMax: number;
  atrPeriod: number;
  stopAtrMult: number;
}

export const DEFAULT_STRATEGY_PARAMS: StrategyParams = {
  fastSma: 50,
  slowSma: 200,
  rsiPeriod: 14,
  rsiEntryMax: 70,
  atrPeriod: 14,
  stopAtrMult: 2.5,
};

export interface BacktestOptions {
  params?: Partial<StrategyParams>;
  initialEquity?: number;
  feeBps?: number;
  slippageBps?: number;
  tradeFromIndex?: number;
  riskFreeRatePct?: number;
  liquidateAtEnd?: boolean;
}

export interface BacktestResult {
  params: StrategyParams;
  startDate: string;
  endDate: string;
  bars: number;
  equityCurve: EquityPoint[];
  trades: TradeRecord[];
  metrics: BacktestMetrics;
  warnings: string[];
}

interface OpenPosition {
  date: string;
  price: number;
  shares: number;
  fee: number;
  index: number;
}

function validateParams(params: StrategyParams): void {
  const integers: Array<[string, number]> = [
    ["fastSma", params.fastSma],
    ["slowSma", params.slowSma],
    ["rsiPeriod", params.rsiPeriod],
    ["atrPeriod", params.atrPeriod],
  ];
  for (const [name, value] of integers) {
    if (!Number.isInteger(value) || value < 2) {
      throw new AppError(`${name} harus bilangan bulat >= 2.`, 400, "invalid_params");
    }
  }
  if (params.fastSma >= params.slowSma) {
    throw new AppError("fastSma harus lebih kecil dari slowSma.", 400, "invalid_params");
  }
  if (params.rsiEntryMax <= 0 || params.rsiEntryMax > 100) {
    throw new AppError("rsiEntryMax harus di antara 0 dan 100.", 400, "invalid_params");
  }
  if (params.stopAtrMult <= 0) {
    throw new AppError("stopAtrMult harus lebih dari 0.", 400, "invalid_params");
  }
}

/**
 * Backtest long-only berbasis tren + momentum.
 * Sinyal dihitung dari data hingga penutupan hari t, lalu dieksekusi pada
 * pembukaan hari t+1 sehingga tidak ada look-ahead.
 */
export function runBacktest(
  candles: readonly Candle[],
  options: BacktestOptions = {},
): BacktestResult {
  const params: StrategyParams = { ...DEFAULT_STRATEGY_PARAMS, ...options.params };
  validateParams(params);

  if (candles.length < 60) {
    throw new AppError(
      `Data harga tidak cukup untuk backtest (${candles.length} candle, minimal 60).`,
      422,
      "insufficient_data",
      { available: candles.length, required: 60 },
    );
  }

  const initialEquity = options.initialEquity ?? 10_000;
  if (!Number.isFinite(initialEquity) || initialEquity <= 0) {
    throw new AppError("initialEquity harus lebih dari 0.", 400, "invalid_params");
  }

  const feeRate = (options.feeBps ?? 10) / 10_000;
  const slippageRate = (options.slippageBps ?? 5) / 10_000;
  if (feeRate < 0 || slippageRate < 0) {
    throw new AppError("Biaya dan slippage tidak boleh negatif.", 400, "invalid_params");
  }

  const closes = candles.map((candle) => candle.close);
  const fastSeries = sma(closes, params.fastSma);
  const slowSeries = sma(closes, params.slowSma);
  const rsiSeries = rsi(closes, params.rsiPeriod);
  const atrSeries = atr(candles, params.atrPeriod);

  const warmupIndex = Math.max(params.slowSma, params.rsiPeriod, params.atrPeriod) + 1;
  const startIndex = Math.max(options.tradeFromIndex ?? 0, warmupIndex);
  if (startIndex >= candles.length - 5) {
    throw new AppError(
      "Data tidak cukup setelah periode pemanasan indikator.",
      422,
      "insufficient_data",
      { available: candles.length, startIndex, required: startIndex + 6 },
    );
  }

  const liquidateAtEnd = options.liquidateAtEnd ?? true;
  const warnings: string[] = [];
  const trades: TradeRecord[] = [];
  const curve: EquityPoint[] = [];

  let cash = initialEquity;
  let shares = 0;
  let pending: "buy" | "sell" | null = null;
  let pendingAtr: number | null = null;
  let stopPrice: number | null = null;
  let entry: OpenPosition | null = null;

  const closePosition = (
    execPrice: number,
    index: number,
    reason: ExitReason,
    exitDate: string,
  ): void => {
    if (!entry || shares <= 0) return;
    const notional = shares * execPrice;
    const exitFee = notional * feeRate;
    const proceeds = notional - exitFee;
    const costBasis = entry.shares * entry.price + entry.fee;
    const pnl = proceeds - costBasis;
    trades.push({
      entryDate: entry.date,
      exitDate,
      entryPrice: round(entry.price, 4),
      exitPrice: round(execPrice, 4),
      shares: Math.round(shares * 10_000) / 10_000,
      pnl: round(pnl, 2),
      returnPct: costBasis > 0 ? round((pnl / costBasis) * 100, 3) : 0,
      barsHeld: index - entry.index,
      exitReason: reason,
      fees: round(entry.fee + exitFee, 2),
    });
    cash += proceeds;
    shares = 0;
    entry = null;
    stopPrice = null;
  };

  for (let i = startIndex; i < candles.length; i += 1) {
    const candle = candles[i];

    if (pending === "buy" && shares === 0) {
      const execPrice = candle.open * (1 + slippageRate);
      const notional = cash / (1 + feeRate);
      const newShares = notional / execPrice;
      if (newShares > 0 && Number.isFinite(newShares)) {
        const entryFee = notional * feeRate;
        cash -= notional + entryFee;
        if (Math.abs(cash) < 1e-6) cash = 0;
        shares = newShares;
        const stopDistance =
          pendingAtr !== null && pendingAtr > 0
            ? Math.max(pendingAtr * params.stopAtrMult, execPrice * 0.01)
            : execPrice * 0.03;
        stopPrice = Math.max(execPrice - stopDistance, execPrice * 0.5);
        entry = {
          date: candle.date,
          price: execPrice,
          shares: newShares,
          fee: entryFee,
          index: i,
        };
      }
      pending = null;
      pendingAtr = null;
    } else if (pending === "sell" && shares > 0) {
      closePosition(candle.open * (1 - slippageRate), i, "signal", candle.date);
      pending = null;
    }

    if (shares > 0 && stopPrice !== null && candle.low <= stopPrice) {
      const execBase = Math.min(candle.open, stopPrice);
      closePosition(execBase * (1 - slippageRate), i, "stop", candle.date);
      pending = null;
    }

    curve.push({
      date: candle.date,
      equity: cash + shares * candle.close,
      position: shares > 0 ? 1 : 0,
    });

    if (i < candles.length - 1) {
      const fast = fastSeries[i];
      const slow = slowSeries[i];
      const rsiValue = rsiSeries[i];
      const entrySignal =
        shares === 0 &&
        fast !== null &&
        slow !== null &&
        rsiValue !== null &&
        fast > slow &&
        closes[i] > fast &&
        rsiValue < params.rsiEntryMax;
      const exitSignal =
        shares > 0 &&
        fast !== null &&
        slow !== null &&
        (closes[i] < fast || fast < slow);

      if (entrySignal) {
        pending = "buy";
        pendingAtr = atrSeries[i];
      } else if (exitSignal) {
        pending = "sell";
      }
    }
  }

  const lastCandle = candles[candles.length - 1];
  if (shares > 0 && liquidateAtEnd) {
    closePosition(lastCandle.close * (1 - slippageRate), candles.length - 1, "final_liquidation", lastCandle.date);
    curve[curve.length - 1] = {
      date: lastCandle.date,
      equity: cash,
      position: 0,
    };
  } else if (shares > 0) {
    warnings.push("Posisi masih terbuka di akhir periode dan tidak dilikuidasi (ditandai ke harga pasar).");
  }

  if (trades.length === 0) {
    warnings.push("Strategi tidak menghasilkan transaksi pada periode ini.");
  }
  if (candles.length < 252) {
    warnings.push("Riwayat < 252 candle; hasil backtest kurang stabil.");
  }

  const buyHoldReturnPct =
    closes[startIndex] > 0
      ? ((closes[candles.length - 1] / closes[startIndex]) - 1) * 100
      : 0;

  return {
    params,
    startDate: candles[startIndex].date,
    endDate: lastCandle.date,
    bars: candles.length - startIndex,
    equityCurve: curve,
    trades,
    metrics: computeMetrics(
      curve,
      trades,
      buyHoldReturnPct,
      options.riskFreeRatePct ?? 0,
    ),
    warnings,
  };
}
