import { loadConfig, type AppConfig } from "../src/config.js";
import type { LlmJsonClient } from "../src/llm/client.js";
import type { MarketDataProviders } from "../src/providers/types.js";
import type {
  Candle,
  CompanyOverview,
  CompanyProfile,
  FinancialPeriod,
  Fundamentals,
  MacroSnapshot,
  NewsItem,
  PriceSeries,
  Quote,
  ScreenerKeyStats,
} from "../src/types.js";
import type { AnalysisContext } from "../src/agents/types.js";

export function makeCandles(
  count: number,
  options: {
    startPrice?: number;
    dailyDriftPct?: number;
    dailyNoisePct?: number;
    endDate?: Date;
  } = {},
): Candle[] {
  const {
    startPrice = 100,
    dailyDriftPct = 0.12,
    dailyNoisePct = 0.5,
    endDate = new Date(),
  } = options;
  const startMs = endDate.getTime() - (count - 1) * 86_400_000;
  const candles: Candle[] = [];
  let price = startPrice;

  for (let i = 0; i < count; i += 1) {
    const date = new Date(startMs + i * 86_400_000).toISOString();
    const open = price;
    const noise = Math.sin(i * 1.618) * (dailyNoisePct / 100);
    const close = Math.max(1, open * (1 + dailyDriftPct / 100 + noise));
    const high = Math.max(open, close) * 1.002;
    const low = Math.min(open, close) * 0.998;
    candles.push({
      date,
      open: round4(open),
      high: round4(high),
      low: round4(low),
      close: round4(close),
      volume: 1_000_000 + (i % 10) * 100_000,
      adjClose: null,
    });
    price = close;
  }
  return candles;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export function makeQuote(candles: Candle[], now = new Date()): Quote {
  const last = candles[candles.length - 1];
  return {
    symbol: "TEST",
    name: "Test Corp",
    currency: "USD",
    exchange: "NYSE",
    marketState: "REGULAR",
    price: last.close,
    previousClose: candles[candles.length - 2]?.close ?? last.close,
    changePct: 0.5,
    volume: last.volume,
    averageVolume10d: 1_200_000,
    marketCap: 1_000_000_000_000,
    fiftyTwoWeekHigh: Math.max(...candles.slice(-252).map((candle) => candle.high)),
    fiftyTwoWeekLow: Math.min(...candles.slice(-252).map((candle) => candle.low)),
    marketTime: now.toISOString(),
    fetchedAt: now.toISOString(),
  };
}

export function makeFundamentals(overrides: Partial<Fundamentals> = {}): Fundamentals {  return {
    symbol: "TEST",
    fetchedAt: new Date().toISOString(),
    currency: "USD",
    sector: "Technology",
    industry: "Software",
    marketCap: 1_000_000_000_000,
    trailingPE: 18,
    forwardPE: 15,
    priceToBook: 3,
    evToEbitda: 12,
    pegRatio: 1.2,
    freeCashflow: 30_000_000_000,
    operatingCashflow: 40_000_000_000,
    fcfYieldPct: 4.5,
    returnOnEquityPct: 24,
    returnOnAssetsPct: 12,
    grossMarginPct: 55,
    operatingMarginPct: 25,
    profitMarginPct: 20,
    debtToEquityPct: 45,
    currentRatio: 1.8,
    revenueGrowthPct: 12,
    earningsGrowthPct: 18,
    epsTrailing: 5,
    epsForward: 6,
    dividendYieldPct: 1.2,
    beta: 1.1,
    totalCash: 50_000_000_000,
    totalDebt: 30_000_000_000,
    revenue: 200_000_000_000,
    periodEnd: "2025-06-30T00:00:00.000Z",
    lastFiscalYearEnd: "2024-12-31T00:00:00.000Z",
    earningsDate: null,
    warnings: [],
    ...overrides,
  };
}

export function makeFinancialPeriods(): FinancialPeriod[] {
  return [2023, 2024, 2025].map((fiscalYear, index) => {
    const totalRevenue = 100_000_000_000_000 + index * 12_000_000_000_000;
    const netIncome = 20_000_000_000_000 + index * 3_000_000_000_000;
    return {
      fiscalYear,
      periodEnd: `${fiscalYear}-12-31T00:00:00.000Z`,
      totalRevenue,
      operatingRevenue: totalRevenue,
      costOfRevenue: totalRevenue - 45_000_000_000_000,
      grossProfit: 45_000_000_000_000 + index * 2_000_000_000_000,
      operatingExpense: 12_000_000_000_000,
      operatingIncome: 30_000_000_000_000 + index * 3_000_000_000_000,
      ebit: 31_000_000_000_000,
      ebitda: 36_000_000_000_000,
      netIncome,
      netIncomeCommonStockholders: netIncome,
      totalAssets: 200_000_000_000_000 + index * 10_000_000_000_000,
      totalLiabilities: 80_000_000_000_000,
      stockholdersEquity: 120_000_000_000_000,
      cashAndCashEquivalents: 40_000_000_000_000,
      totalDebt: 30_000_000_000_000,
      operatingCashFlow: 32_000_000_000_000,
      freeCashFlow: 26_000_000_000_000,
      capitalExpenditure: -6_000_000_000_000,
      basicEPS: 500 + index * 40,
      dilutedEPS: 498 + index * 40,
      grossMarginPct: 45,
      operatingMarginPct: 30,
      netMarginPct: 20,
      revenueGrowthPct: index === 0 ? null : 12,
      netIncomeGrowthPct: index === 0 ? null : 15,
    };
  });
}

export function makeCompanyOverview(symbol = "TEST"): CompanyOverview {
  const code = symbol.replace(/\.JK$/i, "").toUpperCase();
  const profile: CompanyProfile = {
    symbol,
    code,
    name: "Test Corp",
    longName: "Test Corp Tbk",
    sector: "Technology",
    subSector: "Software",
    industry: "Software",
    subIndustry: "Application Software",
    address: "Jl. Test No. 1",
    city: "Jakarta",
    country: "Indonesia",
    website: "https://example.com",
    phone: "+62 21 000",
    email: "ir@example.com",
    board: "Utama",
    listingDate: "2000-01-01",
    mainBusiness: "Software",
    description: "Perusahaan uji coba.",
    employees: 1000,
    secretary: "Test Secretary",
    officers: [{ name: "Test Officer", title: "Director" }],
    directors: [{ name: "Test Director", title: "President Director" }],
    commissioners: [{ name: "Test Commissioner", title: "President Commissioner" }],
    shareholders: [{ name: "Test Holdings", percentage: 60, controlling: true }],
  };
  const keyStats: ScreenerKeyStats = {
    marketCap: 1_000_000_000_000,
    enterpriseValue: 1_100_000_000_000,
    trailingPE: 18,
    forwardPE: 15,
    priceToBook: 3,
    evToEbitda: 12,
    pegRatio: 1.2,
    dividendYieldPct: 1.2,
    beta: 1.1,
    sharesOutstanding: 10_000_000_000,
    floatShares: 4_000_000_000,
    returnOnEquityPct: 24,
    returnOnAssetsPct: 12,
    grossMarginPct: 55,
    operatingMarginPct: 25,
    profitMarginPct: 20,
    debtToEquityPct: 45,
    currentRatio: 1.8,
    totalCash: 50_000_000_000_000,
    totalDebt: 30_000_000_000_000,
    revenue: 300_000_000_000_000,
    revenueGrowthPct: 12,
    earningsGrowthPct: 18,
    freeCashflow: 26_000_000_000_000,
    operatingCashflow: 32_000_000_000_000,
    fiscalYearEnd: "2025-12-31T00:00:00.000Z",
  };
  return { profile, keyStats };
}

export function makeMacro(
  overrides: Partial<MacroSnapshot> = {},
  now = new Date(),
): MacroSnapshot {
  return {
    asOf: now.toISOString(),
    benchmarkSymbol: "^GSPC",
    benchmarkPrice: 5500,
    benchmarkChange60dPct: 5,
    benchmarkAboveSma50: true,
    benchmarkAboveSma200: true,
    vix: 14,
    vixChange20dPct: -5,
    tenYearYieldPct: 4.1,
    threeMonthYieldPct: 4.5,
    yieldCurveSpreadPct: -0.4,
    tenYearChange20dBps: -5,
    dollarIndex: 100,
    dollarChange20dPct: -1,
    goldChange20dPct: 1,
    oilChange20dPct: 2,
    warnings: [],
    ...overrides,
  };
}

export function makeNews(
  titles: string[],
  symbol = "TEST",
  now = new Date(),
): NewsItem[] {
  return titles.map((title, index) => ({
    id: `news-${index}`,
    title,
    publisher: "Test Wire",
    url: `https://example.com/${index}`,
    publishedAt: new Date(now.getTime() - (index + 1) * 3_600_000).toISOString(),
    relatedSymbols: [symbol],
  }));
}

export function makeContext(options: {
  candles: Candle[];
  fundamentals?: Fundamentals | null;
  macro?: MacroSnapshot | null;
  news?: NewsItem[];
  quote?: Quote | null;
}): AnalysisContext {
  const now = new Date();
  const history: PriceSeries = {
    symbol: "TEST",
    currency: "USD",
    interval: "1d",
    fetchedAt: now.toISOString(),
    candles: options.candles,
  };
  return {
    symbol: "TEST",
    analysisDate: now.toISOString(),
    quote: options.quote === undefined ? makeQuote(options.candles, now) : options.quote,
    history,
    fundamentals:
      options.fundamentals === undefined ? makeFundamentals() : options.fundamentals,
    macro: options.macro === undefined ? makeMacro({}, now) : options.macro,
    news: options.news ?? makeNews(["Test Corp beats estimates and raises guidance"], "TEST", now),
  };
}

export interface FakeData {
  candles: Candle[];
  quote?: Quote | null;
  fundamentals?: Fundamentals | null;
  macro?: MacroSnapshot | null;
  news?: NewsItem[];
  quotes?: Quote[] | null;
  financials?: FinancialPeriod[] | null;
  overview?: CompanyOverview | null;
}

export class FakeProviders implements MarketDataProviders {
  constructor(private readonly data: FakeData) {}

  async quote(): Promise<Quote> {
    if (this.data.quote === null) throw new Error("quote unavailable");
    return this.data.quote ?? makeQuote(this.data.candles);
  }

  async quotes(symbols: string[]): Promise<Quote[]> {
    if (this.data.quotes === null) throw new Error("quotes unavailable");
    if (this.data.quotes) {
      const wanted = new Set(symbols.map((symbol) => symbol.toUpperCase()));
      return this.data.quotes.filter((quote) => wanted.has(quote.symbol.toUpperCase()));
    }
    const base = this.data.quote ?? makeQuote(this.data.candles);
    return symbols.map((symbol) => ({ ...base, symbol }));
  }

  async history(): Promise<PriceSeries> {
    return {
      symbol: "TEST",
      currency: "USD",
      interval: "1d",
      fetchedAt: new Date().toISOString(),
      candles: this.data.candles,
    };
  }

  async fundamentals(): Promise<Fundamentals> {
    if (this.data.fundamentals === null) throw new Error("fundamentals unavailable");
    return this.data.fundamentals ?? makeFundamentals();
  }

  async financialHistory(): Promise<FinancialPeriod[]> {
    if (this.data.financials === null) throw new Error("financial history unavailable");
    return this.data.financials ?? makeFinancialPeriods();
  }

  async companyOverview(symbol: string): Promise<CompanyOverview> {
    if (this.data.overview === null) throw new Error("company overview unavailable");
    return this.data.overview ?? makeCompanyOverview(symbol);
  }

  async news(): Promise<NewsItem[]> {
    return this.data.news ?? makeNews(["Test Corp beats estimates and raises guidance"]);
  }

  async macro(): Promise<MacroSnapshot> {
    if (this.data.macro === null) throw new Error("macro unavailable");
    return this.data.macro ?? makeMacro();
  }
}

export const disabledLlm: LlmJsonClient = {
  enabled: false,
  model: "disabled",
  async json() {
    return { data: null, error: "LLM tidak dikonfigurasi", raw: null };
  },
};

export const testConfig: AppConfig = loadConfig({
  LOG_LEVEL: "silent",
  DATA_DIR: "./data-test",
  WEB_DIR: "./data-test-web",
  BENCHMARK_SYMBOL: "^GSPC",
});
