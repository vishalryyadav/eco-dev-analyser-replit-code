import { Router } from "express";

const router = Router();

router.post("/report", (req, res) => {
  const body = req.body as { result?: unknown; format?: unknown };
  if (!body || typeof body.result !== "object" || !body.result) return res.status(400).json({ error: "result must be an analysis object" });
  const format = body.format === "json" ? "json" : "markdown";
  if (format === "json") return res.json({ ok: true, report: body.result });
  const r = body.result as Record<string, any>;
  const lines = [
    "# EcoDev Analysis Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Language: ${r.submission?.language ?? "unknown"}`,
    `Score: ${r.analysis?.score ?? "n/a"}/100`,
    "",
    "## Complexity",
    `- Time: ${r.analysis?.complexity?.time ?? "n/a"}`,
    `- Space: ${r.analysis?.complexity?.space ?? "n/a"}`,
    "",
    "## Runtime",
    `- Status: ${r.execution?.status ?? r.compile?.status ?? "not run"}`,
    `- Wall time: ${r.execution?.wallTimeMs ?? "n/a"} ms`,
    `- CPU time: ${r.execution?.cpuTimeMs ?? "n/a"} ms`,
    `- Peak memory: ${r.execution?.peakMemoryKb ?? "n/a"} KB`,
    `- Energy: ${r.eco?.energyWh ?? "n/a"} Wh (estimate)`,
    `- Carbon: ${r.eco?.carbonGrams ?? "n/a"} gCO2e (estimate)`,
    "",
    "## Findings",
    ...((r.analysis?.findings ?? []).map((f: any) => `- **${String(f.severity).toUpperCase()}** ${f.title}: ${f.detail}`)),
    "",
    "## Optimization alternatives",
    ...((r.analysis?.alternatives ?? []).map((a: any) => `- **${a.title}** — ${a.description} Complexity: ${a.complexity}. Runtime: ${a.expectedRuntimeChange}. Memory: ${a.expectedMemoryChange}.`)),
    "",
    "## Important measurement note",
    "Energy and carbon are modeled estimates unless a hardware energy meter is explicitly integrated. Benchmark results are workload- and environment-specific.",
  ];
  res.type("text/markdown").send(lines.join("\n"));
});

export default router;
