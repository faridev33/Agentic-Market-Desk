import type { FastifyInstance } from "fastify";
import type { ScreenerService } from "../services/screenerService.js";
import { ScreenerQuerySchema, SymbolParamSchema, parseOrThrow } from "./schemas.js";

export function registerScreenerRoutes(
  app: FastifyInstance,
  screener: ScreenerService,
): void {
  app.post("/v1/screener/refresh", async (_request, reply) => {
    reply.code(202);
    return screener.start();
  });

  app.get("/v1/screener/status", async () => screener.status());

  app.get("/v1/screener/results", async (request) => {
    const query = parseOrThrow(ScreenerQuerySchema, request.query);
    return screener.results(query);
  });

  app.get("/v1/screener/:symbol", async (request) => {
    const { symbol } = parseOrThrow(SymbolParamSchema, request.params);
    return screener.detail(symbol);
  });
}
