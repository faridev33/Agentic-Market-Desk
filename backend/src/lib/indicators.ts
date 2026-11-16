import { mean, stdev } from "./math.js";

export interface Ohlcv {
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function sma(values: readonly number[], period: number): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;
  let windowSum = 0;
  for (let i = 0; i < values.length; i += 1) {
    windowSum += values[i];
    if (i >= period) windowSum -= values[i - period];
    if (i >= period - 1) out[i] = windowSum / period;
  }
  return out;
}

export function ema(values: readonly number[], period: number): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;
  const multiplier = 2 / (period + 1);
  let previous: number | null = null;
  let seedSum = 0;
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (previous === null) {
      seedSum += value;
      if (i === period - 1) {
        previous = seedSum / period;
        out[i] = previous;
      }
      continue;
    }
    previous = value * multiplier + previous * (1 - multiplier);
    out[i] = previous;
  }
  return out;
}

export function rsi(values: readonly number[], period = 14): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (period <= 0 || values.length <= period) return out;

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i += 1) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) avgGain += diff;
    else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;

  const compute = (): number => {
    if (avgGain === 0 && avgLoss === 0) return 50;
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  };

  out[period] = compute();
  for (let i = period + 1; i < values.length; i += 1) {
    const diff = values[i] - values[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = compute();
  }
  return out;
}

export function trueRange(candles: readonly Ohlcv[]): number[] {
  const out: number[] = new Array(candles.length).fill(0);
  if (candles.length === 0) return out;
  out[0] = candles[0].high - candles[0].low;
  for (let i = 1; i < candles.length; i += 1) {
    const candle = candles[i];
    const previousClose = candles[i - 1].close;
    out[i] = Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose),
    );
  }
  return out;
}

export function atr(candles: readonly Ohlcv[], period = 14): Array<number | null> {
  const ranges = trueRange(candles);
  const out: Array<number | null> = new Array(candles.length).fill(null);
  if (period <= 0 || ranges.length < period) return out;

  let previous = mean(ranges.slice(0, period));
  out[period - 1] = previous;
  for (let i = period; i < ranges.length; i += 1) {
    previous = (previous * (period - 1) + ranges[i]) / period;
    out[i] = previous;
  }
  return out;
}

export interface MacdResult {
  macd: Array<number | null>;
  signal: Array<number | null>;
  histogram: Array<number | null>;
}

export function macd(
  values: readonly number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): MacdResult {
  const fast = ema(values, fastPeriod);
  const slow = ema(values, slowPeriod);
  const macdLine: Array<number | null> = values.map((_, i) => {
    const f = fast[i];
    const s = slow[i];
    return f !== null && s !== null ? f - s : null;
  });

  const compact: number[] = [];
  const positions: number[] = [];
  macdLine.forEach((value, index) => {
    if (value !== null) {
      compact.push(value);
      positions.push(index);
    }
  });
  const compactSignal = ema(compact, signalPeriod);
  const signal: Array<number | null> = new Array(values.length).fill(null);
  compactSignal.forEach((value, compactIndex) => {
    if (value !== null) signal[positions[compactIndex]] = value;
  });

  const histogram: Array<number | null> = macdLine.map((value, index) => {
    const sig = signal[index];
    return value !== null && sig !== null ? value - sig : null;
  });

  return { macd: macdLine, signal, histogram };
}

export interface BollingerResult {
  middle: Array<number | null>;
  upper: Array<number | null>;
  lower: Array<number | null>;
  bandwidthPct: Array<number | null>;
}

export function bollinger(
  values: readonly number[],
  period = 20,
  multiplier = 2,
): BollingerResult {
  const middle = sma(values, period);
  const upper: Array<number | null> = new Array(values.length).fill(null);
  const lower: Array<number | null> = new Array(values.length).fill(null);
  const bandwidthPct: Array<number | null> = new Array(values.length).fill(null);

  for (let i = period - 1; i < values.length; i += 1) {
    const window = values.slice(i - period + 1, i + 1);
    const avg = middle[i];
    if (avg === null) continue;
    const deviation = stdev(window, false);
    upper[i] = avg + multiplier * deviation;
    lower[i] = avg - multiplier * deviation;
    if (avg !== 0) bandwidthPct[i] = ((upper[i]! - lower[i]!) / avg) * 100;
  }
  return { middle, upper, lower, bandwidthPct };
}

export function obv(candles: readonly Ohlcv[]): number[] {
  const out: number[] = new Array(candles.length).fill(0);
  for (let i = 1; i < candles.length; i += 1) {
    const previous = candles[i - 1].close;
    const current = candles[i].close;
    const direction = current > previous ? 1 : current < previous ? -1 : 0;
    out[i] = out[i - 1] + direction * candles[i].volume;
  }
  return out;
}

export function roc(values: readonly number[], period: number): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (period <= 0) return out;
  for (let i = period; i < values.length; i += 1) {
    const base = values[i - period];
    if (base !== 0) out[i] = ((values[i] - base) / base) * 100;
  }
  return out;
}

/** Z-score nilai terakhir terhadap `window` observasi terakhir. */
export function zScoreLast(values: readonly number[], window: number): number | null {
  if (values.length < Math.max(3, window)) return null;
  const slice = values.slice(-window);
  const deviation = stdev(slice);
  if (deviation === 0) return 0;
  return (slice[slice.length - 1] - mean(slice)) / deviation;
}

export function dailyReturns(values: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i += 1) {
    const previous = values[i - 1];
    if (previous !== 0) out.push(values[i] / previous - 1);
  }
  return out;
}
