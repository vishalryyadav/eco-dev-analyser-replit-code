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
  const key = process.env.OPENAI_API_KEY;
  if (!key) return localCoach(input);
  const model = process.env.ECODEV_AI_MODEL || "gpt-5.6-luna";
  const prompt = [
    "You are EcoDev's senior software-performance and green-computing coach.",
    "Analyze the supplied code and evidence. Do not invent benchmark results. Clearly separate measured facts from hypotheses.",
    "Return JSON with keys summary, recommendations (array of strings), nextTests (array of strings), risks (array of strings).",
    `Language: ${input.language}`,
    `User instruction: ${input.instruction ?? "none"}`,
    `Static analysis: ${JSON.stringify(input.analysis)}`,
    `Security analysis: ${JSON.stringify(input.security)}`,
    `Source code:\n${input.code.slice(0, 120000)}`,
  ].join("\n\n");
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, input: prompt, max_output_tokens: 1200 }),
    });
    if (!response.ok) throw new Error(`OpenAI coach request failed with ${response.status}`);
    const data = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
    const text = data.output_text ?? data.output?.flatMap((item) => item.content ?? []).map((item) => item.text ?? "").join("") ?? "";
    const parsed = JSON.parse(text) as { summary?: string; recommendations?: string[]; nextTests?: string[]; risks?: string[] };
    return { provider: model, summary: parsed.summary ?? "No summary returned.", recommendations: parsed.recommendations ?? [], nextTests: parsed.nextTests ?? [], risks: parsed.risks ?? [], instruction: input.instruction ?? null };
  } catch {
    return { ...localCoach(input), provider: "local-rules-fallback" };
  }
}
