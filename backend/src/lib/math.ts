export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

export function stdev(values: readonly number[], sample = true): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  let acc = 0;
  for (const value of values) acc += (value - avg) ** 2;
  const divisor = sample ? values.length - 1 : values.length;
  return Math.sqrt(acc / divisor);
}

export function sum(values: readonly number[]): number {
  let acc = 0;
  for (const value of values) acc += value;
  return acc;
}

export function pctChange(from: number | null, to: number | null): number | null {
  if (from === null || to === null || from === 0) return null;
  return ((to - from) / from) * 100;
}

export function safeDiv(a: number | null, b: number | null): number | null {
  if (a === null || b === null || b === 0) return null;
  return a / b;
}

export function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** Skor linear: nilai `bad` -> -1, nilai `good` -> +1, dijepit. */
export function ramp(value: number, bad: number, good: number): number {
  if (bad === good) return 0;
  return clamp((2 * (value - bad)) / (good - bad) - 1, -1, 1);
}

/**
 * Rata-rata tertimbang yang mengabaikan bobot nol,
 * mengembalikan null bila tidak ada komponen valid.
 */
export function weightedMean(
  entries: ReadonlyArray<{ value: number | null; weight: number }>,
): number | null {
  let acc = 0;
  let weightSum = 0;
  for (const entry of entries) {
    if (entry.value === null || !Number.isFinite(entry.value) || entry.weight <= 0) continue;
    acc += entry.value * entry.weight;
    weightSum += entry.weight;
  }
  return weightSum > 0 ? acc / weightSum : null;
}

/** Max drawdown sebagai persentase positif (0..100). */
export function maxDrawdown(points: readonly number[]): number {
  let peak = -Infinity;
  let worst = 0;
  for (const point of points) {
    if (point > peak) peak = point;
    if (peak > 0) {
      const drawdown = ((peak - point) / peak) * 100;
      if (drawdown > worst) worst = drawdown;
    }
  }
  return worst;
}

export function annualizedVolatility(
  dailyReturns: readonly number[],
  periodsPerYear = 252,
): number {
  return stdev(dailyReturns) * Math.sqrt(periodsPerYear);
}

export function sharpeRatio(
  dailyReturns: readonly number[],
  riskFreeAnnual = 0,
  periodsPerYear = 252,
): number {
  if (dailyReturns.length < 2) return 0;
  const vol = annualizedVolatility(dailyReturns, periodsPerYear);
  if (vol === 0) return 0;
  const excess = mean(dailyReturns) * periodsPerYear - riskFreeAnnual;
  return excess / vol;
}

export function sortinoRatio(
  dailyReturns: readonly number[],
  riskFreeAnnual = 0,
  periodsPerYear = 252,
): number {
  if (dailyReturns.length < 2) return 0;
  const downside = dailyReturns.filter((r) => r < 0);
  if (downside.length === 0) return 0;
  const downsideDev = Math.sqrt(mean(downside.map((r) => r * r))) * Math.sqrt(periodsPerYear);
  if (downsideDev === 0) return 0;
  return (mean(dailyReturns) * periodsPerYear - riskFreeAnnual) / downsideDev;
}

export function maxOf(values: readonly number[]): number {
  let result = -Infinity;
  for (const value of values) if (value > result) result = value;
  return result;
}

export function minOf(values: readonly number[]): number {
  let result = Infinity;
  for (const value of values) if (value < result) result = value;
  return result;
}

export function ageHours(isoTimestamp: string, now: Date = new Date()): number | null {
  const time = Date.parse(isoTimestamp);
  if (!Number.isFinite(time)) return null;
  return (now.getTime() - time) / 3_600_000;
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function formatNumber(value: number, decimals = 2): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
