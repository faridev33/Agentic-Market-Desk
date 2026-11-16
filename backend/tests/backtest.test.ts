import assert from "node:assert/strict";
import test from "node:test";
import { runBacktest } from "../src/backtest/engine.js";
import { walkForward } from "../src/backtest/walkForward.js";
import { isAppError } from "../src/lib/errors.js";
import { makeCandles } from "./helpers.js";

const params = {
  fastSma: 20,
  slowSma: 100,
  rsiPeriod: 14,
  rsiEntryMax: 100,
  atrPeriod: 14,
  stopAtrMult: 3,
};

test("backtest mengeksekusi sinyal pada pembukaan hari berikutnya", () => {
  const candles = makeCandles(700, { dailyDriftPct: 0.15, dailyNoisePct: 0.6 });
  const result = runBacktest(candles, {
    params,
    feeBps: 0,
    slippageBps: 5,
    initialEquity: 10_000,
  });

  assert.ok(result.trades.length > 0, "harus ada transaksi");
  const trade = result.trades[0];
  const entryIndex = candles.findIndex((candle) => candle.date === trade.entryDate);
  assert.ok(entryIndex > 0);

  const expectedPrice = candles[entryIndex].open * (1 + 5 / 10_000);
  assert.ok(Math.abs(trade.entryPrice - expectedPrice) < 0.02);

  const signalIndex = entryIndex - 1;
  assert.ok(signalIndex >= params.slowSma - 1, "sinyal harus setelah warmup indikator");
  assert.notEqual(candles[signalIndex].date, trade.entryDate);
});

test("biaya transaksi menurunkan hasil akhir", () => {
  const candles = makeCandles(800, { dailyDriftPct: 0.12, dailyNoisePct: 0.7 });
  const free = runBacktest(candles, {
    params,
    feeBps: 0,
    slippageBps: 0,
    initialEquity: 10_000,
  });
  const costly = runBacktest(candles, {
    params,
    feeBps: 50,
    slippageBps: 25,
    initialEquity: 10_000,
  });

  assert.ok(free.trades.length > 0);
  assert.ok(costly.metrics.finalEquity < free.metrics.finalEquity);
  assert.ok(costly.metrics.feesPaid > 0);
});

test("metrik backtest konsisten", () => {
  const candles = makeCandles(600, { dailyDriftPct: 0.1, dailyNoisePct: 0.8 });
  const result = runBacktest(candles, { params, initialEquity: 10_000 });

  assert.equal(result.equityCurve.length, result.bars);
  assert.ok(Number.isFinite(result.metrics.cagrPct));
  assert.ok(result.metrics.maxDrawdownPct >= 0);
  assert.ok(result.metrics.exposurePct >= 0 && result.metrics.exposurePct <= 100);
  assert.equal(
    result.trades.reduce((acc, trade) => acc + trade.fees, 0).toFixed(0),
    result.metrics.feesPaid.toFixed(0),
  );
});

test("walk-forward membentuk beberapa fold dan metrik agregat", () => {
  const candles = makeCandles(1600, { dailyDriftPct: 0.1, dailyNoisePct: 0.7 });
  const result = walkForward(candles, {
    trainBars: 504,
    testBars: 126,
    maxFolds: 4,
    initialEquity: 10_000,
    feeBps: 10,
    slippageBps: 5,
  });

  assert.ok(result.folds.length >= 2);
  assert.ok(result.equityCurve.length > 0);
  assert.ok(Number.isFinite(result.aggregate.totalReturnPct));
  for (const fold of result.folds) {
    assert.ok(fold.selectedParams.fastSma < fold.selectedParams.slowSma);
    assert.ok(fold.trainMetrics.tradeCount >= 0);
  }
});

test("walk-forward menolak data yang tidak cukup", () => {
  const candles = makeCandles(400);
  assert.throws(
    () => walkForward(candles, { trainBars: 504, testBars: 126 }),
    (error: unknown) => isAppError(error) && error.code === "insufficient_data",
  );
});

test("backtest menolak data terlalu pendek", () => {
  assert.throws(
    () => runBacktest(makeCandles(30), { params }),
    (error: unknown) => isAppError(error) && error.code === "insufficient_data",
  );
});
