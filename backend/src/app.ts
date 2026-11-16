import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { ZodError } from "zod";
import { loadConfig, type AppConfig } from "./config.js";
import { isAppError } from "./lib/errors.js";
import type { LoggerLike } from "./lib/logger.js";
import { OpenAiCompatibleLlm, type LlmJsonClient } from "./llm/client.js";
import { YahooMarketData } from "./providers/yahoo.js";
import type { MarketDataProviders } from "./providers/types.js";
import { SqliteDecisionStore } from "./storage/decisions.js";
import type { DecisionStore } from "./storage/types.js";
import { LlmHealthService } from "./services/llmHealthService.js";
import { AnalysisService } from "./services/analysisService.js";
import { BacktestService } from "./services/backtestService.js";
import { ScreenerService } from "./services/screenerService.js";
import { TopPicksService } from "./services/topPicksService.js";
import { registerAnalysisRoutes } from "./api/analysis.js";
import { registerLlmHealthRoutes } from "./api/llmHealth.js";
import { registerBacktestRoutes } from "./api/backtest.js";
import { registerMarketRoutes } from "./api/market.js";
import { registerScreenerRoutes } from "./api/screener.js";
import { registerTopPicksRoutes } from "./api/topPicks.js";
import { registerPortfolioRoutes } from "./api/portfolio.js";
import { SqlitePortfolioStore } from "./storage/portfolio.js";
import { join, resolve } from "node:path";

export interface BuildAppOptions {
  config?: AppConfig;
  providers?: MarketDataProviders;
  store?: DecisionStore;
  portfolioStore?: SqlitePortfolioStore;
  llm?: LlmJsonClient;
  logger?: LoggerLike;
  screener?: ScreenerService;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig();
  const app = Fastify({
    logger:
      config.logLevel === "silent"
        ? false
        : {
            level: config.logLevel,
            redact: ["req.headers.authorization", "req.headers.cookie"],
          },
    trustProxy: true,
  });

  const providers = options.providers ?? new YahooMarketData();
  const store =
    options.store ?? new SqliteDecisionStore(join(config.dataDir, "app.db"));
  const portfolioStore =
    options.portfolioStore ?? new SqlitePortfolioStore(join(config.dataDir, "app.db"));
  const llm = options.llm ?? new OpenAiCompatibleLlm(config.llm);
  const llmHealth = new LlmHealthService({ config: config.llm });
  const logger = options.logger ?? (app.log as unknown as LoggerLike);

  const analysisService = new AnalysisService({
    providers,
    store,
    config,
    llm,
    logger,
  });
  const backtestService = new BacktestService(providers, config);
  const topPicksService = new TopPicksService({
    providers,
    config,
    llm,
    logger,
  });
  await topPicksService.loadFromDisk();
  const screenerService =
    options.screener ??
    new ScreenerService({
      providers,
      dataDir: config.dataDir,
      logger,
    });

  const allowedOrigins =
    config.corsOrigin === "*"
      ? "*"
      : config.corsOrigin
          .split(",")
          .map((origin) => origin.trim())
          .filter((origin) => origin !== "");

  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (allowedOrigins === "*") {
      reply.header("Access-Control-Allow-Origin", "*");
    } else if (origin && allowedOrigins.includes(origin)) {
      reply.header("Access-Control-Allow-Origin", origin);
      reply.header("Vary", "Origin");
    }
    if (request.method === "OPTIONS") {
      reply
        .header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        .header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        .code(204)
        .send();
    }
  });

  app.addHook("onClose", async () => {
    store.close();
  });

  const healthHandler = async () => ({
    status: "ok",
    time: new Date().toISOString(),
    uptimeSec: Math.round(process.uptime()),
    dataProvider: "yahoo-finance",
    llmEnabled: llm.enabled,
  });

  app.get("/health", healthHandler);
  app.get("/v1/health", healthHandler);

  registerMarketRoutes(app, providers, config);
  registerLlmHealthRoutes(app, llmHealth);
  registerAnalysisRoutes(app, analysisService, store);
  registerBacktestRoutes(app, backtestService);
  registerScreenerRoutes(app, screenerService);
  registerTopPicksRoutes(app, topPicksService);
  registerPortfolioRoutes(app, portfolioStore);

  const webDir = resolve(config.webDir);
  const serveWeb = existsSync(join(webDir, "index.html"));

  app.setNotFoundHandler((request, reply) => {
    const path = (request.url.split("?")[0] ?? "").split("#")[0];
    const isRead = request.method === "GET" || request.method === "HEAD";
    const isApi = path === "/health" || path === "/v1" || path.startsWith("/v1/");
    const wantsHtml = request.headers.accept?.includes("text/html") ?? false;
    if (serveWeb && isRead && !isApi && wantsHtml) {
      return reply.type("text/html").sendFile("index.html");
    }
    reply.code(404).send({
      error: {
        code: "not_found",
        message: `Rute ${request.method} ${request.url} tidak ditemukan.`,
      },
    });
  });

  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: {
          code: "validation_error",
          message: "Validasi permintaan gagal.",
          details: error.issues,
        },
      });
    }
    if (isAppError(error)) {
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details ?? null,
        },
      });
    }
    const statusCode = error.statusCode;
    if (typeof statusCode === "number" && statusCode >= 400 && statusCode < 500) {
      return reply.code(statusCode).send({
        error: { code: "bad_request", message: error.message },
      });
    }
    request.log.error(error);
    return reply.code(500).send({
      error: {
        code: "internal_error",
        message: "Terjadi kesalahan internal. Periksa log server untuk detail.",
      },
    });
  });

  // Registrasi static harus setelah handler agar boot tidak mengunci handler default.
  if (serveWeb) {
    await app.register(fastifyStatic, {
      root: webDir,
      prefix: "/",
      wildcard: true,
      index: ["index.html"],
    });
    app.log.info({ webDir }, "Melayani frontend hasil build");
  }

  return app;
}
