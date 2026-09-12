import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCode, detectLanguage } from "./analyzer.ts";

test("detects JavaScript from explicit language and patterns", () => {
  assert.equal(detectLanguage("const x = 1;", "javascript").language, "javascript");
  assert.equal(detectLanguage("function add(a,b){ return a+b; }").language, "javascript");
});

test("detects Python", () => {
  assert.equal(detectLanguage("def add(a, b):\n    return a + b").language, "python");
});

test("detects C, C++, and Go", () => {
  assert.equal(detectLanguage("#include <stdio.h>\nint main(void){}", null).language, "c");
  assert.equal(detectLanguage("#include <iostream>\nint main(){}", null).language, "cpp");
  assert.equal(detectLanguage("package main\nfunc main() {}", null).language, "go");
});

test("flags nested loops and repeated membership scans", () => {
  const result = analyzeCode(`function unique(items) {\n  const out = [];\n  for (const a of items) {\n    for (const b of items) {\n      if (out.includes(a + b)) continue;\n    }\n  }\n  return out;\n}`, "javascript");
  assert.equal(result.complexity.time, "O(n²) inferred");
  assert.ok(result.findings.some((item) => /membership/i.test(item.title)));
  assert.ok(result.alternatives.length >= 3);
});

test("detects sorting and proposes top-k", () => {
  const result = analyzeCode("function top(items){ return items.sort((a,b)=>a-b).slice(0, 10); }", "javascript");
  assert.equal(result.complexity.time, "O(n log n) inferred");
  assert.ok(result.alternatives.some((item) => /top-k/i.test(item.title)));
});

test("different programs produce different static results", () => {
  const linear = analyzeCode("function add(a,b){ return a+b; }", "javascript");
  const nested = analyzeCode("function f(a){ for (const x of a) for (const y of a) console.log(x,y); }", "javascript");
  assert.notEqual(linear.complexity.time, nested.complexity.time);
  assert.notEqual(linear.score, nested.score);
});

test("submission size metadata is dynamic", () => {
  const source = "const a = 1;\nconst b = 2;";
  const result = analyzeCode(source, "javascript");
  assert.equal(result.lines, 2);
  assert.equal(result.bytes, Buffer.byteLength(source, "utf8"));
});

test("flags a source file that ends with an unfinished control statement", () => {
  const result = analyzeCode("int main(void) {\n  if (data == NULL)", "c");
  assert.ok(result.findings.some((item) => item.title === "Source appears incomplete"));
});
