import assert from "node:assert/strict";
import test from "node:test";
import { FundamentalAgent } from "../src/agents/fundamental.js";
import { MacroAgent } from "../src/agents/macro.js";
import { assessRisk } from "../src/agents/riskManager.js";
import { SentimentAgent } from "../src/agents/sentiment.js";
import { Synthesizer } from "../src/agents/synthesizer.js";
import { TechnicalAgent } from "../src/agents/technical.js";
import type { AgentName, AgentSignal, RiskLimits } from "../src/types.js";
import {
  disabledLlm,
  makeCandles,
  makeContext,
  makeFundamentals,
  makeMacro,
  makeNews,
} from "./helpers.js";

const technical = new TechnicalAgent();
const fundamental = new FundamentalAgent();
const macro = new MacroAgent();
const sentiment = new SentimentAgent(disabledLlm);
const synthesizer = new Synthesizer();

function signal(agent: AgentName, score: number, confidence = 0.8): AgentSignal {
  return {
    agent,
    asOf: new Date().toISOString(),
    score,
    confidence,
    summary: `${agent} ${score}`,
    evidence: [],
    warnings: [],
    metrics: {},
  };
}

test("technical bullish pada tren naik", async () => {
  const context = makeContext({ candles: makeCandles(320, { dailyDriftPct: 0.15 }) });
  const { signal: output } = await technical.run(context);
  assert.ok(output.score > 0.15, `skor ${output.score}`);
  assert.ok(output.confidence > 0.2);
  assert.ok(typeof output.metrics.atr === "number");
});

test("technical bearish pada tren turun", async () => {
  const context = makeContext({ candles: makeCandles(320, { dailyDriftPct: -0.15 }) });
  const { signal: output } = await technical.run(context);
  assert.ok(output.score < -0.15, `skor ${output.score}`);
});

test("technical menolak histori yang terlalu pendek", async () => {
  const context = makeContext({ candles: makeCandles(40) });
  await assert.rejects(() => technical.run(context), /tidak cukup/i);
});

test("fundamental menilai emiten berkualitas positif dan emiten lemah negatif", async () => {
  const strong = await fundamental.run(
    makeContext({ candles: makeCandles(300), fundamentals: makeFundamentals() }),
  );
  assert.ok(strong.signal.score > 0.2);

  const weak = await fundamental.run(
    makeContext({
      candles: makeCandles(300),
      fundamentals: makeFundamentals({
        trailingPE: 90,
        forwardPE: 70,
        priceToBook: 15,
        evToEbitda: 40,
        fcfYieldPct: -3,
        returnOnEquityPct: -8,
        operatingMarginPct: -5,
        profitMarginPct: -10,
        debtToEquityPct: 320,
        currentRatio: 0.6,
        revenueGrowthPct: -18,
        earningsGrowthPct: -30,
      }),
    }),
  );
  assert.ok(weak.signal.score < -0.2);
});

test("macro mendeteksi rezim risk-off", async () => {
  const context = makeContext({
    candles: makeCandles(300),
    macro: makeMacro({
      vix: 38,
      vixChange20dPct: 30,
      yieldCurveSpreadPct: -0.8,
      dollarChange20dPct: 4,
      benchmarkAboveSma50: false,
      benchmarkAboveSma200: false,
      benchmarkChange60dPct: -12,
    }),
  });
  const { signal: output } = await macro.run(context);
  assert.equal(output.metrics.regime, "risk_off");
  assert.ok(output.score < -0.2);
});

test("sentimen positif dan negatif terdeteksi dari judul berita", async () => {
  const positive = await sentiment.run(
    makeContext({
      candles: makeCandles(300),
      news: makeNews([
        "Test Corp beats estimates and raises guidance",
        "Test Corp wins record contract",
      ]),
    }),
  );
  assert.ok(positive.signal.score > 0.2);
  assert.ok(positive.details.articles.length === 2);
  assert.ok(positive.details.articles[0].events.includes("earnings"));

  const negative = await sentiment.run(
    makeContext({
      candles: makeCandles(300),
      news: makeNews([
        "Test Corp misses estimates, cuts guidance as lawsuit investigation deepens",
        "Test Corp announces layoffs after profit warning",
      ]),
    }),
  );
  assert.ok(negative.signal.score < -0.2);
});

test("sentimen tanpa berita netral dan keyakinan nol", async () => {
  const context = makeContext({ candles: makeCandles(300), news: [] });
  const { signal: output, details } = await sentiment.run(context);
  assert.equal(output.score, 0);
  assert.equal(output.confidence, 0);
  assert.equal(details.articles.length, 0);
  assert.ok(output.warnings.length > 0);
});

test("synthesizer memboboti fundamental lebih besar untuk investasi", () => {
  const result = synthesizer.run({
    signals: {
      technical: signal("technical", 0.6),
      fundamental: signal("fundamental", 0.5),
      macro: signal("macro", 0.3),
      sentiment: signal("sentiment", 0.4),
    },
    regime: "risk_on",
    focus: "both",
  });

  assert.equal(result.assessments.length, 2);
  const trading = result.assessments.find((entry) => entry.horizon === "trading")!;
  const investment = result.assessments.find((entry) => entry.horizon === "investment")!;
  assert.ok((investment.weights.fundamental ?? 0) > (trading.weights.fundamental ?? 0));
  assert.ok(["buy", "strong_buy"].includes(trading.action));
  assert.equal(trading.conflicts.length, 0);
});

test("synthesizer menandai konflik teknikal vs fundamental", () => {
  const result = synthesizer.run({
    signals: {
      technical: signal("technical", 0.7),
      fundamental: signal("fundamental", -0.7),
      macro: signal("macro", 0),
      sentiment: signal("sentiment", 0.1),
    },
    regime: "neutral",
    focus: "trading",
  });
  assert.ok(result.conflicts.some((conflict) => conflict.includes("fundamental")));
});

const limits: RiskLimits = {
  maxRiskPerTradePct: 1,
  targetVolatilityPct: 15,
  maxPositionPct: 20,
  maxDrawdownPct: 15,
  maxSectorExposurePct: 35,
};

test("risk manager menyetujui entri dengan batas posisi dan stop", () => {
  const risk = assessRisk({
    action: "buy",
    confidence: 0.7,
    probabilityUp: 0.65,
    horizon: "trading",
    equity: 100_000,
    price: 100,
    atr: 2,
    annualizedVolPct: 30,
    avgDollarVolume: 1_000_000_000,
    currentDrawdownPct: 0,
    sectorExposurePct: 0,
    limits,
  });

  assert.equal(risk.approved, true);
  assert.ok(risk.sizing);
  assert.ok(risk.sizing.stopLoss !== null && risk.sizing.stopLoss < 100);
  assert.ok(risk.sizing.recommendedShares > 0);
  assert.ok(risk.sizing.recommendedPositionPct <= 20.01);
});

test("kill switch memblokir entri baru", () => {
  const risk = assessRisk({
    action: "buy",
    confidence: 0.7,
    probabilityUp: 0.65,
    horizon: "trading",
    equity: 100_000,
    price: 100,
    atr: 2,
    annualizedVolPct: 30,
    avgDollarVolume: 1_000_000_000,
    currentDrawdownPct: 20,
    sectorExposurePct: 0,
    limits,
  });

  assert.equal(risk.approved, false);
  assert.equal(risk.killSwitch.triggered, true);
});

test("aksi jual tidak memerlukan sizing dan tetap diizinkan", () => {
  const risk = assessRisk({
    action: "sell",
    confidence: 0.7,
    probabilityUp: 0.3,
    horizon: "trading",
    equity: 100_000,
    price: 100,
    atr: 2,
    annualizedVolPct: 30,
    avgDollarVolume: 1_000_000_000,
    currentDrawdownPct: 20,
    sectorExposurePct: 0,
    limits,
  });

  assert.equal(risk.approved, true);
  assert.equal(risk.sizing, null);
  assert.ok(risk.exitPlan);
});
