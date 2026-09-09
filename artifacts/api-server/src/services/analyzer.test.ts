import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCode, detectLanguage } from "./analyzer";

test("detects JavaScript from explicit language and patterns", () => {
  assert.equal(detectLanguage("const x = 1;", "javascript").language, "javascript");
  assert.equal(detectLanguage("function add(a,b){ return a+b; }").language, "javascript");
});

test("detects Python", () => {
  assert.equal(detectLanguage("def add(a, b):\n    return a + b").language, "python");
});

test("flags nested loops and repeated membership scans", () => {
  const result = analyzeCode(`function unique(items) {\n  const out = [];\n  for (const a of items) {\n    for (const b of items) {\n      if (out.includes(a + b)) continue;\n    }\n  }\n  return out;\n}`, "javascript");
  assert.equal(result.complexity.time, "O(n²) inferred");
  assert.ok(result.findings.some((item) => /membership/i.test(item.title)));
  assert.ok(result.alternatives.length >= 3);
});

test("different source programs produce different static results", () => {
  const linear = analyzeCode("function add(a,b){ return a+b; }", "javascript");
  const nested = analyzeCode("function f(a){ for (const x of a) for (const y of a) console.log(x,y); }", "javascript");
  assert.notEqual(linear.complexity.time, nested.complexity.time);
  assert.notEqual(linear.score, nested.score);
});

test("enforces concrete submission measurements such as bytes and line count", () => {
  const result = analyzeCode("const a = 1;\nconst b = 2;", "javascript");
  assert.equal(result.lines, 2);
  assert.equal(result.bytes, Buffer.byteLength("const a = 1;\nconst b = 2;", "utf8"));
});
