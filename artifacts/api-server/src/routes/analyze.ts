import { Router } from "express";
import { analyzeCode, normalizeLanguage, type SupportedLanguage } from "../services/analyzer";
import { executeCode, type ExecutionResult, executionLimits } from "../services/sandbox";

const router = Router();
const MAX_CODE_BYTES = 200_000;
const DEFAULT_CPU_WATTS = 25;
const DEFAULT_CARBON_G_PER_KWH = 400;

type RunPayload = {
  code?: unknown;
  language?: unknown;
  compareCode?: unknown;
  compareLanguage?: unknown;
  execute?: unknown;
};

function numberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function seconds(ms: number | null) { return ms == null ? null : ms / 1000; }

function ecoEstimate(execution: ExecutionResult | null) {
  if (!execution?.measured || execution.cpuTimeMs == null) {
    return { energyWh: null, carbonGrams: null, basis: "No direct energy meter was available for this run.", measured: false, assumptions: { cpuPackageWatts: numberEnv("ECODEV_CPU_WATTS", DEFAULT_CPU_WATTS), carbonIntensityGPerKwh: numberEnv("ECODEV_CARBON_G_PER_KWH", DEFAULT_CARBON_G_PER_KWH) } };
  }
  const watts = numberEnv("ECODEV_CPU_WATTS", DEFAULT_CPU_WATTS);
  const carbonIntensity = numberEnv("ECODEV_CARBON_G_PER_KWH", DEFAULT_CARBON_G_PER_KWH);
  const energyWh = (execution.cpuTimeMs / 1000) * watts / 3600;
  const carbonGrams = energyWh * carbonIntensity;
  return {
    energyWh,
    carbonGrams,
    basis: "Estimated from measured process CPU time using a configurable average CPU-package power assumption; carbon is energy × configured grid intensity.",
    measured: false,
    assumptions: { cpuPackageWatts: watts, carbonIntensityGPerKwh: carbonIntensity },
  };
}

function summarizeExecution(execution: ExecutionResult | null) {
  if (!execution) return null;
  return {
    ...execution,
    wallTimeMs: execution.wallTimeMs == null ? null : Number(execution.wallTimeMs.toFixed(3)),
    cpuTimeMs: execution.cpuTimeMs == null ? null : Number(execution.cpuTimeMs.toFixed(3)),
    peakMemoryKb: execution.peakMemoryKb,
  };
}

function invalid(message: string, status = 400) {
  return { status, body: { error: message } };
}

router.post("/analyze", async (req, res) => {
  const body = req.body as RunPayload;
  if (typeof body.code !== "string") return res.status(400).json(invalid("code must be a string").body);
  if (!body.code.trim()) return res.status(400).json(invalid("code cannot be empty").body);
  if (Buffer.byteLength(body.code, "utf8") > MAX_CODE_BYTES) return res.status(413).json(invalid(`code exceeds the ${MAX_CODE_BYTES} byte limit`, 413).body);

  const languageHint = body.language == null ? null : normalizeLanguage(String(body.language));
  if (body.language != null && !languageHint) {
    return res.status(400).json({ error: "Unsupported language. Supported languages: JavaScript, TypeScript, Python, C, C++, Go." });
  }

  const staticResult = analyzeCode(body.code, languageHint);
  const shouldExecute = body.execute !== false;
  let compile: ExecutionResult | null = null;
  let execution: ExecutionResult | null = null;

  if (shouldExecute) {
    // executeCode reports compile_error separately, but keeping compile/run as distinct
    // fields is useful for the UI and for future compiler instrumentation.
    const started = performance.now();
    execution = await executeCode(body.code, staticResult.language);
    if (execution.status === "compile_error") {
      compile = { ...execution, wallTimeMs: execution.wallTimeMs == null ? null : execution.wallTimeMs };
      execution = null;
    }
    // Avoid a magic "analysis duration": the server computes this from the actual request.
    const serverDurationMs = performance.now() - started;
    const eco = ecoEstimate(execution);

    let comparison = null;
    if (typeof body.compareCode === "string" && body.compareCode.trim() && Buffer.byteLength(body.compareCode, "utf8") <= MAX_CODE_BYTES) {
      const comparisonLanguage = body.compareLanguage == null ? staticResult.language : normalizeLanguage(String(body.compareLanguage));
      if (comparisonLanguage) {
        const comparisonStatic = analyzeCode(body.compareCode, comparisonLanguage);
        const comparisonExec = shouldExecute ? await executeCode(body.compareCode, comparisonStatic.language) : null;
        const beforeMs = execution?.wallTimeMs ?? null;
        const afterMs = comparisonExec?.wallTimeMs ?? null;
        const beforeMem = execution?.peakMemoryKb ?? null;
        const afterMem = comparisonExec?.peakMemoryKb ?? null;
        comparison = {
          analysis: comparisonStatic,
          execution: summarizeExecution(comparisonExec),
          eco: ecoEstimate(comparisonExec),
          delta: {
            runtimeMs: beforeMs != null && afterMs != null ? afterMs - beforeMs : null,
            runtimePercent: beforeMs && afterMs != null ? ((afterMs - beforeMs) / beforeMs) * 100 : null,
            peakMemoryKb: beforeMem != null && afterMem != null ? afterMem - beforeMem : null,
            carbonGrams: eco.carbonGrams != null && comparisonExec ? eco.carbonGrams - ecoEstimate(comparisonExec).carbonGrams! : null,
          },
        };
      }
    }

    return res.json({
      ok: true,
      submission: { language: staticResult.language, detectionConfidence: staticResult.confidence, bytes: staticResult.bytes, lines: staticResult.lines },
      analysis: staticResult,
      compile: summarizeExecution(compile),
      execution: summarizeExecution(execution),
      eco,
      comparison,
      serverDurationMs: Number(serverDurationMs.toFixed(3)),
      limits: executionLimits,
    });
  }

  return res.json({
    ok: true,
    submission: { language: staticResult.language, detectionConfidence: staticResult.confidence, bytes: staticResult.bytes, lines: staticResult.lines },
    analysis: staticResult,
    compile: null,
    execution: null,
    eco: ecoEstimate(null),
    comparison: null,
    serverDurationMs: null,
    limits: executionLimits,
  });
});

export default router;
