import { AppError } from "../lib/errors.js";
import { clamp, round } from "../lib/math.js";
import type {
  Action,
  Horizon,
  RiskAssessment,
  RiskLimits,
  PositionSizing,
} from "../types.js";

export interface RiskInput {
  action: Action;
  confidence: number;
  probabilityUp: number;
  horizon: Horizon;
  equity: number;
  price: number;
  atr: number | null;
  annualizedVolPct: number | null;
  avgDollarVolume: number | null;
  currentDrawdownPct: number;
  sectorExposurePct: number;
  limits: RiskLimits;
}

interface CapCandidate {
  label: string;
  value: number;
}

const EXIT_NOTE =
  "Rencana keluar: stop 2x ATR, target 2R. Stop dapat tergelincir saat gap; ini bukan jaminan eksekusi.";

export function assessRisk(input: RiskInput): RiskAssessment {
  if (!Number.isFinite(input.equity) || input.equity <= 0) {
    throw new AppError("Ekuitas portofolio harus lebih dari 0.", 400, "invalid_request");
  }
  if (!Number.isFinite(input.price) || input.price <= 0) {
    throw new AppError("Harga instrumen tidak valid.", 400, "invalid_request");
  }

  const warnings: string[] = [];
  const killSwitchTriggered = input.currentDrawdownPct >= input.limits.maxDrawdownPct;

  const rawStopDistance = input.atr !== null && input.atr > 0 ? input.atr * 2 : input.price * 0.03;
  if (input.atr === null || input.atr <= 0) {
    warnings.push("ATR tidak tersedia; jarak stop memakai 3% harga.");
  }
  const stopDistance = clamp(rawStopDistance, input.price * 0.01, input.price * 0.25);
  const stopLoss = round(input.price - stopDistance, 4);
  const takeProfit = round(input.price + stopDistance * 2, 4);
  const stopDistancePct = (stopDistance / input.price) * 100;
  const atrPct = input.atr !== null ? (input.atr / input.price) * 100 : stopDistancePct / 2;

  if (input.annualizedVolPct === null) {
    warnings.push("Volatilitas tahunan tidak tersedia; target volatilitas memakai asumsi 35%.");
  }
  if (
    input.avgDollarVolume !== null &&
    input.avgDollarVolume < 1_000_000
  ) {
    warnings.push("Likuiditas rendah: nilai transaksi harian di bawah 1 juta unit mata uang.");
  }
  if (input.sectorExposurePct >= input.limits.maxSectorExposurePct) {
    warnings.push("Eksposur sektor sudah mencapai batas; entri baru diblokir.");
  }
  if (input.confidence < 0.25) {
    warnings.push("Keyakinan sinyal rendah (< 25%); pertimbangkan menunggu konfirmasi.");
  }

  const killSwitch = {
    triggered: killSwitchTriggered,
    reason: killSwitchTriggered
      ? `Drawdown berjalan ${round(input.currentDrawdownPct, 2)}% melewati batas ${input.limits.maxDrawdownPct}%.`
      : null,
  };

  const baseAssessment = {
    warnings,
    killSwitch,
    limits: input.limits,
  };

  if (input.action !== "buy" && input.action !== "strong_buy") {
    return {
      ...baseAssessment,
      approved: true,
      reasons: [
        input.action === "hold"
          ? "Sinyal hold: tidak ada entri baru yang perlu dibatasi."
          : "Aksi mengurangi/menutup posisi tetap diizinkan meski kill switch aktif.",
      ],
      sizing: null,
      exitPlan: {
        stopLoss,
        takeProfit: input.action === "sell" ? null : takeProfit,
        note: EXIT_NOTE,
      },
    };
  }

  const riskAmount = (input.limits.maxRiskPerTradePct / 100) * input.equity;
  const volatility = input.annualizedVolPct !== null && input.annualizedVolPct > 0
    ? input.annualizedVolPct / 100
    : 0.35;
  const edge = clamp(input.probabilityUp, 0.05, 0.95);
  const kellyRaw = edge - (1 - edge) / 2;
  const fractionalKelly = Math.max(0, kellyRaw) * 0.25;

  const caps: CapCandidate[] = [
    {
      label: "risiko per transaksi",
      value: input.limits.maxRiskPerTradePct / Math.max(stopDistancePct, 0.5),
    },
    { label: "target volatilitas", value: (input.limits.targetVolatilityPct / 100) / volatility },
    { label: "batas posisi", value: input.limits.maxPositionPct / 100 },
    { label: "Kelly pecahan", value: fractionalKelly },
    {
      label: "likuiditas (1% ADV)",
      value:
        input.avgDollarVolume !== null && input.avgDollarVolume > 0
          ? (input.avgDollarVolume * 0.01) / input.equity
          : Number.POSITIVE_INFINITY,
    },
    {
      label: "batas sektor",
      value: Math.max(
        0,
        (input.limits.maxSectorExposurePct - input.sectorExposurePct) / 100,
      ),
    },
  ];

  const binding = caps.reduce((minimum, cap) =>
    cap.value < minimum.value ? cap : minimum,
  );
  let fraction = clamp(binding.value, 0, 1);
  if (killSwitchTriggered) fraction = 0;

  const shares = Math.floor((fraction * input.equity) / input.price + 1e-9);
  const positionValue = round(shares * input.price, 2);
  const positionPct = round((positionValue / input.equity) * 100, 2);

  const reasons: string[] = [];
  const approved = !killSwitchTriggered && shares >= 1 && fractionalKelly > 0;
  if (killSwitchTriggered) {
    reasons.push("Kill switch aktif: entri baru diblokir sampai drawdown pulih di bawah ambang.");
  }
  if (fractionalKelly <= 0) {
    reasons.push("Kelly pecahan tidak positif: probabilitas naik tidak memberi edge terhadap risiko 2R.");
  }
  if (shares < 1) {
    reasons.push("Modal tidak cukup untuk membeli 1 saham dalam batas risiko.");
  }
  if (approved) {
    reasons.push(
      `Ukuran posisi dibatasi oleh ${binding.label} (${round(fraction * 100, 1)}% ekuitas).`,
    );
  }
  if (input.sectorExposurePct > 0) {
    reasons.push(
      `Eksposur sektor saat ini ${round(input.sectorExposurePct, 1)}%, batas ${input.limits.maxSectorExposurePct}%.`,
    );
  }

  const sizing: PositionSizing = {
    atr: input.atr !== null ? round(input.atr, 4) : 0,
    atrPct: round(atrPct, 2),
    stopLoss,
    takeProfit,
    stopDistancePct: round(stopDistancePct, 2),
    riskAmount: round(riskAmount, 2),
    recommendedShares: shares,
    recommendedPositionValue: positionValue,
    recommendedPositionPct: positionPct,
    maxLossAtStop: round(shares * stopDistance, 2),
    volatilityTargetPct: round(
      Math.min((input.limits.targetVolatilityPct / 100) / volatility, 1) * 100,
      2,
    ),
    fractionalKellyPct: round(fractionalKelly * 100, 2),
  };

  return {
    ...baseAssessment,
    approved,
    reasons,
    sizing,
    exitPlan: {
      stopLoss,
      takeProfit,
      note: EXIT_NOTE,
    },
  };
}
