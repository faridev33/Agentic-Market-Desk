import type {
  AgentName,
  AgentSignal,
  Fundamentals,
  MacroSnapshot,
  NewsItem,
  PriceSeries,
  Quote,
} from "../types.js";

export interface AnalysisContext {
  symbol: string;
  analysisDate: string;
  quote: Quote | null;
  history: PriceSeries | null;
  fundamentals: Fundamentals | null;
  macro: MacroSnapshot | null;
  news: NewsItem[];
}

export interface AgentOutput<TDetails = null> {
  signal: AgentSignal;
  details: TDetails;
}

export interface Agent<TDetails = null> {
  readonly name: AgentName;
  run(context: AnalysisContext): Promise<AgentOutput<TDetails>>;
}
