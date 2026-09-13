import assert from "node:assert/strict";
import test from "node:test";
import { getBenchmark, listBenchmarks } from "./benchmarks";

test("built-in benchmark suite contains ECO-01 through ECO-06", () => {
  const suite = listBenchmarks();
  assert.deepEqual(suite.map((item) => item.id), ["ECO-01", "ECO-02", "ECO-03", "ECO-04", "ECO-05", "ECO-06"]);
  assert.ok(suite.every((item) => item.language === "javascript"));
  assert.ok(suite.every((item) => { const benchmark = getBenchmark(item.id); return Boolean(benchmark && benchmark.code.length > 20); }));
  assert.ok(suite.every((item) => Boolean(item.expected.time && item.expected.space && item.expected.output)));
});

test("benchmark lookup is case-insensitive and unknown cases are explicit", () => {
  assert.equal(getBenchmark("eco-04")?.title, "Fibonacci");
  assert.equal(getBenchmark("missing"), null);
});
