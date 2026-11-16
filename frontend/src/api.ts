export type Horizon = "trading" | "investment";
export type Focus = Horizon | "both";
export type Action = "strong_buy" | "buy" | "hold" | "reduce" | "sell";
export type MacroRegime = "risk_on" | "neutral" | "risk_off";
export type AgentName = "technical" | "fundamental" | "macro" | "sentiment";
export type OfficeAgentId =
  | "data_ingestion"
  | AgentName
  | "synthesizer"
  | "risk_manager"
  | "critic";
export type AgentStatus = "ok" | "degraded" | "failed";
export type OfficeAgentStatus = AgentStatus | "idle" | "working";

export interface OfficeAgent {
  id: OfficeAgentId;
  name: string;
  role: string;
  horizon: string;
  status: OfficeAgentStatus;
  task: string;
  summary: string;
  durationMs: number | null;
  score: number | null;
  confidence: number | null;
  lastRunAt: string | null;
}

export interface OfficeSnapshot {
  generatedAt: string;
  latestAnalysis: StoredAnalysisSummary | null;
  agents: OfficeAgent[];
}

export interface StoredAnalysisSummary {
  id: string;
  symbol: string;
  createdAt: string;
  focus: Focus;
  horizon: Horizon;
  action: Action;
  confidence: number;
  score: number;
}

export interface Health {
  status: string;
  time: string;
  uptimeSec: number;
  dataProvider: string;
  llmEnabled: boolean;
}

/** Status kesehatan model LLM, dipakai popup peringatan di halaman utama. */
export type LlmHealthState = "healthy" | "error" | "disabled" | "unknown";

export interface LlmHealth {
  state: LlmHealthState;
  ok: boolean;
  enabled: boolean;
  model: string;
  modelReplied?: string | null;
  replyPreview?: string | null;
  message: string;
  error: string | null;
  latencyMs: number | null;
  checkedAt: string | null;
  consecutiveFailures: number;
  probeTimeoutMs: number;
}

export interface Quote {
  symbol: string;
  name: string | null;
  currency: string | null;
  exchange: string | null;
  marketState: string | null;
  price: number;
  previousClose: number | null;
  changePct: number | null;
  volume: number | null;
  averageVolume10d: number | null;
  marketCap: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  marketTime: string;
  fetchedAt: string;
}

export interface NewsItem {
  id: string;
  title: string;
  publisher: string | null;
  url: string | null;
  publishedAt: string;
  relatedSymbols: string[];
  impactScore?: number;
  impactLevel?: "critical" | "high" | "medium" | "low" | "minimal";
  impactLabel?: string;
  sentiment?: "positive" | "neutral" | "negative";
  events?: string[];
  imageUrl?: string | null;
  snippet?: string | null;
}

export interface PortfolioItem {
  id: string;
  symbol: string;
  name: string;
  sector: string;
  buyPrice: number;
  lots: number;
  shares: number;
  buyDate: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreatePortfolioInput {
  symbol: string;
  name?: string;
  sector?: string;
  buyPrice: number;
  lots: number;
  buyDate?: string;
  notes?: string;
}

export interface UpdatePortfolioInput {
  symbol?: string;
  name?: string;
  sector?: string;
  buyPrice?: number;
  lots?: number;
  buyDate?: string;
  notes?: string;
}

export interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjClose?: number | null;
}

export interface PriceSeries {
  symbol: string;
  currency: string | null;
  interval: "1d" | "1wk" | "1mo";
  fetchedAt: string;
  candles: Candle[];
}

export type MetricValue = number | string | boolean | null;

export interface AgentSignal {
  agent: AgentName;
  asOf: string;
  score: number;
  confidence: number;
  summary: string;
  evidence: string[];
  warnings: string[];
  metrics: Record<string, MetricValue>;
}

export interface AgentRun {
  agent: AgentName;
  status: AgentStatus;
  durationMs: number;
  signal: AgentSignal | null;
  warnings: string[];
  error: string | null;
}

export interface HorizonAssessment {
  horizon: Horizon;
  action: Action;
  score: number;
  probabilityUp: number;
  confidence: number;
  weights: Partial<Record<AgentName, number>>;
  contributions: Partial<Record<AgentName, number>>;
  thesis: string[];
  conflicts: string[];
}

export interface RiskLimits {
  maxRiskPerTradePct: number;
  targetVolatilityPct: number;
  maxPositionPct: number;
  maxDrawdownPct: number;
  maxSectorExposurePct: number;
}

export interface PositionSizing {
  atr: number;
  atrPct: number;
  stopLoss: number | null;
  takeProfit: number | null;
  stopDistancePct: number | null;
  riskAmount: number;
  recommendedShares: number;
  recommendedPositionValue: number;
  recommendedPositionPct: number;
  maxLossAtStop: number;
  volatilityTargetPct: number;
  fractionalKellyPct: number;
}

export interface RiskAssessment {
  approved: boolean;
  reasons: string[];
  warnings: string[];
  killSwitch: { triggered: boolean; reason: string | null };
  limits: RiskLimits;
  sizing: PositionSizing | null;
  exitPlan: { stopLoss: number; takeProfit: number | null; note: string } | null;
}

export type CheckStatus = "pass" | "warn" | "fail";

export interface CriticResult {
  verdict: "pass" | "caution" | "reject";
  confidenceMultiplier: number;
  objections: string[];
  checks: { name: string; status: CheckStatus; detail: string }[];
  llmUsed: boolean;
}

export interface DataQuality {
  quoteAgeHours: number | null;
  historyCandles: number;
  hasFundamentals: boolean;
  newsItems: number;
  macroAvailable: boolean;
  issues: string[];
  degraded: boolean;
}

export type SentimentLabel = "positive" | "neutral" | "negative";

export interface SentimentItem {
  newsId: string;
  title: string;
  publishedAt: string;
  score: number;
  label: SentimentLabel;
  events: string[];
  impact: number;
  source: "lexicon" | "llm";
}

export interface AnalysisResult {
  id: string;
  symbol: string;
  name: string | null;
  createdAt: string;
  focus: Focus;
  quote: Quote | null;
  fundamentalsSummary: {
    sector: string | null;
    trailingPE: number | null;
    priceToBook: number | null;
    returnOnEquityPct: number | null;
    revenueGrowthPct: number | null;
    debtToEquityPct: number | null;
  } | null;
  recommendation: {
    horizon: Horizon;
    action: Action;
    score: number;
    confidence: number;
    probabilityUp: number;
    calibration: "uncalibrated_heuristic";
    thesis: string[];
    conflicts: string[];
  };
  horizons: HorizonAssessment[];
  regime: MacroRegime;
  risk: RiskAssessment;
  critic: CriticResult;
  agents: AgentRun[];
  sentiment: {
    aggregateScore: number;
    coverage: number;
    articles: SentimentItem[];
    llmUsed: boolean;
  } | null;
  dataQuality: DataQuality;
  meta: {
    durationMs: number;
    dataProvider: string;
    llmEnabled: boolean;
    degraded: boolean;
    disclaimer: string;
  };
}

export interface MacroSnapshot {
  asOf: string;
  benchmarkSymbol: string;
  benchmarkPrice: number | null;
  benchmarkChange60dPct: number | null;
  benchmarkAboveSma50: boolean | null;
  benchmarkAboveSma200: boolean | null;
  vix: number | null;
  vixChange20dPct: number | null;
  tenYearYieldPct: number | null;
  threeMonthYieldPct: number | null;
  yieldCurveSpreadPct: number | null;
  tenYearChange20dBps: number | null;
  dollarIndex: number | null;
  dollarChange20dPct: number | null;
  goldChange20dPct: number | null;
  oilChange20dPct: number | null;
  warnings: string[];
}

export interface AnalyzeInput {
  symbol: string;
  focus: Focus;
  equity: number;
  riskPerTradePct?: number;
  currentDrawdownPct: number;
  sectorExposurePct: number;
  benchmark?: string;
}

export interface FinancialPeriod {
  fiscalYear: number;
  periodEnd: string;
  totalRevenue: number | null;
  operatingRevenue: number | null;
  costOfRevenue: number | null;
  grossProfit: number | null;
  operatingExpense: number | null;
  operatingIncome: number | null;
  ebit: number | null;
  ebitda: number | null;
  netIncome: number | null;
  netIncomeCommonStockholders: number | null;
  totalAssets: number | null;
  totalLiabilities: number | null;
  stockholdersEquity: number | null;
  cashAndCashEquivalents: number | null;
  totalDebt: number | null;
  operatingCashFlow: number | null;
  freeCashFlow: number | null;
  capitalExpenditure: number | null;
  basicEPS: number | null;
  dilutedEPS: number | null;
  grossMarginPct: number | null;
  operatingMarginPct: number | null;
  netMarginPct: number | null;
  revenueGrowthPct: number | null;
  netIncomeGrowthPct: number | null;
}

export interface CompanyOfficer {
  name: string;
  title: string | null;
}

export interface CompanyShareholder {
  name: string;
  percentage: number | null;
  controlling: boolean;
}

export interface CompanyProfile {
  symbol: string;
  code: string;
  name: string | null;
  longName: string | null;
  sector: string | null;
  subSector: string | null;
  industry: string | null;
  subIndustry: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  board: string | null;
  listingDate: string | null;
  mainBusiness: string | null;
  description: string | null;
  employees: number | null;
  secretary: string | null;
  officers: CompanyOfficer[];
  directors: CompanyOfficer[];
  commissioners: CompanyOfficer[];
  shareholders: CompanyShareholder[];
}

export interface ScreenerKeyStats {
  marketCap: number | null;
  enterpriseValue: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  priceToBook: number | null;
  evToEbitda: number | null;
  pegRatio: number | null;
  dividendYieldPct: number | null;
  beta: number | null;
  sharesOutstanding: number | null;
  floatShares: number | null;
  returnOnEquityPct: number | null;
  returnOnAssetsPct: number | null;
  grossMarginPct: number | null;
  operatingMarginPct: number | null;
  profitMarginPct: number | null;
  debtToEquityPct: number | null;
  currentRatio: number | null;
  totalCash: number | null;
  totalDebt: number | null;
  revenue: number | null;
  revenueGrowthPct: number | null;
  earningsGrowthPct: number | null;
  freeCashflow: number | null;
  operatingCashflow: number | null;
  fiscalYearEnd: string | null;
}

export interface ScreenerFinancialSummary {
  fiscalYear: number | null;
  periodEnd: string | null;
  revenue: number | null;
  revenueGrowthPct: number | null;
  costOfRevenue: number | null;
  grossProfit: number | null;
  operatingExpense: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  netIncomeGrowthPct: number | null;
  totalAssets: number | null;
  totalLiabilities: number | null;
  stockholdersEquity: number | null;
  operatingCashFlow: number | null;
  freeCashFlow: number | null;
  eps: number | null;
  grossMarginPct: number | null;
  operatingMarginPct: number | null;
  netMarginPct: number | null;
}

export interface ScreenerRevenuePoint {
  fiscalYear: number;
  revenue: number | null;
  netIncome: number | null;
  growthPct: number | null;
}

export type ScreenerDataStatus = "complete" | "price_only" | "empty";

export interface ScreenerRow {
  symbol: string;
  code: string;
  name: string;
  sector: string | null;
  subSector: string | null;
  industry: string | null;
  board: string | null;
  listingDate: string | null;
  mainBusiness: string | null;
  price: number | null;
  previousClose: number | null;
  changePct: number | null;
  volume: number | null;
  marketCap: number | null;
  trailingPE: number | null;
  priceToBook: number | null;
  dividendYieldPct: number | null;
  eps: number | null;
  high52w: number | null;
  low52w: number | null;
  marketTime: string | null;
  financials: ScreenerFinancialSummary | null;
  revenueTrend: ScreenerRevenuePoint[];
  dataStatus: ScreenerDataStatus;
  error: string | null;
}

export type ScreenerJobStatus = "idle" | "running" | "complete" | "failed";
export type ScreenerPhase = "idle" | "quotes" | "financials" | "done";

export interface ScreenerProgress {
  status: ScreenerJobStatus;
  phase: ScreenerPhase;
  total: number;
  quoted: number;
  processed: number;
  withFinancials: number;
  failed: number;
  percent: number;
  startedAt: string | null;
  finishedAt: string | null;
  elapsedMs: number;
  updatedAt: string | null;
  currentSymbol: string | null;
  message: string;
  snapshotAt: string | null;
}

export interface ScreenerSummary {
  total: number;
  loaded: number;
  withFinancials: number;
  gainers: number;
  losers: number;
  averageChangePct: number | null;
  marketCap: number | null;
  failed: number;
}

export interface ScreenerSectorCount {
  sector: string;
  count: number;
}

export interface ScreenerResults {
  progress: ScreenerProgress;
  rows: ScreenerRow[];
  total: number;
  page: number;
  pageSize: number;
  sectors: ScreenerSectorCount[];
  fiscalYears: number[];
  summary: ScreenerSummary;
  snapshotAt: string | null;
}

export interface ScreenerDetail {
  row: ScreenerRow;
  financials: FinancialPeriod[];
  profile: CompanyProfile;
  keyStats: ScreenerKeyStats | null;
  profileError: string | null;
  fetchedAt: string;
}

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

export interface ScreenerQuery {
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

export type TopPickHorizon = "trading" | "investment";

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
  /** Jarak harga terhadap MA20 (%), positif = di atas MA20. */
  fromSma20Pct?: number | null;
  /** Jarak harga terhadap MA50 (%), positif = di atas MA50. */
  fromSma50Pct?: number | null;
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
  entryPullbackPct?: number;
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
  overextended?: boolean;
  stretchScore?: number;
  stretchReasons?: string[];
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
  params: {
    tradingCount: number;
    investmentCount: number;
    priceMin: number;
    priceMax: number;
    minDailyValue: number;
    minMarketCap: number;
    deepScanLimit: number;
    shortlistPerHorizon: number;
  };
  universe: {
    total: number;
    priced: number;
    liquid: number;
    deepScanned: number;
    shortlisted: number;
    extendedExcluded?: number;
  };
  picks: TopPick[];
  agentRuns: TopPicksAgentRun[];
  agentsOk: number;
  regimeNote: string;
  notes: string[];
  disclaimer: string;
}

export interface TopPicksResponse {
  progress: TopPicksProgress;
  result: TopPicksResult | null;
}

interface ErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(message: string, status: number, code = "http_error", details: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof Error) {
    return new ApiError(error.message, 0, "client_error");
  }
  return new ApiError("Terjadi kesalahan yang tidak diketahui.", 0, "client_error");
}

function parseEnvelope(payload: unknown): ErrorEnvelope["error"] | null {
  if (typeof payload !== "object" || payload === null) return null;
  const envelope = payload as ErrorEnvelope;
  return envelope.error ?? null;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  timeoutMs?: number;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs ?? 120_000);

  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? "GET",
      headers: options.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(
      "Tidak dapat terhubung ke backend. Jalankan server di port 3000 lalu coba lagi.",
      0,
      "network_error",
    );
  } finally {
    window.clearTimeout(timeout);
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text !== "") {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const envelope = parseEnvelope(payload);
    throw new ApiError(
      envelope?.message ?? `Permintaan gagal (HTTP ${response.status}).`,
      response.status,
      envelope?.code ?? "http_error",
      envelope?.details ?? null,
    );
  }

  return payload as T;
}

function encodeSymbol(symbol: string): string {
  return encodeURIComponent(symbol.trim().toUpperCase());
}

function screenerQueryString(query: ScreenerQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.sector) params.set("sector", query.sector);
  if (query.hasFinancials) params.set("hasFinancials", query.hasFinancials);
  if (typeof query.priceMin === "number" && Number.isFinite(query.priceMin)) {
    params.set("priceMin", String(query.priceMin));
  }
  if (typeof query.priceMax === "number" && Number.isFinite(query.priceMax)) {
    params.set("priceMax", String(query.priceMax));
  }
  if (query.onlyProfitable) params.set("onlyProfitable", "true");
  if (query.antiGorengan) params.set("antiGorengan", "true");
  if (typeof query.maxDer === "number" && Number.isFinite(query.maxDer)) {
    params.set("maxDer", String(query.maxDer));
  }
  if (typeof query.minRevenueGrowth === "number" && Number.isFinite(query.minRevenueGrowth)) {
    params.set("minRevenueGrowth", String(query.minRevenueGrowth));
  }
  if (query.qualityVerdict && query.qualityVerdict !== "all") {
    params.set("qualityVerdict", query.qualityVerdict);
  }
  if (query.sort) params.set("sort", query.sort);
  if (query.direction) params.set("direction", query.direction);
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  const encoded = params.toString();
  return encoded === "" ? "" : `?${encoded}`;
}

export const api = {
  health: () => request<Health>("/health", { timeoutMs: 10_000 }),

  /** Status model LLM. `force` memaksa probe baru (tombol "Cek ulang"). */
  llmHealth: (force = false) =>
    request<LlmHealth>(`/v1/health/llm${force ? "?force=1" : ""}`, { timeoutMs: 60_000 }),

  office: () => request<OfficeSnapshot>("/v1/office", { timeoutMs: 15_000 }),

  quote: (symbol: string) =>
    request<Quote>(`/v1/market/${encodeSymbol(symbol)}/quote`, { timeoutMs: 30_000 }),

  history: (symbol: string, options: { range?: string; interval?: string } = {}) => {
    const params = new URLSearchParams();
    if (options.range) params.set("range", options.range);
    if (options.interval) params.set("interval", options.interval);
    const qs = params.toString();
    return request<PriceSeries>(
      `/v1/market/${encodeSymbol(symbol)}/history${qs ? `?${qs}` : ""}`,
      { timeoutMs: 35_000 },
    );
  },

  news: (symbol: string, count = 12) =>
    request<NewsItem[]>(
      `/v1/market/${encodeSymbol(symbol)}/news?count=${Math.min(Math.max(count, 1), 30)}`,
      { timeoutMs: 45_000 },
    ),

  macro: (benchmark?: string) =>
    request<MacroSnapshot>(
      `/v1/macro${benchmark ? `?benchmark=${encodeSymbol(benchmark)}` : ""}`,
      { timeoutMs: 60_000 },
    ),

  analyze: (input: AnalyzeInput) =>
    request<AnalysisResult>("/v1/analysis", {
      method: "POST",
      body: input,
      timeoutMs: 120_000,
    }),

  startScreener: () =>
    request<ScreenerProgress>("/v1/screener/refresh", {
      method: "POST",
      body: {},
      timeoutMs: 30_000,
    }),

  screenerStatus: () =>
    request<ScreenerProgress>("/v1/screener/status", { timeoutMs: 15_000 }),

  screenerResults: (query: ScreenerQuery = {}) =>
    request<ScreenerResults>(`/v1/screener/results${screenerQueryString(query)}`, {
      timeoutMs: 30_000,
    }),

  screenerDetail: (symbol: string) =>
    request<ScreenerDetail>(`/v1/screener/${encodeSymbol(symbol)}`, {
      timeoutMs: 60_000,
    }),

  topPicks: () => request<TopPicksResponse>("/v1/top-picks", { timeoutMs: 20_000 }),

  topPicksStatus: () => request<TopPicksProgress>("/v1/top-picks/status", { timeoutMs: 15_000 }),

  runTopPicks: (params: Partial<TopPicksResult["params"]> = {}) =>
    request<TopPicksProgress>("/v1/top-picks/run", {
      method: "POST",
      body: params,
      timeoutMs: 30_000,
    }),

  getPortfolio: () => request<PortfolioItem[]>("/v1/portfolio", { timeoutMs: 15_000 }),

  addPortfolioItem: (data: CreatePortfolioInput) =>
    request<PortfolioItem>("/v1/portfolio", {
      method: "POST",
      body: data,
      timeoutMs: 15_000,
    }),

  updatePortfolioItem: (id: string, data: UpdatePortfolioInput) =>
    request<PortfolioItem>(`/v1/portfolio/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: data,
      timeoutMs: 15_000,
    }),

  deletePortfolioItem: (id: string) =>
    request<{ success: boolean; id: string }>(`/v1/portfolio/${encodeURIComponent(id)}`, {
      method: "DELETE",
      timeoutMs: 15_000,
    }),
};
