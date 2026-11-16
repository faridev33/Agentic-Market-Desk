import {
  atr,
  bollinger,
  dailyReturns,
  macd,
  obv,
  roc,
  rsi,
  sma,
  zScoreLast,
} from "../lib/indicators.js";
import {
  annualizedVolatility,
  clamp,
  formatNumber,
  mean,
  round,
  weightedMean,
} from "../lib/math.js";
import { AppError } from "../lib/errors.js";
import type { AgentSignal } from "../types.js";
import type { Agent, AgentOutput, AnalysisContext } from "./types.js";

function lastValue(values: ReadonlyArray<number | null>): number | null {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const value = values[i];
    if (value !== null) return value;
  }
  return null;
}

function tanhScore(value: number): number {
  return Math.tanh(value);
}

export class TechnicalAgent implements Agent<null> {
  readonly name = "technical" as const;

  async run(context: AnalysisContext): Promise<AgentOutput<null>> {
    const candles = context.history?.candles ?? [];
    if (candles.length < 60) {
      throw new AppError(
        `Riwayat harga ${context.symbol} tidak cukup untuk analisis teknikal (${candles.length} candle, minimal 60).`,
        422,
        "insufficient_data",
      );
    }

    const closes = candles.map((candle) => candle.close);
    const volumes = candles.map((candle) => candle.volume);
    const lastIndex = candles.length - 1;
    const close = closes[lastIndex];
    const previousClose = closes[lastIndex - 1];
    const volume = volumes[lastIndex];

    const sma20Series = sma(closes, 20);
    const sma50Series = sma(closes, 50);
    const sma200Series = sma(closes, 200);
    const sma20 = lastValue(sma20Series);
    const sma50 = lastValue(sma50Series);
    const sma200 = lastValue(sma200Series);
    const sma50TenBarsAgo = lastIndex >= 10 ? sma50Series[lastIndex - 10] : null;

    const rsiValue = lastValue(rsi(closes, 14));
    const macdResult = macd(closes);
    const macdHistogram = lastValue(macdResult.histogram);
    const atrValue = lastValue(atr(candles, 14));
    const bollingerBandwidth = lastValue(bollinger(closes, 20, 2).bandwidthPct);
    const roc20 = lastValue(roc(closes, 20));
    const roc60 = lastValue(roc(closes, 60));
    const volumeZ = zScoreLast(volumes, 20);
    const avgVolume20 = mean(volumes.slice(-20));
    const avgDollarVolume20 = avgVolume20 * mean(closes.slice(-20));

    const obvSeries = obv(candles);
    const obvDiff20 =
      lastIndex >= 20 ? obvSeries[lastIndex] - obvSeries[lastIndex - 20] : 0;
    const obvScore =
      avgVolume20 > 0 ? tanhScore((obvDiff20 / (avgVolume20 * 20)) * 2) : 0;
    const direction = close >= previousClose ? 1 : -1;
    const volumeConfirm = volumeZ !== null ? tanhScore(volumeZ / 2) * direction : null;
    const volumeScore =
      weightedMean([
        { value: obvScore, weight: 0.7 },
        { value: volumeConfirm, weight: 0.3 },
      ]) ?? 0;

    const annualizedVolPct =
      annualizedVolatility(dailyReturns(closes.slice(-61))) * 100;
    const volatilityScore = -tanhScore((annualizedVolPct - 35) / 25);

    const trendParts: Array<{ value: number | null; weight: number }> = [
      { value: sma20 !== null ? tanhScore((close / sma20 - 1) / 0.04) : null, weight: 0.2 },
      { value: sma50 !== null ? tanhScore((close / sma50 - 1) / 0.06) : null, weight: 0.3 },
      {
        value:
          sma50 !== null && sma200 !== null ? tanhScore((sma50 / sma200 - 1) / 0.05) : null,
        weight: 0.25,
      },
      {
        value:
          sma50 !== null && sma50TenBarsAgo !== null && sma50TenBarsAgo !== 0
            ? tanhScore((sma50 / sma50TenBarsAgo - 1) / 0.03)
            : null,
        weight: 0.25,
      },
    ];
    const trendScore = weightedMean(trendParts) ?? 0;

    const rsiScore = rsiValue !== null ? tanhScore((rsiValue - 50) / 18) : null;
    const macdScore =
      macdHistogram !== null && atrValue !== null && atrValue > 0
        ? tanhScore(macdHistogram / (atrValue * 0.6))
        : null;
    const rocScore = roc20 !== null ? tanhScore(roc20 / 10) : null;
    const momentumScore =
      weightedMean([
        { value: rsiScore, weight: 0.35 },
        { value: macdScore, weight: 0.35 },
        { value: rocScore, weight: 0.3 },
      ]) ?? 0;

    const score = clamp(
      0.42 * trendScore + 0.32 * momentumScore + 0.11 * volumeScore + 0.15 * volatilityScore,
      -1,
      1,
    );

    const componentValues = [trendScore, momentumScore, volumeScore, volatilityScore];
    const agreement = clamp(
      1 - mean(componentValues.map((value) => Math.abs(value - score))) / 1.2,
      0,
      1,
    );
    const dataFactor = Math.min(1, candles.length / 250) * (sma200 !== null ? 1 : 0.8);
    const confidence = clamp(
      0.1,
      0.9,
      0.15 + 0.55 * agreement * dataFactor + 0.15 * (sma200 !== null ? 1 : 0),
    );

    const window = candles.slice(-252);
    const high52w = Math.max(...window.map((candle) => candle.high));
    const low52w = Math.min(...window.map((candle) => candle.low));
    const pctFrom52wHigh = ((close - high52w) / high52w) * 100;
    const atrPct = atrValue !== null ? (atrValue / close) * 100 : null;

    const warnings: string[] = [];
    if (sma200 === null) warnings.push("Riwayat < 200 candle: tren jangka panjang belum tersedia.");
    if (annualizedVolPct > 80) warnings.push("Volatilitas tahunan sangat tinggi (> 80%).");
    if (avgDollarVolume20 < 1_000_000) {
      warnings.push("Likuiditas rendah: nilai transaksi harian < 1 juta unit mata uang.");
    }

    const trendLabel = trendScore > 0.2 ? "naik" : trendScore < -0.2 ? "turun" : "netral";
    const momentumLabel =
      momentumScore > 0.2 ? "positif" : momentumScore < -0.2 ? "negatif" : "datar";
    const volLabel =
      annualizedVolPct > 50 ? "tinggi" : annualizedVolPct > 30 ? "sedang" : "rendah";

    const evidence: string[] = [];
    if (sma50 !== null) {
      const distance = ((close / sma50 - 1) * 100).toFixed(2);
      evidence.push(`Harga ${distance}% ${close >= sma50 ? "di atas" : "di bawah"} SMA50.`);
    }
    if (sma200 !== null) {
      evidence.push(
        `SMA50 ${sma50 !== null && sma50 >= sma200 ? "di atas" : "di bawah"} SMA200 (struktur ${sma50 !== null && sma50 >= sma200 ? "bullish" : "bearish"}).`,
      );
    }
    if (rsiValue !== null) {
      const rsiLabel = rsiValue > 70 ? "jenuh beli" : rsiValue < 30 ? "jenuh jual" : "netral";
      evidence.push(`RSI(14) ${formatNumber(rsiValue, 1)} (${rsiLabel}).`);
    }
    if (macdHistogram !== null) {
      evidence.push(`Histogram MACD ${macdHistogram >= 0 ? "positif" : "negatif"}.`);
    }
    if (roc20 !== null) {
      evidence.push(`Perubahan 20 hari ${formatNumber(roc20, 2)}% (60 hari ${roc60 !== null ? formatNumber(roc60, 2) : "n/a"}%).`);
    }
    evidence.push(`Volatilitas tahunan ${formatNumber(annualizedVolPct, 1)}% (${volLabel}).`);
    evidence.push(
      `Volume 20 hari ${volumeZ !== null ? `z-score ${formatNumber(volumeZ, 2)}` : "tidak tersedia"}; akumulasi/distribusi OBV ${obvDiff20 >= 0 ? "positif" : "negatif"}.`,
    );
    evidence.push(`Posisi harga ${formatNumber(pctFrom52wHigh, 1)}% dari puncak 52 minggu.`);

    const metrics: AgentSignal["metrics"] = {
      close: round(close, 4),
      sma20: sma20 !== null ? round(sma20, 4) : null,
      sma50: sma50 !== null ? round(sma50, 4) : null,
      sma200: sma200 !== null ? round(sma200, 4) : null,
      rsi14: rsiValue !== null ? round(rsiValue, 2) : null,
      macdHistogram: macdHistogram !== null ? round(macdHistogram, 4) : null,
      atr: atrValue !== null ? round(atrValue, 4) : null,
      atrPct: atrPct !== null ? round(atrPct, 2) : null,
      annualizedVolPct: round(annualizedVolPct, 2),
      bollingerBandwidthPct:
        bollingerBandwidth !== null ? round(bollingerBandwidth, 2) : null,
      roc20Pct: roc20 !== null ? round(roc20, 2) : null,
      roc60Pct: roc60 !== null ? round(roc60, 2) : null,
      volumeZScore: volumeZ !== null ? round(volumeZ, 2) : null,
      avgVolume20: Math.round(avgVolume20),
      avgDollarVolume20: Math.round(avgDollarVolume20),
      lastVolume: Math.round(volume),
      fiftyTwoWeekHigh: round(high52w, 4),
      fiftyTwoWeekLow: round(low52w, 4),
      pctFrom52wHigh: round(pctFrom52wHigh, 2),
      trendScore: round(trendScore, 3),
      momentumScore: round(momentumScore, 3),
      volumeScore: round(volumeScore, 3),
      volatilityScore: round(volatilityScore, 3),
      bars: candles.length,
    };

    return {
      signal: {
        agent: this.name,
        asOf: candles[lastIndex].date,
        score: round(score, 4),
        confidence: round(confidence, 3),
        summary: `Tren ${trendLabel}, momentum ${momentumLabel}, volatilitas ${volLabel}.`,
        evidence,
        warnings,
        metrics,
      },
      details: null,
    };
  }
}
