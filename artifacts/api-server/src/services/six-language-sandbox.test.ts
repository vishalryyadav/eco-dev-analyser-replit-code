import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { analyzeCode, normalizeLanguage, type SupportedLanguage } from "./analyzer.ts";
import { ecoEstimate } from "./eco.ts";
import { greenScore } from "./green-score.ts";
import { measurementMetadata } from "./measurement-metadata.ts";
import { executeCode, executionLimits, type ExecutionResult } from "./sandbox.ts";

type MatrixCase = { language: SupportedLanguage; name: string; code: string; stdout: string; compiles: boolean };

// Fixed programs and fixed expected output keep this validation deterministic.
const matrix: MatrixCase[] = [
  { language: "javascript", name: "JavaScript / Node", code: "console.log('ecodev-js-ok');", stdout: "ecodev-js-ok", compiles: false },
  { language: "typescript", name: "TypeScript / configured tsc", code: "const message: string = 'ecodev-ts-ok';\nconsole.log(message);", stdout: "ecodev-ts-ok", compiles: true },
  { language: "python", name: "Python / python3", code: "print('ecodev-py-ok')", stdout: "ecodev-py-ok", compiles: false },
  { language: "c", name: "C / gcc", code: "#include <stdio.h>\nint main(void) { puts(\"ecodev-c-ok\"); return 0; }", stdout: "ecodev-c-ok", compiles: true },
  { language: "cpp", name: "C++ / g++", code: "#include <iostream>\nint main() { std::cout << \"ecodev-cpp-ok\\n\"; return 0; }", stdout: "ecodev-cpp-ok", compiles: true },
  { language: "go", name: "Go / go build", code: "package main\nimport \"fmt\"\nfunc main() { fmt.Println(\"ecodev-go-ok\") }", stdout: "ecodev-go-ok", compiles: true },
];

function missingRuntime(result: ExecutionResult | null) {
  return (result?.status === "compile_error" || result?.status === "runtime_error")
    && /(?:not found|no such file|not recognized)/i.test(result.stderr);
}

function skipUnavailable(t: TestContext, result: ExecutionResult | null, language: string) {
  if (result?.status === "sandbox_unavailable") { t.skip(`${language}: ${result.stderr}`); return true; }
  if (missingRuntime(result)) { t.skip(`${language}: required configured compiler/runtime is unavailable: ${result?.stderr}`); return true; }
  return false;
}

for (const item of matrix) {
  test(`production sandbox validation: ${item.name}`, async (t) => {
    const run = await executeCode(item.code, item.language);
    if (skipUnavailable(t, run.compile ?? run.execution, item.name)) return;

    if (item.compiles) {
      assert.ok(run.compile, `${item.name} must use its configured compilation path`);
      assert.equal(run.compile.status, "completed", run.compile.stderr);
      assert.equal(run.compile.exitCode, 0);
    } else assert.equal(run.compile, null);

    assert.ok(run.execution, `${item.name} must return an execution result`);
    if (skipUnavailable(t, run.execution, item.name)) return;
    assert.equal(run.execution.status, "completed", run.execution.stderr);
    assert.equal(run.execution.exitCode, 0);
    assert.equal(run.execution.stdout.trim(), item.stdout);
    assert.equal(run.execution.measured, true);
    assert.ok(run.execution.wallTimeMs != null && run.execution.wallTimeMs >= 0, "sandbox-run wall time must be measured");

    const analysis = analyzeCode(item.code, item.language);
    const eco = ecoEstimate(run.execution);
    const metadata = measurementMetadata(analysis, run.execution, run.compile, eco, greenScore(analysis, run.execution, eco, executionLimits));
    assert.equal(metadata.wallTime.classification, "MEASURED");
    assert.equal(metadata.cpuTime.classification, run.execution.cpuTimeMs == null ? "UNAVAILABLE" : "MEASURED");
    assert.equal(metadata.peakRss.classification, run.execution.peakMemoryKb == null ? "UNAVAILABLE" : "MEASURED");
    assert.equal(metadata.energy.classification, "MODELED / ESTIMATED");
    assert.equal(metadata.carbon.classification, "MODELED / ESTIMATED");
  });
}

test("production sandbox validation: runtime failure remains a failure", async (t) => {
  const run = await executeCode("throw new Error('ecodev-runtime-failure');", "javascript");
  if (skipUnavailable(t, run.execution, "JavaScript runtime failure")) return;
  assert.ok(run.execution);
  assert.equal(run.execution.status, "runtime_error");
  assert.equal(run.execution.measured, false);
});

test("production sandbox validation: timeout remains bounded", async (t) => {
  const run = await executeCode("for (;;) {}", "javascript");
  if (skipUnavailable(t, run.execution, "JavaScript timeout")) return;
  assert.ok(run.execution);
  assert.equal(run.execution.status, "timeout");
  assert.equal(run.execution.measured, false);
});

test("production sandbox validation: output remains bounded", async (t) => {
  const run = await executeCode("console.log('x'.repeat(40000));", "javascript");
  if (skipUnavailable(t, run.execution, "JavaScript output limit")) return;
  assert.ok(run.execution);
  assert.equal(run.execution.status, "output_limit");
  assert.equal(run.execution.measured, false);
  assert.match(run.execution.stderr, /output limit exceeded/i);
});

test("production sandbox validation: unsupported language remains rejected before execution", () => {
  assert.equal(normalizeLanguage("rust"), null);
  assert.equal(normalizeLanguage("JavaScript"), "javascript");
});
