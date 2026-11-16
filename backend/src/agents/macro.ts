import { AppError } from "../lib/errors.js";
import { clamp, formatNumber, round, weightedMean } from "../lib/math.js";
import type { AgentSignal, MacroRegime } from "../types.js";
import type { Agent, AgentOutput, AnalysisContext } from "./types.js";

function vixLevelScore(vix: number | null): number | null {
  if (vix === null) return null;
  if (vix < 12) return 0.8;
  if (vix < 16) return 0.5;
  if (vix < 20) return 0.2;
  if (vix < 25) return -0.2;
  if (vix < 30) return -0.5;
  if (vix < 40) return -0.8;
  return -1;
}

function curveScore(spread: number | null): number | null {
  if (spread === null) return null;
  if (spread > 1.5) return 0.6;
  if (spread > 0.5) return 0.35;
  if (spread > 0) return 0.1;
  if (spread > -0.2) return -0.3;
  return -0.8;
}

function dollarScore(changePct: number | null): number | null {
  if (changePct === null) return null;
  return Math.tanh(-changePct / 2.5);
}

function benchmarkScore(
  aboveSma50: boolean | null,
  aboveSma200: boolean | null,
  change60dPct: number | null,
): number | null {
  return weightedMean([
    { value: aboveSma200 === null ? null : aboveSma200 ? 0.8 : -0.8, weight: 0.5 },
    { value: aboveSma50 === null ? null : aboveSma50 ? 0.4 : -0.4, weight: 0.2 },
    {
      value: change60dPct === null ? null : Math.tanh(change60dPct / 10),
      weight: 0.3,
    },
  ]);
}

function regimeFromScore(score: number): MacroRegime {
  if (score >= 0.35) return "risk_on";
  if (score <= -0.35) return "risk_off";
  return "neutral";
}

export class MacroAgent implements Agent<null> {
  readonly name = "macro" as const;

  async run(context: AnalysisContext): Promise<AgentOutput<null>> {
    const macro = context.macro;
    if (!macro) {
      throw new AppError("Data makro tidak tersedia.", 422, "insufficient_data");
    }

    let vixScore = vixLevelScore(macro.vix);
    if (vixScore !== null && macro.vixChange20dPct !== null) {
      if (macro.vixChange20dPct > 25) vixScore = clamp(vixScore - 0.15, -1, 1);
      else if (macro.vixChange20dPct < -25) vixScore = clamp(vixScore + 0.1, -1, 1);
    }

    const curve = curveScore(macro.yieldCurveSpreadPct);
    const dollar = dollarScore(macro.dollarChange20dPct);
    const benchmark = benchmarkScore(
      macro.benchmarkAboveSma50,
      macro.benchmarkAboveSma200,
      macro.benchmarkChange60dPct,
    );

    const components = [vixScore, curve, dollar, benchmark];
    const available = components.filter((value) => value !== null).length;
    const composite = weightedMean([
      { value: vixScore, weight: 0.35 },
      { value: curve, weight: 0.2 },
      { value: dollar, weight: 0.15 },
      { value: benchmark, weight: 0.3 },
    ]);

    if (composite === null) {
      throw new AppError("Data makro tidak lengkap untuk dinilai.", 422, "insufficient_data");
    }

    const regime = regimeFromScore(composite);
    const ratesRegime =
      macro.tenYearChange20dBps === null
        ? "unknown"
        : macro.tenYearChange20dBps > 10
          ? "rising"
          : macro.tenYearChange20dBps < -10
            ? "falling"
            : "stable";

    const confidence = clamp(0.15, 0.8, 0.15 + 0.6 * (available / components.length));
    const warnings = [...macro.warnings];
    if (macro.vix === null) warnings.push("VIX tidak tersedia.");
    if (macro.yieldCurveSpreadPct === null) warnings.push("Kurva imbal hasil tidak tersedia.");
    if (macro.benchmarkAboveSma200 === null) {
      warnings.push("Tren benchmark belum dapat dihitung (riwayat < 200 hari).");
    }
    if (regime === "risk_off") {
      warnings.push("Rezim makro risk-off: utamakan perlindungan modal.");
    }

    const evidence: string[] = [
      `Rezim makro: ${regime.replace("_", "-")} (skor ${formatNumber(composite, 2)}).`,
      `VIX ${macro.vix !== null ? formatNumber(macro.vix, 1) : "n/a"} (20 hari: ${macro.vixChange20dPct !== null ? formatNumber(macro.vixChange20dPct, 1) : "n/a"}%).`,
      `Yield 10Y ${macro.tenYearYieldPct !== null ? formatNumber(macro.tenYearYieldPct, 2) : "n/a"}%, kurva 10Y-3M ${macro.yieldCurveSpreadPct !== null ? formatNumber(macro.yieldCurveSpreadPct, 2) : "n/a"} pp.`,
      `Dolar (DXY) ${macro.dollarChange20dPct !== null ? `${formatNumber(macro.dollarChange20dPct, 1)}% dalam 20 hari` : "n/a"}.`,
      `Benchmark ${macro.benchmarkSymbol} ${macro.benchmarkAboveSma200 === null ? "tren tidak tersedia" : macro.benchmarkAboveSma200 ? "di atas SMA200" : "di bawah SMA200"}.`,
    ];
    if (macro.goldChange20dPct !== null) {
      evidence.push(`Emas ${formatNumber(macro.goldChange20dPct, 1)}% (20 hari) sebagai indikator permintaan aset aman.`);
    }

    const summary =
      regime === "risk_on"
        ? "Lingkungan makro mendukung aset berisiko."
        : regime === "risk_off"
          ? "Lingkungan makro menekan aset berisiko."
          : "Lingkungan makro campuran, tanpa dorongan arah kuat.";

    const metrics: AgentSignal["metrics"] = {
      regime,
      ratesRegime,
      benchmarkSymbol: macro.benchmarkSymbol,
      benchmarkPrice: macro.benchmarkPrice,
      benchmarkChange60dPct:
        macro.benchmarkChange60dPct !== null ? round(macro.benchmarkChange60dPct, 2) : null,
      vix: macro.vix !== null ? round(macro.vix, 2) : null,
      vixChange20dPct:
        macro.vixChange20dPct !== null ? round(macro.vixChange20dPct, 2) : null,
      tenYearYieldPct:
        macro.tenYearYieldPct !== null ? round(macro.tenYearYieldPct, 3) : null,
      threeMonthYieldPct:
        macro.threeMonthYieldPct !== null ? round(macro.threeMonthYieldPct, 3) : null,
      yieldCurveSpreadPct:
        macro.yieldCurveSpreadPct !== null ? round(macro.yieldCurveSpreadPct, 3) : null,
      tenYearChange20dBps:
        macro.tenYearChange20dBps !== null ? round(macro.tenYearChange20dBps, 1) : null,
      dollarIndex: macro.dollarIndex !== null ? round(macro.dollarIndex, 2) : null,
      dollarChange20dPct:
        macro.dollarChange20dPct !== null ? round(macro.dollarChange20dPct, 2) : null,
      goldChange20dPct:
        macro.goldChange20dPct !== null ? round(macro.goldChange20dPct, 2) : null,
      oilChange20dPct:
        macro.oilChange20dPct !== null ? round(macro.oilChange20dPct, 2) : null,
      vixScore: vixScore !== null ? round(vixScore, 3) : null,
      curveScore: curve !== null ? round(curve, 3) : null,
      dollarScore: dollar !== null ? round(dollar, 3) : null,
      benchmarkScore: benchmark !== null ? round(benchmark, 3) : null,
      componentsAvailable: available,
    };

    return {
      signal: {
        agent: this.name,
        asOf: macro.asOf,
        score: round(composite, 4),
        confidence: round(confidence, 3),
        summary,
        evidence,
        warnings,
        metrics,
      },
      details: null,
    };
  }
}
