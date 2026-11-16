import type { FastifyInstance, FastifyRequest } from "fastify";
import type { LlmHealthService } from "../services/llmHealthService.js";

/**
 * Endpoint status AI untuk halaman utama.
 * GET /v1/health/llm            → pakai cache (maksimal 60 detik)
 * GET /v1/health/llm?force=1    → paksa probe baru (tombol "Cek ulang")
 */
export function registerLlmHealthRoutes(app: FastifyInstance, service: LlmHealthService): void {
  const handler = async (request: FastifyRequest) => {
    const query = (request.query ?? {}) as { force?: string | boolean };
    const force = query.force === "1" || query.force === "true" || query.force === true;
    return service.check({ force });
  };

  app.get("/v1/health/llm", handler);
  app.get("/v1/llm/health", handler);
}
