import { Router } from "express";
import { analyzeCode, normalizeLanguage } from "../services/analyzer";
import { executeCode, type ExecutionResult, executionLimits } from "../services/sandbox";

const router = Router();
const MAX_CODE_BYTES = 200_000;
const DEFAULT_CPU_WATTS = 25;
const DEFAULT_CARBON_G_PER_KWH = 400;

type RunPayload = { code?: unknown; language?: unknown; compareCode?: unknown; compareLanguage?: unknown; execute?: unknown };

function numberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function ecoEstimate(execution: ExecutionResult | null) {
  const watts = numberEnv("ECODEV_CPU_WATTS", DEFAULT_CPU_WATTS);
  const carbonIntensity = numberEnv("ECODEV_CARBON_G_PER_KWH", DEFAULT_CARBON_G_PER_KWH);
  if (!execution?.measured || execution.cpuTimeMs == null) {
    return { energyWh: null, carbonGrams: null, measured: false, basis: "No direct energy meter was available for this run.", assumptions: { cpuPackageWatts: watts, carbonIntensityGPerKwh: carbonIntensity } };
  }
  const energyWh = (execution.cpuTimeMs / 1000) * watts / 3600;
  const carbonGrams = energyWh * carbonIntensity;
  return { energyWh: Number(energyWh.toFixed(6)), carbonGrams: Number(carbonGrams.toFixed(6)), measured: false, basis: "Estimated from measured process CPU time using a configurable average CPU-package power assumption; carbon is energy × configured grid intensity.", assumptions: { cpuPackageWatts: watts, carbonIntensityGPerKwh: carbonIntensity } };
}

function summarize(execution: ExecutionResult | null) {
  if (!execution) return null;
  return {
    status: execution.status, stdout: execution.stdout, stderr: execution.stderr, exitCode: execution.exitCode,
    wallTimeMs: execution.wallTimeMs == null ? null : Number(execution.wallTimeMs.toFixed(3)),
    cpuTimeMs: execution.cpuTimeMs == null ? null : Number(execution.cpuTimeMs.toFixed(3)),
    peakMemoryKb: execution.peakMemoryKb, measured: execution.measured, sandbox: execution.sandbox,
  };
}

router.post("/analyze", async (req, res) => {
  try {
    const body = req.body as RunPayload;
    if (typeof body.code !== "string") return res.status(400).json({ error: "code must be a string" });
    if (!body.code.trim()) return res.status(400).json({ error: "code cannot be empty" });
    if (Buffer.byteLength(body.code, "utf8") > MAX_CODE_BYTES) return res.status(413).json({ error: `code exceeds the ${MAX_CODE_BYTES} byte limit` });

    const language = body.language == null ? null : normalizeLanguage(String(body.language));
    if (body.language != null && !language) return res.status(400).json({ error: "Unsupported language. Use JavaScript, TypeScript, Python, C, C++, or Go." });

    const analysis = analyzeCode(body.code, language);
    if (!language && analysis.confidence === "low") return res.status(422).json({ error: "Language could not be inferred confidently. Select a language explicitly." });

    let compile: ExecutionResult | null = null;
    let execution: ExecutionResult | null = null;
    if (body.execute !== false) {
      const run = await executeCode(body.code, analysis.language);
      compile = run.compile;
      execution = run.execution;
    }

    let comparison = null;
    const compare = typeof body.compareCode === "string" && body.compareCode.trim() && Buffer.byteLength(body.compareCode, "utf8") <= MAX_CODE_BYTES ? body.compareCode : null;
    if (compare) {
      const compareLanguage = body.compareLanguage == null ? analysis.language : normalizeLanguage(String(body.compareLanguage));
      if (compareLanguage) {
        const compareAnalysis = analyzeCode(compare, compareLanguage);
        const compareRun = body.execute === false ? { compile: null, execution: null } : await executeCode(compare, compareAnalysis.language);
        const beforeRuntime = execution?.wallTimeMs ?? null;
        const afterRuntime = compareRun.execution?.wallTimeMs ?? null;
        const beforeMemory = execution?.peakMemoryKb ?? null;
        const afterMemory = compareRun.execution?.peakMemoryKb ?? null;
        const beforeEco = ecoEstimate(execution);
        const afterEco = ecoEstimate(compareRun.execution);
        comparison = {
          analysis: compareAnalysis, compile: summarize(compareRun.compile), execution: summarize(compareRun.execution), eco: afterEco,
          delta: {
            runtimeMs: beforeRuntime != null && afterRuntime != null ? Number((afterRuntime - beforeRuntime).toFixed(3)) : null,
            runtimePercent: beforeRuntime && afterRuntime != null ? Number((((afterRuntime - beforeRuntime) / beforeRuntime) * 100).toFixed(2)) : null,
            peakMemoryKb: beforeMemory != null && afterMemory != null ? afterMemory - beforeMemory : null,
            carbonGrams: beforeEco.carbonGrams != null && afterEco.carbonGrams != null ? Number((afterEco.carbonGrams - beforeEco.carbonGrams).toFixed(6)) : null,
          },
        };
      }
    }

    return res.json({
      ok: true,
      submission: { language: analysis.language, detectionConfidence: analysis.confidence, bytes: analysis.bytes, lines: analysis.lines },
      analysis,
      compile: summarize(compile),
      execution: summarize(execution),
      eco: ecoEstimate(execution),
      comparison,
      limits: executionLimits,
      model: { cpuPackagePowerW: numberEnv("ECODEV_CPU_WATTS", DEFAULT_CPU_WATTS), carbonIntensityGPerKwh: numberEnv("ECODEV_CARBON_G_PER_KWH", DEFAULT_CARBON_G_PER_KWH), note: "Energy and carbon are estimates unless a hardware energy meter is explicitly integrated." },
    });
  } catch (error) {
    req.log?.error?.({ err: error }, "Code analysis failed");
    return res.status(500).json({ error: "Analysis failed unexpectedly. Check server logs for details." });
  }
});

export default router;
