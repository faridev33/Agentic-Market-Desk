import { z } from "zod";
import { AppError } from "../lib/errors.js";
import type { HistoryRange } from "../providers/types.js";

const HISTORY_RANGES = [
  "1mo",
  "3mo",
  "6mo",
  "1y",
  "2y",
  "3y",
  "5y",
  "10y",
  "max",
] as const satisfies readonly HistoryRange[];

export const SymbolSchema = z
  .string()
  .trim()
  .min(1, "Simbol wajib diisi")
  .max(24, "Simbol terlalu panjang")
  .regex(/^[A-Za-z0-9.^=_-]+$/, "Simbol hanya boleh berisi huruf, angka, . ^ = _ -")
  .transform((value) => value.toUpperCase());

export const SymbolParamSchema = z.object({ symbol: SymbolSchema });

export const HistoryQuerySchema = z.object({
  range: z.enum(HISTORY_RANGES).default("2y"),
  interval: z.enum(["1d", "1wk", "1mo"]).default("1d"),
});

export const NewsQuerySchema = z.object({
  count: z.coerce.number().int().min(1).max(30).default(10),
});

export const MacroQuerySchema = z.object({
  benchmark: SymbolSchema.optional(),
});

export const AnalyzeSchema = z.object({
  symbol: SymbolSchema,
  focus: z.enum(["trading", "investment", "both"]).default("both"),
  equity: z.coerce.number().positive().max(1_000_000_000_000).default(10_000),
  riskPerTradePct: z.coerce.number().min(0.05).max(10).optional(),
  currentDrawdownPct: z.coerce.number().min(0).max(100).default(0),
  sectorExposurePct: z.coerce.number().min(0).max(100).default(0),
  benchmark: SymbolSchema.optional(),
});

export const StrategyParamsSchema = z
  .object({
    fastSma: z.number().int().min(2).max(300),
    slowSma: z.number().int().min(5).max(500),
    rsiPeriod: z.number().int().min(2).max(50),
    rsiEntryMax: z.number().min(10).max(100),
    atrPeriod: z.number().int().min(2).max(100),
    stopAtrMult: z.number().min(0.5).max(10),
  })
  .partial();

export const BacktestSchema = z
  .object({
    symbol: SymbolSchema,
    range: z.enum(["2y", "3y", "5y", "10y", "max"]).default("5y"),
    interval: z.enum(["1d", "1wk"]).default("1d"),
    initialEquity: z.number().positive().max(1_000_000_000_000).default(10_000),
    feeBps: z.number().min(0).max(200).default(10),
    slippageBps: z.number().min(0).max(200).default(5),
    params: StrategyParamsSchema.optional(),
    walkForward: z.boolean().default(true),
    trainBars: z.number().int().min(60).max(2000).default(504),
    testBars: z.number().int().min(20).max(1000).default(126),
  })
  .superRefine((value, context) => {
    if (
      value.params?.fastSma !== undefined &&
      value.params?.slowSma !== undefined &&
      value.params.fastSma >= value.params.slowSma
    ) {
      context.addIssue({
        code: "custom",
        message: "fastSma harus lebih kecil dari slowSma",
        path: ["params", "fastSma"],
      });
    }
  });

export const ScreenerQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  sector: z.string().trim().max(80).optional(),
  hasFinancials: z.enum(["all", "yes", "no"]).default("all"),
  priceMin: z.coerce.number().min(0).optional(),
  priceMax: z.coerce.number().min(0).optional(),
  onlyProfitable: z.coerce.boolean().optional(),
  antiGorengan: z.coerce.boolean().optional(),
  maxDer: z.coerce.number().min(0).optional(),
  minRevenueGrowth: z.coerce.number().optional(),
  qualityVerdict: z.enum(["all", "healthy", "buy", "watch", "avoid"]).default("all"),
  sort: z
    .enum([
      "symbol",
      "price",
      "change",
      "marketCap",
      "pe",
      "dividend",
      "revenue",
      "revenueGrowth",
      "netIncome",
      "assets",
      "quality",
    ])
    .default("marketCap"),
  direction: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(200).default(50),
});

export const AnalysisIdSchema = z.object({
  id: z.string().min(8).max(64).regex(/^[A-Za-z0-9-]+$/, "ID tidak valid"),
});

export const AnalysesQuerySchema = z.object({
  symbol: SymbolSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const TopPicksRunSchema = z
  .object({
    tradingCount: z.coerce.number().int().min(1).max(5).optional(),
    investmentCount: z.coerce.number().int().min(1).max(5).optional(),
    priceMin: z.coerce.number().min(1).optional(),
    priceMax: z.coerce.number().min(1).optional(),
    minDailyValue: z.coerce.number().min(0).optional(),
    minMarketCap: z.coerce.number().min(0).optional(),
    deepScanLimit: z.coerce.number().int().min(40).max(600).optional(),
    shortlistPerHorizon: z.coerce.number().int().min(5).max(20).optional(),
  })
  .default({});

export function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError("Validasi permintaan gagal.", 400, "validation_error", result.error.issues);
  }
  return result.data;
}
