import type { FastifyInstance } from "fastify";
import type { BacktestService } from "../services/backtestService.js";
import { BacktestSchema, parseOrThrow } from "./schemas.js";

export function registerBacktestRoutes(
  app: FastifyInstance,
  service: BacktestService,
): void {
  app.post("/v1/backtest", async (request) => {
    const input = parseOrThrow(BacktestSchema, request.body);
    return service.run(input);
  });
}
