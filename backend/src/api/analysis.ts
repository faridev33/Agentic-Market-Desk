import type { FastifyInstance } from "fastify";
import { AppError } from "../lib/errors.js";
import type { AnalysisService } from "../services/analysisService.js";
import type { DecisionStore } from "../storage/types.js";
import {
  AnalysesQuerySchema,
  AnalysisIdSchema,
  AnalyzeSchema,
  parseOrThrow,
} from "./schemas.js";

export function registerAnalysisRoutes(
  app: FastifyInstance,
  service: AnalysisService,
  store: DecisionStore,
): void {
  app.post("/v1/analysis", async (request, reply) => {
    const input = parseOrThrow(AnalyzeSchema, request.body);
    const result = await service.analyze(input);
    return reply.code(201).send(result);
  });

  app.get("/v1/analysis/:id", async (request) => {
    const { id } = parseOrThrow(AnalysisIdSchema, request.params);
    const result = store.get(id);
    if (!result) {
      throw new AppError("Analisis tidak ditemukan.", 404, "not_found");
    }
    return result;
  });

  app.get("/v1/analyses", async (request) => {
    const query = parseOrThrow(AnalysesQuerySchema, request.query);
    return { items: store.list(query) };
  });

  // Read-only projection; no session payloads, logs, or filesystem data are exposed.
  app.get("/v1/office", async () => service.officeSnapshot());
}
