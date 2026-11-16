import type {
  CompanyOverview,
  FinancialPeriod,
  Fundamentals,
  MacroSnapshot,
  NewsItem,
  PriceSeries,
  Quote,
} from "../types.js";

export type HistoryRange = "1mo" | "3mo" | "6mo" | "1y" | "2y" | "3y" | "5y" | "10y" | "max";
export type HistoryInterval = "1d" | "1wk" | "1mo";

export interface HistoryOptions {
  range?: HistoryRange;
  interval?: HistoryInterval;
}

export interface MarketDataProviders {
  quote(symbol: string): Promise<Quote>;
  quotes(symbols: string[]): Promise<Quote[]>;
  history(symbol: string, options?: HistoryOptions): Promise<PriceSeries>;
  fundamentals(symbol: string): Promise<Fundamentals>;
  financialHistory(symbol: string): Promise<FinancialPeriod[]>;
  companyOverview(symbol: string): Promise<CompanyOverview>;
  news(symbol: string, count?: number): Promise<NewsItem[]>;
  macro(benchmarkSymbol: string): Promise<MacroSnapshot>;
}
