import type { ExecutionResult } from "./sandbox.ts";

export type CorrectnessStatus = "VERIFIED" | "PARTIAL" | "UNAVAILABLE";
export type CorrectnessReport = {
  status: CorrectnessStatus;
  reason: string;
  casesChecked: number;
  structuredOutput: "MATCHED" | "UNAVAILABLE" | "MISMATCH";
  deterministic: boolean;
};
export type RepresentativeRun = { caseId: string; result: ExecutionResult; expectedOutput?: string; expectedStructuredOutput?: unknown };
type ComparableRun = ExecutionResult | RepresentativeRun;

export function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
}

export function maximumRss(runs: ExecutionResult[]) {
  const values = runs.flatMap((run) => run.peakMemoryKb == null ? [] : [run.peakMemoryKb]);
  return values.length ? Math.max(...values) : null;
}

function output(run: ExecutionResult) { return run.stdout.replace(/\r\n/g, "\n").trim(); }
function completed(run: ExecutionResult | undefined): run is ExecutionResult { return run?.status === "completed"; }
function measured(run: ExecutionResult) { return completed(run) && run.measured === true; }
// Stable structured output may serialize object keys in a different order.
// Use the same canonical JSON-aware comparison as the baseline/candidate gate,
// while retaining exact matching for non-JSON output and exit status.
function stable(runs: ExecutionResult[]) { return runs.every((run) => outputsMatch(runs[0], run)); }

function normalizeRuns(runs: ComparableRun[]) {
  return runs.map((item): RepresentativeRun => "result" in item ? item : { caseId: "default", result: item });
}
function groupByCase(runs: RepresentativeRun[]) {
  const groups = new Map<string, RepresentativeRun[]>();
  for (const run of runs) groups.set(run.caseId, [...(groups.get(run.caseId) ?? []), run]);
  return groups;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}

function outputsMatch(left: ExecutionResult, right: ExecutionResult) {
  if (left.exitCode !== right.exitCode) return false;
  if (output(left) === output(right)) return true;
  try { return canonical(JSON.parse(output(left))) === canonical(JSON.parse(output(right))); } catch { return false; }
}

function structuredMatch(baseline: ExecutionResult[], candidate: ExecutionResult[]) {
  let checked = false;
  for (let index = 0; index < baseline.length; index += 1) {
    try {
      const left = JSON.parse(output(baseline[index]));
      const right = JSON.parse(output(candidate[index]));
      checked = true;
      if (canonical(left) !== canonical(right)) return "MISMATCH" as const;
    } catch {}
  }
  return checked ? "MATCHED" as const : "UNAVAILABLE" as const;
}

export function validateCorrectness(baseline: ComparableRun[], candidate: ComparableRun[]): CorrectnessReport {
  const left = normalizeRuns(baseline), right = normalizeRuns(candidate);
  if (!left.length || !right.length) return { status: "UNAVAILABLE", reason: "Both programs need completed representative runs before correctness can be assessed.", casesChecked: 0, structuredOutput: "UNAVAILABLE", deterministic: false };
  const baselineByCase = groupByCase(left), candidateByCase = groupByCase(right);
  if (baselineByCase.size !== candidateByCase.size || [...baselineByCase.keys()].some((id) => !candidateByCase.has(id))) return { status: "UNAVAILABLE", reason: "Baseline and candidate did not run the same representative input cases.", casesChecked: 0, structuredOutput: "UNAVAILABLE", deterministic: false };
  if (!left.every((item) => completed(item.result)) || !right.every((item) => completed(item.result))) return { status: "UNAVAILABLE", reason: "A baseline or candidate run did not complete, so correctness and savings are unavailable.", casesChecked: 0, structuredOutput: "UNAVAILABLE", deterministic: false };
  let deterministic = true, sameBehavior = true, structuredOutput: CorrectnessReport["structuredOutput"] = "UNAVAILABLE";
  for (const [caseId, baselineCases] of baselineByCase) {
    const candidateCases = candidateByCase.get(caseId)!;
    if (baselineCases.length !== candidateCases.length) return { status: "UNAVAILABLE", reason: "Each representative input needs the same number of baseline and candidate repeats.", casesChecked: 0, structuredOutput: "UNAVAILABLE", deterministic: false };
    const baselineResults = baselineCases.map((item) => item.result), candidateResults = candidateCases.map((item) => item.result);
    deterministic &&= stable(baselineResults) && stable(candidateResults);
    sameBehavior &&= baselineResults.every((run, index) => outputsMatch(run, candidateResults[index]));
    const structured = structuredMatch(baselineResults, candidateResults);
    if (structured === "MISMATCH") structuredOutput = "MISMATCH";
    else if (structured === "MATCHED" && structuredOutput !== "MISMATCH") structuredOutput = "MATCHED";
    for (const item of [...baselineCases, ...candidateCases]) {
      if (item.expectedOutput != null && output(item.result) !== item.expectedOutput.trim()) sameBehavior = false;
      if (item.expectedStructuredOutput != null) try { if (canonical(JSON.parse(output(item.result))) !== canonical(item.expectedStructuredOutput)) { sameBehavior = false; structuredOutput = "MISMATCH"; } } catch { sameBehavior = false; structuredOutput = "MISMATCH"; }
    }
  }
  const casesChecked = baselineByCase.size;
  if (!sameBehavior || structuredOutput === "MISMATCH") return { status: "PARTIAL", reason: "The supplied cases produced different exit status, stdout, or structured output. Review behavior before adoption.", casesChecked, structuredOutput, deterministic };
  if (!deterministic) return { status: "PARTIAL", reason: "The supplied cases were not deterministic, so matching output is insufficient correctness evidence.", casesChecked, structuredOutput, deterministic };
  if (left.length < 2) return { status: "PARTIAL", reason: "One matching run is only partial evidence; repeat each representative workload before claiming an improvement.", casesChecked, structuredOutput, deterministic };
  return { status: "VERIFIED", reason: "The baseline and candidate matched deterministically for the supplied representative cases. This is not proof of universal semantic equivalence.", casesChecked, structuredOutput, deterministic };
}

export function validateExpectedOutput(runs: ExecutionResult[], expectedOutput: string): CorrectnessReport {
  if (!runs.length || !runs.every(completed)) return { status: "UNAVAILABLE", reason: "The benchmark did not complete for every requested run.", casesChecked: 0, structuredOutput: "UNAVAILABLE", deterministic: false };
  const deterministic = stable(runs);
  if (!runs.every((run) => output(run) === expectedOutput.trim() && run.exitCode === 0)) return { status: "PARTIAL", reason: "The benchmark output or exit status did not match its deterministic workload expectation.", casesChecked: runs.length, structuredOutput: "UNAVAILABLE", deterministic };
  if (!deterministic || runs.length < 2) return { status: "PARTIAL", reason: "The expected output matched, but repeated deterministic evidence is incomplete.", casesChecked: runs.length, structuredOutput: "UNAVAILABLE", deterministic };
  return { status: "VERIFIED", reason: "Every repeated run matched the deterministic workload expectation.", casesChecked: runs.length, structuredOutput: "UNAVAILABLE", deterministic };
}

export function aggregateRuns(runs: ExecutionResult[]) {
  const completedRuns = runs.filter(completed);
  const wallValues = completedRuns.flatMap((run) => run.wallTimeMs == null ? [] : [run.wallTimeMs]);
  const cpuValues = completedRuns.flatMap((run) => run.cpuTimeMs == null ? [] : [run.cpuTimeMs]);
  const representative = completedRuns[0] ? { ...completedRuns[0], wallTimeMs: median(wallValues), cpuTimeMs: median(cpuValues), peakMemoryKb: maximumRss(completedRuns) } : runs[0] ?? null;
  return { representative, completed: completedRuns.length, wallTimeMs: median(wallValues), cpuTimeMs: median(cpuValues), peakMemoryKb: maximumRss(completedRuns) };
}

export function canPublishSavings(baseline: ExecutionResult[], candidate: ExecutionResult[], correctness: CorrectnessReport, baselineValue: number | null | undefined, candidateValue: number | null | undefined) {
  return correctness.status === "VERIFIED" && baseline.length >= 3 && candidate.length >= 3 && baseline.every(measured) && candidate.every(measured) && baselineValue != null && candidateValue != null && Number.isFinite(baselineValue) && Number.isFinite(candidateValue) && baselineValue > 0;
}
