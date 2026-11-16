import type { Action, AgentName, CheckStatus, Horizon, MacroRegime, SentimentLabel } from "./api";

export type Tone = "buy" | "sell" | "hold" | "ok" | "warn" | "info" | "muted";

const numberFormatterCache = new Map<string, Intl.NumberFormat>();

function numberFormatter(digits: number): Intl.NumberFormat {
  const key = String(digits);
  let formatter = numberFormatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat("id-ID", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    numberFormatterCache.set(key, formatter);
  }
  return formatter;
}

export function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function fmtNumber(value: number | null | undefined, digits = 2): string {
  if (!isNumber(value)) return "—";
  return numberFormatter(digits).format(value);
}

export function fmtSigned(value: number | null | undefined, digits = 2): string {
  if (!isNumber(value)) return "—";
  const formatted = numberFormatter(digits).format(Math.abs(value));
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}

export function fmtPct(value: number | null | undefined, digits = 2, signed = false): string {
  if (!isNumber(value)) return "—";
  return `${signed ? fmtSigned(value, digits) : fmtNumber(value, digits)}%`;
}

export function fmtMoney(
  value: number | null | undefined,
  _currency: string | null = null,
  digits = 0,
): string {
  if (!isNumber(value)) return "—";
  try {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: digits,
      minimumFractionDigits: digits,
    }).format(value);
  } catch {
    return `Rp ${fmtNumber(value, digits)}`;
  }
}

export function fmtCompact(value: number | null | undefined): string {
  if (!isNumber(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${fmtNumber(value / 1e12, 2)} T`;
  if (abs >= 1e9) return `${fmtNumber(value / 1e9, 2)} M`;
  if (abs >= 1e6) return `${fmtNumber(value / 1e6, 2)} jt`;
  if (abs >= 1e3) return `${fmtNumber(value / 1e3, 1)} rb`;
  return fmtNumber(value, 2);
}

export function fmtCompactMoney(value: number | null | undefined): string {
  if (!isNumber(value)) return "—";
  return `Rp ${fmtCompact(value)}`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(time));
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(time));
}

export function fmtShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "—";
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short" }).format(
    new Date(time),
  );
}

export function relativeTime(iso: string): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "—";
  const diffMs = Date.now() - time;
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.round(hours / 24);
  return `${days} hari lalu`;
}

export const ACTION_META: Record<Action, { label: string; short: string; tone: Tone }> = {
  strong_buy: { label: "Beli Kuat", short: "BELI KUAT", tone: "buy" },
  buy: { label: "Beli", short: "BELI", tone: "buy" },
  hold: { label: "Tahan", short: "TAHAN", tone: "hold" },
  reduce: { label: "Kurangi", short: "KURANGI", tone: "warn" },
  sell: { label: "Jual", short: "JUAL", tone: "sell" },
};

export function actionMeta(action: Action): { label: string; short: string; tone: Tone } {
  return ACTION_META[action] ?? { label: action, short: action.toUpperCase(), tone: "muted" };
}

export function horizonLabel(horizon: Horizon): string {
  return horizon === "trading" ? "Trading" : "Investasi";
}

export const REGIME_META: Record<MacroRegime, { label: string; tone: Tone }> = {
  risk_on: { label: "Risk-on", tone: "buy" },
  neutral: { label: "Netral", tone: "muted" },
  risk_off: { label: "Risk-off", tone: "sell" },
};

export const AGENT_META: Record<AgentName, { label: string; blurb: string }> = {
  technical: { label: "Teknikal", blurb: "Tren, momentum, volume, volatilitas" },
  fundamental: { label: "Fundamental", blurb: "Valuasi, kualitas, pertumbuhan" },
  macro: { label: "Makro", blurb: "VIX, kurva yield, dolar, benchmark" },
  sentiment: { label: "Sentimen", blurb: "Berita dan peristiwa material" },
};

export function scoreTone(score: number): Tone {
  if (score > 0.15) return "buy";
  if (score < -0.15) return "sell";
  return "muted";
}

export function checkTone(status: CheckStatus): Tone {
  if (status === "pass") return "ok";
  if (status === "warn") return "warn";
  return "sell";
}

export function sentimentTone(label: SentimentLabel): Tone {
  if (label === "positive") return "buy";
  if (label === "negative") return "sell";
  return "muted";
}

export function verdictMeta(verdict: "pass" | "caution" | "reject"): {
  label: string;
  tone: Tone;
} {
  if (verdict === "pass") return { label: "Lolos", tone: "ok" };
  if (verdict === "caution") return { label: "Hati-hati", tone: "warn" };
  return { label: "Ditolak", tone: "sell" };
}

export function exitReasonLabel(reason: string): string {
  if (reason === "signal") return "Sinyal";
  if (reason === "stop") return "Stop loss";
  if (reason === "final_liquidation") return "Likuidasi akhir";
  return reason;
}

const METRIC_LABELS: Record<string, string> = {
  atr: "ATR",
  atrPct: "ATR %",
  annualizedVolPct: "Vol tahunan",
  avgDollarVolume20: "ADV 20 hari",
  rsi14: "RSI 14",
  rsi: "RSI",
  sma20: "SMA 20",
  sma50: "SMA 50",
  sma200: "SMA 200",
  trend: "Tren",
  momentum: "Momentum",
  volume: "Volume",
  volatility: "Volatilitas",
  high52w: "High 52w",
  low52w: "Low 52w",
  bars: "Bar",
  valuation: "Valuasi",
  quality: "Kualitas",
  growth: "Pertumbuhan",
  coverage: "Cakupan",
  trailingPE: "P/E",
  forwardPE: "Fwd P/E",
  priceToBook: "P/B",
  returnOnEquityPct: "ROE",
  revenueGrowthPct: "Growth revenue",
  earningsGrowthPct: "Growth laba",
  debtToEquityPct: "Debt/Equity",
  profitMarginPct: "Margin laba",
  fcfYieldPct: "FCF yield",
  regime: "Rezim",
  ratesRegime: "Rezim suku bunga",
  vix: "VIX",
  tenYearYieldPct: "Yield 10Y",
  threeMonthYieldPct: "Yield 3M",
  yieldCurveSpreadPct: "Spread kurva",
  benchmarkChange60dPct: "Benchmark 60 hari",
  dollarIndex: "DXY",
  dollarChange20dPct: "DXY 20 hari",
  goldChange20dPct: "Emas 20 hari",
  oilChange20dPct: "Minyak 20 hari",
  articleCount: "Artikel",
  recentArticleCount: "Artikel 14 hari",
  positiveCount: "Positif",
  negativeCount: "Negatif",
  neutralCount: "Netral",
  aggregateScore: "Skor agregat",
  llmUsed: "LLM",
  oldestArticleHours: "Usia tertua",
  marketCap: "Kap. pasar",
};

export function metricLabel(key: string): string {
  if (METRIC_LABELS[key]) return METRIC_LABELS[key];
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (char) => char.toUpperCase());
}

export function fmtMetricValue(key: string, value: number | string | boolean | null): string {
  if (value === null) return "—";
  if (typeof value === "boolean") return value ? "Ya" : "Tidak";
  if (typeof value === "string") {
    if (value === "risk_on") return "Risk-on";
    if (value === "risk_off") return "Risk-off";
    if (value === "neutral") return "Netral";
    if (value === "rising") return "Naik";
    if (value === "falling") return "Turun";
    if (value === "stable") return "Stabil";
    if (value === "unknown") return "Tidak diketahui";
    return value;
  }
  if (/Pct$/.test(key) || /yield/i.test(key)) return fmtPct(value, 2);
  if (key === "avgDollarVolume20" || key === "marketCap") return fmtCompactMoney(value);
  if (key === "vix" || key === "dollarIndex") return fmtNumber(value, 2);
  if (/price|sma|atr|high|low/i.test(key)) return fmtNumber(value, 2);
  if (Number.isInteger(value)) return fmtNumber(value, 0);
  return fmtNumber(value, 2);
}

export function prioritisedMetricKeys(agent: AgentName): string[] {
  switch (agent) {
    case "technical":
      return ["rsi14", "atrPct", "annualizedVolPct", "avgDollarVolume20", "sma50", "bars"];
    case "fundamental":
      return ["valuation", "quality", "growth", "trailingPE", "returnOnEquityPct", "fcfYieldPct"];
    case "macro":
      return ["regime", "vix", "yieldCurveSpreadPct", "tenYearYieldPct", "benchmarkChange60dPct"];
    case "sentiment":
      return ["articleCount", "positiveCount", "negativeCount", "aggregateScore", "coverage"];
  }
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
