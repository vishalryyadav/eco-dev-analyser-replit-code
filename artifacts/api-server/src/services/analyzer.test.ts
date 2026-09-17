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
  assert.equal(result.complexity.time, "O(n²)-like inferred");
  assert.ok(result.findings.some((item) => /membership/i.test(item.title)));
  assert.ok(result.alternatives.length >= 3);
});

test("detects sorting and proposes top-k", () => {
  const result = analyzeCode("function top(items){ return items.sort((a,b)=>a-b).slice(0, 10); }", "javascript");
  assert.equal(result.complexity.time, "O(n log n)-like inferred");
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

test("findings include auditable evidence and structural metrics", () => {
  const result = analyzeCode("function f(items) { for (const item of items) { if (items.includes(item)) console.log(item); } }", "javascript");
  assert.equal(result.structure.loops, 1);
  assert.ok(result.structure.calls >= 2);
  const finding = result.findings.find((item) => item.severity !== "info");
  assert.ok(finding);
  assert.match(String(finding?.ruleId), /^ECO-/);
  assert.equal(finding?.location?.line, finding?.line);
  assert.ok(finding?.evidence);
  assert.ok(finding?.recommendation);
  assert.ok(finding?.benchmarkRequired);
});

test("does not manufacture optimization alternatives without a matching rule", () => {
  const result = analyzeCode("function add(a,b){ return a + b; }", "javascript");
  assert.equal(result.alternatives.length, 0);
});

test("each emitted alternative names the finding that supports it", () => {
  const result = analyzeCode("function unique(items){ const out=[]; for (const item of items) if (!out.includes(item)) out.push(item); return out; }", "javascript");
  assert.ok(result.alternatives.length > 0);
  assert.ok(result.alternatives.every((item) => item.supportedBy && result.findings.some((finding) => finding.title === item.supportedBy)));
});

test("language-aware structural metrics recognize loops, conditionals, and declarations for all supported languages", () => {
  const cases = [
    ["javascript", "function work(items) { for (const item of items) { if (item) return item; } return null; }"] as const,
    ["typescript", "function work(items: number[]) { for (const item of items) { if (item) return item; } return null; }"] as const,
    ["python", "def work(items):\n    for item in items:\n        if item:\n            return item\n    return None"] as const,
    ["c", "int work(int *items, int n) { for (int i = 0; i < n; i++) { if (items[i]) return items[i]; } return 0; }"] as const,
    ["cpp", "int work(const std::vector<int>& items) { for (int item : items) { if (item) return item; } return 0; }"] as const,
    ["go", "func work(items []int) int { for _, item := range items { if item != 0 { return item } }; return 0 }"] as const,
  ];
  for (const [language, source] of cases) {
    const result = analyzeCode(source, language);
    assert.equal(result.language, language);
    assert.ok(result.structure.loops >= 1, `${language} loop`);
    assert.ok(result.structure.conditionals >= 1, `${language} conditional`);
    assert.ok(result.structure.functions >= 1, `${language} function`);
  }
});

test("language-aware nested loop and recursion inferences remain explicitly structural", () => {
  const nestedCases = [
    ["javascript", "function f(a){ for (const x of a) { for (const y of a) { console.log(x, y); } } }"] as const,
    ["typescript", "function f(a: number[]){ for (const x of a) { for (const y of a) { console.log(x, y); } } }"] as const,
    ["python", "def f(a):\n    for x in a:\n        for y in a:\n            print(x, y)"] as const,
    ["c", "void f(int *a, int n) { for (int i=0;i<n;i++) { for (int j=0;j<n;j++) printf(\"%d\", a[i]); } }"] as const,
    ["cpp", "void f(std::vector<int> a) { for (int x : a) { for (int y : a) std::cout << x + y; } }"] as const,
    ["go", "func f(a []int) { for _, x := range a { for _, y := range a { fmt.Println(x, y) } } }"] as const,
  ];
  for (const [language, source] of nestedCases) {
    const result = analyzeCode(source, language);
    assert.equal(result.structure.nestedLoops, 1, `${language} nested loop`);
    assert.equal(result.complexity.time, "O(n²)-like inferred");
    const finding = result.findings.find((item) => item.title === "Nested iteration hotspot");
    assert.match(finding?.effect ?? "", /INFERRED/);
    assert.equal(finding?.benchmarkRequired, true);
  }
  const recursion = analyzeCode("def fib(n):\n    if n < 2: return n\n    return fib(n - 1) + fib(n - 2)", "python");
  assert.ok(recursion.findings.some((item) => item.title === "Explosive recursive growth"));
});

test("membership and sorting only fire for language-supported source patterns", () => {
  const js = analyzeCode("function f(items) { for (const item of items) if (items.includes(item)) return item; }", "javascript");
  const python = analyzeCode("def f(items):\n    for item in items:\n        if item in items:\n            return item", "python");
  const cpp = analyzeCode("void f(std::vector<int> v) { for (int x : v) if (std::find(v.begin(), v.end(), x) != v.end()) {} std::sort(v.begin(), v.end()); }", "cpp");
  const go = analyzeCode("func f(v []int) { for _, x := range v { _ = slices.Contains(v, x) }; sort.Ints(v) }", "go");
  const c = analyzeCode("int f(int *v, int n) { qsort(v, n, sizeof(int), cmp); return n; }", "c");
  assert.ok(js.findings.some((item) => /membership/i.test(item.title)));
  assert.ok(python.findings.some((item) => /membership/i.test(item.title)));
  assert.ok(cpp.findings.some((item) => /membership/i.test(item.title)));
  assert.ok(go.findings.some((item) => /membership/i.test(item.title)));
  assert.ok(c.findings.some((item) => /sort/i.test(item.title)));
  assert.equal(c.capabilities.membershipScan, "UNAVAILABLE");
});

test("ordinary sequential loops and ordinary source do not trigger unrelated hotspot rules", () => {
  const sequential = analyzeCode("function totals(a, b) { let x = 0; for (const n of a) x += n; let y = 0; for (const n of b) y += n; return x + y; }", "javascript");
  assert.equal(sequential.structure.nestedLoops, 0);
  assert.equal(sequential.findings.some((item) => item.title === "Nested iteration hotspot"), false);
  assert.equal(sequential.findings.some((item) => /membership|sort|allocation/i.test(item.title)), false);
  const plainPython = analyzeCode("def add(a, b):\n    return a + b", "python");
  assert.equal(plainPython.alternatives.length, 0);
  assert.equal(plainPython.findings.some((item) => item.severity !== "info"), false);
});
