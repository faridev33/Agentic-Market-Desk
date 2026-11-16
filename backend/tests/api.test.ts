import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { silentLogger } from "../src/lib/logger.js";
import { InMemoryDecisionStore } from "../src/storage/decisions.js";
import {
  disabledLlm,
  FakeProviders,
  makeCandles,
  makeFundamentals,
  makeMacro,
  makeNews,
  testConfig,
} from "./helpers.js";

async function makeApp(candleCount = 700): Promise<FastifyInstance> {
  return buildApp({
    config: testConfig,
    providers: new FakeProviders({
      candles: makeCandles(candleCount, { dailyDriftPct: 0.13, dailyNoisePct: 0.6 }),
      fundamentals: makeFundamentals(),
      macro: makeMacro(),
      news: makeNews([
        "Test Corp beats estimates and raises guidance",
        "Test Corp wins record contract",
        "Test Corp announces dividend increase",
      ]),
    }),
    store: new InMemoryDecisionStore(),
    llm: disabledLlm,
    logger: silentLogger,
  });
}

test("GET /health melaporkan status dan LLM", async () => {
  const app = await makeApp();
  const response = await app.inject({ method: "GET", url: "/health" });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.status, "ok");
  assert.equal(body.dataProvider, "yahoo-finance");
  assert.equal(body.llmEnabled, false);
  await app.close();
});

test("POST /v1/analysis menghasilkan rekomendasi lengkap dan menyimpannya", async () => {
  const app = await makeApp();
  const response = await app.inject({
    method: "POST",
    url: "/v1/analysis",
    payload: { symbol: "test", equity: 25_000 },
  });

  assert.equal(response.statusCode, 201);
  const body = response.json();
  assert.equal(body.symbol, "TEST");
  assert.ok(
    ["strong_buy", "buy", "hold", "reduce", "sell"].includes(body.recommendation.action),
  );
  assert.equal(body.recommendation.calibration, "uncalibrated_heuristic");
  assert.ok(body.recommendation.probabilityUp > 0 && body.recommendation.probabilityUp < 1);
  assert.equal(body.agents.length, 4);
  assert.ok(body.agents.every((agent: { status: string }) => agent.status !== "failed"));
  assert.equal(body.horizons.length, 2);
  assert.ok(body.critic.verdict);
  assert.ok(body.risk.reasons.length > 0);
  assert.equal(body.meta.llmEnabled, false);
  assert.equal(body.dataQuality.degraded, false);
  assert.ok(body.meta.disclaimer.includes("bukan nasihat keuangan"));

  const stored = await app.inject({ method: "GET", url: `/v1/analysis/${body.id}` });
  assert.equal(stored.statusCode, 200);
  assert.equal(stored.json().id, body.id);

  const list = await app.inject({ method: "GET", url: "/v1/analyses?symbol=TEST" });
  assert.equal(list.statusCode, 200);
  assert.equal(list.json().items.length, 1);
  assert.equal(list.json().items[0].id, body.id);

  await app.close();
});

test("GET /v1/office menampilkan roster agen dan status sesi terakhir secara aman", async () => {
  const app = await makeApp();
  const idle = await app.inject({ method: "GET", url: "/v1/office" });
  assert.equal(idle.statusCode, 200);
  assert.deepEqual(idle.json().agents.map((agent: { id: string; status: string }) => [agent.id, agent.status]), [
    ["data_ingestion", "idle"],
    ["technical", "idle"],
    ["fundamental", "idle"],
    ["macro", "idle"],
    ["sentiment", "idle"],
    ["synthesizer", "idle"],
    ["risk_manager", "idle"],
    ["critic", "idle"],
  ]);
  assert.equal(idle.json().latestAnalysis, null);

  const analysis = await app.inject({
    method: "POST",
    url: "/v1/analysis",
    payload: { symbol: "test" },
  });
  assert.equal(analysis.statusCode, 201);

  const snapshot = await app.inject({ method: "GET", url: "/v1/office" });
  assert.equal(snapshot.statusCode, 200);
  assert.equal(snapshot.json().latestAnalysis.symbol, "TEST");
  assert.equal(snapshot.json().agents.length, 8);
  assert.ok(snapshot.json().agents.every((agent: { status: string }) => ["ok", "degraded", "failed"].includes(agent.status)));
  assert.ok(snapshot.json().agents.every((agent: { task: string }) => typeof agent.task === "string" && agent.task.length > 0));
  assert.ok(snapshot.json().agents.every((agent: { horizon: string }) => typeof agent.horizon === "string" && agent.horizon.length > 0));
  await app.close();
});

test("GET /v1/analysis/:id mengembalikan 404 untuk ID tidak dikenal", async () => {
  const app = await makeApp();
  const response = await app.inject({
    method: "GET",
    url: "/v1/analysis/00000000-0000-0000-0000-000000000000",
  });
  assert.equal(response.statusCode, 404);
  assert.equal(response.json().error.code, "not_found");
  await app.close();
});

test("validasi menolak simbol tidak valid", async () => {
  const app = await makeApp();
  const response = await app.inject({
    method: "POST",
    url: "/v1/analysis",
    payload: { symbol: "AAPL; DROP TABLE" },
  });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, "validation_error");
  await app.close();
});

test("endpoint data pasar mengembalikan bentuk yang diharapkan", async () => {
  const app = await makeApp(400);

  const history = await app.inject({
    method: "GET",
    url: "/v1/market/aapl/history?range=1y&interval=1d",
  });
  assert.equal(history.statusCode, 200);
  assert.equal(history.json().candles.length, 400);
  assert.equal(history.json().symbol, "TEST");

  const quote = await app.inject({ method: "GET", url: "/v1/market/aapl/quote" });
  assert.equal(quote.statusCode, 200);
  assert.ok(quote.json().price > 0);

  const fundamentals = await app.inject({
    method: "GET",
    url: "/v1/market/aapl/fundamentals",
  });
  assert.equal(fundamentals.statusCode, 200);
  assert.equal(fundamentals.json().sector, "Technology");

  const news = await app.inject({ method: "GET", url: "/v1/market/aapl/news?count=5" });
  assert.equal(news.statusCode, 200);
  assert.ok(Array.isArray(news.json()));

  const macro = await app.inject({ method: "GET", url: "/v1/macro?benchmark=^gspc" });
  assert.equal(macro.statusCode, 200);
  assert.equal(macro.json().vix, 14);

  const invalidRange = await app.inject({
    method: "GET",
    url: "/v1/market/aapl/history?range=7d",
  });
  assert.equal(invalidRange.statusCode, 400);

  await app.close();
});

test("POST /v1/backtest menjalankan backtest dan melewati walk-forward yang tidak layak", async () => {
  const app = await makeApp(700);
  const response = await app.inject({
    method: "POST",
    url: "/v1/backtest",
    payload: { symbol: "TEST", range: "5y", walkForward: true },
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.bars, 700);
  assert.ok(body.single.metrics.finalEquity > 0);
  assert.ok(body.single.equityCurve.length > 0);
  assert.ok(body.notes.length > 0);
  assert.equal(body.walkForward, null);
  assert.ok(typeof body.walkForwardSkippedReason === "string");

  await app.close();
});

test("POST /v1/backtest menolak parameter SMA yang tidak konsisten", async () => {
  const app = await makeApp();
  const response = await app.inject({
    method: "POST",
    url: "/v1/backtest",
    payload: { symbol: "TEST", params: { fastSma: 200, slowSma: 100 } },
  });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, "validation_error");
  await app.close();
});

test("POST /v1/backtest menolak riwayat terlalu pendek", async () => {
  const app = await makeApp(120);
  const response = await app.inject({
    method: "POST",
    url: "/v1/backtest",
    payload: { symbol: "TEST" },
  });
  assert.equal(response.statusCode, 422);
  assert.equal(response.json().error.code, "insufficient_data");
  await app.close();
});

test("rute tidak dikenal mengembalikan 404 terstruktur", async () => {
  const app = await makeApp();
  const response = await app.inject({ method: "GET", url: "/v1/unknown" });
  assert.equal(response.statusCode, 404);
  assert.equal(response.json().error.code, "not_found");
  await app.close();
});

test("server yang melayani build web tetap memakai envelope error API", async () => {
  const webDir = await mkdtemp(join(tmpdir(), "agentic-web-"));
  try {
    await writeFile(join(webDir, "index.html"), "<!doctype html><title>Desk</title>", "utf8");
    const app = await buildApp({
      config: { ...testConfig, webDir },
      providers: new FakeProviders({
        candles: makeCandles(700, { dailyDriftPct: 0.13, dailyNoisePct: 0.6 }),
      }),
      store: new InMemoryDecisionStore(),
      llm: disabledLlm,
      logger: silentLogger,
    });

    const root = await app.inject({ method: "GET", url: "/" });
    assert.equal(root.statusCode, 200);
    assert.match(root.body, /Desk/);

    const spa = await app.inject({
      method: "GET",
      url: "/deep/link",
      headers: { accept: "text/html" },
    });
    assert.equal(spa.statusCode, 200);

    const invalid = await app.inject({
      method: "POST",
      url: "/v1/analysis",
      payload: { symbol: "bad symbol!" },
    });
    assert.equal(invalid.statusCode, 400);
    assert.equal(invalid.json().error.code, "validation_error");

    const api404 = await app.inject({ method: "GET", url: "/v1/unknown" });
    assert.equal(api404.statusCode, 404);
    assert.equal(api404.json().error.code, "not_found");

    await app.close();
  } finally {
    await rm(webDir, { recursive: true, force: true });
  }
});

test("analisis tetap berjalan ketika fundamental tidak tersedia", async () => {
  const app = await buildApp({
    config: testConfig,
    providers: new FakeProviders({
      candles: makeCandles(600, { dailyDriftPct: 0.12 }),
      fundamentals: null,
      macro: makeMacro(),
    }),
    store: new InMemoryDecisionStore(),
    llm: disabledLlm,
    logger: silentLogger,
  });

  const response = await app.inject({
    method: "POST",
    url: "/v1/analysis",
    payload: { symbol: "TEST", focus: "trading" },
  });

  assert.equal(response.statusCode, 201);
  const body = response.json();
  assert.equal(body.dataQuality.hasFundamentals, false);
  assert.equal(body.dataQuality.degraded, true);
  assert.ok(
    body.agents.some(
      (agent: { agent: string; status: string }) =>
        agent.agent === "fundamental" && agent.status === "failed",
    ),
  );

  await app.close();
});
