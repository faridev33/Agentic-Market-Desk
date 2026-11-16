import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { IDX_UNIVERSE } from "../data/idxUniverse.js";
import { atr, dailyReturns, rsi, sma } from "../lib/indicators.js";
import { AppError, errorMessage } from "../lib/errors.js";
import type { LoggerLike } from "../lib/logger.js";
import { annualizedVolatility, clamp, maxDrawdown, pctChange, ramp, round } from "../lib/math.js";
import type { LlmJsonClient } from "../llm/client.js";
import type { MarketDataProviders } from "../providers/types.js";
import type { Candle, Fundamentals, Quote } from "../types.js";

const DISCLAIMER =
  "Lima emiten ini dipilih otomatis oleh 8 agen AI dari data publik Yahoo Finance, bukan nasihat keuangan. " +
  "Skor konsensus belum terkalibrasi terhadap hasil nyata. Verifikasi laporan keuangan, cek likuiditas saat jam bursa, " +
  "dan gunakan stop loss sesuai rencana risiko sebelum membeli.";

const QUOTE_CHUNK = 100;
const HISTORY_CONCURRENCY = 8;
const FUNDAMENTAL_CONCURRENCY = 4;

export type TopPickHorizon = "trading" | "investment";

export interface TopPicksParams {
  tradingCount: number;
  investmentCount: number;
  priceMin: number;
  priceMax: number;
  minDailyValue: number;
  minMarketCap: number;
  deepScanLimit: number;
  shortlistPerHorizon: number;
}

const DEFAULT_PARAMS: TopPicksParams = {
  tradingCount: 3,
  investmentCount: 2,
  priceMin: 100,
  priceMax: 20000,
  minDailyValue: 5_000_000_000,
  minMarketCap: 500_000_000_000,
  deepScanLimit: 180,
  shortlistPerHorizon: 10,
};

export interface TopPickIndicators {
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi14: number | null;
  atrPct: number | null;
  volatilityPct: number | null;
  return1mPct: number | null;
  return3mPct: number | null;
  return6mPct: number | null;
  volumeRatio: number | null;
  drawdownPct: number | null;
  from52wHighPct: number | null;
  /** Jarak harga terhadap SMA20 dalam persen (positif = di atas MA20). */
  fromSma20Pct: number | null;
  /** Jarak harga terhadap SMA50 dalam persen (positif = di atas MA50). */
  fromSma50Pct: number | null;
  avgDailyValue: number;
}

export interface TopPickFundamentals {
  sector: string | null;
  trailingPE: number | null;
  priceToBook: number | null;
  returnOnEquityPct: number | null;
  debtToEquityPct: number | null;
  revenueGrowthPct: number | null;
  profitMarginPct: number | null;
  dividendYieldPct: number | null;
}

export interface TopPickPlan {
  entryLow: number;
  entryHigh: number;
  stopLoss: number;
  target: number;
  riskReward: number;
  holdDays: number;
  /** Selisih zona entry terhadap harga terakhir (%), negatif = tunggu pullback. */
  entryPullbackPct: number;
}

export interface TopPickVote {
  agentId: string;
  agentName: string;
  model: string;
  modelUsed: string | null;
  horizon: TopPickHorizon;
  conviction: number;
  reason: string;
}

export interface TopPick {
  rank: number;
  horizon: TopPickHorizon;
  code: string;
  symbol: string;
  name: string | null;
  sector: string | null;
  price: number;
  changePct: number | null;
  marketCap: number | null;
  consensusScore: number;
  voteCount: number;
  agreementPct: number;
  grade: string;
  heuristicScore: number;
  /** true bila harga sudah melambung (jauh di atas MA20/MA50, RSI panas, atau naik terlalu cepat). */
  overextended: boolean;
  /** Intensitas keterlanjuran harga (0 = wajar, ≥1.2 = melambung). */
  stretchScore: number;
  stretchReasons: string[];
  indicators: TopPickIndicators;
  fundamentals: TopPickFundamentals | null;
  plan: TopPickPlan;
  thesis: string[];
  risks: string[];
  votes: TopPickVote[];
}

export interface TopPicksAgentRun {
  id: string;
  name: string;
  role: string;
  focus: string;
  model: string;
  modelUsed: string | null;
  status: "ok" | "failed";
  durationMs: number;
  picks: number;
  error: string | null;
}

export type TopPicksPhase = "idle" | "scan" | "deep" | "agents" | "enrich" | "done";

export interface TopPicksProgress {
  status: "idle" | "running" | "complete" | "failed";
  phase: TopPicksPhase;
  percent: number;
  message: string;
  total: number;
  processed: number;
  currentSymbol: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  elapsedMs: number;
  updatedAt: string | null;
}

export interface TopPicksResult {
  id: string;
  generatedAt: string;
  durationMs: number;
  params: TopPicksParams;
  universe: {
    total: number;
    priced: number;
    liquid: number;
    deepScanned: number;
    shortlisted: number;
    /** Kandidat yang disisihkan karena harganya sudah melambung. */
    extendedExcluded: number;
  };
  picks: TopPick[];
  agentRuns: TopPicksAgentRun[];
  agentsOk: number;
  regimeNote: string;
  notes: string[];
  disclaimer: string;
}

interface AgentBlueprint {
  id: string;
  name: string;
  role: string;
  focus: TopPickHorizon | "both";
  modelSlot: number;
  persona: string;
}

/** Delapan agen AI; tiap agen punya sudut pandang berbeda dan model yang berbeda. */
const AGENT_BLUEPRINT: readonly AgentBlueprint[] = [
  {
    id: "technical_trend",
    name: "Technical Trend",
    role: "Tren & momentum harga",
    focus: "trading",
    modelSlot: 0,
    persona:
      "Kamu Technical Analyst IDX yang disiplin. Fokus pada struktur tren (posisi harga terhadap SMA20/50/200), " +
      "momentum (return 1-3 bulan), RSI, dan kualitas breakout. Hindari saham yang sudah overextended jauh di atas SMA20 " +
      "tanpa volume pendukung.",
  },
  {
    id: "fundamental_value",
    name: "Fundamental Value",
    role: "Valuasi & kualitas laba",
    focus: "investment",
    modelSlot: 2,
    persona:
      "Kamu Fundamental Analyst value investing. Fokus pada ROE, margin laba, DER, pertumbuhan pendapatan, dan valuasi PE/PB. " +
      "Tolak emiten dengan utang berlebihan atau profitabilitas rapuh meskipun tren harganya bagus.",
  },
  {
    id: "macro_regime",
    name: "Macro Regime",
    role: "Rezim makro & rotasi sektor",
    focus: "both",
    modelSlot: 3,
    persona:
      "Kamu Macro Strategist. Baca rezim pasar (risk-on/risk-off), suku bunga, dolar, dan komoditas, lalu tentukan sektor " +
      "yang diuntungkan. Pilih emiten yang arusnya searah dengan rezim, bukan yang melawan arus.",
  },
  {
    id: "news_sentiment",
    name: "News & Sentiment",
    role: "Katalis & sentimen pasar",
    focus: "trading",
    modelSlot: 1,
    persona:
      "Kamu analis News & Sentiment. Nilai katalis (dividen, ekspansi, aksi korporasi) dan risiko berita negatif. " +
      "Kamu pragmatis: momentum sentimen biasanya berlangsung 1-6 minggu.",
  },
  {
    id: "quant_momentum",
    name: "Quant Momentum",
    role: "Skor statistik & likuiditas",
    focus: "trading",
    modelSlot: 0,
    persona:
      "Kamu quant trader. Peringkatkan kandidat secara statistik: rasio Sharpe kasar, volatilitas, likuiditas nilai transaksi, " +
      "dan konsistensi tren. Kamu menolak saham dengan nilai transaksi harian yang terlalu tipis untuk keluar masuk posisi.",
  },
  {
    id: "risk_guardian",
    name: "Risk Guardian",
    role: "Proteksi modal",
    focus: "both",
    modelSlot: 4,
    persona:
      "Kamu Risk Manager. Tugasmu menolak ide yang rapuh: volatilitas ekstrem, drawdown dalam, likuiditas tipis, harga di puncak " +
      "tanpa ruang aman. Pilih kandidat dengan risiko terukur karena kamu yang menanggung stop loss.",
  },
  {
    id: "contrarian_critic",
    name: "Contrarian Critic",
    role: "Uji balik tesis mayoritas",
    focus: "both",
    modelSlot: 1,
    persona:
      "Kamu Critic/Red Team. Tugasmu menantang konsensus: cari alasan sebuah kandidat bisa gagal, lalu pilih 5 nama yang " +
      "paling tahan banting terhadap kritik. Sebut risiko utama pada alasanmu.",
  },
  {
    id: "portfolio_synthesizer",
    name: "Portfolio Synthesizer",
    role: "Komposisi portofolio final",
    focus: "both",
    modelSlot: 2,
    persona:
      "Kamu Portfolio Manager. Susun komposisi 5 emiten yang seimbang antara 3 posisi trading dan 2 posisi investasi, " +
      "hindari konsentrasi berlebihan di satu sektor, dan prioritaskan nama dengan rasio imbal/risiko terbaik.",
  },
];

const AgentPickSchema = z
  .object({
    code: z.string().nullish(),
    symbol: z.string().nullish(),
    ticker: z.string().nullish(),
    emiten: z.string().nullish(),
    horizon: z.string().nullish(),
    conviction: z.union([z.number(), z.string()]).nullish(),
    confidence: z.union([z.number(), z.string()]).nullish(),
    keyakinan: z.union([z.number(), z.string()]).nullish(),
    alasan: z.string().nullish(),
    reason: z.string().nullish(),
  })
  .passthrough();

/** Model kadang membalas array langsung atau memakai nama kunci lain; normalkan dulu. */
function normalizeAgentReply(input: unknown): unknown {
  if (Array.isArray(input)) return { picks: input };
  if (input && typeof input === "object") {
    const obj = input as Record<string, unknown>;
    for (const key of ["picks", "pilihan", "rekomendasi", "recommendations", "selection"]) {
      const value = obj[key];
      if (Array.isArray(value)) return { ...obj, picks: value };
    }
  }
  return input;
}

const AgentReplySchema = z.preprocess(
  normalizeAgentReply,
  z.object({
    picks: z.array(AgentPickSchema).min(1),
    catatan: z.string().nullish(),
  }),
);

function pickCode(pick: z.infer<typeof AgentPickSchema>): string {
  const raw = pick.code ?? pick.symbol ?? pick.ticker ?? pick.emiten ?? "";
  return raw.trim().toUpperCase().replace(/\.JK$/, "");
}

function pickConviction(pick: z.infer<typeof AgentPickSchema>): number {
  const raw = pick.conviction ?? pick.confidence ?? pick.keyakinan ?? 60;
  const numeric = typeof raw === "number" ? raw : Number.parseFloat(String(raw).replace(/[^0-9.,-]/g, "").replace(",", "."));
  return Number.isFinite(numeric) ? clamp(Math.round(numeric), 0, 100) : 60;
}

function pickReason(pick: z.infer<typeof AgentPickSchema>): string {
  return (pick.alasan ?? pick.reason ?? "").trim().slice(0, 320);
}

interface CandidateRow {
  code: string;
  symbol: string;
  name: string | null;
  quote: Quote;
  candles: Candle[];
  indicators: TopPickIndicators;
  price: number;
  tradingScore: number;
  investmentScore: number;
  fundamentals: Fundamentals | null;
}

interface RawVote {
  code: string;
  horizon: TopPickHorizon;
  conviction: number;
  reason: string;
  agent: AgentBlueprint;
  model: string;
  modelUsed: string | null;
}

function u01(signed: number): number {
  return clamp((signed + 1) / 2, 0, 1);
}

function lastValue(values: Array<number | null>): number | null {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const value = values[i];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function weightAverage(entries: ReadonlyArray<{ value: number | null; weight: number }>): number {
  let acc = 0;
  let total = 0;
  for (const entry of entries) {
    if (entry.value === null || !Number.isFinite(entry.value)) continue;
    acc += entry.value * entry.weight;
    total += entry.weight;
  }
  return total > 0 ? acc / total : 0.5;
}

async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function fmt(value: number | null | undefined, digits = 1): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return value.toFixed(digits);
}

export class TopPicksService {
  private progress: TopPicksProgress = {
    status: "idle",
    phase: "idle",
    percent: 0,
    message: "Belum ada pemindaian. Jalankan 8 agen untuk menyusun 5 emiten terbaik.",
    total: 0,
    processed: 0,
    currentSymbol: null,
    startedAt: null,
    finishedAt: null,
    elapsedMs: 0,
    updatedAt: null,
  };

  private result: TopPicksResult | null = null;
  private jobStartedAt = 0;

  constructor(
    private readonly deps: {
      providers: MarketDataProviders;
      config: AppConfig;
      llm: LlmJsonClient;
      logger: LoggerLike;
      now?: () => Date;
    },
  ) {}

  private get filePath(): string {
    return join(this.deps.config.dataDir, "top-picks.json");
  }

  getProgress(): TopPicksProgress {
    if (this.progress.status === "running") {
      return {
        ...this.progress,
        elapsedMs: Date.now() - this.jobStartedAt,
        percent: round(this.progress.percent, 1),
      };
    }
    return { ...this.progress, percent: round(this.progress.percent, 1) };
  }

  getResult(): TopPicksResult | null {
    return this.result;
  }

  async loadFromDisk(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as TopPicksResult;
      if (parsed && Array.isArray(parsed.picks) && parsed.picks.length > 0) {
        this.result = parsed;
        this.progress = {
          ...this.progress,
          status: "complete",
          phase: "done",
          percent: 100,
          message: `Snapshot terakhir: ${parsed.picks.length} emiten (${parsed.generatedAt}).`,
          finishedAt: parsed.generatedAt,
          updatedAt: parsed.generatedAt,
        };
      }
    } catch {
      // belum ada snapshot, abaikan
    }
  }

  start(params: Partial<TopPicksParams> = {}): TopPicksProgress {
    if (this.progress.status === "running") {
      throw new AppError("Pemindaian 8 agen masih berjalan.", 409, "job_running");
    }
    const resolved: TopPicksParams = { ...DEFAULT_PARAMS };
    const numeric = (value: unknown, fallback: number): number =>
      typeof value === "number" && Number.isFinite(value) ? value : fallback;
    resolved.tradingCount = numeric(params.tradingCount, DEFAULT_PARAMS.tradingCount);
    resolved.investmentCount = numeric(params.investmentCount, DEFAULT_PARAMS.investmentCount);
    resolved.priceMin = numeric(params.priceMin, DEFAULT_PARAMS.priceMin);
    resolved.priceMax = numeric(params.priceMax, DEFAULT_PARAMS.priceMax);
    resolved.minDailyValue = numeric(params.minDailyValue, DEFAULT_PARAMS.minDailyValue);
    resolved.minMarketCap = numeric(params.minMarketCap, DEFAULT_PARAMS.minMarketCap);
    resolved.deepScanLimit = numeric(params.deepScanLimit, DEFAULT_PARAMS.deepScanLimit);
    resolved.shortlistPerHorizon = numeric(params.shortlistPerHorizon, DEFAULT_PARAMS.shortlistPerHorizon);
    resolved.tradingCount = clamp(Math.round(resolved.tradingCount), 1, 5);
    resolved.investmentCount = clamp(Math.round(resolved.investmentCount), 1, 5);
    resolved.deepScanLimit = clamp(Math.round(resolved.deepScanLimit), 40, 600);
    resolved.shortlistPerHorizon = clamp(Math.round(resolved.shortlistPerHorizon), 5, 20);

    this.jobStartedAt = Date.now();
    this.progress = {
      status: "running",
      phase: "scan",
      percent: 1,
      message: "Memindai seluruh universe IDX...",
      total: IDX_UNIVERSE.length,
      processed: 0,
      currentSymbol: null,
      startedAt: new Date(this.jobStartedAt).toISOString(),
      finishedAt: null,
      elapsedMs: 0,
      updatedAt: new Date().toISOString(),
    };
    void this.run(resolved).catch((error: unknown) => {
      const message = errorMessage(error);
      this.deps.logger.error(`Pemindaian 8 agen gagal: ${message}`);
      this.progress = {
        ...this.progress,
        status: "failed",
        phase: "done",
        message: `Gagal: ${message}`,
        finishedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });
    return this.getProgress();
  }

  private setPhase(phase: TopPicksPhase, message: string, extra: Partial<TopPicksProgress> = {}): void {
    this.progress = {
      ...this.progress,
      phase,
      message,
      updatedAt: new Date().toISOString(),
      ...extra,
    };
  }

  private async run(params: TopPicksParams): Promise<void> {
    const startedAt = Date.now();
    const notes: string[] = [];

    // ---------- Tahap 1: quote massal seluruh universe ----------
    const symbols = IDX_UNIVERSE.map((entry) => entry.symbol);
    const quotes: Quote[] = [];
    const batches = chunk(symbols, QUOTE_CHUNK);
    for (let i = 0; i < batches.length; i += 1) {
      const batch = batches[i];
      try {
        const part = await this.deps.providers.quotes(batch);
        quotes.push(...part);
      } catch (error) {
        notes.push(`Batch quote ${i + 1} gagal: ${errorMessage(error)}`);
      }
      this.progress = {
        ...this.progress,
        processed: quotes.length,
        percent: 2 + (i / batches.length) * 13,
        message: `Quote massal: ${quotes.length}/${symbols.length} emiten`,
        currentSymbol: batch[0]?.replace(/\.JK$/, "") ?? null,
      };
    }

    const priceBand = quotes.filter((quote) => {
      const price = quote.price;
      return (
        Number.isFinite(price) && price >= params.priceMin && price <= params.priceMax && (quote.averageVolume10d ?? 0) > 0
      );
    });
    const liquid = priceBand.filter((quote) => {
      const value = (quote.averageVolume10d ?? 0) * quote.price;
      const cap = quote.marketCap ?? 0;
      return value >= params.minDailyValue && (quote.marketCap === null || cap >= params.minMarketCap);
    });
    notes.push(
      `${quotes.length} emiten berharga; ${liquid.length} lolos filter likuiditas (nilai transaksi ≥ Rp ${(
        params.minDailyValue / 1e9
      ).toFixed(1)} M/hari).`,
    );

    // Pre-peringkat tanpa history: momentum 52 minggu + likuiditas.
    const preRanked = [...liquid].sort((a, b) => this.preScore(b) - this.preScore(a));
    const deepTargets = preRanked.slice(0, params.deepScanLimit);

    // ---------- Tahap 2: history + indikator ----------
    this.setPhase("deep", `Menarik riwayat harga ${deepTargets.length} kandidat...`, {
      total: deepTargets.length,
      processed: 0,
      percent: 16,
    });

    let deepDone = 0;
    const rows = await mapLimit(deepTargets, HISTORY_CONCURRENCY, async (quote) => {
      const code = (quote.symbol ?? "").replace(/\.JK$/, "");
      try {
        const series = await this.deps.providers.history(quote.symbol, { range: "1y" });
        const row = this.buildRow(quote, series.candles);
        return row;
      } catch {
        return null;
      } finally {
        deepDone += 1;
        if (deepDone % 5 === 0 || deepDone === deepTargets.length) {
          this.progress = {
            ...this.progress,
            processed: deepDone,
            percent: 16 + (deepDone / deepTargets.length) * 29,
            message: `Analisis teknikal: ${deepDone}/${deepTargets.length} kandidat`,
            currentSymbol: code,
          };
        }
      }
    });
    const valid = rows.filter((row): row is CandidateRow => row !== null);
    notes.push(`${valid.length} kandidat punya ≥60 candle harian untuk dihitung indikatornya.`);

    // ---------- Tahap 3: fundamental untuk shortlist ----------
    // Pisahkan kandidat yang harganya sudah melambung agar tidak mengisi daftar finalis.
    const fresh = valid.filter((row) => !this.isOverextended(row));
    const extended = valid.filter((row) => this.isOverextended(row));
    const pool = fresh.length >= params.shortlistPerHorizon * 2 ? fresh : [...fresh, ...extended];
    notes.push(
      `${extended.length} kandidat disisihkan karena harga sudah melambung (jauh di atas MA20/MA50, RSI panas, atau naik terlalu cepat); ` +
        `shortlist diambil dari ${pool.length} kandidat (${fresh.length} belum melambung).`,
    );
    const byTrading = [...pool]
      .sort((a, b) => b.tradingScore - a.tradingScore)
      .slice(0, params.shortlistPerHorizon);
    const byInvestment = [...pool]
      .sort((a, b) => b.investmentScore - a.investmentScore)
      .slice(0, params.shortlistPerHorizon);
    const shortMap = new Map<string, CandidateRow>();
    for (const row of [...byTrading, ...byInvestment]) shortMap.set(row.code, row);
    const shortlist = [...shortMap.values()];

    this.setPhase("deep", `Melengkapi fundamental ${shortlist.length} finalis...`, {
      percent: 46,
      total: shortlist.length,
      processed: 0,
    });

    let fundDone = 0;
    await mapLimit(shortlist, FUNDAMENTAL_CONCURRENCY, async (row) => {
      try {
        row.fundamentals = await this.deps.providers.fundamentals(row.symbol);
      } catch {
        row.fundamentals = null;
      } finally {
        fundDone += 1;
        this.progress = {
          ...this.progress,
          processed: fundDone,
          percent: 46 + (fundDone / shortlist.length) * 8,
          message: `Fundamental: ${fundDone}/${shortlist.length} finalis`,
          currentSymbol: row.code,
        };
      }
    });

    // Skor investasi dihitung ulang setelah fundamental tersedia.
    for (const row of shortlist) row.investmentScore = this.scoreInvestment(row);

    // ---------- Tahap 4: 8 agen AI ----------
    this.setPhase("agents", `Menjalankan ${AGENT_BLUEPRINT.length} agen AI...`, {
      percent: 55,
      total: AGENT_BLUEPRINT.length,
      processed: 0,
    });

    const allowedCodes = new Set(shortlist.map((row) => row.code));
    const table = this.buildCandidateTable(shortlist);
    const agentRuns: TopPicksAgentRun[] = [];
    const votes: RawVote[] = [];

    if (!this.deps.llm.enabled) {
      notes.push("LLM tidak dikonfigurasi: peringkat disusun murni dari skor heuristik.");
    }

    for (let i = 0; i < AGENT_BLUEPRINT.length; i += 1) {
      const agent = AGENT_BLUEPRINT[i];
      const model = this.modelForSlot(agent.modelSlot);
      const started = Date.now();
      this.progress = {
        ...this.progress,
        processed: i,
        percent: 55 + (i / AGENT_BLUEPRINT.length) * 38,
        message: `Agen ${i + 1}/${AGENT_BLUEPRINT.length}: ${agent.name} (${model})`,
        currentSymbol: null,
      };

      if (!this.deps.llm.enabled) {
        agentRuns.push({
          id: agent.id,
          name: agent.name,
          role: agent.role,
          focus: agent.focus,
          model,
          modelUsed: null,
          status: "failed",
          durationMs: 0,
          picks: 0,
          error: "LLM tidak dikonfigurasi",
        });
        continue;
      }

      // Dua percobaan per agen: model sesuai slot, lalu model cepat sebagai cadangan.
      const fastModel = this.deps.config.llm.models[1] ?? model;
      const attempts = model === fastModel ? [model] : [model, fastModel];
      let response = await this.deps.llm.json({
        system: this.buildSystemPrompt(agent),
        user: this.buildUserPrompt(agent, table, params),
        schema: AgentReplySchema,
        model: attempts[0],
        maxTokens: 1400,
        temperature: 0.3,
        retries: 0,
      });
      for (const retryModel of attempts.slice(1)) {
        if (response.data) break;
        this.progress = {
          ...this.progress,
          message: `Agen ${i + 1}/${AGENT_BLUEPRINT.length}: ${agent.name} — ulangi dengan ${retryModel}`,
        };
        response = await this.deps.llm.json({
          system: this.buildSystemPrompt(agent),
          user: this.buildUserPrompt(agent, table, params),
          schema: AgentReplySchema,
          model: retryModel,
          maxTokens: 1400,
          temperature: 0.4,
          retries: 0,
        });
      }

      if (!response.data) {
        agentRuns.push({
          id: agent.id,
          name: agent.name,
          role: agent.role,
          focus: agent.focus,
          model,
          modelUsed: response.model ?? null,
          status: "failed",
          durationMs: Date.now() - started,
          picks: 0,
          error: response.error ?? "Respons kosong",
        });
        continue;
      }

      let accepted = 0;
      for (const pick of response.data.picks) {
        const code = pickCode(pick);
        if (!allowedCodes.has(code)) continue;
        const horizonRaw = (pick.horizon ?? "").toLowerCase();
        const horizon: TopPickHorizon =
          horizonRaw.startsWith("inv") || horizonRaw.startsWith("long")
            ? "investment"
            : horizonRaw.startsWith("trad") || horizonRaw.startsWith("short")
              ? "trading"
              : agent.focus === "both"
                ? "trading"
                : agent.focus;
        votes.push({
          code,
          horizon,
          conviction: pickConviction(pick),
          reason: pickReason(pick),
          agent,
          model,
          modelUsed: response.model ?? model,
        });
        accepted += 1;
      }
      agentRuns.push({
        id: agent.id,
        name: agent.name,
        role: agent.role,
        focus: agent.focus,
        model,
        modelUsed: response.model ?? null,
        status: "ok",
        durationMs: Date.now() - started,
        picks: accepted,
        error: null,
      });
    }

    const agentsOk = agentRuns.filter((run) => run.status === "ok").length;
    notes.push(`${agentsOk}/${AGENT_BLUEPRINT.length} agen memberi suara; total ${votes.length} suara diterima.`);
    if (agentsOk === 0) {
      notes.push("Semua agen AI gagal merespons: peringkat diambil dari skor heuristik.");
    }

    // ---------- Tahap 5: konsensus + rencana trading ----------
    this.setPhase("enrich", "Menghitung konsensus dan rencana risiko...", { percent: 94 });
    const picks = this.buildPicks({
      shortlist,
      votes,
      params,
      agentsTotal: AGENT_BLUEPRINT.length,
    });

    const finishedAt = new Date().toISOString();
    const result: TopPicksResult = {
      id: randomUUID(),
      generatedAt: finishedAt,
      durationMs: Date.now() - startedAt,
      params,
      universe: {
        total: symbols.length,
        priced: quotes.length,
        liquid: liquid.length,
        deepScanned: valid.length,
        shortlisted: shortlist.length,
        extendedExcluded: extended.length,
      },
      picks,
      agentRuns,
      agentsOk,
      regimeNote: this.regimeNote(valid),
      notes,
      disclaimer: DISCLAIMER,
    };

    this.result = result;
    this.progress = {
      ...this.progress,
      status: "complete",
      phase: "done",
      percent: 100,
      message: `Selesai: ${picks.length} emiten dari ${valid.length} kandidat dalam ${Math.round(
        (Date.now() - startedAt) / 1000,
      )}s.`,
      finishedAt,
      updatedAt: finishedAt,
      elapsedMs: Date.now() - startedAt,
    };

    try {
      await mkdir(dirname(this.filePath), { recursive: true });
      await writeFile(this.filePath, JSON.stringify(result, null, 2), "utf8");
    } catch (error) {
      notes.push(`Snapshot gagal disimpan: ${errorMessage(error)}`);
    }

    this.deps.logger.info(
      `Top picks selesai: ${picks.map((pick) => `${pick.code}(${pick.horizon})`).join(", ")}`,
    );
  }

  private modelForSlot(slot: number): string {
    const models = this.deps.config.llm.models;
    if (models.length === 0) return this.deps.config.llm.model;
    return models[slot % models.length];
  }

  /**
   * Ukur seberapa melambung harga kandidat terhadap support-nya.
   * Skor 0 = wajar, >= 1.2 = sudah terlalu jauh dari support sehingga beli di harga sekarang berisiko.
   */
  private stretch(row: CandidateRow): { score: number; reasons: string[] } {
    const ind = row.indicators;
    const reasons: string[] = [];
    let score = 0;
    const ext20 = ind.fromSma20Pct;
    const ext50 = ind.fromSma50Pct;
    const r1m = ind.return1mPct ?? 0;
    const r3m = ind.return3mPct ?? 0;
    const rsi = ind.rsi14 ?? 50;
    const fromHigh = ind.from52wHighPct ?? -100;

    if (ext20 !== null && ext20 > 8) {
      score += (ext20 - 8) / 8;
      reasons.push(`harga ${ext20.toFixed(0)}% di atas MA20`);
    }
    if (ext50 !== null && ext50 > 18) {
      score += (ext50 - 18) / 15;
      reasons.push(`${ext50.toFixed(0)}% di atas MA50`);
    }
    if (r1m > 18) {
      score += (r1m - 18) / 12;
      reasons.push(`naik ${r1m.toFixed(0)}% dalam 1 bulan`);
    }
    if (r3m > 35) {
      score += (r3m - 35) / 25;
      reasons.push(`naik ${r3m.toFixed(0)}% dalam 3 bulan`);
    }
    if (rsi > 70) {
      score += (rsi - 70) / 15;
      reasons.push(`RSI ${rsi.toFixed(0)} jenuh beli`);
    }
    if (fromHigh > -3 && r1m > 12) {
      score += 0.6;
      reasons.push("menempel di puncak 52 minggu");
    }
    return { score: round(score, 2), reasons };
  }

  private isOverextended(row: CandidateRow): boolean {
    return this.stretch(row).score >= 1.2;
  }

  private preScore(quote: Quote): number {
    const price = quote.price;
    const high = quote.fiftyTwoWeekHigh ?? price;
    const low = quote.fiftyTwoWeekLow ?? price;
    const position = high > low ? (price - low) / (high - low) : 0.5;
    const value = (quote.averageVolume10d ?? 0) * price;
    const liquidity = u01(ramp(Math.log10(Math.max(value, 1)), 9.4, 11.6));
    // Puncak di posisi ~65% rentang 52 minggu: dekat puncak tapi masih menyisakan ruang, bukan mengejar harga di high.
    const room = clamp(1 - Math.abs(position - 0.65) / 0.55, 0, 1);
    const change = u01(ramp(quote.changePct ?? 0, -4, 2));
    return 0.45 * liquidity + 0.35 * room + 0.2 * change;
  }

  private buildRow(quote: Quote, candles: Candle[]): CandidateRow | null {
    if (candles.length < 60) return null;
    const closes = candles.map((candle) => candle.close).filter((value) => Number.isFinite(value) && value > 0);
    if (closes.length < 60) return null;
    const price = closes[closes.length - 1];
    const code = quote.symbol.replace(/\.JK$/, "");
    const sma20 = lastValue(sma(closes, 20));
    const sma50 = lastValue(sma(closes, 50));
    const sma200 = lastValue(sma(closes, 200));
    const rsiSeries = rsi(closes, 14);
    const rsi14 = lastValue(rsiSeries);
    const atrSeries = atr(
      candles.map((candle) => ({ high: candle.high, low: candle.low, close: candle.close, volume: candle.volume })),
      14,
    );
    const atrLast = lastValue(atrSeries);
    const returns = dailyReturns(closes);
    const volatilityPct = returns.length > 20 ? annualizedVolatility(returns) * 100 : null;

    const volumes = candles.map((candle) => candle.volume);
    const recentVolume = volumes.slice(-10);
    const baseVolume = volumes.slice(-60);
    const volumeRatio =
      baseVolume.length > 0 && recentVolume.length > 0
        ? recentVolume.reduce((a, b) => a + b, 0) / recentVolume.length /
          Math.max(baseVolume.reduce((a, b) => a + b, 0) / baseVolume.length, 1)
        : null;

    const high52 = Math.max(...closes);
    const indicators: TopPickIndicators = {
      sma20,
      sma50,
      sma200,
      rsi14,
      atrPct: atrLast !== null ? (atrLast / price) * 100 : null,
      volatilityPct,
      return1mPct: closes.length > 21 ? pctChange(closes[closes.length - 22], price) : null,
      return3mPct: closes.length > 63 ? pctChange(closes[closes.length - 64], price) : null,
      return6mPct: closes.length > 126 ? pctChange(closes[closes.length - 127], price) : null,
      volumeRatio,
      drawdownPct: maxDrawdown(closes),
      from52wHighPct: high52 > 0 ? (price / high52 - 1) * 100 : null,
      fromSma20Pct: sma20 !== null && sma20 > 0 ? (price / sma20 - 1) * 100 : null,
      fromSma50Pct: sma50 !== null && sma50 > 0 ? (price / sma50 - 1) * 100 : null,
      avgDailyValue: (quote.averageVolume10d ?? 0) * price,
    };

    const row: CandidateRow = {
      code,
      symbol: quote.symbol,
      name: quote.name,
      quote,
      candles,
      indicators,
      price,
      tradingScore: 0,
      investmentScore: 0,
      fundamentals: null,
    };
    row.tradingScore = this.scoreTrading(row);
    row.investmentScore = this.scoreInvestment(row);
    return row;
  }

  private scoreTrading(row: CandidateRow): number {
    const ind = row.indicators;
    const liquidity = u01(ramp(Math.log10(Math.max(ind.avgDailyValue, 1)), 9.4, 11.6));
    const trend =
      (ind.sma20 !== null && row.price > ind.sma20 ? 0.5 : 0) +
      (ind.sma50 !== null && row.price > ind.sma50 ? 0.5 : 0);
    const momentum = weightAverage([
      { value: u01(ramp(ind.return1mPct ?? 0, -10, 12)), weight: 0.55 },
      { value: u01(ramp(ind.return3mPct ?? 0, -20, 25)), weight: 0.45 },
    ]);
    // Idealnya harga hanya 0-4% di atas MA20; makin jauh di atas MA20, makin sempit ruang aman entry.
    const room =
      ind.fromSma20Pct === null ? 0.5 : clamp(1 - Math.abs(ind.fromSma20Pct - 2) / 10, 0, 1);
    const rsiScore =
      ind.rsi14 === null
        ? 0.5
        : ind.rsi14 >= 45 && ind.rsi14 <= 65
          ? 1
          : ind.rsi14 > 75
            ? 0.15
            : ind.rsi14 > 65
              ? clamp(1 - (ind.rsi14 - 65) / 12, 0.15, 1)
              : ind.rsi14 < 32
                ? 0.35
                : 0.6;
    const volumeScore = ind.volumeRatio === null ? 0.5 : clamp(0.4 + (ind.volumeRatio - 1) * 0.6, 0, 1);
    const volSane =
      ind.volatilityPct === null ? 0.5 : clamp(1 - Math.abs(ind.volatilityPct - 38) / 60, 0, 1);

    const base =
      100 *
      (0.26 * momentum +
        0.2 * trend +
        0.13 * rsiScore +
        0.12 * room +
        0.14 * liquidity +
        0.08 * volumeScore +
        0.07 * volSane);
    // Penalti eksplisit: emiten yang harganya sudah melambung tidak boleh menang hanya karena momentum.
    const penalty = 22 * this.stretch(row).score;
    return round(clamp(base - penalty, 0, 100), 1);
  }

  private scoreInvestment(row: CandidateRow): number {
    const ind = row.indicators;
    const fund = row.fundamentals;
    const liquidity = u01(ramp(Math.log10(Math.max(ind.avgDailyValue, 1)), 9.4, 11.6));
    const trendLong =
      (ind.sma50 !== null && row.price > ind.sma50 ? 0.5 : 0) +
      (ind.sma200 !== null && row.price > ind.sma200 ? 0.5 : 0);
    const momentum = weightAverage([
      { value: u01(ramp(ind.return6mPct ?? 0, -12, 35)), weight: 0.55 },
      { value: u01(ramp(ind.return3mPct ?? 0, -15, 25)), weight: 0.45 },
    ]);
    const quality = weightAverage([
      { value: fund?.returnOnEquityPct != null ? u01(ramp(fund.returnOnEquityPct, 2, 25)) : null, weight: 0.3 },
      { value: fund?.trailingPE != null && fund.trailingPE > 0 ? u01(ramp(fund.trailingPE, 30, 6)) : null, weight: 0.2 },
      { value: fund?.debtToEquityPct != null ? u01(ramp(fund.debtToEquityPct, 180, 25)) : null, weight: 0.2 },
      { value: fund?.revenueGrowthPct != null ? u01(ramp(fund.revenueGrowthPct, -8, 20)) : null, weight: 0.15 },
      { value: fund?.profitMarginPct != null ? u01(ramp(fund.profitMarginPct, 0, 18)) : null, weight: 0.15 },
    ]);
    const ddScore = clamp(1 - Math.min(ind.drawdownPct ?? 20, 60) / 80, 0, 1);
    // Untuk investasi, harga idealnya masih dekat MA50 (0-10% di atasnya) agar valuasi belum mahal.
    const room =
      ind.fromSma50Pct === null ? 0.5 : clamp(1 - Math.abs(ind.fromSma50Pct - 5) / 20, 0, 1);

    const base =
      100 *
      (0.22 * trendLong +
        0.27 * quality +
        0.16 * momentum +
        0.12 * liquidity +
        0.1 * ddScore +
        0.13 * room);
    const penalty = 20 * this.stretch(row).score;
    return round(clamp(base - penalty, 0, 100), 1);
  }

  private buildCandidateTable(shortlist: CandidateRow[]): string {
    const header =
      "code | harga(Rp) | chg1h% | ret1m% | ret3m% | ret6m% | RSI14 | >SMA20 | >SMA50 | >SMA200 | extMA20% | extMA50% | vol% | ATR% | volRatio | DD1y% | drHigh52% | nilaiTransaksi(Rp M/hari) | mcap(Rp T) | PE | PB | ROE% | DER% | revGrowth% | sektor";
    const lines = shortlist.map((row) => {
      const ind = row.indicators;
      const fund = row.fundamentals;
      return [
        row.code,
        fmt(row.price, 0),
        fmt(row.quote.changePct, 2),
        fmt(ind.return1mPct),
        fmt(ind.return3mPct),
        fmt(ind.return6mPct),
        fmt(ind.rsi14),
        ind.sma20 !== null ? (row.price > ind.sma20 ? "ya" : "tidak") : "-",
        ind.sma50 !== null ? (row.price > ind.sma50 ? "ya" : "tidak") : "-",
        ind.sma200 !== null ? (row.price > ind.sma200 ? "ya" : "tidak") : "-",
        fmt(ind.fromSma20Pct),
        fmt(ind.fromSma50Pct),
        fmt(ind.volatilityPct, 0),
        fmt(ind.atrPct, 2),
        fmt(ind.volumeRatio, 2),
        fmt(ind.drawdownPct, 0),
        fmt(ind.from52wHighPct),
        fmt(ind.avgDailyValue / 1e9, 0),
        fmt((row.quote.marketCap ?? 0) / 1e12, 1),
        fmt(fund?.trailingPE),
        fmt(fund?.priceToBook, 2),
        fmt(fund?.returnOnEquityPct),
        fmt(fund?.debtToEquityPct, 0),
        fmt(fund?.revenueGrowthPct),
        fund?.sector ?? "-",
      ].join(" | ");
    });
    return [header, ...lines].join("\n");
  }

  private buildSystemPrompt(agent: AgentBlueprint): string {
    return [
      `Kamu adalah "${agent.name}", salah satu dari 8 agen analis di Agentic Market Desk untuk Bursa Efek Indonesia (IDX).`,
      `Peran: ${agent.role}.`,
      agent.persona,
      "",
      "ATURAN KERJA:",
      "1. Pilih HANYA dari daftar kandidat yang diberikan. Jangan mengarang kode emiten di luar daftar.",
      "2. Pilih tepat 5 emiten: 3 dengan horizon \"trading\" (1-6 minggu) dan 2 dengan horizon \"investment\" (3-12 bulan).",
      "3. conviction 0-100 menunjukkan keyakinanmu, bukan probabilitas. Bersikap tegas dan berbeda bila datanya membedakan.",
      "4. Alasan maksimal 25 kata, memakai angka dari data (RSI, return, PE, ROE, nilai transaksi).",
      "5. Semua nilai uang dalam Rupiah. Jangan menulis kalimat pembuka atau penutup.",
      "6. Jangan mengejar harga yang sudah melambung: hindari emiten dengan extMA20% > 8, RSI > 70, atau ret1m% > 25 " +
        "kecuali ada alasan fundamental kuat yang kamu sebutkan. Prioritaskan kandidat yang masih dekat support MA20/MA50.",
      "",
      'Balas HANYA JSON: {"picks":[{"code":"BBCA","horizon":"trading","conviction":78,"alasan":"..."}],"catatan":"opsional"}',
    ].join("\n");
  }

  private buildUserPrompt(agent: AgentBlueprint, table: string, params: TopPicksParams): string {
    return [
      `Tanggal analisis: ${new Date().toISOString().slice(0, 10)}.`,
      `Filter awal sistem: harga Rp ${params.priceMin}–${params.priceMax}, nilai transaksi ≥ Rp ${(
        params.minDailyValue / 1e9
      ).toFixed(0)} M/hari, kapitalisasi ≥ Rp ${(params.minMarketCap / 1e12).toFixed(0)} T.`,
      "",
      "Kandidat (hasil screening seluruh universe IDX):",
      table,
      "",
      `Tugasmu (${agent.name}): pilih ${params.tradingCount} emiten trading + ${params.investmentCount} emiten investasi dari tabel di atas.`,
      "Ingat: extMA20%/extMA50% adalah jarak harga terhadap rata-rata bergerak. Nilai besar = harga sudah melambung dan entry sekarang berisiko.",
    ].join("\n");
  }

  private buildPicks(input: {
    shortlist: CandidateRow[];
    votes: RawVote[];
    params: TopPicksParams;
    agentsTotal: number;
  }): TopPick[] {
    const { shortlist, votes, params, agentsTotal } = input;
    const byCode = new Map(shortlist.map((row) => [row.code, row]));

    type Bucket = { code: string; horizon: TopPickHorizon; votes: RawVote[] };
    const buckets = new Map<string, Bucket>();
    for (const vote of votes) {
      const key = `${vote.code}|${vote.horizon}`;
      const existing = buckets.get(key);
      if (existing) existing.votes.push(vote);
      else buckets.set(key, { code: vote.code, horizon: vote.horizon, votes: [vote] });
    }

    const scored = [...buckets.values()]
      .map((bucket) => {
        const convictions = bucket.votes.map((vote) => vote.conviction);
        const meanConviction = convictions.reduce((a, b) => a + b, 0) / convictions.length;
        const row = byCode.get(bucket.code);
        const heuristic = row
          ? bucket.horizon === "trading"
            ? row.tradingScore
            : row.investmentScore
          : 50;
        const consensus =
          meanConviction * (0.55 + 0.45 * Math.min(bucket.votes.length / agentsTotal, 1)) * 0.85 +
          heuristic * 0.15;
        return { ...bucket, consensus, heuristic };
      })
      .sort((a, b) => b.consensus - a.consensus);

    const chosen: typeof scored = [];
    const usedCodes = new Set<string>();
    const pickFor = (horizon: TopPickHorizon, count: number, minVotes: number): void => {
      for (const entry of scored) {
        if (chosen.length >= params.tradingCount + params.investmentCount) return;
        if (chosen.filter((item) => item.horizon === horizon).length >= count) return;
        if (entry.horizon !== horizon) continue;
        if (entry.votes.length < minVotes) continue;
        if (usedCodes.has(entry.code)) continue;
        chosen.push(entry);
        usedCodes.add(entry.code);
      }
    };
    // Prioritaskan nama yang didukung minimal 2 agen, baru lengkapi dengan dukungan tunggal.
    pickFor("trading", params.tradingCount, 2);
    pickFor("investment", params.investmentCount, 2);
    pickFor("trading", params.tradingCount, 1);
    pickFor("investment", params.investmentCount, 1);

    // Isi kekurangan dari skor heuristik bila suara agen tidak cukup.
    const fillFromHeuristic = (): void => {
      const need = params.tradingCount + params.investmentCount - chosen.length;
      if (need <= 0) return;
      const pool = [...shortlist]
        .filter((row) => !usedCodes.has(row.code))
        .sort(
          (a, b) =>
            Math.max(b.tradingScore, b.investmentScore) - Math.max(a.tradingScore, a.investmentScore),
        );
      for (const row of pool) {
        if (chosen.length >= params.tradingCount + params.investmentCount) return;
        const horizon: TopPickHorizon =
          chosen.filter((item) => item.horizon === "trading").length < params.tradingCount
            ? "trading"
            : "investment";
        chosen.push({ code: row.code, horizon, votes: [], consensus: row.tradingScore, heuristic: row.tradingScore });
        usedCodes.add(row.code);
      }
    };
    fillFromHeuristic();

    return chosen.slice(0, params.tradingCount + params.investmentCount).map((entry, index) => {
      const row = byCode.get(entry.code);
      return this.toPick(row, entry, index + 1, agentsTotal);
    });
  }

  private toPick(
    row: CandidateRow | undefined,
    entry: { code: string; horizon: TopPickHorizon; votes: RawVote[]; consensus: number; heuristic: number },
    rank: number,
    agentsTotal: number,
  ): TopPick {
    const fallbackPrice = row?.price ?? 0;
    const price = fallbackPrice;
    const ind = row?.indicators;
    const atrPct = ind?.atrPct ?? 2.5;
    const atrAbs = (atrPct / 100) * price;
    const isTrading = entry.horizon === "trading";
    const convictionFactor = clamp(entry.consensus / 100, 0, 1);
    const stopMultiple = isTrading ? 2 : 2.8;
    const targetMultiple = isTrading ? 3.5 + 2 * convictionFactor : 5 + 3 * convictionFactor;

    // Zona entry = tunggu pullback ke support terdekat (MA20 untuk trading, MA50 untuk investasi),
    // bukan menyarankan beli di harga yang sudah melambung.
    const supportRef = isTrading
      ? ind?.sma20 ?? price - atrAbs
      : ind?.sma50 ?? ind?.sma20 ?? price - atrAbs;
    const maxPullbackAtr = isTrading ? 1.6 : 2.2;
    const anchor = Math.max(
      Math.min(supportRef, price - atrAbs * 0.35),
      price - atrAbs * maxPullbackAtr,
    );
    const entryLow = anchor - atrAbs * 0.4;
    const entryHigh = Math.min(anchor + atrAbs * 0.4, price);
    const entryMid = (entryLow + entryHigh) / 2;
    const stopLoss = Math.max(entryMid - atrAbs * stopMultiple, price * 0.5);
    const target = price + atrAbs * targetMultiple;
    const risk = entryMid - stopLoss;

    const plan: TopPickPlan = {
      entryLow: round(entryLow, 0),
      entryHigh: round(entryHigh, 0),
      stopLoss: round(stopLoss, 0),
      target: round(target, 0),
      riskReward: risk > 0 ? round((target - entryMid) / risk, 2) : 0,
      holdDays: isTrading ? 30 : 180,
      entryPullbackPct: price > 0 ? round((entryMid / price - 1) * 100, 1) : 0,
    };

    const votes: TopPickVote[] = entry.votes
      .slice()
      .sort((a, b) => b.conviction - a.conviction)
      .map((vote) => ({
        agentId: vote.agent.id,
        agentName: vote.agent.name,
        model: vote.model,
        modelUsed: vote.modelUsed,
        horizon: vote.horizon,
        conviction: vote.conviction,
        reason: vote.reason,
      }));

    const thesis: string[] = [];
    for (const vote of votes.slice(0, 4)) {
      if (vote.reason) thesis.push(`${vote.agentName}: ${vote.reason}`);
    }
    if (thesis.length === 0 && ind) {
      thesis.push(
        `Skor heuristik trading ${row?.tradingScore ?? 0} / investasi ${row?.investmentScore ?? 0}: momentum ${
          ind.return3mPct !== null ? `${ind.return3mPct.toFixed(1)}% (3 bulan)` : "terbatas"
        }, RSI ${ind.rsi14 !== null ? ind.rsi14.toFixed(0) : "-"}.`,
      );
    }

    const risks: string[] = [];
    const stretch = row ? this.stretch(row) : { score: 0, reasons: [] as string[] };
    if (stretch.score > 0.4 && stretch.reasons.length > 0) {
      risks.push(
        `Harga sudah melambung (${stretch.reasons.slice(0, 2).join(", ")}); tunggu pullback ke ` +
          `Rp ${Math.round(entryLow).toLocaleString("id-ID")}–${Math.round(entryHigh).toLocaleString("id-ID")} sebelum beli.`,
      );
    }
    if (ind?.rsi14 != null && ind.rsi14 > 72) risks.push(`RSI ${ind.rsi14.toFixed(0)} sudah panas; rawan koreksi teknikal.`);
    if (ind?.volatilityPct != null && ind.volatilityPct > 55)
      risks.push(`Volatilitas tahunan ${ind.volatilityPct.toFixed(0)}% tinggi; kecilkan ukuran posisi.`);
    if (ind?.avgDailyValue != null && ind.avgDailyValue < 10e9)
      risks.push("Nilai transaksi harian di bawah Rp 10 M; slippage saat keluar posisi besar.");
    if (ind?.sma200 != null && price < ind.sma200) risks.push("Harga masih di bawah SMA200 (tren jangka panjang belum pulih).");
    if (row?.fundamentals?.debtToEquityPct != null && row.fundamentals.debtToEquityPct > 150)
      risks.push(`DER ${row.fundamentals.debtToEquityPct.toFixed(0)}% cukup tinggi.`);
    if (risks.length === 0) risks.push("Risiko utama: perubahan sentimen pasar/IHSG dan rilis laporan keuangan.");

    const consensusScore = round(clamp(entry.consensus, 0, 100), 1);
    const voteCount = entry.votes.length;
    const grade =
      consensusScore >= 78 && voteCount >= 4
        ? "A"
        : consensusScore >= 68 && voteCount >= 3
          ? "B"
          : consensusScore >= 58
            ? "C"
            : "D";

    return {
      rank,
      horizon: entry.horizon,
      code: entry.code,
      symbol: row?.symbol ?? `${entry.code}.JK`,
      name: row?.name ?? null,
      sector: row?.fundamentals?.sector ?? null,
      price: round(price, 0),
      changePct: row?.quote.changePct ?? null,
      marketCap: row?.quote.marketCap ?? null,
      consensusScore,
      voteCount,
      agreementPct: round((voteCount / Math.max(agentsTotal, 1)) * 100, 0),
      grade,
      heuristicScore: round(entry.heuristic, 1),
      overextended: stretch.score >= 1.2,
      stretchScore: stretch.score,
      stretchReasons: stretch.reasons,
      indicators: ind ?? {
        sma20: null,
        sma50: null,
        sma200: null,
        rsi14: null,
        atrPct: null,
        volatilityPct: null,
        return1mPct: null,
        return3mPct: null,
        return6mPct: null,
        volumeRatio: null,
        drawdownPct: null,
        from52wHighPct: null,
        fromSma20Pct: null,
        fromSma50Pct: null,
        avgDailyValue: 0,
      },
      fundamentals: row?.fundamentals
        ? {
            sector: row.fundamentals.sector,
            trailingPE: row.fundamentals.trailingPE,
            priceToBook: row.fundamentals.priceToBook,
            returnOnEquityPct: row.fundamentals.returnOnEquityPct,
            debtToEquityPct: row.fundamentals.debtToEquityPct,
            revenueGrowthPct: row.fundamentals.revenueGrowthPct,
            profitMarginPct: row.fundamentals.profitMarginPct,
            dividendYieldPct: row.fundamentals.dividendYieldPct,
          }
        : null,
      plan,
      thesis,
      risks,
      votes,
    };
  }

  private regimeNote(rows: CandidateRow[]): string {
    if (rows.length === 0) return "Rezim pasar tidak dapat dinilai (data kosong).";
    const above200 = rows.filter((row) => row.indicators.sma200 !== null && row.price > row.indicators.sma200).length;
    const share = (above200 / rows.length) * 100;
    if (share >= 60) return `Mayoritas kandidat (${share.toFixed(0)}%) di atas SMA200: rezim cenderung risk-on.`;
    if (share <= 35) return `Hanya ${share.toFixed(0)}% kandidat di atas SMA200: rezim cenderung risk-off, prioritaskan posisi kecil.`;
    return `${share.toFixed(0)}% kandidat di atas SMA200: rezim campuran, pilih nama dengan tren terkuat.`;
  }
}
