import type { FinancialPeriod, ScreenerQuality, ScreenerQualityParts } from "../types.js";

export interface QualityQuoteInput {
  price: number | null;
  changePct: number | null;
  trailingPE: number | null;
  priceToBook: number | null;
  dividendYieldPct: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
}

export interface QualityInput {
  quote: QualityQuoteInput | null;
  latest: FinancialPeriod | null;
}

function num(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Interpolasi linear menurun: 1.0 pada `good`, menuju 0.0 pada `bad`. */
function decay(value: number, good: number, bad: number): number {
  if (value <= good) return 1;
  if (value >= bad) return 0;
  return clamp01(1 - (value - good) / (bad - good));
}

function band(value: number, edges: readonly { at: number; score: number }[]): number {
  for (const edge of edges) {
    if (value >= edge.at) return edge.score;
  }
  return edges[edges.length - 1]?.score ?? 0;
}

const ROE_BANDS = [
  { at: 25, score: 1 },
  { at: 18, score: 0.9 },
  { at: 12, score: 0.75 },
  { at: 8, score: 0.55 },
  { at: 4, score: 0.35 },
  { at: 0.0001, score: 0.2 },
] as const;

const NET_MARGIN_BANDS = [
  { at: 25, score: 1 },
  { at: 15, score: 0.85 },
  { at: 8, score: 0.6 },
  { at: 3, score: 0.35 },
  { at: 0.0001, score: 0.15 },
] as const;

const GROSS_MARGIN_BANDS = [
  { at: 50, score: 1 },
  { at: 30, score: 0.8 },
  { at: 20, score: 0.6 },
  { at: 10, score: 0.4 },
] as const;

const PE_BANDS = [
  { at: 0.0001, score: 1 },
  { at: 6, score: 0.95 },
  { at: 12, score: 0.8 },
  { at: 18, score: 0.6 },
  { at: 25, score: 0.4 },
  { at: 35, score: 0.25 },
] as const;

const PB_BANDS = [
  { at: 0.0001, score: 1 },
  { at: 1, score: 0.9 },
  { at: 2, score: 0.8 },
  { at: 3, score: 0.65 },
  { at: 5, score: 0.45 },
  { at: 8, score: 0.25 },
] as const;

const DIVIDEND_BANDS = [
  { at: 6, score: 1 },
  { at: 4, score: 0.85 },
  { at: 3, score: 0.7 },
  { at: 2, score: 0.5 },
  { at: 1, score: 0.3 },
] as const;

const REVENUE_GROWTH_BANDS = [
  { at: 25, score: 1 },
  { at: 15, score: 0.85 },
  { at: 8, score: 0.65 },
  { at: 3, score: 0.45 },
  { at: 0, score: 0.3 },
  { at: -5, score: 0.15 },
] as const;

const EARNINGS_GROWTH_BANDS = [
  { at: 25, score: 1 },
  { at: 10, score: 0.8 },
  { at: 0, score: 0.55 },
  { at: -10, score: 0.3 },
] as const;

const DEBT_BANDS = [
  { at: 0, score: 1 },
  { at: 30, score: 0.9 },
  { at: 60, score: 0.75 },
  { at: 100, score: 0.55 },
  { at: 150, score: 0.35 },
  { at: 250, score: 0.15 },
] as const;

function peScore(pe: number | null): number {
  if (!num(pe)) return 0.45;
  if (pe <= 0) return 0.15;
  return band(pe, PE_BANDS);
}

function pbScore(pb: number | null): number {
  if (!num(pb)) return 0.45;
  if (pb <= 0) return 0.2;
  return band(pb, PB_BANDS);
}

function dividendScore(yieldPct: number | null): number {
  if (!num(yieldPct) || yieldPct <= 0) return 0.1;
  return band(yieldPct, DIVIDEND_BANDS);
}

function gradeFor(score: number): ScreenerQuality["grade"] {
  if (score >= 80) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  if (score >= 50) return "D";
  return "E";
}

/**
 * Skor kualitas 0-100 gabungan valuasi (25%), kualitas laba (30%),
 * pertumbuhan (20%), kesehatan neraca (15%), dan momentum harga (10%).
 */
export function computeQuality(input: QualityInput): ScreenerQuality | null {
  const { quote, latest } = input;
  if (!quote || !latest || !num(quote.price) || quote.price <= 0) return null;

  const equity = latest.stockholdersEquity;
  const roe =
    num(latest.netIncome) && num(equity) && equity > 0
      ? (latest.netIncome / equity) * 100
      : null;
  const debtToEquity =
    num(latest.totalLiabilities) && num(equity) && equity > 0
      ? (latest.totalLiabilities / equity) * 100
      : null;
  const cashVsDebt =
    num(latest.cashAndCashEquivalents) && num(latest.totalDebt) && latest.totalDebt > 0
      ? latest.cashAndCashEquivalents / latest.totalDebt
      : num(latest.cashAndCashEquivalents) && num(latest.totalDebt)
        ? Number.POSITIVE_INFINITY
        : null;

  // --- kualitas laba ---
  const roePart = num(roe) && roe > 0 ? band(roe, ROE_BANDS) : roe !== null ? 0 : null;
  const netMarginPart =
    num(latest.netMarginPct) && latest.netMarginPct > 0
      ? band(latest.netMarginPct, NET_MARGIN_BANDS)
      : latest.netMarginPct !== null && latest.netMarginPct !== undefined
        ? 0
        : null;
  const grossMarginPart =
    num(latest.grossMarginPct) && latest.grossMarginPct > 0
      ? band(latest.grossMarginPct, GROSS_MARGIN_BANDS)
      : 0.4;
  const knownMarginParts = [roePart, netMarginPart].filter((part) => part !== null);
  const marginBlend =
    knownMarginParts.length > 0
      ? knownMarginParts.reduce((sum, part) => sum + part, 0) / knownMarginParts.length
      : 0.35;
  const qualityPart = clamp01(marginBlend * 0.7 + grossMarginPart * 0.3);

  // --- valuasi ---
  const valuePart = clamp01(
    peScore(quote.trailingPE) * 0.45 + pbScore(quote.priceToBook) * 0.35 + dividendScore(quote.dividendYieldPct) * 0.2,
  );

  // --- pertumbuhan ---
  const revenueGrowthPart =
    num(latest.revenueGrowthPct) && latest.revenueGrowthPct > 0
      ? band(latest.revenueGrowthPct, REVENUE_GROWTH_BANDS)
      : latest.revenueGrowthPct !== null && latest.revenueGrowthPct !== undefined
        ? 0
        : 0.25;
  const earningsGrowthPart =
    num(latest.netIncomeGrowthPct) && latest.netIncomeGrowthPct > 0
      ? band(latest.netIncomeGrowthPct, EARNINGS_GROWTH_BANDS)
      : latest.netIncomeGrowthPct !== null && latest.netIncomeGrowthPct !== undefined
        ? 0
        : 0.25;
  const growthPart = clamp01(revenueGrowthPart * 0.55 + earningsGrowthPart * 0.45);

  // --- kesehatan neraca ---
  const debtPart = debtToEquity === null ? 0.5 : band(debtToEquity, DEBT_BANDS);
  const cashPart =
    cashVsDebt === null
      ? 0.45
      : cashVsDebt === Number.POSITIVE_INFINITY || cashVsDebt >= 1
        ? 1
        : cashVsDebt >= 0.5
          ? 0.7
          : cashVsDebt > 0
            ? 0.45
            : 0.2;
  const ocfPart =
    num(latest.operatingCashFlow) && latest.operatingCashFlow > 0
      ? 1
      : num(latest.operatingCashFlow)
        ? 0
        : 0.5;
  const healthPart = clamp01(debtPart * 0.45 + cashPart * 0.25 + ocfPart * 0.3);

  // --- momentum harga ---
  let rangePosition: number | null = null;
  if (num(quote.fiftyTwoWeekHigh) && num(quote.fiftyTwoWeekLow)) {
    const span = quote.fiftyTwoWeekHigh - quote.fiftyTwoWeekLow;
    if (span > 0) {
      rangePosition = clamp01((quote.price - quote.fiftyTwoWeekLow) / span);
    }
  }
  const positionPart =
    rangePosition === null
      ? 0.5
      : rangePosition >= 0.85
        ? 0.55
        : rangePosition >= 0.7
          ? 0.8
          : rangePosition >= 0.3
            ? 1
            : rangePosition >= 0.15
              ? 0.6
              : 0.45;
  const changePart =
    num(quote.changePct) && quote.changePct > 0 ? 0.7 : num(quote.changePct) && quote.changePct < 0 ? 0.4 : 0.55;
  const momentumPart = clamp01(positionPart * 0.7 + changePart * 0.3);

  const parts: ScreenerQualityParts = {
    value: valuePart,
    quality: qualityPart,
    growth: growthPart,
    health: healthPart,
    momentum: momentumPart,
  };

  const score = Math.round(
    (valuePart * 0.25 + qualityPart * 0.3 + growthPart * 0.2 + healthPart * 0.15 + momentumPart * 0.1) * 1000,
  ) / 10;

  const profitable = num(latest.netIncome) && latest.netIncome > 0;
  const verdict: ScreenerQuality["verdict"] =
    score >= 65 && profitable && healthPart >= 0.5 && (debtToEquity === null || debtToEquity <= 150)
      ? "buy"
      : score >= 48
        ? "watch"
        : "avoid";

  const reasons: string[] = [];
  const risks: string[] = [];

  if (roe !== null && roe >= 12) reasons.push(`ROE ${roe.toFixed(1)}% menunjukkan kualitas laba baik.`);
  if (num(quote.trailingPE) && quote.trailingPE > 0 && quote.trailingPE <= 12)
    reasons.push(`Valuasi tergolong murah dengan P/E ${quote.trailingPE.toFixed(1)}.`);
  if (num(quote.dividendYieldPct) && quote.dividendYieldPct >= 4)
    reasons.push(`Dividen ${quote.dividendYieldPct.toFixed(1)}% cukup menarik.`);
  if (num(latest.revenueGrowthPct) && latest.revenueGrowthPct >= 10)
    reasons.push(`Pendapatan tumbuh ${latest.revenueGrowthPct.toFixed(1)}% YoY.`);
  if (num(latest.netIncomeGrowthPct) && latest.netIncomeGrowthPct >= 15)
    reasons.push(`Laba bersih tumbuh ${latest.netIncomeGrowthPct.toFixed(1)}% YoY.`);
  if (debtToEquity !== null && debtToEquity <= 50)
    reasons.push(`Utang rendah, ${debtToEquity.toFixed(0)}% dari ekuitas.`);
  if (cashVsDebt !== null && (cashVsDebt === Number.POSITIVE_INFINITY || cashVsDebt >= 1))
    reasons.push("Kas melampaui total utang (net cash).");
  if (num(latest.netMarginPct) && latest.netMarginPct >= 15)
    reasons.push(`Margin laba sehat ${latest.netMarginPct.toFixed(1)}%.`);

  if (num(latest.netIncome) && latest.netIncome < 0) risks.push("Laba bersih negatif.");
  if (num(latest.revenueGrowthPct) && latest.revenueGrowthPct < 0)
    risks.push(`Pendapatan menyusut ${Math.abs(latest.revenueGrowthPct).toFixed(1)}% YoY.`);
  if (debtToEquity !== null && debtToEquity > 150)
    risks.push(`Utang tinggi, ${debtToEquity.toFixed(0)}% dari ekuitas.`);
  if (num(quote.trailingPE) && quote.trailingPE > 30) risks.push(`Valuasi mahal (P/E ${quote.trailingPE.toFixed(1)}).`);
  if (rangePosition !== null && rangePosition >= 0.9) risks.push("Harga dekat puncak 52 minggu.");
  if (num(latest.operatingCashFlow) && latest.operatingCashFlow < 0) risks.push("Arus kas operasi negatif.");
  if (!profitable && score < 48) risks.push("Belum ada bukti laba yang layak.");

  return {
    score,
    grade: gradeFor(score),
    verdict,
    parts,
    reasons: reasons.slice(0, 4),
    risks: risks.slice(0, 3),
    metrics: {
      roePct: roe,
      netMarginPct: latest.netMarginPct ?? null,
      debtToEquityPct: debtToEquity,
      revenueGrowthPct: latest.revenueGrowthPct ?? null,
      earningsGrowthPct: latest.netIncomeGrowthPct ?? null,
      dividendYieldPct: quote.dividendYieldPct,
      range52PositionPct: rangePosition === null ? null : rangePosition * 100,
    },
  };
}

export { decay };
