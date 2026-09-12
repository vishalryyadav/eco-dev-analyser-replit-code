import assert from "node:assert/strict";
import test from "node:test";
import { ecoEstimate } from "./eco.ts";

test("returns no eco number without measured execution data", () => {
  const result = ecoEstimate({ cpuTimeMs: null, wallTimeMs: null, measured: false });
  assert.equal(result.energyWh, null);
  assert.equal(result.carbonGrams, null);
  assert.equal(result.range, null);
  assert.equal(result.assumptions.input, "unavailable");
});

test("uses measured CPU time and returns a scenario range", () => {
  const result = ecoEstimate({ cpuTimeMs: 1000, wallTimeMs: 2, measured: true });
  assert.equal(result.assumptions.input, "cpuTimeMs");
  assert.ok(result.range);
  assert.equal(result.range.energyWh.low, 0.004167);
  assert.equal(result.range.energyWh.high, 0.0125);
  assert.ok(result.range.carbonGrams.low < result.range.carbonGrams.high);
  assert.match(result.basis, /measured cpuTimeMs/);
  assert.ok(result.sources.length >= 3);
  assert.equal(result.projection.usage.runsPerDay, 100);
  assert.ok(result.projection.monthly);
  assert.ok(result.projection.yearly);
  assert.equal(result.projection.scenario.reductionLowPercent, 10);
  assert.equal(result.projection.scenario.reductionHighPercent, 40);
});