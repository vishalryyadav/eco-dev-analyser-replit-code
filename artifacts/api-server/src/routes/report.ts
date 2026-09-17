import { Router } from "express";

const router = Router();
const MAX_REPORT_BYTES = 200_000;

function display(value: unknown, unit = "") {
  return value == null ? "UNAVAILABLE" : `${String(value)}${unit}`;
}

// The report endpoint receives the already-produced current analysis object from
// the browser. Refuse an internally contradictory modeled result rather than
// serializing different energy/carbon facts into its JSON and Markdown forms.
function hasConsistentSci(result: Record<string, any>) {
  const energyWh = result.eco?.energyWh;
  if (typeof energyWh !== "number" || energyWh === 0) return true;
  const sci = result.eco?.sci;
  if (!sci || typeof sci.energyKwh !== "number" || typeof sci.operationalCarbonGrams !== "number") return false;
  const close = (left: number, right: number) => Math.abs(left - right) <= 1e-9;
  return close(sci.energyKwh, energyWh / 1000)
    && close(sci.operationalCarbonGrams, sci.energyKwh * Number(result.eco?.grid?.factorGPerKwh))
    && (sci.scoreGramsPerUnit == null || close(sci.scoreGramsPerUnit, (sci.operationalCarbonGrams + (sci.embodiedEmissionsGrams ?? 0)) / Number(sci.functionalUnitCount)));
}

router.post("/report", (req, res) => {
  const body = req.body as { result?: unknown; format?: unknown };
  if (!body || typeof body.result !== "object" || !body.result) return res.status(400).json({ error: "result must be an analysis object" });
  if (Buffer.byteLength(JSON.stringify(body.result), "utf8") > MAX_REPORT_BYTES) return res.status(413).json({ error: `report data exceeds the ${MAX_REPORT_BYTES} byte limit` });
  if (body.format != null && body.format !== "json" && body.format !== "markdown") return res.status(400).json({ error: "format must be json or markdown" });
  const r = body.result as Record<string, any>;
  if (!hasConsistentSci(r)) return res.status(422).json({ error: "Report rejected because its SCI metadata is inconsistent with its modeled energy/carbon values." });
  const format = body.format === "json" ? "json" : "markdown";
  if (format === "json") return res.json({ ok: true, report: body.result });
  const sci = r.eco?.sci;
  const lines = [
    "# EcoDev Analysis Report", "", `Generated: ${new Date().toISOString()}`, `Language: ${r.submission?.language ?? "unknown"}`, `Score: ${r.analysis?.score ?? "n/a"}/100`, "",
    "## Complexity", `- Time: ${r.analysis?.complexity?.time ?? "n/a"}`, `- Space: ${r.analysis?.complexity?.space ?? "n/a"}`, "",
    "## Runtime", `- Status: ${r.execution?.status ?? r.compile?.status ?? "not run"}`, `- Wall time: ${display(r.execution?.wallTimeMs, " ms")}`, `- CPU time: ${display(r.execution?.cpuTimeMs, " ms")}`, `- Peak memory: ${display(r.execution?.peakMemoryKb, " KB")}`, `- Energy: ${display(r.eco?.energyWh, " Wh")} (MODELED / ESTIMATED)`, `- Carbon: ${display(r.eco?.carbonGrams, " gCO2e")} (MODELED / ESTIMATED)`, "",
    "## SCI-style operational estimate", `- Formula: ${sci?.formula ?? "UNAVAILABLE"}`, `- E: ${display(sci?.energyKwh, " kWh")} (the same modeled energy as above, converted from Wh)`, `- I: ${display(r.eco?.grid?.factorGPerKwh, " gCO2e/kWh")}`, `- M: ${display(sci?.embodiedEmissionsGrams, " gCO2e")} (${sci?.embodiedEmissionsClassification ?? "UNAVAILABLE"})`, `- R: ${display(sci?.functionalUnitCount)} ${sci?.functionalUnit ?? "functional unit(s)"}`, `- Operational carbon: ${display(sci?.operationalCarbonGrams, " gCO2e")}`, `- SCI result: ${display(sci?.scoreGramsPerUnit, " gCO2e per functional unit")}`, "",
    "## Run and preference context", `- Selected profile: ${display(r.preferences?.profile)}`, `- Applied profile: ${r.preferences?.weightSource === "profile" ? display(r.preferences?.profile) : "UNAVAILABLE (custom weights)"}`, `- Priority weight source: ${r.preferences?.weightSource === "reset" ? "reset/default custom weights (50)" : display(r.preferences?.weightSource)}`, `- Runs requested: ${display(r.benchmark?.iterationsRequested)}`, `- Runs collected: ${display(r.benchmark?.samplesCollected)}`, `- Representative stdin cases: ${display(r.benchmark?.representativeCases)}`, `- Optimization goal: ${display(r.preferences?.instruction)}`, `- Priority weights: ${r.preferences?.weights ? JSON.stringify(r.preferences.weights) : "UNAVAILABLE"}`, "",
    "## Before vs After", `- Status: ${display(r.comparison?.optimization)}`, `- Correctness: ${display(r.comparison?.correctness?.status)}`, `- Correctness detail: ${display(r.comparison?.correctness?.reason)}`, `- Requested runs per supplied case: ${display(r.comparison?.benchmark?.requestedRuns)}`, `- Baseline/candidate runs: ${display(r.comparison?.benchmark?.baselineRuns)}/${display(r.comparison?.benchmark?.candidateRuns)}`, `- Runtime direction: ${display(r.comparison?.delta?.runtimePercent, "%")}`, `- Carbon direction: ${display(r.comparison?.delta?.carbonPercent, "%")}`, "",
    "## Findings", ...((r.analysis?.findings ?? []).map((f: any) => `- **${String(f.severity).toUpperCase()}** ${f.title}: ${f.detail}`)), "",
    "## Optimization alternatives", ...((r.analysis?.alternatives ?? []).map((a: any) => `- **${a.title}** — ${a.description} Complexity: ${a.complexity}. Runtime: ${a.expectedRuntimeChange}. Memory: ${a.expectedMemoryChange}.`)), "",
    "## Important measurement note", "Energy and carbon are modeled estimates unless a hardware energy meter is explicitly integrated. Benchmark results are workload- and environment-specific.",
  ];
  return res.type("text/markdown").send(lines.join("\n"));
});

export default router;
