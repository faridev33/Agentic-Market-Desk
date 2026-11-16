import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import type { IdxUniverseEntry } from "../src/data/idxUniverse.js";
import { silentLogger } from "../src/lib/logger.js";
import { ScreenerService } from "../src/services/screenerService.js";
import { InMemoryDecisionStore } from "../src/storage/decisions.js";
import type { FinancialPeriod, Quote, ScreenerResults } from "../src/types.js";
import {
  disabledLlm,
  FakeProviders,
  makeCandles,
  makeFinancialPeriods,
  testConfig,
} from "./helpers.js";

const UNIVERSE: readonly IdxUniverseEntry[] = [
  { code: "BBCA", symbol: "BBCA.JK", name: "Bank Central Asia Tbk" },
  { code: "TLKM", symbol: "TLKM.JK", name: "Telkom Indonesia Tbk" },
  { code: "GOTO", symbol: "GOTO.JK", name: "GoTo Gojek Tokopedia Tbk" },
];

function makeQuote(
  symbol: string,
  price: number,
  marketCap: number,
  changePct: number,
): Quote {
  return {
    symbol,
    name: symbol,
    currency: "IDR",
    exchange: "Jakarta Stock Exchange",
    marketState: "REGULAR",
    price,
    previousClose: price / (1 + changePct / 100),
    changePct,
    volume: 1_000_000,
    averageVolume10d: 900_000,
    marketCap,
    fiftyTwoWeekHigh: price * 1.2,
    fiftyTwoWeekLow: price * 0.8,
    marketTime: new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
    trailingPE: 15,
    priceToBook: 2.4,
    dividendYieldPct: 1.8,
    epsTrailing: price / 15,
  };
}

function periodsWithRevenue(base: number): FinancialPeriod[] {
  return makeFinancialPeriods().map((period, index) => {
    const revenue = base * (1 + index * 0.1);
    return {
      ...period,
      totalRevenue: revenue,
      operatingRevenue: revenue,
      costOfRevenue: revenue * 0.55,
      grossProfit: revenue * 0.45,
      operatingIncome: revenue * 0.3,
      netIncome: revenue * 0.2,
      netIncomeCommonStockholders: revenue * 0.2,
    };
  });
}

class ScreenerProviders extends FakeProviders {
  constructor(
    private readonly financialsBySymbol: Record<string, FinancialPeriod[]>,
    quotes: Quote[],
  ) {
    super({ candles: makeCandles(30), quotes });
  }

  override async financialHistory(symbol: string): Promise<FinancialPeriod[]> {
    return this.financialsBySymbol[symbol] ?? [];
  }
}

function makeProviders(): ScreenerProviders {
  return new ScreenerProviders(
    {
      "BBCA.JK": periodsWithRevenue(100_000_000_000_000),
      "TLKM.JK": periodsWithRevenue(50_000_000_000_000),
    },
    [
      makeQuote("BBCA.JK", 9_000, 1_100_000_000_000_000, 1.2),
      makeQuote("TLKM.JK", 3_000, 300_000_000_000_000, -0.8),
      makeQuote("GOTO.JK", 60, 70_000_000_000_000, 2.4),
    ],
  );
}

async function waitFor(
  condition: () => boolean,
  message: string,
  timeoutMs = 10_000,
): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timeout: ${message}`);
}

test("ScreenerService menyelesaikan job, memfilter, dan menyimpan cache", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "screener-"));
  try {
    const service = new ScreenerService({
      providers: makeProviders(),
      dataDir,
      universe: UNIVERSE,
      concurrency: 2,
      logger: silentLogger,
    });

    const idle = service.status();
    assert.equal(idle.status, "idle");
    assert.equal(idle.total, 3);
    assert.ok(idle.message.includes("3 emiten"));

    service.start();
    await waitFor(() => service.status().status === "complete", "job screener selesai");

    const status = service.status();
    assert.equal(status.percent, 100);
    assert.equal(status.processed, 3);
    assert.equal(status.quoted, 3);
    assert.equal(status.withFinancials, 2);
    assert.equal(status.failed, 0);
    assert.ok(status.elapsedMs >= 0);
    assert.ok(status.snapshotAt !== null);

    const results = service.results({ pageSize: 10 });
    assert.equal(results.total, 3);
    assert.equal(results.rows.length, 3);
    assert.equal(results.summary.total, 3);
    assert.equal(results.summary.withFinancials, 2);
    assert.equal(results.summary.gainers, 2);
    assert.equal(results.summary.losers, 1);
    assert.deepEqual(
      results.rows.map((row) => row.code).sort(),
      ["BBCA", "GOTO", "TLKM"],
    );
    assert.equal(results.fiscalYears.length, 3);
    assert.ok(results.sectors.some((sector) => sector.sector === "Keuangan"));

    const bank = service.results({ q: "bank", pageSize: 10 });
    assert.equal(bank.total, 1);
    assert.equal(bank.rows[0]?.code, "BBCA");

    const finance = service.results({ sector: "Keuangan", pageSize: 10 });
    assert.equal(finance.total, 1);
    assert.equal(finance.rows[0]?.code, "BBCA");

    const withFinancials = service.results({ hasFinancials: "yes", pageSize: 10 });
    assert.equal(withFinancials.total, 2);
    const withoutFinancials = service.results({ hasFinancials: "no", pageSize: 10 });
    assert.equal(withoutFinancials.total, 1);
    assert.equal(withoutFinancials.rows[0]?.code, "GOTO");

    const byRevenue = service.results({
      sort: "revenue",
      direction: "desc",
      pageSize: 10,
    });
    assert.equal(byRevenue.rows[0]?.code, "BBCA");
    assert.equal(byRevenue.rows[1]?.code, "TLKM");
    assert.equal(byRevenue.rows[2]?.code, "GOTO");

    const firstPage = service.results({ pageSize: 10, page: 1, sort: "symbol" });
    assert.equal(firstPage.page, 1);
    assert.equal(firstPage.rows[0]?.code, "BBCA");

    const cachedPath = join(dataDir, "screener-cache.json");
    await waitFor(() => existsSync(cachedPath), "cache screener tersimpan");

    const reloaded = new ScreenerService({
      providers: makeProviders(),
      dataDir,
      universe: UNIVERSE,
      logger: silentLogger,
    });
    const loadedStatus = reloaded.status();
    assert.equal(loadedStatus.status, "idle");
    assert.equal(loadedStatus.percent, 100);
    assert.ok(loadedStatus.snapshotAt !== null);
    const loaded = reloaded.results({ pageSize: 10 });
    assert.equal(loaded.total, 3);
    assert.equal(loaded.summary.withFinancials, 2);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("ScreenerService mengembalikan detail profil gabungan", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "screener-detail-"));
  try {
    const service = new ScreenerService({
      providers: makeProviders(),
      dataDir,
      universe: UNIVERSE,
      concurrency: 2,
      logger: silentLogger,
    });
    service.start();
    await waitFor(() => service.status().status === "complete", "job screener selesai");

    const detail = await service.detail("bbca");
    assert.equal(detail.row.code, "BBCA");
    assert.equal(detail.financials.length, 3);
    assert.equal(detail.profile.code, "BBCA");
    assert.equal(detail.profile.sector, "Keuangan");
    assert.ok(detail.profile.name?.includes("Bank Central Asia"));
    assert.equal(detail.profile.directors.length > 0, true);
    assert.ok(detail.keyStats !== null);
    assert.equal(detail.profileError, null);

    await assert.rejects(() => service.detail("ZZZZ"), /belum ada dalam hasil screener/);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("Endpoint screener menyajikan status, hasil, detail, dan validasi query", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "screener-api-"));
  let app: FastifyInstance | null = null;
  try {
    const screener = new ScreenerService({
      providers: makeProviders(),
      dataDir,
      universe: UNIVERSE,
      concurrency: 2,
      logger: silentLogger,
    });
    app = await buildApp({
      config: { ...testConfig, dataDir },
      providers: makeProviders(),
      store: new InMemoryDecisionStore(),
      llm: disabledLlm,
      logger: silentLogger,
      screener,
    });

    const empty = await app.inject({ method: "GET", url: "/v1/screener/results" });
    assert.equal(empty.statusCode, 200);
    const emptyBody = empty.json() as ScreenerResults;
    assert.equal(emptyBody.total, 0);
    assert.equal(emptyBody.progress.status, "idle");

    const started = await app.inject({ method: "POST", url: "/v1/screener/refresh" });
    assert.equal(started.statusCode, 202);
    assert.equal(started.json().status, "running");

    const running = await app.inject({ method: "GET", url: "/v1/screener/status" });
    assert.equal(running.statusCode, 200);

    await waitFor(() => screener.status().status === "complete", "job API selesai");

    const results = await app.inject({
      method: "GET",
      url: "/v1/screener/results?pageSize=10&sort=revenue&direction=desc",
    });
    assert.equal(results.statusCode, 200);
    const body = results.json() as ScreenerResults;
    assert.equal(body.total, 3);
    assert.equal(body.rows[0]?.code, "BBCA");
    assert.equal(body.pageSize, 10);

    const detail = await app.inject({ method: "GET", url: "/v1/screener/bbca" });
    assert.equal(detail.statusCode, 200);
    assert.equal(detail.json().profile.code, "BBCA");

    const missing = await app.inject({ method: "GET", url: "/v1/screener/zzzz" });
    assert.equal(missing.statusCode, 404);
    assert.equal(missing.json().error.code, "not_found");

    const invalid = await app.inject({
      method: "GET",
      url: "/v1/screener/results?pageSize=500",
    });
    assert.equal(invalid.statusCode, 400);
    assert.equal(invalid.json().error.code, "validation_error");
  } finally {
    if (app) await app.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});
