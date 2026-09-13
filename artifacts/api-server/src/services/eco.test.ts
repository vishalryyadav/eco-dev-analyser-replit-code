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
test("reports India grid provenance and an SCI-style operational estimate", () => {
  const result = ecoEstimate({ cpuTimeMs: 1000, wallTimeMs: 2, measured: true }, { region: "India", functionalUnit: "request", functionalUnitCount: 10 });
  assert.equal(result.grid.region, "India");
  assert.equal(result.grid.factorGPerKwh, 710);
  assert.equal(result.grid.year, "FY2024–25");
  assert.equal(result.energyLevel, "MODELED");
  assert.equal(result.sci.label, "SCI-style operational estimate");
  assert.equal(result.sci.functionalUnit, "request");
  assert.equal(result.sci.functionalUnitCount, 10);
  assert.ok(result.sci.scoreGramsPerUnit != null);
});
