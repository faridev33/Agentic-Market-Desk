import { AppError } from "../lib/errors.js";
import type { Candle } from "../types.js";
import {
  DEFAULT_STRATEGY_PARAMS,
  runBacktest,
  type BacktestResult,
  type StrategyParams,
} from "./engine.js";
import {
  computeMetrics,
  type BacktestMetrics,
  type EquityPoint,
  type TradeRecord,
} from "./metrics.js";

export interface WalkForwardOptions {
  initialEquity?: number;
  feeBps?: number;
  slippageBps?: number;
  trainBars?: number;
  testBars?: number;
  maxFolds?: number;
  riskFreeRatePct?: number;
  grid?: StrategyParams[];
}

export interface WalkForwardFold {
  fold: number;
  trainStartDate: string;
  trainEndDate: string;
  testStartDate: string;
  testEndDate: string;
  selectedParams: StrategyParams;
  trainMetrics: BacktestMetrics;
  testMetrics: BacktestMetrics;
}

export interface WalkForwardResult {
  folds: WalkForwardFold[];
  aggregate: BacktestMetrics;
  equityCurve: EquityPoint[];
  trades: TradeRecord[];
  warnings: string[];
}

export function defaultParamGrid(): StrategyParams[] {
  const grid: StrategyParams[] = [];
  for (const fastSma of [20, 50]) {
    for (const slowSma of [100, 200]) {
      if (fastSma >= slowSma) continue;
      for (const rsiEntryMax of [70, 80]) {
        for (const stopAtrMult of [2, 3]) {
          grid.push({
            ...DEFAULT_STRATEGY_PARAMS,
            fastSma,
            slowSma,
            rsiEntryMax,
            stopAtrMult,
          });
        }
      }
    }
  }
  return grid;
}

function pickBestOnTrain(
  trainCandles: readonly Candle[],
  grid: readonly StrategyParams[],
  warmup: number,
  options: WalkForwardOptions,
): { params: StrategyParams; result: BacktestResult; objective: number } {
  let best: { params: StrategyParams; result: BacktestResult; objective: number } | null = null;
  for (const params of grid) {
    const result = runBacktest(trainCandles, {
      params,
      initialEquity: options.initialEquity,
      feeBps: options.feeBps,
      slippageBps: options.slippageBps,
      tradeFromIndex: warmup,
      riskFreeRatePct: options.riskFreeRatePct,
    });
    const objective =
      result.metrics.sharpe + (result.metrics.tradeCount < 2 ? -1 : 0);
    if (!best || objective > best.objective) {
      best = { params, result, objective };
    }
  }
  if (!best) {
    throw new AppError("Grid parameter kosong.", 400, "invalid_params");
  }
  return best;
}

/**
 * Walk-forward: parameter dipilih pada jendela latih, lalu diuji pada jendela
 * berikutnya yang belum pernah dilihat. Jendela uji tidak tumpang tindih dan
 * modal dirangkai dari satu fold ke fold berikutnya.
 */
export function walkForward(
  candles: readonly Candle[],
  options: WalkForwardOptions = {},
): WalkForwardResult {
  const grid = options.grid ?? defaultParamGrid();
  const trainBars = options.trainBars ?? 504;
  const testBars = options.testBars ?? 126;
  const maxFolds = options.maxFolds ?? 4;

  if (trainBars < 60 || testBars < 20) {
    throw new AppError("trainBars minimal 60 dan testBars minimal 20.", 400, "invalid_params");
  }

  const maxSlow = Math.max(...grid.map((params) => params.slowSma));
  const maxRsi = Math.max(...grid.map((params) => params.rsiPeriod));
  const maxAtr = Math.max(...grid.map((params) => params.atrPeriod));
  const warmup = Math.max(maxSlow, maxRsi, maxAtr) + 2;
  const required = warmup + trainBars + testBars;

  if (trainBars <= warmup) {
    throw new AppError(
      `trainBars (${trainBars}) harus lebih besar dari warmup indikator (${warmup}).`,
      422,
      "insufficient_data",
      { trainBars, warmup },
    );
  }
  if (candles.length < required) {
    throw new AppError(
      `Data tidak cukup untuk walk-forward: butuh minimal ${required} candle, tersedia ${candles.length}.`,
      422,
      "insufficient_data",
      { available: candles.length, required, warmup, trainBars, testBars },
    );
  }

  const folds: WalkForwardFold[] = [];
  const aggregateCurve: EquityPoint[] = [];
  const allTrades: TradeRecord[] = [];
  const warnings: string[] = [];
  let runningEquity = options.initialEquity ?? 10_000;
  let buyHoldFactor = 1;

  let foldIndex = 0;
  for (
    let foldStart = 0;
    foldStart + trainBars + testBars <= candles.length && foldIndex < maxFolds;
    foldStart += testBars
  ) {
    const trainEnd = foldStart + trainBars;
    const testEnd = trainEnd + testBars;

    const trainCandles = candles.slice(foldStart, trainEnd);
    const best = pickBestOnTrain(trainCandles, grid, warmup, options);

    const testContext = candles.slice(foldStart, testEnd);
    const testRun = runBacktest(testContext, {
      params: best.params,
      initialEquity: runningEquity,
      feeBps: options.feeBps,
      slippageBps: options.slippageBps,
      tradeFromIndex: trainBars,
      riskFreeRatePct: options.riskFreeRatePct,
    });

    for (let i = 0; i < testRun.equityCurve.length; i += 1) {
      const point = testRun.equityCurve[i];
      if (i === 0) {
        runningEquity = point.equity;
        aggregateCurve.push({
          date: point.date,
          equity: runningEquity,
          position: point.position,
        });
        continue;
      }
      const previous = testRun.equityCurve[i - 1].equity;
      if (previous > 0) runningEquity *= point.equity / previous;
      aggregateCurve.push({
        date: point.date,
        equity: runningEquity,
        position: point.position,
      });
    }

    allTrades.push(...testRun.trades);
    buyHoldFactor *= 1 + testRun.metrics.buyHoldReturnPct / 100;

    if (best.result.metrics.tradeCount < 2) {
      warnings.push(
        `Fold ${foldIndex + 1}: parameter terpilih menghasilkan kurang dari 2 transaksi di data latih.`,
      );
    }
    if (testRun.metrics.tradeCount === 0) {
      warnings.push(`Fold ${foldIndex + 1}: tidak ada transaksi di jendela uji.`);
    }

    folds.push({
      fold: foldIndex + 1,
      trainStartDate: trainCandles[0].date,
      trainEndDate: trainCandles[trainCandles.length - 1].date,
      testStartDate: testRun.startDate,
      testEndDate: testRun.endDate,
      selectedParams: best.params,
      trainMetrics: best.result.metrics,
      testMetrics: testRun.metrics,
    });

    foldIndex += 1;
  }

  if (folds.length === 0) {
    throw new AppError("Tidak ada fold walk-forward yang dapat dibentuk.", 422, "insufficient_data");
  }
  if (folds.length < 2) {
    warnings.push("Hanya terbentuk 1 fold; hasil out-of-sample belum meyakinkan.");
  }
  if (allTrades.length === 0) {
    warnings.push("Tidak ada transaksi out-of-sample pada seluruh fold.");
  }

  const aggregate = computeMetrics(
    aggregateCurve,
    allTrades,
    (buyHoldFactor - 1) * 100,
    options.riskFreeRatePct ?? 0,
  );

  return {
    folds,
    aggregate,
    equityCurve: aggregateCurve,
    trades: allTrades,
    warnings,
  };
}
