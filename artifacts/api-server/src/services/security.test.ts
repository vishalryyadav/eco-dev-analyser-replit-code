import assert from "node:assert/strict";
import test from "node:test";
import { securityAnalyze } from "./security.ts";

test("flags dynamic evaluation and shell execution", () => {
  const result = securityAnalyze("eval(input); child_process.exec(cmd);", "javascript");
  assert.ok(result.score < 70);
  assert.ok(result.findings.some((f) => f.title === "Dynamic code execution"));
  assert.ok(result.findings.some((f) => f.title === "Shell/process invocation"));
});

test("does not report an obvious warning for ordinary arithmetic", () => {
  const result = securityAnalyze("console.log(2 + 2);", "javascript");
  assert.equal(result.score, 100);
  assert.equal(result.findings[0].severity, "info");
});
