import { clamp, mean, round } from "../lib/math.js";
import type {
  Action,
  AgentName,
  AgentSignal,
  Focus,
  Horizon,
  HorizonAssessment,
  MacroRegime,
  SynthesisResult,
} from "../types.js";

const BASE_WEIGHTS: Record<Horizon, Record<AgentName, number>> = {
  trading: { technical: 0.55, sentiment: 0.2, macro: 0.2, fundamental: 0.05 },
  investment: { fundamental: 0.55, macro: 0.25, technical: 0.12, sentiment: 0.08 },
};

const AGENT_LABEL: Record<AgentName, string> = {
  technical: "Teknikal",
  fundamental: "Fundamental",
  macro: "Makro",
  sentiment: "Sentimen",
};

function actionFromScore(score: number): Action {
  if (score >= 0.5) return "strong_buy";
  if (score >= 0.18) return "buy";
  if (score <= -0.5) return "sell";
  if (score <= -0.18) return "reduce";
  return "hold";
}

function regimeAdjustedWeights(horizon: Horizon, regime: MacroRegime): Record<AgentName, number> {
  const base = { ...BASE_WEIGHTS[horizon] };
  if (regime === "risk_off") {
    base.macro *= 1.35;
    base.technical *= 0.85;
  } else if (regime === "risk_on") {
    base.technical *= 1.1;
    base.sentiment *= 1.1;
    base.macro *= 0.9;
  }
  return base;
}

export interface SynthesizeInput {
  signals: Partial<Record<AgentName, AgentSignal>>;
  regime: MacroRegime;
  focus: Focus;
}

export class Synthesizer {
  run(input: SynthesizeInput): SynthesisResult {
    const available = (
      Object.entries(input.signals) as Array<[AgentName, AgentSignal | undefined]>
    ).filter(
      (entry): entry is [AgentName, AgentSignal] =>
        entry[1] !== undefined &&
        Number.isFinite(entry[1].score) &&
        entry[1].confidence > 0.05,
    );

    const conflicts = this.detectConflicts(input.signals, input.regime);
    const horizons: Horizon[] = input.focus === "both" ? ["trading", "investment"] : [input.focus];

    const assessments = horizons.map((horizon) =>
      this.assessHorizon(horizon, available, input.regime, conflicts),
    );

    let primary = assessments[0];
    if (input.focus === "both" && assessments.length === 2) {
      primary =
        assessments[1].confidence > assessments[0].confidence ? assessments[1] : assessments[0];
    }

    return {
      primaryHorizon: primary.horizon,
      assessments,
      regime: input.regime,
      conflicts,
    };
  }

  private assessHorizon(
    horizon: Horizon,
    available: Array<[AgentName, AgentSignal]>,
    regime: MacroRegime,
    conflicts: string[],
  ): HorizonAssessment {
    if (available.length === 0) {
      return {
        horizon,
        action: "hold",
        score: 0,
        probabilityUp: 0.5,
        confidence: 0,
        weights: {},
        contributions: {},
        thesis: ["Tidak ada sinyal agen yang valid; analisis tidak dapat disimpulkan."],
        conflicts,
      };
    }

    const base = regimeAdjustedWeights(horizon, regime);
    const usable = available.filter(([, signal]) => base[signal.agent] > 0);
    const baseWeightSum = usable.reduce((acc, [, signal]) => acc + base[signal.agent], 0);

    const weights: Partial<Record<AgentName, number>> = {};
    const effective: Array<{ agent: AgentName; signal: AgentSignal; weight: number }> = [];
    for (const [, signal] of usable) {
      const normalized = base[signal.agent] / baseWeightSum;
      weights[signal.agent] = round(normalized, 3);
      effective.push({
        agent: signal.agent,
        signal,
        weight: normalized * (0.35 + 0.65 * signal.confidence),
      });
    }

    const effectiveWeightSum = effective.reduce((acc, entry) => acc + entry.weight, 0);
    const composite =
      effectiveWeightSum > 0
        ? effective.reduce((acc, entry) => acc + entry.signal.score * entry.weight, 0) /
          effectiveWeightSum
        : 0;

    const contributions: Partial<Record<AgentName, number>> = {};
    for (const entry of effective) {
      contributions[entry.agent] = round(
        (entry.weight / effectiveWeightSum) * entry.signal.score,
        3,
      );
    }

    const agreement = clamp(
      1 -
        effective.reduce(
          (acc, entry) => acc + entry.weight * Math.abs(entry.signal.score - composite),
          0,
        ) /
          (2 * effectiveWeightSum),
      0,
      1,
    );
    const averageConfidence = mean(
      effective.map((entry) => entry.signal.confidence),
    );
    const coverageFactor = Math.min(1, 0.6 + 0.2 * effective.length);
    const confidence = clamp(
      0.05,
      0.9,
      averageConfidence * (0.45 + 0.55 * agreement) * coverageFactor,
    );

    const score = round(composite, 4);
    const action: Action = confidence < 0.2 ? "hold" : actionFromScore(score);
    const directionalStrength = Math.tanh(1.4 * score);
    const probabilityUp = round(
      clamp(0.5 + 0.3 * directionalStrength * (0.5 + 0.5 * confidence), 0.2, 0.8),
      3,
    );

    return {
      horizon,
      action,
      score,
      probabilityUp,
      confidence: round(confidence, 3),
      weights,
      contributions,
      thesis: this.buildThesis(horizon, effective, contributions, regime, agreement),
      conflicts,
    };
  }

  private buildThesis(
    horizon: Horizon,
    effective: Array<{ agent: AgentName; signal: AgentSignal }>,
    contributions: Partial<Record<AgentName, number>>,
    regime: MacroRegime,
    agreement: number,
  ): string[] {
    const thesis: string[] = [];
    const sorted = [...effective].sort(
      (a, b) => Math.abs(contributions[b.agent] ?? 0) - Math.abs(contributions[a.agent] ?? 0),
    );

    let positives = 0;
    let negatives = 0;
    for (const entry of sorted) {
      const contribution = contributions[entry.agent] ?? 0;
      if (contribution > 0.02 && positives < 2) {
        thesis.push(
          `${AGENT_LABEL[entry.agent]} mendukung (kontribusi +${round(contribution, 2)}): ${entry.signal.summary}`,
        );
        positives += 1;
      } else if (contribution < -0.02 && negatives < 2) {
        thesis.push(
          `${AGENT_LABEL[entry.agent]} menahan (kontribusi ${round(contribution, 2)}): ${entry.signal.summary}`,
        );
        negatives += 1;
      }
    }

    if (positives === 0 && negatives === 0) {
      thesis.push("Sinyal antar agen saling menetralkan; tidak ada keunggulan arah yang jelas.");
    }
    if (agreement < 0.5) {
      thesis.push("Tingkat kesepakatan antar agen rendah, sehingga keyakinan diturunkan.");
    }
    thesis.push(
      regime === "risk_off"
        ? "Rezim makro risk-off menaikkan bobot makro dalam gabungan sinyal."
        : regime === "risk_on"
          ? "Rezim makro risk-on memberi ruang lebih besar pada sinyal teknikal dan sentimen."
          : "Rezim makro netral; bobot sinyal mendekati konfigurasi dasar.",
    );
    thesis.push(
      horizon === "trading"
        ? "Horizon trading menekankan teknikal dan sentimen; horizon waktu pendek dan stop-loss ketat."
        : "Horizon investasi menekankan fundamental dan makro; noise harian sengaja diredam.",
    );
    return thesis;
  }

  private detectConflicts(
    signals: Partial<Record<AgentName, AgentSignal>>,
    regime: MacroRegime,
  ): string[] {
    const conflicts: string[] = [];
    const technical = signals.technical;
    const fundamental = signals.fundamental;
    const sentiment = signals.sentiment;

    if (technical && fundamental) {
      if (technical.score > 0.3 && fundamental.score < -0.3) {
        conflicts.push("Teknikal bullish, tetapi fundamental bearish.");
      } else if (technical.score < -0.3 && fundamental.score > 0.3) {
        conflicts.push("Teknikal bearish, tetapi fundamental bullish.");
      }
    }
    if (technical && sentiment) {
      if (technical.score > 0.3 && sentiment.score < -0.3) {
        conflicts.push("Tren harga positif, tetapi sentimen berita negatif.");
      } else if (technical.score < -0.3 && sentiment.score > 0.3) {
        conflicts.push("Tren harga negatif, tetapi sentimen berita positif.");
      }
    }
    if (regime === "risk_off" && technical && technical.score > 0.35) {
      conflicts.push("Sinyal teknikal bullish bertentangan dengan rezim makro risk-off.");
    }
    return conflicts;
  }
}
