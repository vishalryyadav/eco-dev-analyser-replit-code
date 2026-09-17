import { Router } from "express";
import { analyzeCode, normalizeLanguage } from "../services/analyzer";
import { executeCode, type ExecutionResult, executionLimits } from "../services/sandbox";
import { normalizeProfile, normalizePriorityWeights, rankAlternatives, type OptimizationProfile } from "../services/preferences";
import { securityAnalyze } from "../services/security";
import { ecoEstimate, type EcoOptions } from "../services/eco";
import { greenScore } from "../services/green-score";
import { measurementMetadata } from "../services/measurement-metadata";
import { aggregateRuns, canPublishSavings, validateCorrectness, type RepresentativeRun } from "../services/benchmark-harness";

const router = Router();
const MAX_CODE_BYTES = 200_000;

type RunPayload = { code?: unknown; language?: unknown; compareCode?: unknown; compareLanguage?: unknown; execute?: unknown; preferences?: unknown; eco?: unknown; benchmarkIterations?: unknown; representativeInputs?: unknown };

function summarize(execution: ExecutionResult | null) { if (!execution) return null; return { status: execution.status, stdout: execution.stdout, stderr: execution.stderr, exitCode: execution.exitCode, signal: execution.signal, wallTimeMs: execution.wallTimeMs == null ? null : Number(execution.wallTimeMs.toFixed(3)), cpuTimeMs: execution.cpuTimeMs == null ? null : Number(execution.cpuTimeMs.toFixed(3)), peakMemoryKb: execution.peakMemoryKb, measured: execution.measured, sandbox: execution.sandbox }; }
function profileFromPayload(value: unknown): OptimizationProfile { if (!value || typeof value !== "object") return "balanced"; return normalizeProfile((value as { profile?: unknown }).profile); }
function prioritiesFromPayload(value: unknown, profile: OptimizationProfile) { if (!value || typeof value !== "object") return normalizePriorityWeights(null, profile); return normalizePriorityWeights((value as { weights?: unknown }).weights, profile); }
function weightSourceFromPayload(value: unknown): "profile" | "custom" | "reset" {
  if (!value || typeof value !== "object") return "profile";
  const input = value as { weightSource?: unknown; weights?: unknown };
  if (input.weightSource === "profile" || input.weightSource === "custom" || input.weightSource === "reset") return input.weightSource;
  return input.weights && typeof input.weights === "object" ? "custom" : "profile";
}
function sameWeights(left: ReturnType<typeof normalizePriorityWeights>, right: ReturnType<typeof normalizePriorityWeights>) {
  return Object.keys(left).every((key) => left[key as keyof typeof left] === right[key as keyof typeof right]);
}
function ecoOptionsFromPayload(value: unknown): EcoOptions {
  if (!value || typeof value !== "object") return {};
  const input = value as Record<string, unknown>;
  return { region: typeof input.region === "string" ? input.region.slice(0, 80) : undefined, gridFactorGPerKwh: Number.isFinite(Number(input.gridFactorGPerKwh)) ? Number(input.gridFactorGPerKwh) : undefined, gridSource: typeof input.gridSource === "string" ? input.gridSource.slice(0, 240) : undefined, gridYear: typeof input.gridYear === "string" || typeof input.gridYear === "number" ? input.gridYear : undefined, functionalUnit: typeof input.functionalUnit === "string" ? input.functionalUnit.slice(0, 80) : undefined, functionalUnitCount: Number.isFinite(Number(input.functionalUnitCount)) ? Number(input.functionalUnitCount) : undefined, embodiedEmissionsGrams: Number.isFinite(Number(input.embodiedEmissionsGrams)) ? Number(input.embodiedEmissionsGrams) : undefined, embodiedEmissionsSource: typeof input.embodiedEmissionsSource === "string" ? input.embodiedEmissionsSource.slice(0, 240) : undefined };
}
function improvementPercent(before: number | null, after: number | null, beforeValid: boolean, afterValid: boolean) {
  if (!beforeValid || !afterValid || before == null || after == null || before <= 0) return null;
  return Number((((before - after) / before) * 100).toFixed(2));
}
function representativeInputs(value: unknown): string[] | null {
  if (value == null) return [""];
  if (!Array.isArray(value) || !value.length || value.length > 8 || !value.every((item) => typeof item === "string" && Buffer.byteLength(item, "utf8") <= 32_000)) return null;
  return value;
}

router.post("/analyze", async (req, res) => {
  try {
    const body = req.body as RunPayload;
    if (!body || typeof body !== "object") return res.status(400).json({ error: "Invalid JSON request body" });
    if (typeof body.code !== "string") return res.status(400).json({ error: "code must be a string" });
    if (!body.code.trim()) return res.status(400).json({ error: "code cannot be empty" });
    if (Buffer.byteLength(body.code, "utf8") > MAX_CODE_BYTES) return res.status(413).json({ error: `code exceeds the ${MAX_CODE_BYTES} byte limit` });
    if (body.language != null && typeof body.language !== "string") return res.status(400).json({ error: "language must be a string when provided" });
    if (body.compareCode != null && typeof body.compareCode !== "string") return res.status(400).json({ error: "compareCode must be a string when provided" });
    if (body.compareLanguage != null && typeof body.compareLanguage !== "string") return res.status(400).json({ error: "compareLanguage must be a string when provided" });
    if (body.execute !== undefined && typeof body.execute !== "boolean") return res.status(400).json({ error: "execute must be boolean" });
    const inputs = representativeInputs(body.representativeInputs);
    if (!inputs) return res.status(400).json({ error: "representativeInputs must be an array of 1 to 8 strings, each at most 32 KB" });
    const iterationsRaw = body.benchmarkIterations == null ? 3 : Number(body.benchmarkIterations);
    if (!Number.isInteger(iterationsRaw) || iterationsRaw < 1 || iterationsRaw > 5) return res.status(400).json({ error: "benchmarkIterations must be an integer from 1 to 5" });
    const profile = profileFromPayload(body.preferences);
    const priorityWeights = prioritiesFromPayload(body.preferences, profile);
    const requestedWeightSource = weightSourceFromPayload(body.preferences);
    const profileWeights = normalizePriorityWeights(null, profile);
    const resetWeights = normalizePriorityWeights({ runtime: 50, memory: 50, energy: 50, carbon: 50, readable: 50, maintain: 50, secure: 50, reliable: 50, scalable: 50, portable: 50 }, profile);
    const weightSource = requestedWeightSource === "profile" && sameWeights(priorityWeights, profileWeights) ? "profile"
      : requestedWeightSource === "reset" && sameWeights(priorityWeights, resetWeights) ? "reset"
      : "custom";
    const ecoOptions = ecoOptionsFromPayload(body.eco);
    const requestedLanguage = body.language == null ? null : normalizeLanguage(body.language);
    if (body.language != null && !requestedLanguage) return res.status(400).json({ error: "Unsupported language. Use JavaScript, TypeScript, Python, C, C++, or Go." });
    const analysis = analyzeCode(body.code, requestedLanguage);
    const security = securityAnalyze(body.code, analysis.language);
    const instruction = typeof body.preferences === "object" && body.preferences ? (body.preferences as { instruction?: unknown }).instruction : null;
    analysis.alternatives = rankAlternatives(analysis.alternatives, profile, priorityWeights, instruction);
    if (!requestedLanguage && analysis.confidence === "low") return res.status(422).json({ error: "Language could not be inferred confidently. Select a language explicitly." });

    let compile: ExecutionResult | null = null, execution: ExecutionResult | null = null;
    let benchmarkSamples: ExecutionResult[] = [];
    let correctnessSamples: RepresentativeRun[] = [];
    const runEnabled = body.execute !== false;
    if (runEnabled) {
      for (let caseIndex = 0; caseIndex < inputs.length; caseIndex += 1) {
        for (let index = 0; index < iterationsRaw; index += 1) {
          const next = await executeCode(body.code, analysis.language, { input: inputs[caseIndex] });
          compile ??= next.compile;
          if (next.execution) { benchmarkSamples.push(next.execution); correctnessSamples.push({ caseId: `input-${caseIndex + 1}`, result: next.execution }); }
          if (next.execution?.status !== "completed") break;
        }
        if (correctnessSamples.at(-1)?.result.status !== "completed") break;
      }
      execution = aggregateRuns(benchmarkSamples).representative;
    }

    let comparison = null, compare: string | null = null;
    if (typeof body.compareCode === "string" && body.compareCode.trim()) { if (Buffer.byteLength(body.compareCode, "utf8") > MAX_CODE_BYTES) return res.status(413).json({ error: `compareCode exceeds the ${MAX_CODE_BYTES} byte limit` }); compare = body.compareCode; }
    if (compare) {
      const compareLanguage = body.compareLanguage == null ? analysis.language : normalizeLanguage(body.compareLanguage);
      if (!compareLanguage) return res.status(400).json({ error: "Unsupported compareLanguage. Use JavaScript, TypeScript, Python, C, C++, or Go." });
      const compareAnalysis = analyzeCode(compare, compareLanguage); compareAnalysis.alternatives = rankAlternatives(compareAnalysis.alternatives, profile, priorityWeights, instruction);
      const compareRuns: ExecutionResult[] = [];
      const compareCorrectnessSamples: RepresentativeRun[] = [];
      let compareRun = { compile: null as ExecutionResult | null, execution: null as ExecutionResult | null };
      if (runEnabled) for (let caseIndex = 0; caseIndex < inputs.length; caseIndex += 1) {
        for (let index = 0; index < iterationsRaw; index += 1) {
          const next = await executeCode(compare, compareAnalysis.language, { input: inputs[caseIndex] });
          compareRun.compile ??= next.compile;
          if (next.execution) { compareRun.execution = next.execution; compareRuns.push(next.execution); compareCorrectnessSamples.push({ caseId: `input-${caseIndex + 1}`, result: next.execution }); }
          if (next.execution?.status !== "completed") break;
        }
        if (compareCorrectnessSamples.at(-1)?.result.status !== "completed") break;
      }
      compareRun = { ...compareRun, execution: aggregateRuns(compareRuns).representative };
      const beforeRuntime = execution?.wallTimeMs ?? null, afterRuntime = compareRun.execution?.wallTimeMs ?? null, beforeCpu = execution?.cpuTimeMs ?? null, afterCpu = compareRun.execution?.cpuTimeMs ?? null, beforeMemory = execution?.peakMemoryKb ?? null, afterMemory = compareRun.execution?.peakMemoryKb ?? null;
      const beforeEco = ecoEstimate(execution, ecoOptions), afterEco = ecoEstimate(compareRun.execution, ecoOptions);
      const correctnessReport = validateCorrectness(correctnessSamples, compareCorrectnessSamples);
      const beforeGreen = greenScore(analysis, execution, beforeEco, executionLimits), afterGreen = greenScore(compareAnalysis, compareRun.execution, afterEco, executionLimits);
      const validWall = canPublishSavings(benchmarkSamples, compareRuns, correctnessReport, beforeRuntime, afterRuntime);
      const validCpu = canPublishSavings(benchmarkSamples, compareRuns, correctnessReport, beforeCpu, afterCpu);
      const validMemory = canPublishSavings(benchmarkSamples, compareRuns, correctnessReport, beforeMemory, afterMemory);
      const validEco = canPublishSavings(benchmarkSamples, compareRuns, correctnessReport, beforeEco.carbonGrams, afterEco.carbonGrams);
      const validGreen = canPublishSavings(benchmarkSamples, compareRuns, correctnessReport, beforeGreen.score, afterGreen.score);
      const optimization = correctnessReport.status === "VERIFIED" ? "BENCHMARK_COMPLETED" : correctnessReport.status === "PARTIAL" ? "BENCHMARK_REQUIRED" : "BENCHMARK_UNAVAILABLE";
      comparison = { baseline: { execution: summarize(execution), eco: beforeEco, greenScore: beforeGreen }, analysis: compareAnalysis, compile: summarize(compareRun.compile), execution: summarize(compareRun.execution), eco: afterEco, greenScore: afterGreen, correctness: correctnessReport, benchmark: { status: optimization, requestedRuns: iterationsRaw, baselineRuns: benchmarkSamples.length, candidateRuns: compareRuns.length, representativeCases: inputs.length }, optimization, delta: { runtimeMs: validWall ? Number((afterRuntime! - beforeRuntime!).toFixed(3)) : null, runtimePercent: improvementPercent(beforeRuntime, afterRuntime, validWall, validWall), cpuTimeMs: validCpu ? Number((afterCpu! - beforeCpu!).toFixed(3)) : null, cpuTimePercent: improvementPercent(beforeCpu, afterCpu, validCpu, validCpu), peakMemoryKb: validMemory ? afterMemory! - beforeMemory! : null, peakMemoryPercent: improvementPercent(beforeMemory, afterMemory, validMemory, validMemory), carbonGrams: validEco ? Number((afterEco.carbonGrams! - beforeEco.carbonGrams!).toFixed(6)) : null, carbonPercent: improvementPercent(beforeEco.carbonGrams, afterEco.carbonGrams, validEco, validEco), greenScore: validGreen ? Number((afterGreen.score! - beforeGreen.score!).toFixed(2)) : null, greenScorePercent: validGreen && beforeGreen.score !== 0 ? Number((((afterGreen.score! - beforeGreen.score!) / beforeGreen.score!) * 100).toFixed(2)) : null }, evidence: { wallTime: validWall ? "MEASURED" : "UNAVAILABLE", cpuTime: validCpu ? "MEASURED" : "UNAVAILABLE", peakMemory: validMemory ? "MEASURED" : "UNAVAILABLE", energyCarbon: validEco ? "MODELED" : "UNAVAILABLE", greenScore: validGreen ? "CALCULATED" : "UNAVAILABLE" } };
    }

    const eco = ecoEstimate(execution, ecoOptions);
    // A compile failure is execution evidence, not an opted-out execution.
    // Preserve the distinction so a failed run cannot receive a static-only
    // Green Score.
    const greenExecution = execution ?? (runEnabled && compile ? { status: compile.status, measured: false, cpuTimeMs: null, peakMemoryKb: null } : null);
    const green = greenScore(analysis, greenExecution, eco, executionLimits);
    if (compile?.status === "compile_error") eco.basis = "Program execution was skipped because compilation failed. Fix the compiler errors and analyze again to measure program runtime, electricity, and carbon scenarios.";
    const metadata = measurementMetadata(analysis, execution, compile, eco, green);
    return res.json({ ok: true, submission: { language: analysis.language, detectionConfidence: analysis.confidence, bytes: analysis.bytes, lines: analysis.lines }, analysis, security, compile: summarize(compile), execution: summarize(execution), eco, greenScore: green, measurementMetadata: metadata, comparison, preferences: { profile, weights: priorityWeights, weightSource, instruction, rankedBy: weightSource === "profile" ? profile : `priority weights (${weightSource})` }, limits: executionLimits, benchmark: { iterationsRequested: iterationsRaw, samplesCollected: benchmarkSamples.length || (execution?.wallTimeMs != null ? 1 : 0), representativeCases: inputs.length, strategy: iterationsRaw > 1 ? "median wall/CPU; max observed RSS" : "single run" }, model: { version: "eco-scenario-v2", note: "Energy and carbon are scenario estimates unless a hardware energy meter is explicitly integrated.", sources: eco.sources } });
  } catch (error) { req.log?.error?.({ err: error }, "Code analysis failed"); return res.status(500).json({ error: "Analysis failed unexpectedly. Check server logs for details." }); }
});

export default router;
