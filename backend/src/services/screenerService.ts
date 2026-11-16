import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { idxCompany, type IdxCompanyProfile } from "../data/idxCompanies.js";
import { IDX_UNIVERSE, type IdxUniverseEntry } from "../data/idxUniverse.js";
import { AppError, errorMessage } from "../lib/errors.js";
import { silentLogger, type LoggerLike } from "../lib/logger.js";
import { computeQuality } from "./quality.js";
import type { MarketDataProviders } from "../providers/types.js";
import type {
  CompanyProfile,
  FinancialPeriod,
  Quote,
  ScreenerBucket,
  ScreenerDetail,
  ScreenerFinancialSummary,
  ScreenerKeyStats,
  ScreenerProgress,
  ScreenerResults,
  ScreenerRow,
  ScreenerSectorCount,
  ScreenerSummary,
} from "../types.js";

const CACHE_VERSION = 1;
const QUOTE_CHUNK_SIZE = 100;

export type ScreenerSortKey =
  | "symbol"
  | "price"
  | "change"
  | "marketCap"
  | "pe"
  | "dividend"
  | "revenue"
  | "revenueGrowth"
  | "netIncome"
  | "assets"
  | "quality";

export interface ScreenerResultsQuery {
  q?: string;
  sector?: string;
  hasFinancials?: "all" | "yes" | "no";
  priceMin?: number;
  priceMax?: number;
  onlyProfitable?: boolean;
  antiGorengan?: boolean;
  maxDer?: number;
  minRevenueGrowth?: number;
  qualityVerdict?: "all" | "healthy" | "buy" | "watch" | "avoid";
  sort?: ScreenerSortKey;
  direction?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface ScreenerServiceOptions {
  providers: MarketDataProviders;
  dataDir: string;
  universe?: readonly IdxUniverseEntry[];
  concurrency?: number;
  logger?: LoggerLike;
}

interface StoredCompany {
  symbol: string;
  code: string;
  name: string;
  quote: Quote | null;
  financials: FinancialPeriod[];
  fetchedAt: string;
  error: string | null;
}

interface PersistedScreener {
  version: number;
  savedAt: string;
  total: number;
  failed: number;
  companies: StoredCompany[];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

async function mapWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      await worker(items[index] as T);
    }
  });
  await Promise.all(workers);
}

function normalizedCode(input: string): string {
  return input.trim().toUpperCase().replace(/\.JK$/i, "");
}

function mergeProfile(
  code: string,
  staticProfile: IdxCompanyProfile | null,
  yahooProfile: CompanyProfile | null,
): CompanyProfile {
  const symbol = `${code}.JK`;
  return {
    symbol,
    code,
    name: staticProfile?.name ?? yahooProfile?.name ?? code,
    longName: yahooProfile?.longName ?? staticProfile?.name ?? code,
    sector: staticProfile?.sector ?? yahooProfile?.sector ?? null,
    subSector: staticProfile?.subSector ?? null,
    industry: staticProfile?.industry ?? yahooProfile?.industry ?? null,
    subIndustry: staticProfile?.subIndustry ?? null,
    address: staticProfile?.address ?? yahooProfile?.address ?? null,
    city: yahooProfile?.city ?? null,
    country: yahooProfile?.country ?? "Indonesia",
    website: staticProfile?.website ?? yahooProfile?.website ?? null,
    phone: staticProfile?.phone ?? yahooProfile?.phone ?? null,
    email: staticProfile?.email ?? null,
    board: staticProfile?.board ?? null,
    listingDate: staticProfile?.listingDate ?? null,
    mainBusiness: staticProfile?.mainBusiness ?? null,
    description: yahooProfile?.description ?? null,
    employees: yahooProfile?.employees ?? null,
    secretary: staticProfile?.secretary ?? null,
    officers: yahooProfile?.officers ?? [],
    directors: staticProfile?.directors ?? [],
    commissioners: staticProfile?.commissioners ?? [],
    shareholders: staticProfile?.shareholders ?? [],
  };
}

function latestFinancials(periods: readonly FinancialPeriod[]): ScreenerFinancialSummary | null {
  const latest = periods[periods.length - 1];
  if (!latest) return null;
  return {
    fiscalYear: latest.fiscalYear,
    periodEnd: latest.periodEnd,
    revenue: latest.totalRevenue ?? latest.operatingRevenue,
    revenueGrowthPct: latest.revenueGrowthPct,
    costOfRevenue: latest.costOfRevenue,
    grossProfit: latest.grossProfit,
    operatingExpense: latest.operatingExpense,
    operatingIncome: latest.operatingIncome,
    netIncome: latest.netIncome,
    netIncomeGrowthPct: latest.netIncomeGrowthPct,
    totalAssets: latest.totalAssets,
    totalLiabilities: latest.totalLiabilities,
    stockholdersEquity: latest.stockholdersEquity,
    operatingCashFlow: latest.operatingCashFlow,
    freeCashFlow: latest.freeCashFlow,
    eps: latest.basicEPS ?? latest.dilutedEPS,
    grossMarginPct: latest.grossMarginPct,
    operatingMarginPct: latest.operatingMarginPct,
    netMarginPct: latest.netMarginPct,
  };
}

function sortValue(row: ScreenerRow, key: ScreenerSortKey): number | null {
  switch (key) {
    case "price":
      return row.price;
    case "change":
      return row.changePct;
    case "marketCap":
      return row.marketCap;
    case "pe":
      return row.trailingPE;
    case "dividend":
      return row.dividendYieldPct;
    case "revenue":
      return row.financials?.revenue ?? null;
    case "revenueGrowth":
      return row.financials?.revenueGrowthPct ?? null;
    case "netIncome":
      return row.financials?.netIncome ?? null;
    case "assets":
      return row.financials?.totalAssets ?? null;
    case "quality":
      return row.quality?.score ?? null;
    default:
      return null;
  }
}

const PRICE_BUCKETS: readonly { label: string; min: number | null; max: number | null }[] = [
  { label: "< Rp 100", min: null, max: 100 },
  { label: "Rp 100–500", min: 100, max: 500 },
  { label: "Rp 500–5.000", min: 500, max: 5_000 },
  { label: "Rp 5.000–50.000", min: 5_000, max: 50_000 },
  { label: "≥ Rp 50.000", min: 50_000, max: null },
  { label: "Tanpa harga", min: null, max: null },
];

function priceBucketLabel(price: number | null): string {
  if (price === null) return "Tanpa harga";
  for (const bucket of PRICE_BUCKETS) {
    if (bucket.label === "Tanpa harga") continue;
    const aboveMin = bucket.min === null || price >= bucket.min;
    const belowMax = bucket.max === null || price < bucket.max;
    if (aboveMin && belowMax) return bucket.label;
  }
  return "Tanpa harga";
}

export class ScreenerService {
  private readonly providers: MarketDataProviders;
  private readonly universe: readonly IdxUniverseEntry[];
  private readonly knownSymbols: Set<string>;
  private readonly concurrency: number;
  private readonly logger: LoggerLike;
  private readonly cachePath: string;
  private readonly records = new Map<string, StoredCompany>();
  private startedAtMs: number | null = null;
  private running = false;
  private rowsCache: ScreenerRow[] | null = null;
  private summaryCache: ScreenerSummary | null = null;
  private sectorCache: ScreenerSectorCount[] | null = null;
  private priceBucketCache: ScreenerBucket[] | null = null;
  private verdictCache: ScreenerBucket[] | null = null;
  private progress: ScreenerProgress;

  constructor(options: ScreenerServiceOptions) {
    this.providers = options.providers;
    this.universe = options.universe ?? IDX_UNIVERSE;
    this.knownSymbols = new Set(this.universe.map((entry) => entry.symbol));
    this.concurrency = Math.min(Math.max(1, options.concurrency ?? 6), 16);
    this.logger = options.logger ?? silentLogger;
    this.cachePath = join(options.dataDir, "screener-cache.json");
    this.progress = {
      status: "idle",
      phase: "idle",
      total: this.universe.length,
      quoted: 0,
      processed: 0,
      withFinancials: 0,
      failed: 0,
      percent: 0,
      startedAt: null,
      finishedAt: null,
      elapsedMs: 0,
      updatedAt: null,
      currentSymbol: null,
      message: `Belum ada data. Tekan Ambil data untuk memindai sekitar ${this.universe.length} emiten IDX.`,
      snapshotAt: null,
    };
    this.loadCache();
  }

  start(): ScreenerProgress {
    if (this.running) return this.snapshot();
    const startedAt = new Date();
    this.running = true;
    this.startedAtMs = startedAt.getTime();
    this.progress = {
      status: "running",
      phase: "quotes",
      total: this.universe.length,
      quoted: 0,
      processed: 0,
      withFinancials: 0,
      failed: 0,
      percent: 0,
      startedAt: startedAt.toISOString(),
      finishedAt: null,
      elapsedMs: 0,
      updatedAt: startedAt.toISOString(),
      currentSymbol: null,
      message: `Mengambil harga saham 0/${this.universe.length} emiten...`,
      snapshotAt: this.progress.snapshotAt,
    };
    void this.run(startedAt).catch((error) => {
      this.running = false;
      this.progress = {
        ...this.progress,
        status: "failed",
        phase: "idle",
        finishedAt: new Date().toISOString(),
        elapsedMs: Date.now() - startedAt.getTime(),
        currentSymbol: null,
        message: `Gagal mengambil data screener: ${errorMessage(error)}`,
        updatedAt: new Date().toISOString(),
      };
      this.logger.error(`Screener gagal: ${errorMessage(error)}`);
    });
    return this.snapshot();
  }

  status(): ScreenerProgress {
    return this.snapshot();
  }

  results(query: ScreenerResultsQuery = {}): ScreenerResults {
    const allRows = this.rows();
    const pageSize = Math.min(Math.max(query.pageSize ?? 50, 10), 200);
    const needle = query.q?.trim().toLowerCase() ?? "";
    const sector = query.sector?.trim() ?? "";
    const priceMin = typeof query.priceMin === "number" && Number.isFinite(query.priceMin) ? query.priceMin : null;
    const priceMax = typeof query.priceMax === "number" && Number.isFinite(query.priceMax) ? query.priceMax : null;

    const filtered = allRows.filter((row) => {
      if (query.hasFinancials === "yes" && row.financials === null) return false;
      if (query.hasFinancials === "no" && row.financials !== null) return false;
      if (sector !== "" && row.sector !== sector) return false;
      if (priceMin !== null && (row.price === null || row.price < priceMin)) return false;
      if (priceMax !== null && (row.price === null || row.price > priceMax)) return false;

      // Filter emiten yang rugi (hanya perusahaan untung)
      if (query.onlyProfitable) {
        if (!row.financials || row.financials.netIncome === null || row.financials.netIncome <= 0) {
          return false;
        }
      }

      // Filter pertumbuhan pendapatan tidak minus banyak
      if (typeof query.minRevenueGrowth === "number" && Number.isFinite(query.minRevenueGrowth)) {
        if (
          !row.financials ||
          row.financials.revenueGrowthPct === null ||
          row.financials.revenueGrowthPct < query.minRevenueGrowth
        ) {
          return false;
        }
      }

      // Filter batas utang (DER) & hindari defisiensi modal
      if (typeof query.maxDer === "number" && Number.isFinite(query.maxDer)) {
        const der = row.quality?.metrics.debtToEquityPct;
        if (der !== null && der !== undefined && der > query.maxDer) {
          return false;
        }
        if (
          row.financials?.stockholdersEquity !== null &&
          row.financials?.stockholdersEquity !== undefined &&
          row.financials.stockholdersEquity <= 0
        ) {
          return false;
        }
      }

      // Filter anti-gorengan & saham tidak jelas
      if (query.antiGorengan) {
        // Harus ada harga wajar
        if (row.price === null || row.price < 50) return false;
        // Wajib memiliki laporan keuangan
        if (!row.financials) return false;
        // Market cap likuid minimal Rp 300 Miliar (menghindari penny stock tidak likuid)
        if (row.marketCap !== null && row.marketCap < 300_000_000_000) return false;
        // Hindari emiten berpredikat "avoid"
        if (row.quality && row.quality.verdict === "avoid") return false;
        // Hindari papan akselerasi / pemantauan khusus
        if (row.board) {
          const lowerBoard = row.board.toLowerCase();
          if (lowerBoard.includes("akselerasi") || lowerBoard.includes("pemantauan khusus")) {
            return false;
          }
        }
      }

      // Filter kualitas spesifik
      if (query.qualityVerdict && query.qualityVerdict !== "all") {
        if (query.qualityVerdict === "healthy") {
          if (!row.quality || row.quality.verdict === "avoid") return false;
        } else if (row.quality?.verdict !== query.qualityVerdict) {
          return false;
        }
      }

      if (needle === "") return true;
      return (
        row.code.toLowerCase().includes(needle) ||
        row.name.toLowerCase().includes(needle) ||
        (row.sector ?? "").toLowerCase().includes(needle) ||
        (row.industry ?? "").toLowerCase().includes(needle)
      );
    });

    const sort = query.sort ?? "marketCap";
    const direction = query.direction ?? (sort === "symbol" ? "asc" : "desc");
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sort === "symbol") {
        const comparison = a.code.localeCompare(b.code);
        return direction === "asc" ? comparison : -comparison;
      }
      const aValue = sortValue(a, sort);
      const bValue = sortValue(b, sort);
      if (aValue === null && bValue === null) return a.code.localeCompare(b.code);
      if (aValue === null) return 1;
      if (bValue === null) return -1;
      const comparison = aValue - bValue;
      return direction === "asc" ? comparison : -comparison;
    });

    const total = sorted.length;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(Math.max(query.page ?? 1, 1), pageCount);
    const offset = (page - 1) * pageSize;

    return {
      progress: this.snapshot(),
      rows: sorted.slice(offset, offset + pageSize),
      total,
      page,
      pageSize,
      sectors: this.sectors(),
      priceBuckets: this.priceBuckets(),
      verdicts: this.verdicts(),
      fiscalYears: this.fiscalYears(),
      summary: this.summary(),
      snapshotAt: this.progress.snapshotAt,
    };
  }

  async detail(input: string): Promise<ScreenerDetail> {
    const code = normalizedCode(input);
    const symbol = `${code}.JK`;
    const record = this.records.get(symbol);
    if (!record) {
      throw new AppError(
        `Emiten ${code} belum ada dalam hasil screener. Ambil data terlebih dahulu.`,
        404,
        "not_found",
      );
    }

    let yahooProfile: CompanyProfile | null = null;
    let keyStats: ScreenerKeyStats | null = null;
    let profileError: string | null = null;
    try {
      const overview = await this.providers.companyOverview(symbol);
      yahooProfile = overview.profile;
      keyStats = overview.keyStats;
    } catch (error) {
      profileError = errorMessage(error);
    }

    return {
      row: this.toRow(record),
      financials: record.financials,
      profile: mergeProfile(code, idxCompany(code), yahooProfile),
      keyStats,
      profileError,
      fetchedAt: new Date().toISOString(),
    };
  }

  private async run(startedAt: Date): Promise<void> {
    try {
      const quotes = await this.loadQuotes();
      this.progress.phase = "financials";
      this.progress.currentSymbol = null;
      this.progress.message = `Mengambil laporan keuangan 0/${this.universe.length} emiten...`;
      this.touch();

      const next = new Map<string, StoredCompany>();
      for (const entry of this.universe) {
        const profile = idxCompany(entry.code);
        next.set(entry.symbol, {
          symbol: entry.symbol,
          code: entry.code,
          name: profile?.name ?? entry.name,
          quote: quotes.get(entry.symbol) ?? null,
          financials: [],
          fetchedAt: new Date().toISOString(),
          error: null,
        });
      }

      let processed = 0;
      let withFinancials = 0;
      let failed = 0;

      await mapWithConcurrency(this.universe, this.concurrency, async (entry) => {
        const record = next.get(entry.symbol);
        if (!record) return;
        this.progress.currentSymbol = entry.code;
        try {
          const financials = await this.withRetry(
            () => this.providers.financialHistory(entry.symbol),
            2,
          );
          record.financials = financials;
          if (financials.length > 0) withFinancials += 1;
        } catch (error) {
          record.error = errorMessage(error);
          failed += 1;
        }

        processed += 1;
        record.fetchedAt = new Date().toISOString();
        this.progress.processed = processed;
        this.progress.withFinancials = withFinancials;
        this.progress.failed = failed;
        this.progress.percent = 10 + (processed / Math.max(1, this.universe.length)) * 90;
        this.progress.message = `Mengambil laporan keuangan ${processed}/${this.universe.length} emiten...`;
        this.touch();
      });

      this.records.clear();
      for (const [symbol, record] of next) this.records.set(symbol, record);
      this.invalidate();

      const finishedAt = new Date();
      this.progress.status = "complete";
      this.progress.phase = "done";
      this.progress.processed = this.universe.length;
      this.progress.withFinancials = withFinancials;
      this.progress.failed = failed;
      this.progress.percent = 100;
      this.progress.finishedAt = finishedAt.toISOString();
      this.progress.elapsedMs = finishedAt.getTime() - startedAt.getTime();
      this.progress.currentSymbol = null;
      this.progress.snapshotAt = finishedAt.toISOString();
      this.progress.message =
        failed > 0
          ? `Selesai: ${withFinancials} emiten memiliki laporan keuangan, ${failed} gagal diambil.`
          : `Selesai: ${withFinancials} emiten memiliki laporan keuangan tahunan.`;
      this.touch();
      await this.persist(finishedAt.toISOString());
      this.logger.info(
        `Screener selesai dalam ${Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000)} detik; ${withFinancials} emiten dengan laporan keuangan.`,
      );
    } finally {
      this.running = false;
      this.startedAtMs = null;
    }
  }

  private async loadQuotes(): Promise<Map<string, Quote>> {
    const quotes = new Map<string, Quote>();
    const symbols = this.universe.map((entry) => entry.symbol);
    const chunks = chunk(symbols, QUOTE_CHUNK_SIZE);

    for (let index = 0; index < chunks.length; index += 1) {
      const current = chunks[index];
      if (!current) continue;
      try {
        const batch = await this.withRetry(() => this.providers.quotes(current), 2);
        for (const quote of batch) {
          quotes.set(quote.symbol.toUpperCase(), quote);
        }
      } catch (error) {
        this.logger.warn(
          `Gagal mengambil harga ${current.length} emiten: ${errorMessage(error)}`,
        );
      }
      const quoted = quotes.size;
      this.progress.quoted = quoted;
      this.progress.percent = ((index + 1) / Math.max(1, chunks.length)) * 10;
      this.progress.message = `Mengambil harga saham ${quoted}/${symbols.length} emiten...`;
      this.touch();
      if (index < chunks.length - 1) await delay(120);
    }

    return quotes;
  }

  private async withRetry<T>(operation: () => Promise<T>, attempts: number): Promise<T> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (attempt < attempts - 1) await delay(450 * (attempt + 1));
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private snapshot(): ScreenerProgress {
    const elapsedMs =
      this.running && this.startedAtMs !== null
        ? Math.max(0, Date.now() - this.startedAtMs)
        : this.progress.elapsedMs;
    return { ...this.progress, elapsedMs };
  }

  private touch(): void {
    this.progress.updatedAt = new Date().toISOString();
    if (this.startedAtMs !== null) {
      this.progress.elapsedMs = Math.max(0, Date.now() - this.startedAtMs);
    }
  }

  private invalidate(): void {
    this.rowsCache = null;
    this.summaryCache = null;
    this.sectorCache = null;
  }

  private rows(): ScreenerRow[] {
    if (this.rowsCache) return this.rowsCache;
    const rows = [...this.records.values()].map((record) => this.toRow(record));
    rows.sort((a, b) => {
      const capA = a.marketCap ?? Number.NEGATIVE_INFINITY;
      const capB = b.marketCap ?? Number.NEGATIVE_INFINITY;
      if (capB !== capA) return capB - capA;
      return a.code.localeCompare(b.code);
    });
    this.rowsCache = rows;
    return rows;
  }

  private toRow(record: StoredCompany): ScreenerRow {
    const profile = idxCompany(record.code);
    const quote = record.quote;
    const financials = latestFinancials(record.financials);
    const revenueTrend = record.financials.slice(-5).map((period) => ({
      fiscalYear: period.fiscalYear,
      revenue: period.totalRevenue ?? period.operatingRevenue,
      netIncome: period.netIncome,
      growthPct: period.revenueGrowthPct,
    }));
    const quality = computeQuality({
      quote: quote
        ? {
            price: quote.price ?? null,
            changePct: quote.changePct ?? null,
            trailingPE: quote.trailingPE ?? null,
            priceToBook: quote.priceToBook ?? null,
            dividendYieldPct: quote.dividendYieldPct ?? null,
            fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh ?? null,
            fiftyTwoWeekLow: quote.fiftyTwoWeekLow ?? null,
          }
        : null,
      latest: record.financials[record.financials.length - 1] ?? null,
    });
    return {
      symbol: record.symbol,
      code: record.code,
      name: profile?.name ?? quote?.name ?? record.name,
      sector: profile?.sector ?? null,
      subSector: profile?.subSector ?? null,
      industry: profile?.industry ?? null,
      board: profile?.board ?? null,
      listingDate: profile?.listingDate ?? null,
      mainBusiness: profile?.mainBusiness ?? null,
      price: quote?.price ?? null,
      previousClose: quote?.previousClose ?? null,
      changePct: quote?.changePct ?? null,
      volume: quote?.volume ?? null,
      marketCap: quote?.marketCap ?? null,
      trailingPE: quote?.trailingPE ?? null,
      priceToBook: quote?.priceToBook ?? null,
      dividendYieldPct: quote?.dividendYieldPct ?? null,
      eps: quote?.epsTrailing ?? financials?.eps ?? null,
      high52w: quote?.fiftyTwoWeekHigh ?? null,
      low52w: quote?.fiftyTwoWeekLow ?? null,
      marketTime: quote?.marketTime ?? null,
      financials,
      revenueTrend,
      quality,
      dataStatus:
        record.financials.length > 0
          ? "complete"
          : quote
            ? "price_only"
            : "empty",
      error: record.error,
    };
  }

  private summary(): ScreenerSummary {
    if (this.summaryCache) return this.summaryCache;
    let loaded = 0;
    let withFinancials = 0;
    let gainers = 0;
    let losers = 0;
    let changeSum = 0;
    let changeCount = 0;
    let marketCap = 0;
    let hasMarketCap = false;

    for (const row of this.rows()) {
      if (row.price !== null || row.financials !== null) loaded += 1;
      if (row.financials !== null) withFinancials += 1;
      if (row.changePct !== null) {
        changeSum += row.changePct;
        changeCount += 1;
        if (row.changePct > 0) gainers += 1;
        if (row.changePct < 0) losers += 1;
      }
      if (row.marketCap !== null) {
        marketCap += row.marketCap;
        hasMarketCap = true;
      }
    }

    this.summaryCache = {
      total: this.universe.length,
      loaded,
      withFinancials,
      gainers,
      losers,
      averageChangePct: changeCount > 0 ? changeSum / changeCount : null,
      marketCap: hasMarketCap ? marketCap : null,
      failed: this.progress.failed,
    };
    return this.summaryCache;
  }

  private sectors(): ScreenerSectorCount[] {
    if (this.sectorCache) return this.sectorCache;
    const counts = new Map<string, number>();
    for (const row of this.rows()) {
      const sector = row.sector ?? "Lainnya";
      counts.set(sector, (counts.get(sector) ?? 0) + 1);
    }
    this.sectorCache = [...counts.entries()]
      .map(([sector, count]) => ({ sector, count }))
      .sort((a, b) => b.count - a.count || a.sector.localeCompare(b.sector));
    return this.sectorCache;
  }

  private priceBuckets(): ScreenerBucket[] {
    if (this.priceBucketCache) return this.priceBucketCache;
    const counts = new Map<string, number>();
    for (const bucket of PRICE_BUCKETS) counts.set(bucket.label, 0);
    for (const row of this.rows()) {
      const label = priceBucketLabel(row.price);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    this.priceBucketCache = PRICE_BUCKETS.map((bucket) => ({
      label: bucket.label,
      count: counts.get(bucket.label) ?? 0,
    }));
    return this.priceBucketCache;
  }

  private verdicts(): ScreenerBucket[] {
    if (this.verdictCache) return this.verdictCache;
    const counts = { buy: 0, watch: 0, avoid: 0, none: 0 };
    for (const row of this.rows()) {
      if (row.quality) counts[row.quality.verdict] += 1;
      else counts.none += 1;
    }
    this.verdictCache = [
      { label: "Layak beli", count: counts.buy },
      { label: "Pantau", count: counts.watch },
      { label: "Hindari", count: counts.avoid },
      { label: "Data kurang", count: counts.none },
    ];
    return this.verdictCache;
  }

  private fiscalYears(): number[] {
    const years = new Set<number>();
    for (const row of this.rows()) {
      for (const point of row.revenueTrend) years.add(point.fiscalYear);
    }
    return [...years].sort((a, b) => a - b).slice(-3);
  }

  private loadCache(): void {
    if (!existsSync(this.cachePath)) return;
    try {
      const parsed = JSON.parse(readFileSync(this.cachePath, "utf8")) as PersistedScreener;
      if (parsed.version !== CACHE_VERSION || !Array.isArray(parsed.companies)) return;
      for (const company of parsed.companies) {
        if (!company.symbol || !this.knownSymbols.has(company.symbol)) continue;
        if (!Array.isArray(company.financials)) continue;
        this.records.set(company.symbol, company);
      }
      if (this.records.size === 0) return;
      const quoted = [...this.records.values()].filter((record) => record.quote !== null).length;
      const withFinancials = [...this.records.values()].filter(
        (record) => record.financials.length > 0,
      ).length;
      this.invalidate();
      this.progress = {
        ...this.progress,
        status: "idle",
        phase: "idle",
        quoted,
        processed: this.records.size,
        withFinancials,
        failed: parsed.failed ?? 0,
        percent: 100,
        elapsedMs: 0,
        updatedAt: parsed.savedAt,
        currentSymbol: null,
        message: `Data tersimpan dari ${new Date(parsed.savedAt).toLocaleString("id-ID")}. Tekan Ambil data untuk memperbarui.`,
        snapshotAt: parsed.savedAt,
      };
      this.logger.info(`Memuat ${this.records.size} emiten dari cache screener.`);
    } catch (error) {
      this.logger.warn(`Cache screener tidak dapat dibaca: ${errorMessage(error)}`);
    }
  }

  private async persist(savedAt: string): Promise<void> {
    const payload: PersistedScreener = {
      version: CACHE_VERSION,
      savedAt,
      total: this.universe.length,
      failed: this.progress.failed,
      companies: [...this.records.values()],
    };
    try {
      await mkdir(dirname(this.cachePath), { recursive: true });
      await writeFile(this.cachePath, JSON.stringify(payload), "utf8");
    } catch (error) {
      this.logger.warn(`Gagal menyimpan cache screener: ${errorMessage(error)}`);
    }
  }
}
