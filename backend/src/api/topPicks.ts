import type { FastifyInstance } from "fastify";
import type { TopPicksService } from "../services/topPicksService.js";
import { parseOrThrow, TopPicksRunSchema } from "./schemas.js";

export function registerTopPicksRoutes(app: FastifyInstance, service: TopPicksService): void {
  // Memulai pemindaian 8 agen. Job berjalan di latar belakang; klien memantau /status.
  app.post("/v1/top-picks/run", async (request, reply) => {
    const input = parseOrThrow(TopPicksRunSchema, request.body ?? {});
    reply.code(202);
    return service.start(input);
  });

  app.get("/v1/top-picks/status", async () => service.getProgress());

  app.get("/v1/top-picks", async () => ({
    progress: service.getProgress(),
    result: service.getResult(),
  }));
}
