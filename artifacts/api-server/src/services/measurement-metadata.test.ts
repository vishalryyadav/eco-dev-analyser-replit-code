import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCode } from "./analyzer.ts";
import { ecoEstimate } from "./eco.ts";
import { greenScore } from "./green-score.ts";
import { measurementMetadata } from "./measurement-metadata.ts";

const analysis = analyzeCode("function add(a,b) { return a + b; }", "javascript");
const limits = { timeoutMs: 5_000, memoryMb: 256 };

test("measurement metadata classifies measured telemetry and modeled eco values", () => {
  const execution = { status: "completed", measured: true, wallTimeMs: 200, cpuTimeMs: 100, peakMemoryKb: 2048 } as any;
  const eco = ecoEstimate(execution);
  const metadata = measurementMetadata(analysis, execution, null, eco, greenScore(analysis, execution, eco, limits));
  assert.equal(metadata.staticComplexity.classification, "INFERRED");
  assert.equal(metadata.staticEfficiency.classification, "INFERRED / CALCULATED");
  assert.equal(metadata.wallTime.classification, "MEASURED");
  assert.match(metadata.wallTime.description, /sandbox-run wall time/i);
  assert.equal(metadata.cpuTime.classification, "MEASURED");
  assert.equal(metadata.peakRss.classification, "MEASURED");
  assert.equal(metadata.energy.classification, "MODELED / ESTIMATED");
  assert.equal(metadata.energy.joules, Number((eco.energyWh! * 3600).toFixed(6)));
  assert.equal(metadata.energy.kilowattHours, Number((eco.energyWh! / 1000).toFixed(9)));
  assert.equal(metadata.carbon.classification, "MODELED / ESTIMATED");
  assert.equal(metadata.sciStyle.formula, "(E × I + M) / R");
  assert.equal(metadata.functionalUnit.label, "one completed analyzed execution / benchmark run");
});

test("measurement metadata leaves CPU, RSS, whole-laptop, and undocumented embodied emissions unavailable", () => {
  const execution = { status: "completed", measured: true, wallTimeMs: 200, cpuTimeMs: null, peakMemoryKb: null } as any;
  const eco = ecoEstimate(execution, { embodiedEmissionsGrams: 100 });
  const metadata = measurementMetadata(analysis, execution, null, eco, greenScore(analysis, execution, eco, limits));
  assert.equal(metadata.cpuTime.classification, "UNAVAILABLE");
  assert.match(metadata.cpuTime.description, /does not fall back to wall time/i);
  assert.equal(metadata.peakRss.classification, "UNAVAILABLE");
  assert.equal(metadata.wholeLaptopElectricity.classification, "UNAVAILABLE");
  assert.equal(metadata.embodiedEmissions.classification, "UNAVAILABLE");
  assert.ok(metadata.boundary.excluded.some((item) => item.component === "Display" && item.treatment.includes("not assumed to be zero")));
  assert.ok(metadata.boundary.conditional.some((item) => item.component === "Compilation/build overhead"));
});

test("documented embodied allocation is surfaced as modeled, never measured", () => {
  const execution = { status: "completed", measured: true, wallTimeMs: 200, cpuTimeMs: 100, peakMemoryKb: 2048 } as any;
  const eco = ecoEstimate(execution, { embodiedEmissionsGrams: 100, embodiedEmissionsSource: "Lifecycle allocation: example inventory" });
  const metadata = measurementMetadata(analysis, execution, null, eco, greenScore(analysis, execution, eco, limits));
  assert.equal(metadata.embodiedEmissions.classification, "MODELED / ESTIMATED");
  assert.equal(metadata.embodiedEmissions.source, "Lifecycle allocation: example inventory");
});
