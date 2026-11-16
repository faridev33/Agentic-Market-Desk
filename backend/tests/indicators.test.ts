import assert from "node:assert/strict";
import test from "node:test";
import {
  atr,
  bollinger,
  dailyReturns,
  ema,
  macd,
  obv,
  roc,
  rsi,
  sma,
  zScoreLast,
} from "../src/lib/indicators.js";
import { makeCandles } from "./helpers.js";

const series = Array.from({ length: 50 }, (_, index) => index + 1);

test("sma menghitung rata-rata bergerak", () => {
  const result = sma(series, 5);
  assert.equal(result[3], null);
  assert.equal(result[4], 3);
  assert.equal(result[49], 48);
});

test("ema terisi setelah periode", () => {
  const result = ema(series, 10);
  assert.equal(result[8], null);
  assert.equal(result[9], 5.5);
  assert.ok(typeof result[49] === "number");
});

test("rsi naik pada tren naik dan tetap dalam 0..100", () => {
  const values = rsi(series, 14);
  const last = values[values.length - 1];
  assert.ok(last !== null);
  assert.ok(last > 50);
  assert.ok(last <= 100);
});

test("atr positif pada candle nyata", () => {
  const candles = makeCandles(60);
  const values = atr(candles, 14);
  const last = values[values.length - 1];
  assert.ok(last !== null && last > 0);
});

test("macd menghasilkan panjang array yang konsisten", () => {
  const result = macd(series);
  assert.equal(result.macd.length, series.length);
  assert.equal(result.signal.length, series.length);
  assert.ok(typeof result.histogram[49] === "number");
});

test("bollinger upper >= middle >= lower", () => {
  const result = bollinger(series, 20, 2);
  const index = 49;
  assert.ok(result.upper[index]! > result.middle[index]!);
  assert.ok(result.middle[index]! > result.lower[index]!);
  assert.ok(result.bandwidthPct[index]! > 0);
});

test("obv naik saat harga naik", () => {
  const candles = makeCandles(30);
  const values = obv(candles);
  assert.ok(values[values.length - 1] > 0);
});

test("roc dan z-score menghasilkan nilai terbatas", () => {
  const change = roc(series, 10);
  assert.equal(change[9], null);
  assert.ok(change[10] !== null);
  const z = zScoreLast(series, 10);
  assert.ok(z !== null && Number.isFinite(z));
});

test("dailyReturns menghitung return harian", () => {
  const returns = dailyReturns([100, 110, 99]);
  assert.equal(returns.length, 2);
  assert.ok(Math.abs(returns[0] - 0.1) < 1e-9);
});
