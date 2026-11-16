import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { PortfolioItem } from "../types.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS portfolio (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  sector TEXT NOT NULL,
  buy_price REAL NOT NULL,
  lots INTEGER NOT NULL,
  shares INTEGER NOT NULL,
  buy_date TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_portfolio_symbol ON portfolio (symbol);
CREATE INDEX IF NOT EXISTS idx_portfolio_created ON portfolio (created_at DESC);
`;

export interface CreatePortfolioInput {
  id?: string;
  symbol: string;
  name?: string;
  sector?: string;
  buyPrice: number;
  lots: number;
  shares?: number;
  buyDate?: string;
  notes?: string;
}

export interface UpdatePortfolioInput {
  symbol?: string;
  name?: string;
  sector?: string;
  buyPrice?: number;
  lots?: number;
  shares?: number;
  buyDate?: string;
  notes?: string;
}

interface PortfolioRow {
  id: string;
  symbol: string;
  name: string;
  sector: string;
  buy_price: number;
  lots: number;
  shares: number;
  buy_date: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: PortfolioRow): PortfolioItem {
  return {
    id: row.id,
    symbol: row.symbol,
    name: row.name,
    sector: row.sector,
    buyPrice: row.buy_price,
    lots: row.lots,
    shares: row.shares,
    buyDate: row.buy_date,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SqlitePortfolioStore {
  private readonly db: DatabaseSync;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec(SCHEMA);
    this.seedIfEmpty();
  }

  private seedIfEmpty(): void {
    const countRow = this.db.prepare("SELECT COUNT(*) as count FROM portfolio").get() as
      | { count: number }
      | undefined;
    if (countRow && countRow.count > 0) return;

    const initial: CreatePortfolioInput[] = [
      {
        id: "p-bbca-1",
        symbol: "BBCA.JK",
        name: "Bank Central Asia",
        sector: "Perbankan",
        buyPrice: 5000,
        lots: 10,
        shares: 1000,
        buyDate: "2026-10-15",
        notes: "Investasi jangka menengah, target dividen & apresiasi modal",
      },
      {
        id: "p-tlkm-2",
        symbol: "TLKM.JK",
        name: "Telkom Indonesia",
        sector: "Telekomunikasi",
        buyPrice: 2850,
        lots: 20,
        shares: 2000,
        buyDate: "2026-10-22",
        notes: "Swing trading pantulan support teknikal",
      },
      {
        id: "p-bmri-3",
        symbol: "BMRI.JK",
        name: "Bank Mandiri",
        sector: "Perbankan",
        buyPrice: 4800,
        lots: 15,
        shares: 1500,
        buyDate: "2026-11-01",
        notes: "Kawal tren laba kuartal 3",
      },
    ];

    for (const item of initial) {
      this.add(item);
    }
  }

  list(): PortfolioItem[] {
    const rows = this.db
      .prepare("SELECT * FROM portfolio ORDER BY created_at DESC")
      .all() as unknown as PortfolioRow[];
    return rows.map(mapRow);
  }

  get(id: string): PortfolioItem | null {
    const row = this.db
      .prepare("SELECT * FROM portfolio WHERE id = ?")
      .get(id) as unknown as PortfolioRow | undefined;
    return row ? mapRow(row) : null;
  }

  add(input: CreatePortfolioInput): PortfolioItem {
    const now = new Date().toISOString();
    const id = input.id || `porto-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const shares = input.shares ?? input.lots * 100;
    const name = input.name || input.symbol.replace(/\.JK$/, "");
    const sector = input.sector || "Pasar Modal";
    const buyDate = input.buyDate || now.slice(0, 10);
    const notes = input.notes || null;

    this.db
      .prepare(
        `INSERT INTO portfolio (id, symbol, name, sector, buy_price, lots, shares, buy_date, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.symbol,
        name,
        sector,
        input.buyPrice,
        input.lots,
        shares,
        buyDate,
        notes,
        now,
        now
      );

    return {
      id,
      symbol: input.symbol,
      name,
      sector,
      buyPrice: input.buyPrice,
      lots: input.lots,
      shares,
      buyDate,
      notes: notes ?? undefined,
      createdAt: now,
      updatedAt: now,
    };
  }

  update(id: string, updates: UpdatePortfolioInput): PortfolioItem | null {
    const existing = this.get(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const symbol = updates.symbol ?? existing.symbol;
    const name = updates.name ?? existing.name;
    const sector = updates.sector ?? existing.sector;
    const buyPrice = updates.buyPrice ?? existing.buyPrice;
    const lots = updates.lots ?? existing.lots;
    const shares = updates.shares ?? (updates.lots ? updates.lots * 100 : existing.shares);
    const buyDate = updates.buyDate ?? existing.buyDate;
    const notes = updates.notes !== undefined ? updates.notes : (existing.notes ?? null);

    this.db
      .prepare(
        `UPDATE portfolio
         SET symbol = ?, name = ?, sector = ?, buy_price = ?, lots = ?, shares = ?, buy_date = ?, notes = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(symbol, name, sector, buyPrice, lots, shares, buyDate, notes, now, id);

    return {
      id,
      symbol,
      name,
      sector,
      buyPrice,
      lots,
      shares,
      buyDate,
      notes: notes ?? undefined,
      createdAt: existing.createdAt,
      updatedAt: now,
    };
  }

  delete(id: string): boolean {
    const res = this.db.prepare("DELETE FROM portfolio WHERE id = ?").run(id);
    return (res.changes ?? 0) > 0;
  }
}
