import assert from "node:assert/strict";
import test from "node:test";
import { greenScore } from "./green-score.ts";

const analysis = { score: 80 } as any;
const limits = { timeoutMs: 1000, memoryMb: 100 };
const eco = { range: { energyWh: { low: 0.0005, high: 0.00125 } }, assumptions: { powerWatts: { low: 15, high: 45 } } } as any;
const good = { status: "completed", measured: true, cpuTimeMs: 100, peakMemoryKb: 10 * 1024 };

test("Green Score uses the documented weighted formula deterministically", () => {
  const first = greenScore(analysis, good, eco, limits);
  const second = greenScore(analysis, good, eco, limits);
  assert.deepEqual(first, second);
  assert.equal(first.score, 87.5);
  assert.equal(first.classification, "CALCULATED");
  assert.equal(first.evidenceLevel, "FULL");
});

test("Green Score is higher for lower measured resource use", () => {
  const worse = greenScore(analysis, { status: "completed", measured: true, cpuTimeMs: 900, peakMemoryKb: 90 * 1024 }, { ...eco, range: { energyWh: { low: 0.005, high: 0.01125 } } }, limits);
  assert.ok((greenScore(analysis, good, eco, limits).score ?? 0) > (worse.score ?? 0));
});

test("Green Score is unavailable for failed execution and excludes its telemetry", () => {
  const result = greenScore(analysis, { status: "runtime_error", measured: false, cpuTimeMs: 1, peakMemoryKb: 1 }, eco, limits);
  assert.equal(result.score, null);
  assert.equal(result.classification, "UNAVAILABLE");
  assert.equal(result.evidenceLevel, "UNAVAILABLE");
});

test("Green Score is explicitly partial when no execution was requested", () => {
  const result = greenScore(analysis, null, eco, limits);
  assert.equal(result.score, 28);
  assert.equal(result.evidenceLevel, "PARTIAL");
});
