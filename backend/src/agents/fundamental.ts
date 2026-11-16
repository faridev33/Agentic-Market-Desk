import { AppError } from "../lib/errors.js";
import { clamp, formatNumber, mean, ramp, round, weightedMean } from "../lib/math.js";
import type { AgentSignal, Fundamentals } from "../types.js";
import type { Agent, AgentOutput, AnalysisContext } from "./types.js";

function averageOf(values: ReadonlyArray<number | null>): number | null {
  const valid = values.filter((value): value is number => value !== null);
  return valid.length > 0 ? mean(valid) : null;
}

function positive(value: number | null): number | null {
  return value !== null && value > 0 ? value : null;
}

export class FundamentalAgent implements Agent<null> {
  readonly name = "fundamental" as const;

  async run(context: AnalysisContext): Promise<AgentOutput<null>> {
    const fundamentals = context.fundamentals;
    if (!fundamentals) {
      throw new AppError(
        `Data fundamental ${context.symbol} tidak tersedia.`,
        422,
        "insufficient_data",
      );
    }

    const f: Fundamentals = fundamentals;
    const valuationScores = [
      positive(f.trailingPE) !== null ? ramp(positive(f.trailingPE)!, 40, 12) : null,
      positive(f.forwardPE) !== null ? ramp(positive(f.forwardPE)!, 32, 12) : null,
      positive(f.priceToBook) !== null ? ramp(positive(f.priceToBook)!, 10, 1.5) : null,
      positive(f.evToEbitda) !== null ? ramp(positive(f.evToEbitda)!, 22, 6) : null,
      f.fcfYieldPct !== null ? ramp(f.fcfYieldPct, 0, 8) : null,
    ];
    const qualityScores = [
      f.returnOnEquityPct !== null ? ramp(f.returnOnEquityPct, 0, 25) : null,
      f.operatingMarginPct !== null ? ramp(f.operatingMarginPct, 0, 30) : null,
      f.profitMarginPct !== null ? ramp(f.profitMarginPct, 0, 20) : null,
      f.debtToEquityPct !== null ? ramp(f.debtToEquityPct, 250, 30) : null,
      f.currentRatio !== null ? ramp(f.currentRatio, 0.8, 2.2) : null,
    ];
    const growthScores = [
      f.revenueGrowthPct !== null ? ramp(f.revenueGrowthPct, -10, 25) : null,
      f.earningsGrowthPct !== null ? ramp(f.earningsGrowthPct, -20, 30) : null,
    ];

    const valuation = averageOf(valuationScores);
    const quality = averageOf(qualityScores);
    const growth = averageOf(growthScores);

    const score =
      weightedMean([
        { value: valuation, weight: 0.35 },
        { value: quality, weight: 0.42 },
        { value: growth, weight: 0.23 },
      ]) ?? null;

    if (score === null) {
      throw new AppError(
        `Rasio fundamental ${context.symbol} tidak lengkap untuk dinilai.`,
        422,
        "insufficient_data",
      );
    }

    const allScores = [...valuationScores, ...qualityScores, ...growthScores];
    const coverage = allScores.filter((value) => value !== null).length / allScores.length;
    const isFinancial = f.sector?.toLowerCase().includes("financial") ?? false;
    const warnings = [...f.warnings];
    if (isFinancial) {
      warnings.push(
        "Sektor keuangan: PER/PB dan leverage tidak sebanding dengan emiten non-keuangan; skor fundamental kurang dapat dibandingkan.",
      );
    }
    if (coverage < 0.5) {
      warnings.push("Cakupan rasio fundamental terbatas (< 50%).");
    }

    const confidence = clamp(0.1, 0.85, 0.2 + 0.6 * coverage) * (isFinancial ? 0.9 : 1);

    const evidence: string[] = [];
    if (f.trailingPE !== null) {
      evidence.push(`PER trailing ${formatNumber(f.trailingPE, 1)}x (forward ${f.forwardPE !== null ? formatNumber(f.forwardPE, 1) : "n/a"}x).`);
    }
    if (f.priceToBook !== null) evidence.push(`PB ${formatNumber(f.priceToBook, 2)}x.`);
    if (f.returnOnEquityPct !== null) {
      evidence.push(`ROE ${formatNumber(f.returnOnEquityPct, 1)}%.`);
    }
    if (f.operatingMarginPct !== null) {
      evidence.push(`Margin operasi ${formatNumber(f.operatingMarginPct, 1)}%.`);
    }
    if (f.debtToEquityPct !== null) {
      evidence.push(`Utang/Ekuitas ${formatNumber(f.debtToEquityPct, 1)}%.`);
    }
    if (f.fcfYieldPct !== null) {
      evidence.push(`FCF yield ${formatNumber(f.fcfYieldPct, 2)}%.`);
    }
    if (f.revenueGrowthPct !== null) {
      evidence.push(
        `Pertumbuhan pendapatan ${formatNumber(f.revenueGrowthPct, 1)}%, laba ${f.earningsGrowthPct !== null ? formatNumber(f.earningsGrowthPct, 1) : "n/a"}%.`,
      );
    }

    const valuationLabel =
      valuation === null ? "tidak tersedia" : valuation > 0.25 ? "menarik" : valuation < -0.25 ? "mahal" : "wajar";
    const qualityLabel =
      quality === null ? "tidak tersedia" : quality > 0.25 ? "kuat" : quality < -0.25 ? "lemah" : "sedang";

    const metrics: AgentSignal["metrics"] = {
      sector: f.sector,
      industry: f.industry,
      marketCap: f.marketCap,
      trailingPE: f.trailingPE !== null ? round(f.trailingPE, 2) : null,
      forwardPE: f.forwardPE !== null ? round(f.forwardPE, 2) : null,
      priceToBook: f.priceToBook !== null ? round(f.priceToBook, 2) : null,
      evToEbitda: f.evToEbitda !== null ? round(f.evToEbitda, 2) : null,
      fcfYieldPct: f.fcfYieldPct !== null ? round(f.fcfYieldPct, 2) : null,
      returnOnEquityPct:
        f.returnOnEquityPct !== null ? round(f.returnOnEquityPct, 2) : null,
      operatingMarginPct:
        f.operatingMarginPct !== null ? round(f.operatingMarginPct, 2) : null,
      profitMarginPct: f.profitMarginPct !== null ? round(f.profitMarginPct, 2) : null,
      debtToEquityPct: f.debtToEquityPct !== null ? round(f.debtToEquityPct, 2) : null,
      currentRatio: f.currentRatio !== null ? round(f.currentRatio, 2) : null,
      revenueGrowthPct:
        f.revenueGrowthPct !== null ? round(f.revenueGrowthPct, 2) : null,
      earningsGrowthPct:
        f.earningsGrowthPct !== null ? round(f.earningsGrowthPct, 2) : null,
      dividendYieldPct:
        f.dividendYieldPct !== null ? round(f.dividendYieldPct, 2) : null,
      beta: f.beta !== null ? round(f.beta, 2) : null,
      periodEnd: f.periodEnd,
      valuationScore: valuation !== null ? round(valuation, 3) : null,
      qualityScore: quality !== null ? round(quality, 3) : null,
      growthScore: growth !== null ? round(growth, 3) : null,
      ratioCoverage: round(coverage, 2),
    };

    return {
      signal: {
        agent: this.name,
        asOf: f.fetchedAt,
        score: round(score, 4),
        confidence: round(confidence, 3),
        summary: `Valuasi ${valuationLabel}, kualitas ${qualityLabel}, pertumbuhan ${growth !== null && growth > 0.2 ? "positif" : growth !== null && growth < -0.2 ? "negatif" : "datar"}.`,
        evidence,
        warnings,
        metrics,
      },
      details: null,
    };
  }
}
