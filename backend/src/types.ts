export type Horizon = "trading" | "investment";
export type Focus = Horizon | "both";

export type Action =
  | "strong_buy"
  | "buy"
  | "hold"
  | "reduce"
  | "sell";

export type MacroRegime = "risk_on" | "neutral" | "risk_off";

export type AgentName =
  | "technical"
  | "fundamental"
  | "macro"
  | "sentiment";

export type OfficeAgentId =
  | "data_ingestion"
  | AgentName
  | "synthesizer"
  | "risk_manager"
  | "critic";

export type OfficeStatus = "idle" | "working" | "ok" | "degraded" | "failed";

export interface OfficeAgentSnapshot {
  id: OfficeAgentId;
  name: string;
  role: string;
  horizon: string;
  status: OfficeStatus;
  task: string;
  summary: string;
  durationMs: number | null;
  score: number | null;
  confidence: number | null;
  lastRunAt: string | null;
}

export type AgentStatus = "ok" | "degraded" | "failed";

export type DataProviderName = "yahoo-finance";

export interface Candle {
  /** ISO date (UTC) */
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjClose: number | null;
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
  trailingPE?: number | null;
  priceToBook?: number | null;
  dividendYieldPct?: number | null;
  epsTrailing?: number | null;
}

export interface PriceSeries {
  symbol: string;
  currency: string | null;
  interval: "1d" | "1wk" | "1mo";
  fetchedAt: string;
  candles: Candle[];
}

export interface Fundamentals {
  symbol: string;
  fetchedAt: string;
  currency: string | null;
  sector: string | null;
  industry: string | null;
  marketCap: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  priceToBook: number | null;
  evToEbitda: number | null;
  pegRatio: number | null;
  freeCashflow: number | null;
  operatingCashflow: number | null;
  fcfYieldPct: number | null;
  returnOnEquityPct: number | null;
  returnOnAssetsPct: number | null;
  grossMarginPct: number | null;
  operatingMarginPct: number | null;
  profitMarginPct: number | null;
  debtToEquityPct: number | null;
  currentRatio: number | null;
  revenueGrowthPct: number | null;
  earningsGrowthPct: number | null;
  epsTrailing: number | null;
  epsForward: number | null;
  dividendYieldPct: number | null;
  beta: number | null;
  totalCash: number | null;
  totalDebt: number | null;
  revenue: number | null;
  /** Akhir periode laporan terakhir (bukan tanggal rilis). */
  periodEnd: string | null;
  /** Tanggal rilis laporan terakhir bila tersedia. */
  lastFiscalYearEnd: string | null;
  earningsDate: string | null;
  warnings: string[];
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
  createdAt: string;
  updatedAt: string;
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

export interface SentimentItem {
  newsId: string;
  title: string;
  publishedAt: string;
  score: number;
  label: "positive" | "neutral" | "negative";
  events: string[];
  impact: number;
  source: "lexicon" | "llm";
}

export interface AgentSignal {
  agent: AgentName;
  asOf: string;
  /** -1 (bearish) .. +1 (bullish) */
  score: number;
  /** 0..1, keyakinan pada sinyal, bukan probabilitas hasil. */
  confidence: number;
  summary: string;
  evidence: string[];
  warnings: string[];
  metrics: Record<string, number | string | boolean | null>;
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
  /** Heuristik arah, belum terkalibrasi terhadap hasil nyata. */
  probabilityUp: number;
  confidence: number;
  weights: Partial<Record<AgentName, number>>;
  contributions: Partial<Record<AgentName, number>>;
  thesis: string[];
  conflicts: string[];
}

export interface SynthesisResult {
  primaryHorizon: Horizon;
  assessments: HorizonAssessment[];
  regime: MacroRegime;
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

export interface CriticResult {
  verdict: "pass" | "caution" | "reject";
  confidenceMultiplier: number;
  objections: string[];
  checks: { name: string; status: "pass" | "warn" | "fail"; detail: string }[];
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

export interface FinalRecommendation {
  horizon: Horizon;
  action: Action;
  score: number;
  confidence: number;
  probabilityUp: number;
  calibration: "uncalibrated_heuristic";
  thesis: string[];
  conflicts: string[];
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
  recommendation: FinalRecommendation;
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
    dataProvider: DataProviderName;
    llmEnabled: boolean;
    degraded: boolean;
    disclaimer: string;
  };
}

/** Satu tahun buku laporan keuangan tahunan. Nilai moneter dalam mata uang laporan emiten. */
export interface FinancialPeriod {
  fiscalYear: number;
  /** Akhir periode laporan (ISO date). */
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

/** Profil perusahaan gabungan data IDX dan Yahoo Finance. */
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

export interface CompanyOverview {
  profile: CompanyProfile;
  keyStats: ScreenerKeyStats;
}

/** Ringkasan laporan keuangan terbaru yang dipakai tabel screener. */
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

export type ScreenerVerdict = "buy" | "watch" | "avoid";

export interface ScreenerQualityParts {
  value: number;
  quality: number;
  growth: number;
  health: number;
  momentum: number;
}

export interface ScreenerQuality {
  score: number;
  grade: "A" | "B" | "C" | "D" | "E";
  verdict: ScreenerVerdict;
  parts: ScreenerQualityParts;
  reasons: string[];
  risks: string[];
  metrics: {
    roePct: number | null;
    netMarginPct: number | null;
    debtToEquityPct: number | null;
    revenueGrowthPct: number | null;
    earningsGrowthPct: number | null;
    dividendYieldPct: number | null;
    range52PositionPct: number | null;
  };
}

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
  quality: ScreenerQuality | null;
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

export interface ScreenerBucket {
  label: string;
  count: number;
}

export interface ScreenerResults {
  progress: ScreenerProgress;
  rows: ScreenerRow[];
  total: number;
  page: number;
  pageSize: number;
  sectors: ScreenerSectorCount[];
  priceBuckets: ScreenerBucket[];
  verdicts: ScreenerBucket[];
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
