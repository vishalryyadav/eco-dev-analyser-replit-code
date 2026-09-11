import assert from "node:assert/strict";
import test from "node:test";
import { analyzeProject } from "./project.ts";

test("project scan aggregates different files and identifies a hotspot", () => {
  const result = analyzeProject([
    { path: "src/fast.js", code: "function add(a,b){ return a+b; }" },
    { path: "src/hot.js", code: "function find(a){ for (const x of a) for (const y of a) console.log(x,y); }" },
  ]);
  assert.equal(result.filesScanned, 2);
  assert.ok(result.hotspots.some((item) => item.path.endsWith("hot.js") && item.complexity.includes("n²")));
  assert.ok(result.totalLines >= 2);
});
