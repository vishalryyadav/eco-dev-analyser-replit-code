export type EcoExecution = { cpuTimeMs: number | null; wallTimeMs: number | null; measured: boolean };
export type EcoOptions = { region?: string; gridFactorGPerKwh?: number; gridSource?: string; gridYear?: string | number; functionalUnit?: string; functionalUnitCount?: number; embodiedEmissionsGrams?: number };
export type GridFactor = { region: string; factorGPerKwh: number; unit: "gCO2e/kWh"; source: string; year: string; retrievalDate: string; provenance: "RESEARCH REFERENCE" | "CONFIGURED" };
export type SCIReport = { label: "SCI-style operational estimate"; formula: "(E × I + M) / R"; functionalUnit: string; functionalUnitCount: number; energyKwh: number | null; operationalCarbonGrams: number | null; embodiedEmissionsGrams: number; scoreGramsPerUnit: number | null; method: string; confidence: "High" | "Medium" | "Low" | "Research Reference" };

export type ImpactProjection = {
  usage: { runsPerDay: number; daysPerMonth: number; daysPerYear: number };
  scenario: { reductionLowPercent: number; reductionHighPercent: number; label: string };
  monthly: { baselineEnergyWh: number; savedEnergyWh: { low: number; high: number }; baselineCarbonGrams: number; savedCarbonGrams: { low: number; high: number } } | null;
  yearly: { baselineEnergyWh: number; savedEnergyWh: { low: number; high: number }; baselineCarbonGrams: number; savedCarbonGrams: { low: number; high: number } } | null;
  note: string;
};

export type EcoEstimate = {
  energyWh: number | null;
  carbonGrams: number | null;
  range: { energyWh: { low: number; high: number }; carbonGrams: { low: number; high: number } } | null;
  measured: false;
  basis: string;
  assumptions: {
    powerWatts: { low: number; high: number; source: string };
    carbonIntensityGPerKwh: { low: number; high: number; source: string };
    input: "cpuTimeMs" | "wallTimeMs" | "unavailable";
  };
  methodology: string;
  sources: { title: string; url: string }[];
  projection: ImpactProjection;
  energyLevel: "MODELED";
  carbonLevel: "MODELED";
  grid: GridFactor;
  sci: SCIReport;
};

const DEFAULT_POWER_LOW_WATTS = 15;
const DEFAULT_POWER_HIGH_WATTS = 45;
const DEFAULT_CARBON_LOW = 100;
const DEFAULT_CARBON_HIGH = 800;
const POWER_SOURCE = "Scenario bounds for a laptop CPU package; configure from measured hardware telemetry for a narrower estimate.";
const CARBON_SOURCE = "Scenario bounds spanning low-carbon to fossil-heavy electricity; configure with location/time-specific grid data for a narrower estimate.";
const DEFAULT_GRID_FACTOR = 710;
const DEFAULT_GRID_REGION = "India";
const DEFAULT_GRID_YEAR = "FY2024–25";
const DEFAULT_GRID_SOURCE = "Central Electricity Authority of India reference factor; update when the next official factor is published.";

function gridFactor(options: EcoOptions): GridFactor {
  const configured = Number(options.gridFactorGPerKwh ?? process.env.ECODEV_GRID_FACTOR_G_PER_KWH);
  const hasConfigured = Number.isFinite(configured) && configured > 0 && configured <= 3000;
  const region = String(options.region ?? process.env.ECODEV_GRID_REGION ?? DEFAULT_GRID_REGION);
  const indiaReference = region.trim().toLowerCase() === "india" && !hasConfigured;
  return {
    region, factorGPerKwh: hasConfigured ? configured : DEFAULT_GRID_FACTOR, unit: "gCO2e/kWh",
    source: options.gridSource ?? process.env.ECODEV_GRID_SOURCE ?? (indiaReference ? DEFAULT_GRID_SOURCE : "No official regional factor configured; this is a configurable reference default."),
    year: String(options.gridYear ?? process.env.ECODEV_GRID_YEAR ?? (indiaReference ? DEFAULT_GRID_YEAR : "reference")),
    retrievalDate: new Date().toISOString().slice(0, 10), provenance: hasConfigured ? "CONFIGURED" : "RESEARCH REFERENCE",
  };
}

function sciReport(energyWh: number | null, grid: GridFactor, options: EcoOptions): SCIReport {
  const functionalUnit = String(options.functionalUnit ?? process.env.ECODEV_FUNCTIONAL_UNIT ?? "execution");
  const functionalUnitCount = Math.max(1e-9, Number(options.functionalUnitCount ?? process.env.ECODEV_FUNCTIONAL_UNIT_COUNT ?? 1) || 1);
  const embodiedEmissionsGrams = Math.max(0, Number(options.embodiedEmissionsGrams ?? process.env.ECODEV_EMBODIED_EMISSIONS_G ?? 0) || 0);
  const energyKwh = energyWh == null ? null : round(energyWh / 1000);
  const operationalCarbonGrams = energyKwh == null ? null : round(energyKwh * grid.factorGPerKwh);
  const scoreGramsPerUnit = operationalCarbonGrams == null ? null : round((operationalCarbonGrams + embodiedEmissionsGrams) / functionalUnitCount);
  return { label: "SCI-style operational estimate", formula: "(E × I + M) / R", functionalUnit, functionalUnitCount, energyKwh, operationalCarbonGrams, embodiedEmissionsGrams, scoreGramsPerUnit, method: embodiedEmissionsGrams > 0 ? "Operational energy/carbon plus user-configured embodied emissions divided by the selected functional unit." : "Operational estimate only; embodied emissions were not included.", confidence: energyWh == null ? "Low" : grid.provenance === "RESEARCH REFERENCE" ? "Research Reference" : "Medium" };
}

function envNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function round(value: number) { return Number(value.toFixed(6)); }

function positiveInteger(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function projection(energyWh: number | null, carbonGrams: number | null): ImpactProjection {
  const runsPerDay = positiveInteger("ECODEV_RUNS_PER_DAY", 100);
  const reductionLowPercent = 10;
  const reductionHighPercent = 40;
  const scenario = { reductionLowPercent, reductionHighPercent, label: "Scenario only: assumed 10-40% reduction after adopting and validating an alternative." };
  if (energyWh == null || carbonGrams == null) return { usage: { runsPerDay, daysPerMonth: 30, daysPerYear: 365 }, scenario, monthly: null, yearly: null, note: "Run the code in the secured production runtime to generate an impact projection." };
  const calculate = (days: number) => ({
    baselineEnergyWh: round(energyWh * runsPerDay * days),
    savedEnergyWh: { low: round(energyWh * runsPerDay * days * reductionLowPercent / 100), high: round(energyWh * runsPerDay * days * reductionHighPercent / 100) },
    baselineCarbonGrams: round(carbonGrams * runsPerDay * days),
    savedCarbonGrams: { low: round(carbonGrams * runsPerDay * days * reductionLowPercent / 100), high: round(carbonGrams * runsPerDay * days * reductionHighPercent / 100) },
  });
  return { usage: { runsPerDay, daysPerMonth: 30, daysPerYear: 365 }, scenario, monthly: calculate(30), yearly: calculate(365), note: "Baseline scales the measured per-run midpoint. Savings are a bounded adoption scenario, not a promise or a global climate percentage." };
}

export function ecoEstimate(execution: EcoExecution | null, options: EcoOptions = {}): EcoEstimate {
  const powerLow = Math.min(envNumber("ECODEV_CPU_WATTS_LOW", DEFAULT_POWER_LOW_WATTS), envNumber("ECODEV_CPU_WATTS_HIGH", DEFAULT_POWER_HIGH_WATTS));
  const powerHigh = Math.max(envNumber("ECODEV_CPU_WATTS_LOW", DEFAULT_POWER_LOW_WATTS), envNumber("ECODEV_CPU_WATTS_HIGH", DEFAULT_POWER_HIGH_WATTS));
  const carbonLow = Math.min(envNumber("ECODEV_CARBON_G_PER_KWH_LOW", DEFAULT_CARBON_LOW), envNumber("ECODEV_CARBON_G_PER_KWH_HIGH", DEFAULT_CARBON_HIGH));
  const carbonHigh = Math.max(envNumber("ECODEV_CARBON_G_PER_KWH_LOW", DEFAULT_CARBON_LOW), envNumber("ECODEV_CARBON_G_PER_KWH_HIGH", DEFAULT_CARBON_HIGH));
  const grid = gridFactor(options);
  const input: EcoEstimate["assumptions"]["input"] = execution?.cpuTimeMs != null && execution.cpuTimeMs > 0 && execution.measured ? "cpuTimeMs" : execution?.wallTimeMs != null && execution.wallTimeMs > 0 && execution.measured ? "wallTimeMs" : "unavailable";
  const durationSeconds = input === "cpuTimeMs" ? (execution?.cpuTimeMs ?? 0) / 1000 : input === "wallTimeMs" ? (execution?.wallTimeMs ?? 0) / 1000 : null;
  const assumptions = { powerWatts: { low: powerLow, high: powerHigh, source: POWER_SOURCE }, carbonIntensityGPerKwh: { low: carbonLow, high: carbonHigh, source: CARBON_SOURCE }, input };
  const sources = [
    { title: "Green Software Foundation: Software Carbon Intensity", url: "https://greensoftware.foundation/standards/sci/" },
    { title: "Pereira et al. (2021), programming-language energy efficiency", url: "https://doi.org/10.1016/j.scico.2021.102609" },
    { title: "Jiménez et al. (2025), compiler/interpreter versions and energy", url: "https://doi.org/10.1016/j.scico.2025.103270" },
  ];
  if (durationSeconds == null) return { energyWh: null, carbonGrams: null, range: null, measured: false, basis: "No measured CPU or wall time was available. Secure execution may be unavailable or the program may not have completed.", assumptions, methodology: "Energy is estimated as duration × assumed package power. Carbon is estimated as energy in kWh × grid carbon intensity. These are scenarios, not direct energy-meter readings.", sources, projection: projection(null, null), energyLevel: "MODELED", carbonLevel: "MODELED", grid, sci: sciReport(null, grid, options) };
  const energyLow = durationSeconds * powerLow / 3600;
  const energyHigh = durationSeconds * powerHigh / 3600;
  const carbonGramsLow = energyLow / 1000 * carbonLow;
  const carbonGramsHigh = energyHigh / 1000 * carbonHigh;
  const energyWh = round((energyLow + energyHigh) / 2), carbonGrams = round((carbonGramsLow + carbonGramsHigh) / 2);
  return { energyWh, carbonGrams, range: { energyWh: { low: round(energyLow), high: round(energyHigh) }, carbonGrams: { low: round(carbonGramsLow), high: round(carbonGramsHigh) } }, measured: false, basis: `Scenario range derived from measured ${input}; no hardware energy meter was attached to this run.`, assumptions, methodology: "Energy is estimated as duration × assumed package power. Carbon is estimated as energy in kWh × grid carbon intensity. The midpoint is a convenience summary; use the range for decisions.", sources, projection: projection(energyWh, carbonGrams), energyLevel: "MODELED", carbonLevel: "MODELED", grid, sci: sciReport(energyWh, grid, options) };
}