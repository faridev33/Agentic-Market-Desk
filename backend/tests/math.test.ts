import assert from "node:assert/strict";
import test from "node:test";
import {
  clamp,
  maxDrawdown,
  ramp,
  round,
  sharpeRatio,
  weightedMean,
} from "../src/lib/math.js";

test("clamp membatasi nilai", () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-1, 0, 3), 0);
  assert.equal(clamp(2, 0, 3), 2);
});

test("ramp memetakan nilai buruk ke -1 dan baik ke +1", () => {
  assert.equal(ramp(40, 40, 12), -1);
  assert.equal(ramp(12, 40, 12), 1);
  assert.equal(ramp(26, 40, 12), 0);
  assert.equal(ramp(0, 40, 12), 1);
});

test("maxDrawdown menghitung penurunan puncak-ke-palung", () => {
  assert.equal(maxDrawdown([100, 120, 90, 110]), 25);
  assert.equal(maxDrawdown([100, 110, 120]), 0);
});

test("weightedMean mengabaikan komponen null", () => {
  assert.equal(weightedMean([{ value: 1, weight: 1 }, { value: 0.5, weight: 2 }]), 2 / 3);
  assert.equal(weightedMean([{ value: null, weight: 1 }]), null);
  assert.equal(weightedMean([]), null);
});

test("sharpeRatio nol untuk return konstan tanpa volatilitas", () => {
  assert.equal(sharpeRatio([0.01, 0.01, 0.01]), 0);
});

test("round membulatkan dengan benar", () => {
  assert.equal(round(1.2345, 2), 1.23);
  assert.equal(round(1.2355, 2), 1.24);
});
