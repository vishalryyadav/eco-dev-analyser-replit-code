import type { StaticAnalysis } from "./analyzer.ts";
import type { EcoEstimate } from "./eco.ts";
import type { GreenScore } from "./green-score.ts";
import type { ExecutionResult } from "./sandbox.ts";

type Classification = "INFERRED" | "INFERRED / CALCULATED" | "MEASURED" | "CALCULATED" | "MODELED / ESTIMATED" | "UNAVAILABLE";
type Metric = { classification: Classification; valueAvailable: boolean; description: string };

export type MeasurementMetadata = {
  methodology: "SCI-aligned methodology";
  staticComplexity: Metric;
  staticEfficiency: Metric;
  wallTime: Metric;
  cpuTime: Metric;
  peakRss: Metric;
  greenScore: Metric;
  energy: Metric & { joules: number | null; wattHours: number | null; kilowattHours: number | null };
  carbon: Metric;
  powerRange: Metric;
  wholeLaptopElectricity: Metric;
  embodiedEmissions: Metric & { grams: number | null; source: string | null };
  functionalUnit: { label: string; unitsR: number; classification: "CALCULATED"; description: string };
  boundary: {
    included: Array<{ component: string; treatment: string }>;
    conditional: Array<{ component: string; treatment: string }>;
    excluded: Array<{ component: string; classification: "UNAVAILABLE"; treatment: string }>;
  };
  sciStyle: {
    label: "SCI-style calculation";
    formula: "(E × I + M) / R";
    E: { valueKwh: number | null; classification: Classification; description: string };
    I: { valueGco2ePerKwh: number; region: string; source: string; year: string; retrievalDate: string; provenance: string; classification: "MODELED / ESTIMATED" };
    M: { valueGrams: number | null; source: string | null; classification: "MODELED / ESTIMATED" | "UNAVAILABLE" };
    R: { functionalUnit: string; units: number; classification: "CALCULATED" };
    assumptions: string[];
    limitations: string[];
  };
};

function completed(execution: ExecutionResult | null) { return execution?.status === "completed" && execution.measured; }

export function measurementMetadata(analysis: StaticAnalysis, execution: ExecutionResult | null, compile: ExecutionResult | null, eco: EcoEstimate, green: GreenScore): MeasurementMetadata {
  const runCompleted = completed(execution);
  const hasWall = runCompleted && execution?.wallTimeMs != null;
  const hasCpu = runCompleted && execution?.cpuTimeMs != null;
  const hasRss = runCompleted && execution?.peakMemoryKb != null;
  const hasEnergy = eco.energyWh != null;
  const embodiedAvailable = eco.sci.embodiedEmissionsClassification === "MODELED / ESTIMATED";
  const functionalUnit = eco.sci.functionalUnit === "execution" ? "one completed analyzed execution / benchmark run" : eco.sci.functionalUnit;
  const joules = hasEnergy ? Number((eco.energyWh! * 3600).toFixed(6)) : null;
  const kwh = hasEnergy ? Number((eco.energyWh! / 1000).toFixed(9)) : null;

  return {
    methodology: "SCI-aligned methodology",
    staticComplexity: { classification: "INFERRED", valueAvailable: true, description: `${analysis.complexity.time}; heuristic structural inference, not a runtime measurement.` },
    staticEfficiency: { classification: "INFERRED / CALCULATED", valueAvailable: true, description: `Static Efficiency score ${analysis.score}/100 is calculated from inferred rule findings.` },
    wallTime: { classification: hasWall ? "MEASURED" : "UNAVAILABLE", valueAvailable: hasWall, description: hasWall ? "Measured sandbox-run wall time; it includes secure-runner and sandbox overhead, not only user-program instructions." : "No completed sandbox run provided wall-time evidence." },
    cpuTime: { classification: hasCpu ? "MEASURED" : "UNAVAILABLE", valueAvailable: hasCpu, description: hasCpu ? "Measured from GNU time -v user plus system CPU telemetry." : "CPU time is unavailable because GNU time -v telemetry was not available for a completed run; it does not fall back to wall time." },
    peakRss: { classification: hasRss ? "MEASURED" : "UNAVAILABLE", valueAvailable: hasRss, description: hasRss ? "Measured maximum resident set size from GNU time -v telemetry." : "Peak RSS is unavailable because GNU time -v telemetry was not available for a completed run." },
    greenScore: { classification: "CALCULATED", valueAvailable: green.score != null, description: green.score == null ? "Calculated score is unavailable because required execution evidence is unavailable." : "Calculated heuristic score; it is not a direct energy or carbon measurement." },
    energy: { classification: hasEnergy ? "MODELED / ESTIMATED" : "UNAVAILABLE", valueAvailable: hasEnergy, description: hasEnergy ? "Modeled from measured CPU duration, or measured sandbox-run wall time only when CPU telemetry is unavailable; no hardware energy meter was attached." : "Energy is unavailable without a completed measured duration.", joules, wattHours: eco.energyWh, kilowattHours: kwh },
    carbon: { classification: hasEnergy ? "MODELED / ESTIMATED" : "UNAVAILABLE", valueAvailable: hasEnergy, description: hasEnergy ? "Modeled operational carbon from estimated energy and the documented grid-intensity scenario." : "Carbon is unavailable without modeled operational energy." },
    powerRange: { classification: "MODELED / ESTIMATED", valueAvailable: true, description: `${eco.assumptions.powerWatts.low}-${eco.assumptions.powerWatts.high} W scenario assumption; it is not a measurement of this laptop.` },
    wholeLaptopElectricity: { classification: "UNAVAILABLE", valueAvailable: false, description: "Whole-laptop electricity is not measured. Display, storage, networking, charging losses, peripherals, and other device loads are not zero; they are outside this result." },
    embodiedEmissions: { classification: embodiedAvailable ? "MODELED / ESTIMATED" : "UNAVAILABLE", valueAvailable: embodiedAvailable, description: embodiedAvailable ? "Configured embodied-emissions allocation with a documented source; it remains an allocation/model, not a measurement of this run." : "Unavailable until an embodied-emissions allocation and documented data source are explicitly configured.", grams: eco.sci.embodiedEmissionsGrams, source: eco.sci.embodiedEmissionsSource },
    functionalUnit: { label: functionalUnit, unitsR: eco.sci.functionalUnitCount, classification: "CALCULATED", description: "R is the selected number of completed analyzed executions. No production workload frequency is assumed." },
    boundary: {
      included: [
        { component: "Sandboxed program execution", treatment: "Included when a submitted program completes in Bubblewrap or Firejail." },
        { component: "Runtime and CPU/RSS telemetry", treatment: "Wall time is measured for the sandbox run; CPU time and RSS are included only when GNU time -v exposes them." },
        { component: "Modeled operational energy", treatment: "E is modeled from valid measured duration and configured CPU-package power scenarios." },
      ],
      conditional: [{ component: "Compilation/build overhead", treatment: compile ? "Compilation ran separately in the sandbox where applicable; its standalone telemetry is not added to this execution-only E result." : "No separate compilation step applied to this language/run." }],
      excluded: [
        { component: "Display", classification: "UNAVAILABLE", treatment: "Not measured and not assumed to be zero." },
        { component: "Storage", classification: "UNAVAILABLE", treatment: "Not measured and not assumed to be zero." },
        { component: "Networking", classification: "UNAVAILABLE", treatment: "Not measured and not assumed to be zero." },
        { component: "Charging losses", classification: "UNAVAILABLE", treatment: "Not measured and not assumed to be zero." },
        { component: "Peripherals", classification: "UNAVAILABLE", treatment: "Not measured and not assumed to be zero." },
        { component: "Whole-laptop electricity", classification: "UNAVAILABLE", treatment: "Not measured and not inferred from CPU-package scenarios." },
        { component: "Embodied hardware emissions", classification: "UNAVAILABLE", treatment: "Excluded unless a documented allocation/data source is configured." },
      ],
    },
    sciStyle: {
      label: "SCI-style calculation", formula: "(E × I + M) / R",
      E: { valueKwh: eco.sci.energyKwh, classification: hasEnergy ? "MODELED / ESTIMATED" : "UNAVAILABLE", description: "Operational energy scenario, not a direct electricity-meter reading." },
      I: { valueGco2ePerKwh: eco.grid.factorGPerKwh, region: eco.grid.region, source: eco.grid.source, year: eco.grid.year, retrievalDate: eco.grid.retrievalDate, provenance: eco.grid.provenance, classification: "MODELED / ESTIMATED" },
      M: { valueGrams: eco.sci.embodiedEmissionsGrams, source: eco.sci.embodiedEmissionsSource, classification: eco.sci.embodiedEmissionsClassification },
      R: { functionalUnit, units: eco.sci.functionalUnitCount, classification: "CALCULATED" },
      assumptions: [eco.assumptions.powerWatts.source, eco.assumptions.carbonIntensityGPerKwh.source],
      limitations: ["SCI-aligned methodology and SCI-style calculation only; EcoDev does not claim ISO certification.", "Excluded components are unavailable, not zero.", "Energy and carbon remain modeled unless an explicitly integrated hardware meter provides scoped evidence."],
    },
  };
}
