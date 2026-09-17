import type { StaticAnalysis } from "./analyzer";
import type { SecurityReport } from "./security";

export type CoachInput = { code: string; language: string; analysis: StaticAnalysis; security: SecurityReport; instruction?: string | null };

function localCoach(input: CoachInput) {
  const high = input.analysis.findings.filter((f) => f.severity === "high");
  const security = input.security.findings.filter((f) => f.severity === "high");
  const recommendations = [
    ...high.map((f) => f.detail),
    ...input.analysis.alternatives.slice(0, 3).map((a) => `${a.title}: ${a.description}`),
    ...security.map((f) => `Security: ${f.detail}`),
  ];
  return {
    provider: "local-rules",
    summary: high.length ? `The main engineering opportunity is to address ${high.length} high-priority hotspot(s) before optimizing micro-details.` : "No high-priority static hotspot was detected; validate the measured baseline and optimize only where the benchmark shows a meaningful cost.",
    recommendations: recommendations.slice(0, 6),
    nextTests: ["Run the baseline and candidate with the same representative input.", "Compare median wall time, CPU time, peak memory, and estimated carbon.", "Add a regression test for the behavior being optimized.", "Review security warnings before shipping."],
    instruction: input.instruction ?? null,
  };
}

export async function coachCode(input: CoachInput) {
  // The coach is deliberately local and rule-backed. It receives the source
  // only in this configured EcoDev API process and never forwards it to an AI
  // provider, regardless of environment variables.
  return localCoach(input);
}
