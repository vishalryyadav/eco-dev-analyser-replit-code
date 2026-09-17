import type { StaticAnalysis } from "./analyzer";
import type { EcoEstimate } from "./eco";

type GreenExecution = { status: string; measured: boolean; cpuTimeMs: number | null; peakMemoryKb: number | null } | null;
type GreenLimits = { timeoutMs: number; memoryMb: number };

export type GreenScore = {
  score: number | null;
  classification: "CALCULATED" | "UNAVAILABLE";
  evidenceLevel: "FULL" | "PARTIAL" | "UNAVAILABLE";
  summary: string;
  formula: "35% static efficiency + 10% successful execution + 20% CPU headroom + 20% memory headroom + 15% modeled-energy headroom";
  components: Array<{ name: string; weight: number; points: number | null; classification: "INFERRED" | "MEASURED" | "ESTIMATED" | "UNAVAILABLE"; explanation: string }>;
};

// Heuristic weights sum to 100. They are evidence weights, not measured-energy shares.
const WEIGHTS = { static: 35, execution: 10, cpu: 20, memory: 20, energy: 15 } as const;
const formula: GreenScore["formula"] = "35% static efficiency + 10% successful execution + 20% CPU headroom + 20% memory headroom + 15% modeled-energy headroom";
const round = (value: number) => Number(value.toFixed(2));
const headroom = (value: number, limit: number) => Math.max(0, 1 - Math.min(1, value / limit));

/**
 * Deterministic per-run heuristic. It deliberately keeps modeled energy separate
 * from measured CPU/RSS and leaves unavailable evidence out of the score.
 */
export function greenScore(analysis: StaticAnalysis, execution: GreenExecution, eco: EcoEstimate, limits: GreenLimits): GreenScore {
  const staticPoints = round(analysis.score * WEIGHTS.static / 100);
  const components: GreenScore["components"] = [{ name: "Static efficiency", weight: WEIGHTS.static, points: staticPoints, classification: "INFERRED", explanation: `Existing static Efficiency score (${analysis.score}/100) × ${WEIGHTS.static}%.` }];

  if (execution && (execution.status !== "completed" || !execution.measured)) {
    components.push({ name: "Execution evidence", weight: WEIGHTS.execution, points: null, classification: "UNAVAILABLE", explanation: "Execution did not complete with valid telemetry; runtime-derived and modeled eco evidence is excluded." });
    return { score: null, classification: "UNAVAILABLE", evidenceLevel: "UNAVAILABLE", summary: "UNAVAILABLE: the submitted program did not complete with valid execution telemetry.", formula, components };
  }

  if (!execution) {
    return { score: staticPoints, classification: "CALCULATED", evidenceLevel: "PARTIAL", summary: "Partial score from static analysis only; no execution evidence was requested or available.", formula, components };
  }

  components.push({ name: "Successful execution", weight: WEIGHTS.execution, points: WEIGHTS.execution, classification: "MEASURED", explanation: "Completed in the secured sandbox with valid telemetry." });
  if (execution.cpuTimeMs != null) components.push({ name: "CPU headroom", weight: WEIGHTS.cpu, points: round(WEIGHTS.cpu * headroom(execution.cpuTimeMs, limits.timeoutMs)), classification: "MEASURED", explanation: `Measured CPU time relative to the configured ${limits.timeoutMs} ms execution limit.` });
  else components.push({ name: "CPU headroom", weight: WEIGHTS.cpu, points: null, classification: "UNAVAILABLE", explanation: "CPU telemetry was unavailable." });
  if (execution.peakMemoryKb != null) components.push({ name: "Memory headroom", weight: WEIGHTS.memory, points: round(WEIGHTS.memory * headroom(execution.peakMemoryKb, limits.memoryMb * 1024)), classification: "MEASURED", explanation: `Measured peak RSS relative to the configured ${limits.memoryMb} MB memory limit.` });
  else components.push({ name: "Memory headroom", weight: WEIGHTS.memory, points: null, classification: "UNAVAILABLE", explanation: "Peak-memory telemetry was unavailable." });

  const energyHigh = eco.range?.energyWh.high ?? null;
  if (energyHigh != null) {
    const modeledLimitWh = limits.timeoutMs / 1000 * eco.assumptions.powerWatts.high / 3600;
    components.push({ name: "Modeled-energy headroom", weight: WEIGHTS.energy, points: round(WEIGHTS.energy * headroom(energyHigh, modeledLimitWh)), classification: "ESTIMATED", explanation: `Modeled high energy relative to ${modeledLimitWh.toFixed(6)} Wh, the configured timeout at the high power scenario.` });
  } else components.push({ name: "Modeled-energy headroom", weight: WEIGHTS.energy, points: null, classification: "UNAVAILABLE", explanation: "Modeled energy was unavailable and was not treated as zero." });

  const available = components.filter((component) => component.points != null);
  const score = round(available.reduce((total, component) => total + (component.points ?? 0), 0));
  const evidenceLevel: GreenScore["evidenceLevel"] = available.length === components.length ? "FULL" : "PARTIAL";
  return { score, classification: "CALCULATED", evidenceLevel, summary: `${evidenceLevel === "FULL" ? "Full" : "Partial"} evidence: static analysis, successful execution, measured CPU/RSS${energyHigh != null ? ", and modeled energy" : ""}. Modeled energy is not a hardware measurement.`, formula, components };
}
