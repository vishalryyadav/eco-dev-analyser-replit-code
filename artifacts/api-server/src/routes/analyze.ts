import { Router } from "express";
import { analyzeCode, normalizeLanguage } from "../services/analyzer";
import { executeCode, type ExecutionResult, executionLimits } from "../services/sandbox";
import { normalizeProfile, rankAlternatives, type OptimizationProfile } from "../services/preferences";
import { securityAnalyze } from "../services/security";
import { ecoEstimate } from "../services/eco";

const router = Router();
const MAX_CODE_BYTES = 200_000;

type RunPayload = { code?: unknown; language?: unknown; compareCode?: unknown; compareLanguage?: unknown; execute?: unknown; preferences?: unknown; benchmarkIterations?: unknown };

function summarize(execution: ExecutionResult | null) { if (!execution) return null; return { status: execution.status, stdout: execution.stdout, stderr: execution.stderr, exitCode: execution.exitCode, signal: execution.signal, wallTimeMs: execution.wallTimeMs == null ? null : Number(execution.wallTimeMs.toFixed(3)), cpuTimeMs: execution.cpuTimeMs == null ? null : Number(execution.cpuTimeMs.toFixed(3)), peakMemoryKb: execution.peakMemoryKb, measured: execution.measured, sandbox: execution.sandbox }; }
function profileFromPayload(value: unknown): OptimizationProfile { if (!value || typeof value !== "object") return "balanced"; return normalizeProfile((value as { profile?: unknown }).profile); }

router.post("/analyze", async (req, res) => {
  try {
    const body = req.body as RunPayload;
    if (!body || typeof body !== "object") return res.status(400).json({ error: "Invalid JSON request body" });
    if (typeof body.code !== "string") return res.status(400).json({ error: "code must be a string" });
    if (!body.code.trim()) return res.status(400).json({ error: "code cannot be empty" });
    if (Buffer.byteLength(body.code, "utf8") > MAX_CODE_BYTES) return res.status(413).json({ error: `code exceeds the ${MAX_CODE_BYTES} byte limit` });
    if (body.execute !== undefined && typeof body.execute !== "boolean") return res.status(400).json({ error: "execute must be boolean" });
    const iterationsRaw = body.benchmarkIterations == null ? 1 : Number(body.benchmarkIterations);
    if (!Number.isInteger(iterationsRaw) || iterationsRaw < 1 || iterationsRaw > 5) return res.status(400).json({ error: "benchmarkIterations must be an integer from 1 to 5" });
    const profile = profileFromPayload(body.preferences);
    const requestedLanguage = body.language == null ? null : normalizeLanguage(String(body.language));
    if (body.language != null && !requestedLanguage) return res.status(400).json({ error: "Unsupported language. Use JavaScript, TypeScript, Python, C, C++, or Go." });
    const analysis = analyzeCode(body.code, requestedLanguage);
    const security = securityAnalyze(body.code, analysis.language);
    analysis.alternatives = rankAlternatives(analysis.alternatives, profile);
    if (!requestedLanguage && analysis.confidence === "low") return res.status(422).json({ error: "Language could not be inferred confidently. Select a language explicitly." });

    let compile: ExecutionResult | null = null, execution: ExecutionResult | null = null;
    let benchmarkSamples: ExecutionResult[] = [];
    const runEnabled = body.execute !== false;
    if (runEnabled) {
      const firstRun = await executeCode(body.code, analysis.language); compile = firstRun.compile; execution = firstRun.execution;
      if (iterationsRaw > 1 && execution?.status === "completed") {
        const runs = [execution];
        for (let i = 1; i < iterationsRaw; i++) { const next = await executeCode(body.code, analysis.language); if (next.execution?.status !== "completed") break; runs.push(next.execution); }
        benchmarkSamples = runs.filter((r): r is ExecutionResult => r.wallTimeMs != null);
        const valid = benchmarkSamples;
        if (valid.length > 1) {
          const sorted = valid.map(r => r.wallTimeMs as number).sort((a, b) => a - b), median = sorted[Math.floor(sorted.length / 2)];
          const cpu = valid.map(r => r.cpuTimeMs).filter((v): v is number => v != null), rss = valid.map(r => r.peakMemoryKb).filter((v): v is number => v != null);
          const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
          execution = { ...execution, wallTimeMs: median, cpuTimeMs: cpu.length ? cpu.sort((a, b) => a - b)[Math.floor(cpu.length / 2)] : execution.cpuTimeMs, peakMemoryKb: rss.length ? Math.max(...rss) : execution.peakMemoryKb, benchmark: { minWallTimeMs: Number(sorted[0].toFixed(3)), maxWallTimeMs: Number(sorted[sorted.length - 1].toFixed(3)), meanWallTimeMs: Number(mean.toFixed(3)) } } as ExecutionResult;
        }
      }
    }

    let comparison = null, compare: string | null = null;
    if (typeof body.compareCode === "string" && body.compareCode.trim()) { if (Buffer.byteLength(body.compareCode, "utf8") > MAX_CODE_BYTES) return res.status(413).json({ error: `compareCode exceeds the ${MAX_CODE_BYTES} byte limit` }); compare = body.compareCode; }
    if (compare) {
      const compareLanguage = body.compareLanguage == null ? analysis.language : normalizeLanguage(String(body.compareLanguage));
      if (!compareLanguage) return res.status(400).json({ error: "Unsupported compareLanguage. Use JavaScript, TypeScript, Python, C, C++, or Go." });
      const compareAnalysis = analyzeCode(compare, compareLanguage); compareAnalysis.alternatives = rankAlternatives(compareAnalysis.alternatives, profile);
      const compareRuns = [] as ExecutionResult[];
      let compareRun = !runEnabled ? { compile: null, execution: null } : await executeCode(compare, compareAnalysis.language);
      if (runEnabled && compareRun.execution?.status === "completed") {
        compareRuns.push(compareRun.execution);
        for (let i = 1; i < iterationsRaw; i++) { const next = await executeCode(compare, compareAnalysis.language); if (next.execution?.status !== "completed") break; compareRuns.push(next.execution); }
        const validCompare = compareRuns.filter((run) => run.wallTimeMs != null);
        if (validCompare.length > 1) { const wallTimes = validCompare.map((run) => run.wallTimeMs as number).sort((a, b) => a - b); compareRun = { ...compareRun, execution: { ...compareRun.execution, wallTimeMs: wallTimes[Math.floor(wallTimes.length / 2)] } }; }
      }
      const beforeRuntime = execution?.wallTimeMs ?? null, afterRuntime = compareRun.execution?.wallTimeMs ?? null, beforeMemory = execution?.peakMemoryKb ?? null, afterMemory = compareRun.execution?.peakMemoryKb ?? null;
      const beforeEco = ecoEstimate(execution), afterEco = ecoEstimate(compareRun.execution);
      comparison = { analysis: compareAnalysis, compile: summarize(compareRun.compile), execution: summarize(compareRun.execution), eco: afterEco, delta: { runtimeMs: beforeRuntime != null && afterRuntime != null ? Number((afterRuntime - beforeRuntime).toFixed(3)) : null, runtimePercent: beforeRuntime != null && afterRuntime != null && beforeRuntime !== 0 ? Number((((afterRuntime - beforeRuntime) / beforeRuntime) * 100).toFixed(2)) : null, peakMemoryKb: beforeMemory != null && afterMemory != null ? afterMemory - beforeMemory : null, carbonGrams: beforeEco.carbonGrams != null && afterEco.carbonGrams != null ? Number((afterEco.carbonGrams - beforeEco.carbonGrams).toFixed(6)) : null } };
    }

    const eco = ecoEstimate(execution);
    if (compile?.status === "compile_error") eco.basis = "Program execution was skipped because compilation failed. Fix the compiler errors and analyze again to measure program runtime, electricity, and carbon scenarios.";
    return res.json({ ok: true, submission: { language: analysis.language, detectionConfidence: analysis.confidence, bytes: analysis.bytes, lines: analysis.lines }, analysis, security, compile: summarize(compile), execution: summarize(execution), eco, comparison, preferences: { profile, instruction: typeof body.preferences === "object" && body.preferences ? (body.preferences as { instruction?: unknown }).instruction ?? null : null, rankedBy: profile }, limits: executionLimits, benchmark: { iterationsRequested: iterationsRaw, samplesCollected: benchmarkSamples.length || (execution?.wallTimeMs != null ? 1 : 0), strategy: iterationsRaw > 1 ? "median wall/CPU; max observed RSS" : "single run" }, model: { version: "eco-scenario-v2", note: "Energy and carbon are scenario estimates unless a hardware energy meter is explicitly integrated.", sources: eco.sources } });
  } catch (error) { req.log?.error?.({ err: error }, "Code analysis failed"); return res.status(500).json({ error: "Analysis failed unexpectedly. Check server logs for details." }); }
});

export default router;
