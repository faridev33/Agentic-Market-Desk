import { randomUUID } from "node:crypto";
import type { AppConfig } from "../config.js";
import { ageHours, clamp, round } from "../lib/math.js";
import { AppError, errorMessage } from "../lib/errors.js";
import type { LoggerLike } from "../lib/logger.js";
import type { LlmJsonClient } from "../llm/client.js";
import type { MarketDataProviders } from "../providers/types.js";
import type { DecisionStore } from "../storage/types.js";
import type {
  AgentName,
  AgentRun,
  AgentSignal,
  AnalysisResult,
  DataQuality,
  Focus,
  HorizonAssessment,
  MacroRegime,
  OfficeAgentId,
  OfficeAgentSnapshot,
  OfficeStatus,
  SynthesisResult,
} from "../types.js";
import { Critic } from "../agents/critic.js";
import { FundamentalAgent } from "../agents/fundamental.js";
import { MacroAgent } from "../agents/macro.js";
import { assessRisk } from "../agents/riskManager.js";
import { SentimentAgent, type SentimentDetails } from "../agents/sentiment.js";
import { Synthesizer } from "../agents/synthesizer.js";
import { TechnicalAgent } from "../agents/technical.js";
import type { Agent, AgentOutput, AnalysisContext } from "../agents/types.js";

const DISCLAIMER =
  "Rekomendasi dihasilkan sistem otomatis dan bukan nasihat keuangan. Probabilitas belum terkalibrasi terhadap hasil nyata. " +
  "Verifikasi data dan lakukan paper trading sebelum mengambil keputusan.";

export interface AnalyzeRequest {
  symbol: string;
  focus: Focus;
  equity: number;
  riskPerTradePct?: number;
  currentDrawdownPct: number;
  sectorExposurePct: number;
  benchmark?: string;
}

export interface AnalysisServiceDeps {
  providers: MarketDataProviders;
  store: DecisionStore;
  config: AppConfig;
  llm: LlmJsonClient;
  logger: LoggerLike;
  now?: () => Date;
}

interface ExecutedAgent<T> {
  run: AgentRun;
  output: AgentOutput<T> | null;
}

function metricValue(signal: AgentSignal | undefined, key: string): number | null {
  const value = signal?.metrics[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function regimeOf(signals: Partial<Record<AgentName, AgentSignal>>): MacroRegime {
  const value = signals.macro?.metrics.regime;
  return value === "risk_on" || value === "risk_off" ? value : "neutral";
}

function settledValue<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === "fulfilled" ? result.value : null;
}

interface OfficeState {
  status: OfficeStatus;
  task: string;
  summary: string;
  durationMs: number | null;
  score: number | null;
  confidence: number | null;
  lastRunAt: string | null;
}

const DEFAULT_OFFICE_STATE: OfficeState = {
  status: "idle",
  task: "Menunggu analisis baru",
  summary: "Belum ada sesi analisis.",
  durationMs: null,
  score: null,
  confidence: null,
  lastRunAt: null,
};

const OFFICE_ROSTER: readonly {
  id: OfficeAgentId;
  name: string;
  role: string;
  horizon: string;
}[] = [
  { id: "data_ingestion", name: "Data Ingestion", role: "Tarik & validasi data", horizon: "Semua" },
  { id: "technical", name: "Technical", role: "Tren & momentum", horizon: "Trading" },
  { id: "fundamental", name: "Fundamental", role: "Kualitas & valuasi", horizon: "Jangka panjang" },
  { id: "macro", name: "Macro", role: "Rezim & siklus ekonomi", horizon: "Keduanya" },
  { id: "sentiment", name: "News & Sentiment", role: "Berita & sentimen", horizon: "Trading" },
  { id: "synthesizer", name: "Synthesizer", role: "Gabungan sinyal & bobot", horizon: "Semua" },
  { id: "risk_manager", name: "Risk Manager", role: "Ukuran posisi & batas risiko", horizon: "Semua" },
  { id: "critic", name: "Critic / Validator", role: "Tantang kesimpulan", horizon: "Semua" },
];

export class AnalysisService {
  private readonly technical = new TechnicalAgent();
  private readonly fundamental = new FundamentalAgent();
  private readonly macro = new MacroAgent();
  private readonly sentiment: SentimentAgent;
  private readonly officeState = new Map<OfficeAgentId, OfficeState>();

  officeSnapshot(): {
    generatedAt: string;
    latestAnalysis: ReturnType<DecisionStore["list"]>[number] | null;
    agents: OfficeAgentSnapshot[];
  } {
    const latestSummary = this.deps.store.list({ limit: 1 })[0] ?? null;
    return {
      generatedAt: new Date().toISOString(),
      latestAnalysis: latestSummary,
      agents: OFFICE_ROSTER.map((agent) => ({
        ...agent,
        ...(this.officeState.get(agent.id) ?? DEFAULT_OFFICE_STATE),
      })),
    };
  }

  private markOffice(
    id: OfficeAgentId,
    status: OfficeStatus,
    task: string,
    summary: string,
    extra: {
      durationMs?: number | null;
      score?: number | null;
      confidence?: number | null;
      lastRunAt?: string;
    } = {},
  ): void {
    this.officeState.set(id, {
      status,
      task,
      summary,
      durationMs: extra.durationMs ?? null,
      score: extra.score ?? null,
      confidence: extra.confidence ?? null,
      lastRunAt: extra.lastRunAt ?? new Date().toISOString(),
    });
  }

  private readonly synthesizer = new Synthesizer();
  private readonly critic: Critic;

  constructor(private readonly deps: AnalysisServiceDeps) {
    this.sentiment = new SentimentAgent(deps.llm);
    this.critic = new Critic(deps.llm);
  }

  async analyze(request: AnalyzeRequest): Promise<AnalysisResult> {
    const startedAt = Date.now();
    const now = this.deps.now?.() ?? new Date();
    const symbol = request.symbol.toUpperCase();
    const benchmark = (request.benchmark ?? this.deps.config.benchmarkSymbol).toUpperCase();

    const ingestionStartedAt = Date.now();
    this.markOffice(
      "data_ingestion",
      "working",
      `Menarik data ${symbol}`,
      "Quote, riwayat harga, fundamental, berita, dan makro sedang diambil.",
      { lastRunAt: now.toISOString() },
    );

    const [quoteResult, historyResult, fundamentalsResult, newsResult, macroResult] =
      await Promise.allSettled([
        this.deps.providers.quote(symbol),
        this.deps.providers.history(symbol, { range: "3y" }),
        this.deps.providers.fundamentals(symbol),
        this.deps.providers.news(symbol, 12),
        this.deps.providers.macro(benchmark),
      ]);

    const issues: string[] = [];
    const quote = settledValue(quoteResult);
    if (!quote) {
      issues.push(
        `Quote tidak tersedia: ${errorMessage((quoteResult as PromiseRejectedResult).reason)}`,
      );
    }
    const history = settledValue(historyResult);
    if (!history) {
      throw new AppError(
        `Data harga ${symbol} tidak dapat diambil dari Yahoo Finance.`,
        502,
        "upstream_error",
        { reason: errorMessage((historyResult as PromiseRejectedResult).reason) },
      );
    }
    const fundamentals = settledValue(fundamentalsResult);
    if (!fundamentals) {
      issues.push(
        `Fundamental tidak tersedia: ${errorMessage((fundamentalsResult as PromiseRejectedResult).reason)}`,
      );
    }
    const news = settledValue(newsResult) ?? [];
    if (newsResult.status === "rejected") {
      issues.push(`Berita tidak tersedia: ${errorMessage(newsResult.reason)}`);
    }
    const macro = settledValue(macroResult);
    if (!macro) {
      issues.push(`Makro tidak tersedia: ${errorMessage((macroResult as PromiseRejectedResult).reason)}`);
    }

    this.markOffice(
      "data_ingestion",
      issues.length > 0 ? "degraded" : "ok",
      `Validasi data ${symbol}`,
      [
        `${history.candles.length} candle`,
        fundamentals ? "fundamental tersedia" : "fundamental tidak tersedia",
        macro ? "makro tersedia" : "makro tidak tersedia",
        `${news.length} berita`,
        issues.length > 0 ? `${issues.length} catatan data` : "semua sumber utama valid",
      ].join(" · "),
      { durationMs: Date.now() - ingestionStartedAt, lastRunAt: now.toISOString() },
    );

    const context: AnalysisContext = {
      symbol,
      analysisDate: now.toISOString(),
      quote,
      history,
      fundamentals,
      macro,
      news,
    };

    const [technicalRun, fundamentalRun, macroRun, sentimentRun] = await Promise.all([
      this.execute(this.technical, context),
      this.execute(this.fundamental, context),
      this.execute(this.macro, context),
      this.execute(this.sentiment, context),
    ]);

    const agentRuns = [technicalRun, fundamentalRun, macroRun, sentimentRun];
    for (const run of agentRuns) {
      if (run.run.status === "failed" && run.run.error) {
        issues.push(`${run.run.agent}: ${run.run.error}`);
      }
    }

    const signals: Partial<Record<AgentName, AgentSignal>> = {};
    if (technicalRun.output) signals.technical = technicalRun.output.signal;
    if (fundamentalRun.output) signals.fundamental = fundamentalRun.output.signal;
    if (macroRun.output) signals.macro = macroRun.output.signal;
    if (sentimentRun.output) signals.sentiment = sentimentRun.output.signal;

    if (!signals.technical && !signals.fundamental) {
      throw new AppError(
        "Tidak ada agen analitis yang berhasil; data tidak cukup untuk menyusun rekomendasi.",
        422,
        "insufficient_data",
        { issues },
      );
    }

    const regime = regimeOf(signals);
    const synthesisStartedAt = Date.now();
    this.markOffice(
      "synthesizer",
      "working",
      `Menggabungkan sinyal ${symbol}`,
      "Membobot sinyal sesuai horizon dan rezim makro.",
      { lastRunAt: now.toISOString() },
    );
    const synthesis = this.synthesizer.run({
      signals,
      regime,
      focus: request.focus,
    });
    const synthesisPrimary =
      synthesis.assessments.find(
        (assessment) => assessment.horizon === synthesis.primaryHorizon,
      ) ?? synthesis.assessments[0];
    this.markOffice(
      "synthesizer",
      "ok",
      `Sintesis ${synthesis.primaryHorizon}`,
      `Aksi ${synthesisPrimary.action}; ${synthesis.conflicts.length} konflik antar sinyal.`,
      {
        durationMs: Date.now() - synthesisStartedAt,
        score: synthesisPrimary.score,
        confidence: synthesisPrimary.confidence,
        lastRunAt: now.toISOString(),
      },
    );

    const criticStartedAt = Date.now();
    this.markOffice(
      "critic",
      "working",
      `Menantang kesimpulan ${symbol}`,
      "Memeriksa konsistensi, konflik sinyal, dan kualitas data.",
      { lastRunAt: now.toISOString() },
    );
    const critic = await this.critic.review({
      symbol,
      focus: request.focus,
      quote,
      history,
      fundamentals,
      signals,
      synthesis,
      earningsDate: fundamentals?.earningsDate ?? null,
      now,
    });
    this.markOffice(
      "critic",
      critic.verdict === "pass" ? "ok" : "degraded",
      `Validasi ${synthesis.primaryHorizon}`,
      `Verdict ${critic.verdict}; ${critic.objections.length} keberatan, ${critic.checks.length} pemeriksaan.`,
      {
        durationMs: Date.now() - criticStartedAt,
        confidence: critic.confidenceMultiplier,
        lastRunAt: now.toISOString(),
      },
    );

    const assessments = this.applyCritic(synthesis, critic);
    const primary =
      assessments.find((assessment) => assessment.horizon === synthesis.primaryHorizon) ??
      assessments[0];

    const price = quote?.price ?? history.candles[history.candles.length - 1].close;
    const riskStartedAt = Date.now();
    this.markOffice(
      "risk_manager",
      "working",
      `Menilai risiko ${symbol}`,
      "Menghitung ukuran posisi, stop-loss, dan batas eksposur.",
      { lastRunAt: now.toISOString() },
    );
    let risk = assessRisk({
      action: primary.action,
      confidence: primary.confidence,
      probabilityUp: primary.probabilityUp,
      horizon: primary.horizon,
      equity: request.equity,
      price,
      atr: metricValue(signals.technical, "atr"),
      annualizedVolPct: metricValue(signals.technical, "annualizedVolPct"),
      avgDollarVolume: metricValue(signals.technical, "avgDollarVolume20"),
      currentDrawdownPct: request.currentDrawdownPct,
      sectorExposurePct: request.sectorExposurePct,
      limits: {
        ...this.deps.config.risk,
        maxRiskPerTradePct:
          request.riskPerTradePct ?? this.deps.config.risk.maxRiskPerTradePct,
      },
    });
    if (critic.verdict === "reject") {
      risk = {
        ...risk,
        approved: false,
        reasons: [...risk.reasons, "Critic menolak kesimpulan; eksekusi ditahan."],
      };
    }
    this.markOffice(
      "risk_manager",
      risk.approved ? "ok" : "degraded",
      `Rencana risiko ${symbol}`,
      risk.sizing
        ? `${risk.sizing.recommendedShares} saham, stop ${risk.sizing.stopLoss}, ukuran ${risk.sizing.recommendedPositionPct}% ekuitas.`
        : risk.reasons[0] ?? "Tidak ada posisi baru.",
      {
        durationMs: Date.now() - riskStartedAt,
        score: risk.sizing?.recommendedPositionPct ?? null,
        lastRunAt: now.toISOString(),
      },
    );

    const quoteAge = quote ? ageHours(quote.marketTime, now) : null;
    const degraded =
      issues.length > 0 || agentRuns.some((entry) => entry.run.status !== "ok");
    const dataQuality: DataQuality = {
      quoteAgeHours: quoteAge !== null ? round(quoteAge, 2) : null,
      historyCandles: history.candles.length,
      hasFundamentals: fundamentals !== null,
      newsItems: news.length,
      macroAvailable: macro !== null,
      issues,
      degraded,
    };

    const sentimentDetails: SentimentDetails | null = sentimentRun.output?.details ?? null;

    const result: AnalysisResult = {
      id: randomUUID(),
      symbol,
      name: quote?.name ?? null,
      createdAt: now.toISOString(),
      focus: request.focus,
      quote,
      fundamentalsSummary: fundamentals
        ? {
            sector: fundamentals.sector,
            trailingPE: fundamentals.trailingPE,
            priceToBook: fundamentals.priceToBook,
            returnOnEquityPct: fundamentals.returnOnEquityPct,
            revenueGrowthPct: fundamentals.revenueGrowthPct,
            debtToEquityPct: fundamentals.debtToEquityPct,
          }
        : null,
      recommendation: {
        horizon: primary.horizon,
        action: primary.action,
        score: primary.score,
        confidence: primary.confidence,
        probabilityUp: primary.probabilityUp,
        calibration: "uncalibrated_heuristic",
        thesis: primary.thesis,
        conflicts: primary.conflicts,
      },
      horizons: assessments,
      regime,
      risk,
      critic,
      agents: agentRuns.map((entry) => entry.run),
      sentiment: sentimentDetails
        ? {
            aggregateScore: sentimentDetails.aggregateScore,
            coverage: sentimentDetails.coverage,
            articles: sentimentDetails.articles,
            llmUsed: sentimentDetails.llmUsed,
          }
        : null,
      dataQuality,
      meta: {
        durationMs: Date.now() - startedAt,
        dataProvider: "yahoo-finance",
        llmEnabled: this.deps.llm.enabled,
        degraded,
        disclaimer: DISCLAIMER,
      },
    };

    this.deps.store.save(result);
    this.deps.logger.info(
      `Analisis ${symbol} selesai: ${result.recommendation.action} (${result.recommendation.horizon}), keyakinan ${result.recommendation.confidence}, ${Date.now() - startedAt}ms`,
    );
    return result;
  }

  private async execute<T>(
    agent: Agent<T>,
    context: AnalysisContext,
  ): Promise<ExecutedAgent<T>> {
    const startedAt = Date.now();
    this.officeState.set(agent.name, {
      status: "working",
      task: `Analisis ${context.symbol}`,
      summary: "Mengumpulkan dan mengevaluasi sinyal.",
      durationMs: null,
      score: null,
      confidence: null,
      lastRunAt: context.analysisDate,
    });
    try {
      const output = await agent.run(context);
      const status = output.signal.warnings.length > 0 ? "degraded" : "ok";
      this.officeState.set(agent.name, {
        status,
        task: `Analisis ${context.symbol}`,
        summary: output.signal.summary,
        durationMs: Date.now() - startedAt,
        score: output.signal.score,
        confidence: output.signal.confidence,
        lastRunAt: context.analysisDate,
      });
      return {
        run: {
          agent: agent.name,
          status,
          durationMs: Date.now() - startedAt,
          signal: output.signal,
          warnings: output.signal.warnings,
          error: null,
        },
        output,
      };
    } catch (error) {
      const message = errorMessage(error);
      this.officeState.set(agent.name, {
        status: "failed",
        task: `Analisis ${context.symbol}`,
        summary: message,
        durationMs: Date.now() - startedAt,
        score: null,
        confidence: null,
        lastRunAt: context.analysisDate,
      });
      return {
        run: {
          agent: agent.name,
          status: "failed",
          durationMs: Date.now() - startedAt,
          signal: null,
          warnings: [],
          error: message,
        },
        output: null,
      };
    }
  }

  private applyCritic(
    synthesis: SynthesisResult,
    critic: AnalysisResult["critic"],
  ): HorizonAssessment[] {
    return synthesis.assessments.map((assessment) => {
      const rejected = critic.verdict === "reject";
      return {
        ...assessment,
        action: rejected ? "hold" : assessment.action,
        confidence: round(
          clamp(assessment.confidence * critic.confidenceMultiplier, 0, 0.95),
          3,
        ),
        probabilityUp: rejected ? 0.5 : assessment.probabilityUp,
        thesis: rejected
          ? [...assessment.thesis, "Kesimpulan ditahan oleh Critic; lihat bagian critic."]
          : assessment.thesis,
      };
    });
  }
}
