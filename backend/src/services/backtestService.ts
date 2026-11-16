import { AppError, isAppError } from "../lib/errors.js";
import type { MarketDataProviders } from "../providers/types.js";
import type { AppConfig } from "../config.js";
import type { HistoryInterval, HistoryRange } from "../providers/types.js";
import {
  runBacktest,
  type BacktestResult,
  type StrategyParams,
} from "../backtest/engine.js";
import {
  walkForward,
  type WalkForwardResult,
} from "../backtest/walkForward.js";

const BACKTEST_NOTES = [
  "Eksekusi memakai harga pembukaan hari berikutnya setelah sinyal penutupan; tidak ada look-ahead.",
  "Biaya transaksi dan slippage diterapkan pada setiap sisi transaksi. Pajak, dividen, dan biaya pinjam tidak dimodelkan.",
  "Data Yahoo Finance dapat mengandung survivorship bias untuk emiten yang delisting.",
  "Hasil backtest bukan jaminan kinerja masa depan.",
];

export interface BacktestRequest {
  symbol: string;
  range: HistoryRange;
  interval: HistoryInterval;
  initialEquity: number;
  feeBps: number;
  slippageBps: number;
  params?: Partial<StrategyParams>;
  walkForward: boolean;
  trainBars: number;
  testBars: number;
}

export interface BacktestResponse {
  symbol: string;
  currency: string | null;
  range: HistoryRange;
  interval: HistoryInterval;
  bars: number;
  dataFetchedAt: string;
  dataStartDate: string;
  dataEndDate: string;
  single: BacktestResult;
  walkForward: WalkForwardResult | null;
  walkForwardSkippedReason: string | null;
  notes: string[];
}

export class BacktestService {
  constructor(
    private readonly providers: MarketDataProviders,
    private readonly config: AppConfig,
  ) {}

  async run(request: BacktestRequest): Promise<BacktestResponse> {
    const series = await this.providers.history(request.symbol, {
      range: request.range,
      interval: request.interval,
    });

    if (series.candles.length < 250) {
      throw new AppError(
        `Riwayat ${request.symbol} hanya ${series.candles.length} candle; minimal 250 untuk backtest yang layak.`,
        422,
        "insufficient_data",
        { available: series.candles.length, required: 250 },
      );
    }

    const costs = {
      initialEquity: request.initialEquity,
      feeBps: request.feeBps,
      slippageBps: request.slippageBps,
    };

    const single = runBacktest(series.candles, {
      ...costs,
      params: request.params,
    });

    let walkForwardResult: WalkForwardResult | null = null;
    let skippedReason: string | null = null;

    if (request.walkForward) {
      try {
        walkForwardResult = walkForward(series.candles, {
          ...costs,
          trainBars: request.trainBars,
          testBars: request.testBars,
          riskFreeRatePct: 0,
        });
      } catch (error) {
        if (isAppError(error) && error.code === "insufficient_data") {
          skippedReason = `${error.message} Perbesar range data atau kecilkan trainBars/testBars.`;
        } else {
          throw error;
        }
      }
    }

    return {
      symbol: series.symbol,
      currency: series.currency,
      range: request.range,
      interval: request.interval,
      bars: series.candles.length,
      dataFetchedAt: series.fetchedAt,
      dataStartDate: series.candles[0].date,
      dataEndDate: series.candles[series.candles.length - 1].date,
      single,
      walkForward: walkForwardResult,
      walkForwardSkippedReason: skippedReason,
      notes: [...BACKTEST_NOTES, `Benchmark data: ${this.config.benchmarkSymbol}.`],
    };
  }
}
