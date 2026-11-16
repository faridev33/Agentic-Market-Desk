import type { Action, AnalysisResult, Focus, Horizon } from "../types.js";

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

export interface ListAnalysesFilter {
  symbol?: string;
  limit?: number;
}

export interface DecisionStore {
  save(result: AnalysisResult): void;
  get(id: string): AnalysisResult | null;
  list(filter?: ListAnalysesFilter): StoredAnalysisSummary[];
  close(): void;
}
