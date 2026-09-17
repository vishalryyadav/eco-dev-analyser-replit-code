import assert from "node:assert/strict";
import test from "node:test";
import { aggregateRuns, canPublishSavings, maximumRss, median, validateCorrectness } from "./benchmark-harness.ts";
import { benchmarkAvailability, createBenchmarkWorkload, getBenchmark, listBenchmarks, runBenchmark } from "./benchmarks.ts";
import type { ExecutionResult } from "./sandbox.ts";

function run(overrides: Partial<ExecutionResult> = {}): ExecutionResult {
  return { status: "completed", stdout: "42\n", stderr: "", exitCode: 0, signal: null, wallTimeMs: 10, cpuTimeMs: 5, peakMemoryKb: 128, measured: true, sandbox: "bubblewrap", ...overrides };
}

test("built-in benchmark suite contains deterministic JavaScript workloads and explicit language availability", () => {
  const suite = listBenchmarks();
  assert.deepEqual(suite.map((item) => item.id), ["ECO-01", "ECO-02", "ECO-03", "ECO-04", "ECO-05", "ECO-06"]);
  assert.ok(suite.every((item) => item.language === "javascript" && item.status === "IMPLEMENTED" && item.inputSizes.length > 0));
  assert.deepEqual(benchmarkAvailability(), [
    { language: "javascript", status: "IMPLEMENTED" },
    { language: "typescript", status: "UNAVAILABLE" },
    { language: "python", status: "UNAVAILABLE" },
    { language: "c", status: "UNAVAILABLE" },
    { language: "cpp", status: "UNAVAILABLE" },
    { language: "go", status: "UNAVAILABLE" },
  ]);
});

test("benchmark workloads are generated deterministically from documented input sizes", () => {
  const first = createBenchmarkWorkload("ECO-01", 1000);
  const second = createBenchmarkWorkload("eco-01", 1000);
  assert.equal(first?.code, second?.code);
  assert.match(first?.code ?? "", /const inputSize = 1000/);
  assert.equal(first?.expectedOutput, "499500");
  assert.equal(createBenchmarkWorkload("ECO-01", 123), null);
  assert.equal(getBenchmark("missing"), null);
});

test("three-run benchmark reports median timing, maximum RSS, and expected-output correctness", async () => {
  const values = [run({ wallTimeMs: 9, cpuTimeMs: 4, peakMemoryKb: 100, stdout: "4950\n" }), run({ wallTimeMs: 11, cpuTimeMs: 6, peakMemoryKb: 200, stdout: "4950\n" }), run({ wallTimeMs: 10, cpuTimeMs: 5, peakMemoryKb: 150, stdout: "4950\n" })];
  let calls = 0;
  const result = await runBenchmark("ECO-01", { inputSize: 100, warmups: 0, iterations: 3, execute: async () => ({ compile: null, execution: values[calls++] }) });
  assert.equal(result.status, "completed");
  assert.equal(result.samples.iterationsCompleted, 3);
  assert.equal(result.samples.medianWallTimeMs, 10);
  assert.equal(result.samples.medianCpuTimeMs, 5);
  assert.equal(result.samples.maximumRssKb, 200);
  assert.equal(result.correctness.status, "VERIFIED");
});

test("one, three, and five selected runs produce exactly that many attempted executions", async () => {
  for (const iterations of [1, 3, 5]) {
    let calls = 0;
    const result = await runBenchmark("ECO-01", {
      inputSize: 100,
      warmups: 0,
      iterations,
      execute: async () => {
        calls += 1;
        return { compile: null, execution: run({ stdout: "4950\n" }) };
      },
    });
    if (!("samples" in result) || !result.samples) throw new Error("Expected a completed benchmark result");
    const samples = result.samples;
    assert.equal(calls, iterations);
    assert.equal(samples.iterationsRequested, iterations);
    assert.equal(samples.runs, iterations);
    assert.equal(samples.iterationsCompleted, iterations);
  }
});

test("harness calculates medians and maximum RSS without inventing missing telemetry", () => {
  const runs = [run({ wallTimeMs: 3, cpuTimeMs: null, peakMemoryKb: 20 }), run({ wallTimeMs: 1, cpuTimeMs: 4, peakMemoryKb: 80 }), run({ wallTimeMs: 2, cpuTimeMs: 2, peakMemoryKb: null })];
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(maximumRss(runs), 80);
  const aggregate = aggregateRuns(runs);
  assert.equal(aggregate.wallTimeMs, 2);
  assert.equal(aggregate.cpuTimeMs, 4);
  assert.equal(aggregate.peakMemoryKb, 80);
});

test("correctness needs repeated deterministic matching cases and recognizes structured output", () => {
  const baseline = [run({ stdout: '{"value":42}\n' }), run({ stdout: '{"value":42}\n' }), run({ stdout: '{"value":42}\n' })];
  const candidate = [run({ stdout: '{"value":42}\n' }), run({ stdout: '{"value":42}\n' }), run({ stdout: '{"value":42}\n' })];
  const report = validateCorrectness(baseline, candidate);
  assert.equal(report.status, "VERIFIED");
  assert.equal(report.structuredOutput, "MATCHED");
  assert.equal(report.deterministic, true);
});

test("correctness groups deterministic repeats by representative input and checks declared output", () => {
  const baseline = [
    { caseId: "small", result: run({ stdout: '{"value":1,"items":[2]}\n' }), expectedStructuredOutput: { items: [2], value: 1 } },
    { caseId: "small", result: run({ stdout: '{"items":[2],"value":1}\n' }), expectedStructuredOutput: { value: 1, items: [2] } },
    { caseId: "large", result: run({ stdout: "10\n" }), expectedOutput: "10" },
    { caseId: "large", result: run({ stdout: "10\n" }), expectedOutput: "10" },
  ];
  const candidate = [
    { caseId: "small", result: run({ stdout: '{"items":[2],"value":1}\n' }), expectedStructuredOutput: { value: 1, items: [2] } },
    { caseId: "small", result: run({ stdout: '{"value":1,"items":[2]}\n' }), expectedStructuredOutput: { items: [2], value: 1 } },
    { caseId: "large", result: run({ stdout: "10\n" }), expectedOutput: "10" },
    { caseId: "large", result: run({ stdout: "10\n" }), expectedOutput: "10" },
  ];
  const report = validateCorrectness(baseline, candidate);
  assert.equal(report.status, "VERIFIED");
  assert.equal(report.casesChecked, 2);
  assert.equal(report.structuredOutput, "MATCHED");
});

test("declared representative expectations and output-limited runs cannot validate or publish savings", () => {
  const expected = [{ caseId: "input-1", result: run({ stdout: "wrong\n" }), expectedOutput: "right" }, { caseId: "input-1", result: run({ stdout: "wrong\n" }), expectedOutput: "right" }];
  assert.equal(validateCorrectness(expected, expected).status, "PARTIAL");
  const limited = [run({ status: "output_limit", measured: false }), run(), run()];
  assert.equal(validateCorrectness([run(), run(), run()], limited).status, "UNAVAILABLE");
  assert.equal(canPublishSavings([run(), run(), run()], limited, validateCorrectness([run(), run(), run()], limited), 10, 5), false);
});

test("incorrect, failed, and timed-out comparisons never verify correctness or publish savings", () => {
  const baseline = [run(), run(), run()];
  const incorrect = [run({ stdout: "41\n" }), run({ stdout: "41\n" }), run({ stdout: "41\n" })];
  const failed = [run({ status: "runtime_error", measured: false }), run(), run()];
  const timeout = [run({ status: "timeout", measured: false }), run(), run()];
  const incorrectReport = validateCorrectness(baseline, incorrect);
  assert.equal(incorrectReport.status, "PARTIAL");
  assert.equal(validateCorrectness(baseline, failed).status, "UNAVAILABLE");
  assert.equal(validateCorrectness(baseline, timeout).status, "UNAVAILABLE");
  assert.equal(canPublishSavings(baseline, incorrect, incorrectReport, 10, 5), false);
  assert.equal(canPublishSavings(baseline, failed, validateCorrectness(baseline, failed), 10, 5), false);
  assert.equal(canPublishSavings(baseline, timeout, validateCorrectness(baseline, timeout), 10, 5), false);
});

test("unavailable telemetry and a single matching run suppress before-after savings", () => {
  const oneRun = [run()];
  const report = validateCorrectness(oneRun, oneRun);
  assert.equal(report.status, "PARTIAL");
  assert.equal(canPublishSavings(oneRun, oneRun, report, 10, 5), false);
  const unavailable = [run({ wallTimeMs: null })];
  assert.equal(canPublishSavings([run(), run(), run()], [unavailable[0], unavailable[0], unavailable[0]], validateCorrectness([run(), run(), run()], [unavailable[0], unavailable[0], unavailable[0]]), 10, null), false);
});
