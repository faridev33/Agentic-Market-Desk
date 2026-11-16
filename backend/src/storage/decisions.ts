import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AnalysisResult } from "../types.js";
import type {
  DecisionStore,
  ListAnalysesFilter,
  StoredAnalysisSummary,
} from "./types.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS analyses (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  created_at TEXT NOT NULL,
  focus TEXT NOT NULL,
  horizon TEXT NOT NULL,
  action TEXT NOT NULL,
  confidence REAL NOT NULL,
  score REAL NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_analyses_symbol ON analyses (symbol, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analyses_created ON analyses (created_at DESC);
`;

interface SummaryRow {
  id: string;
  symbol: string;
  created_at: string;
  focus: string;
  horizon: string;
  action: string;
  confidence: number;
  score: number;
}

interface PayloadRow {
  payload: string;
}

export class SqliteDecisionStore implements DecisionStore {
  private readonly db: DatabaseSync;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec(SCHEMA);
  }

  save(result: AnalysisResult): void {
    this.db
      .prepare(
        `INSERT INTO analyses (id, symbol, created_at, focus, horizon, action, confidence, score, payload)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        result.id,
        result.symbol,
        result.createdAt,
        result.focus,
        result.recommendation.horizon,
        result.recommendation.action,
        result.recommendation.confidence,
        result.recommendation.score,
        JSON.stringify(result),
      );
  }

  get(id: string): AnalysisResult | null {
    const row = this.db
      .prepare("SELECT payload FROM analyses WHERE id = ?")
      .get(id) as PayloadRow | undefined;
    if (!row) return null;
    try {
      return JSON.parse(row.payload) as AnalysisResult;
    } catch {
      return null;
    }
  }

  list(filter: ListAnalysesFilter = {}): StoredAnalysisSummary[] {
    const limit = Math.min(Math.max(filter.limit ?? 20, 1), 100);
    const rows = (
      filter.symbol
        ? this.db
            .prepare(
              `SELECT id, symbol, created_at, focus, horizon, action, confidence, score
               FROM analyses WHERE symbol = ? ORDER BY created_at DESC LIMIT ?`,
            )
            .all(filter.symbol, limit)
        : this.db
            .prepare(
              `SELECT id, symbol, created_at, focus, horizon, action, confidence, score
               FROM analyses ORDER BY created_at DESC LIMIT ?`,
            )
            .all(limit)
    ) as unknown as SummaryRow[];

    return rows.map((row) => ({
      id: row.id,
      symbol: row.symbol,
      createdAt: row.created_at,
      focus: row.focus as StoredAnalysisSummary["focus"],
      horizon: row.horizon as StoredAnalysisSummary["horizon"],
      action: row.action as StoredAnalysisSummary["action"],
      confidence: row.confidence,
      score: row.score,
    }));
  }

  close(): void {
    this.db.close();
  }
}

export class InMemoryDecisionStore implements DecisionStore {
  private readonly results = new Map<string, AnalysisResult>();

  save(result: AnalysisResult): void {
    this.results.set(result.id, result);
  }

  get(id: string): AnalysisResult | null {
    return this.results.get(id) ?? null;
  }

  list(filter: ListAnalysesFilter = {}): StoredAnalysisSummary[] {
    const limit = Math.min(Math.max(filter.limit ?? 20, 1), 100);
    return [...this.results.values()]
      .filter((result) => (filter.symbol ? result.symbol === filter.symbol : true))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, limit)
      .map((result) => ({
        id: result.id,
        symbol: result.symbol,
        createdAt: result.createdAt,
        focus: result.focus,
        horizon: result.recommendation.horizon,
        action: result.recommendation.action,
        confidence: result.recommendation.confidence,
        score: result.recommendation.score,
      }));
  }

  close(): void {
    this.results.clear();
  }
}
