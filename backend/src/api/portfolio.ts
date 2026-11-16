import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { SqlitePortfolioStore } from "../storage/portfolio.js";

const idParamsSchema = z.object({
  id: z.string().min(1),
});

const createPortfolioSchema = z.object({
  symbol: z.string().min(1).max(24),
  name: z.string().optional(),
  sector: z.string().optional(),
  buyPrice: z.number().positive(),
  lots: z.number().int().positive(),
  buyDate: z.string().optional(),
  notes: z.string().optional(),
});

const updatePortfolioSchema = z.object({
  symbol: z.string().min(1).max(24).optional(),
  name: z.string().optional(),
  sector: z.string().optional(),
  buyPrice: z.number().positive().optional(),
  lots: z.number().int().positive().optional(),
  buyDate: z.string().optional(),
  notes: z.string().optional(),
});

export function registerPortfolioRoutes(
  app: FastifyInstance,
  store: SqlitePortfolioStore,
): void {
  app.get("/v1/portfolio", async () => {
    return store.list();
  });

  app.get("/v1/portfolio/:id", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const item = store.get(id);
    if (!item) {
      return reply.code(404).send({
        error: { code: "not_found", message: `Portofolio dengan id ${id} tidak ditemukan.` },
      });
    }
    return item;
  });

  app.post("/v1/portfolio", async (request, reply) => {
    const body = createPortfolioSchema.parse(request.body);
    const item = store.add(body);
    return reply.code(201).send(item);
  });

  app.put("/v1/portfolio/:id", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = updatePortfolioSchema.parse(request.body);
    const updated = store.update(id, body);
    if (!updated) {
      return reply.code(404).send({
        error: { code: "not_found", message: `Portofolio dengan id ${id} tidak ditemukan.` },
      });
    }
    return updated;
  });

  app.delete("/v1/portfolio/:id", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const ok = store.delete(id);
    if (!ok) {
      return reply.code(404).send({
        error: { code: "not_found", message: `Portofolio dengan id ${id} tidak ditemukan.` },
      });
    }
    return { success: true, id };
  });
}
