import { z } from "zod";
import { clamp } from "./lib/math.js";

const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  DATA_DIR: z.string().default("./data"),
  // Relatif terhadap folder backend (cwd saat server dijalankan).
  WEB_DIR: z.string().default("../frontend/dist"),
  CORS_ORIGIN: z.string().default("*"),
  BENCHMARK_SYMBOL: z.string().default("^GSPC"),
  LLM_API_KEY: z.string().optional(),
  LLM_BASE_URL: z.string().default("https://api.openai.com/v1"),
  LLM_MODEL: z.string().default("gpt-4o-mini"),
  // Daftar model yang boleh dipakai roster 8 agen (dipisah koma).
  LLM_MODELS: z.string().optional(),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(20000),
  MAX_RISK_PER_TRADE_PCT: z.coerce.number().min(0.05).max(10).default(1),
  TARGET_VOLATILITY_PCT: z.coerce.number().min(1).max(100).default(15),
  MAX_POSITION_PCT: z.coerce.number().min(1).max(100).default(20),
  MAX_DRAWDOWN_PCT: z.coerce.number().min(1).max(100).default(15),
  MAX_SECTOR_EXPOSURE_PCT: z.coerce.number().min(1).max(100).default(35),
});

export interface LlmConfig {
  apiKey: string | null;
  baseUrl: string;
  model: string;
  /** Kumpulan model yang tersedia untuk roster multi-model. */
  models: string[];
  timeoutMs: number;
}

export interface RiskConfig {
  maxRiskPerTradePct: number;
  targetVolatilityPct: number;
  maxPositionPct: number;
  maxDrawdownPct: number;
  maxSectorExposurePct: number;
}

export interface AppConfig {
  port: number;
  host: string;
  logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  dataDir: string;
  webDir: string;
  corsOrigin: string;
  benchmarkSymbol: string;
  llm: LlmConfig;
  risk: RiskConfig;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Konfigurasi environment tidak valid: ${parsed.error.message}`);
  }
  const value = parsed.data;
  return {
    port: value.PORT,
    host: value.HOST,
    logLevel: value.LOG_LEVEL,
    dataDir: value.DATA_DIR,
    webDir: value.WEB_DIR,
    corsOrigin: value.CORS_ORIGIN,
    benchmarkSymbol: value.BENCHMARK_SYMBOL,
    llm: {
      apiKey: value.LLM_API_KEY && value.LLM_API_KEY.trim() !== "" ? value.LLM_API_KEY.trim() : null,
      baseUrl: value.LLM_BASE_URL.replace(/\/+$/, ""),
      model: value.LLM_MODEL,
      models: (value.LLM_MODELS ?? value.LLM_MODEL)
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry !== ""),
      timeoutMs: value.LLM_TIMEOUT_MS,
    },
    risk: {
      maxRiskPerTradePct: clamp(value.MAX_RISK_PER_TRADE_PCT, 0.05, 10),
      targetVolatilityPct: clamp(value.TARGET_VOLATILITY_PCT, 1, 100),
      maxPositionPct: clamp(value.MAX_POSITION_PCT, 1, 100),
      maxDrawdownPct: clamp(value.MAX_DRAWDOWN_PCT, 1, 100),
      maxSectorExposurePct: clamp(value.MAX_SECTOR_EXPOSURE_PCT, 1, 100),
    },
  };
}
