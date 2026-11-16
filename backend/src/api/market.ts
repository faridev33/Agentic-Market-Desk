import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import type { MarketDataProviders } from "../providers/types.js";
import {
  HistoryQuerySchema,
  MacroQuerySchema,
  NewsQuerySchema,
  SymbolParamSchema,
  parseOrThrow,
} from "./schemas.js";

/** Tambahkan .JK otomatis untuk saham Indonesia yang tidak memiliki suffix */
function normalizeSymbol(symbol: string): string {
  const normalized = symbol.trim().toUpperCase();
  // Jika bukan sudah index/futures/commodity dan belum ada .JK, tambahkan
  if (!normalized.includes(".") && !normalized.startsWith("^") && !normalized.includes("-")) {
    return `${normalized}.JK`;
  }
  return normalized;
}

export function registerMarketRoutes(
  app: FastifyInstance,
  providers: MarketDataProviders,
  config: AppConfig,
): void {
  app.get("/v1/market/:symbol/quote", async (request) => {
    const { symbol } = parseOrThrow(SymbolParamSchema, request.params);
    return providers.quote(normalizeSymbol(symbol));
  });

  app.get("/v1/market/:symbol/history", async (request) => {
    const { symbol } = parseOrThrow(SymbolParamSchema, request.params);
    const query = parseOrThrow(HistoryQuerySchema, request.query);
    return providers.history(normalizeSymbol(symbol), query);
  });

  app.get("/v1/market/:symbol/fundamentals", async (request) => {
    const { symbol } = parseOrThrow(SymbolParamSchema, request.params);
    return providers.fundamentals(normalizeSymbol(symbol));
  });

  app.get("/v1/market/:symbol/news", async (request) => {
    const { symbol } = parseOrThrow(SymbolParamSchema, request.params);
    const { count } = parseOrThrow(NewsQuerySchema, request.query);
    return providers.news(normalizeSymbol(symbol), count);
  });

  app.get("/v1/macro", async (request) => {
    const { benchmark } = parseOrThrow(MacroQuerySchema, request.query);
    return providers.macro((benchmark ?? config.benchmarkSymbol).toUpperCase());
  });
}
