import { z } from "zod";
import type { LlmJsonClient } from "../llm/client.js";
import { ageHours, round } from "../lib/math.js";
import type {
  AgentName,
  AgentSignal,
  CriticResult,
  Focus,
  Fundamentals,
  PriceSeries,
  Quote,
  SynthesisResult,
} from "../types.js";

export interface CriticInput {
  symbol: string;
  focus: Focus;
  quote: Quote | null;
  history: PriceSeries | null;
  fundamentals: Fundamentals | null;
  signals: Partial<Record<AgentName, AgentSignal>>;
  synthesis: SynthesisResult;
  earningsDate: string | null;
  now: Date;
}

interface Check {
  name: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

const LlmReviewSchema = z.object({
  objections: z.array(z.string().min(1).max(300)).max(5),
  severity: z.enum(["low", "medium", "high"]),
});

function metricNumber(signal: AgentSignal | undefined, key: string): number | null {
  if (!signal) return null;
  const value = signal.metrics[key];
  return typeof value === "number" ? value : null;
}

export class Critic {
  constructor(private readonly llm: LlmJsonClient) {}

  async review(input: CriticInput): Promise<CriticResult> {
    const checks: Check[] = [];
    const add = (name: string, status: Check["status"], detail: string): void => {
      checks.push({ name, status, detail });
    };

    const candles = input.history?.candles.length ?? 0;
    if (candles < 60) {
      add("data_histori", "fail", `Riwayat harga hanya ${candles} candle; analisis tidak reliabel.`);
    } else if (candles < 200) {
      add("data_histori", "warn", `Riwayat harga ${candles} candle (< 200); tren jangka panjang terbatas.`);
    } else {
      add("data_histori", "pass", `Riwayat harga ${candles} candle.`);
    }

    if (input.focus !== "trading" && !input.fundamentals) {
      add("data_fundamental", "warn", "Data fundamental tidak tersedia; pandangan investasi jangka panjang lemah.");
    }

    const quoteAge = input.quote ? ageHours(input.quote.marketTime, input.now) : null;
    if (quoteAge === null) {
      add("kesegaran_harga", "warn", "Waktu pasar quote tidak diketahui; analisis memakai data histori.");
    } else if (quoteAge > 240) {
      add("kesegaran_harga", "fail", `Harga terakhir berumur ${round(quoteAge, 1)} jam; data terlalu basi.`);
    } else if (quoteAge > 96) {
      add("kesegaran_harga", "warn", `Harga terakhir berumur ${round(quoteAge, 1)} jam; verifikasi sebelum eksekusi.`);
    } else {
      add("kesegaran_harga", "pass", `Harga terakhir berumur ${round(quoteAge, 1)} jam.`);
    }

    const volatility = metricNumber(input.signals.technical, "annualizedVolPct");
    if (volatility !== null) {
      if (volatility > 120) {
        add("volatilitas", "fail", `Volatilitas tahunan ${round(volatility, 1)}% ekstrem.`);
      } else if (volatility > 80) {
        add("volatilitas", "warn", `Volatilitas tahunan ${round(volatility, 1)}% sangat tinggi.`);
      } else {
        add("volatilitas", "pass", `Volatilitas tahunan ${round(volatility, 1)}%.`);
      }
    }

    const primary = input.synthesis.assessments.find(
      (assessment) => assessment.horizon === input.synthesis.primaryHorizon,
    );
    const action = primary?.action ?? "hold";

    if (input.earningsDate) {
      const earningsMs = Date.parse(input.earningsDate);
      if (Number.isFinite(earningsMs)) {
        const daysUntil = (earningsMs - input.now.getTime()) / 86_400_000;
        if (daysUntil >= 0 && daysUntil <= 5) {
          add(
            "event_earnings",
            "warn",
            `Rilis laporan keuangan dalam ${Math.ceil(daysUntil)} hari; risiko gap naik.`,
          );
        }
      }
    }

    const technical = input.signals.technical;
    const fundamental = input.signals.fundamental;
    const sentiment = input.signals.sentiment;
    if (technical && fundamental && technical.score * fundamental.score < 0) {
      if (Math.abs(technical.score) > 0.3 && Math.abs(fundamental.score) > 0.3) {
        add("konflik_sinyal", "warn", "Teknikal dan fundamental berlawanan arah tanpa dominasi jelas.");
      }
    }
    if (technical && sentiment && technical.score * sentiment.score < 0) {
      if (Math.abs(technical.score) > 0.3 && Math.abs(sentiment.score) > 0.3) {
        add("konflik_sentimen", "warn", "Sentimen berita berlawanan dengan tren harga.");
      }
    }
    for (const conflict of input.synthesis.conflicts) {
      add("konflik_rezim", "warn", conflict);
    }

    if (primary && primary.confidence < 0.3) {
      add("keyakinan_rendah", "warn", `Keyakinan gabungan rendah (${round(primary.confidence, 2)}).`);
    }

    const avgDollarVolume = metricNumber(technical, "avgDollarVolume20");
    if (avgDollarVolume !== null && avgDollarVolume < 1_000_000) {
      add("likuiditas", "warn", "Nilai transaksi harian di bawah 1 juta unit mata uang.");
    }

    if (input.synthesis.regime === "risk_off" && (action === "buy" || action === "strong_buy")) {
      add("makro_berlawanan", "warn", "Sinyal beli melawan rezim makro risk-off.");
    }

    const rsi = metricNumber(technical, "rsi14");
    if (rsi !== null && rsi > 80 && (action === "buy" || action === "strong_buy")) {
      add("jenuh_beli", "warn", `RSI ${round(rsi, 1)} menunjukkan kondisi jenuh beli.`);
    }

    let llmUsed = false;
    const objections = checks
      .filter((check) => check.status !== "pass")
      .map((check) => check.detail);

    if (this.llm.enabled && primary) {
      const response = await this.llm.json({
        system:
          "Anda kritikus investasi independen. Tugas Anda menantang kesimpulan analisis, bukan mengulang ringkasan. " +
          'Balas hanya JSON: {"objections":["..."],"severity":"low|medium|high"}. Maksimal 3 keberatan, masing-masing < 200 karakter.',
        user: [
          `Simbol: ${input.symbol}`,
          `Aksi: ${action} (${primary.horizon}), skor ${primary.score}, keyakinan ${primary.confidence}`,
          `Rezim makro: ${input.synthesis.regime}`,
          `Tesis: ${primary.thesis.join(" | ")}`,
          `Konflik: ${input.synthesis.conflicts.join(" | ") || "tidak ada"}`,
          `RSI: ${rsi ?? "n/a"}; volatilitas tahunan: ${volatility ?? "n/a"}%; PER: ${input.fundamentals?.trailingPE ?? "n/a"}; ROE: ${input.fundamentals?.returnOnEquityPct ?? "n/a"}%`,
        ].join("\n"),
        schema: LlmReviewSchema,
        maxTokens: 600,
      });

      if (response.data) {
        llmUsed = true;
        for (const objection of response.data.objections) objections.push(objection);
        if (response.data.severity === "high") {
          add("tinjauan_llm", "warn", "Kritikus LLM menilai risiko kesimpulan tinggi.");
        } else if (response.data.severity === "medium") {
          add("tinjauan_llm", "warn", "Kritikus LLM menemukan keberatan material.");
        } else {
          add("tinjauan_llm", "pass", "Kritikus LLM tidak menemukan keberatan material.");
        }
      } else if (response.error) {
        add("tinjauan_llm", "pass", `Tinjauan LLM dilewati: ${response.error}`);
      }
    }

    const fails = checks.filter((check) => check.status === "fail").length;
    const warns = checks.filter((check) => check.status === "warn").length;
    const verdict: CriticResult["verdict"] =
      fails > 0 ? "reject" : warns > 0 ? "caution" : "pass";
    const confidenceMultiplier =
      verdict === "reject" ? 0.5 : verdict === "caution" ? Math.max(0.7, 1 - 0.05 * warns) : 1;

    return {
      verdict,
      confidenceMultiplier: round(confidenceMultiplier, 3),
      objections,
      checks,
      llmUsed,
    };
  }
}
