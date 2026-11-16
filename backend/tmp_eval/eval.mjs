import { YahooMarketData } from "../dist/providers/yahoo.js";
import { walkForward } from "../dist/backtest/walkForward.js";
import { runBacktest } from "../dist/backtest/engine.js";
import { writeFileSync } from "node:fs";

const tickers = process.argv.slice(2);
const provider = new YahooMarketData();
const out = [];

for (const t of tickers) {
  const symbol = t.endsWith(".JK") ? t : `${t}.JK`;
  try {
    const series = await provider.history(symbol, { range: "5y", interval: "1d" });
    const wf = walkForward(series.candles, {
      initialEquity: 100_000_000,
      feeBps: 15,
      slippageBps: 10,
      trainBars: 504,
      testBars: 126,
      maxFolds: 4,
      riskFreeRatePct: 0,
    });
    const single = runBacktest(series.candles, {
      initialEquity: 100_000_000,
      feeBps: 15,
      slippageBps: 10,
    });
    out.push({
      symbol,
      bars: series.candles.length,
      start: series.candles[0].date,
      end: series.candles[series.candles.length - 1].date,
      folds: wf.folds.length,
      wf: wf.aggregate,
      single: single.metrics,
      selected: wf.folds.map((f) => ({
        fold: f.fold,
        testStart: f.testStartDate,
        testEnd: f.testEndDate,
        params: f.selectedParams,
        testSharpe: f.testMetrics.sharpe,
        testReturn: f.testMetrics.totalReturnPct,
        bh: f.testMetrics.buyHoldReturnPct,
        trades: f.testMetrics.tradeCount,
      })),
      equity: wf.equityCurve
        .filter((_, i) => i % 5 === 0)
        .map((p) => [p.date, Math.round(p.equity)]),
      warnings: wf.warnings,
    });
    console.log(t, "ok", wf.folds.length, "folds", wf.aggregate.sharpe, wf.aggregate.totalReturnPct);
  } catch (e) {
    console.log(t, "FAIL", e.message);
    out.push({ symbol, error: e.message });
  }
}

writeFileSync("tmp_eval/results.json", JSON.stringify(out, null, 2));
console.log("written", out.length);
