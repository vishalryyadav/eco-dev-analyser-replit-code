import assert from "node:assert/strict";
import test from "node:test";
import { normalizeProfile, rankAlternatives } from "./preferences.ts";

test("normalizes supported and unsupported profiles safely", () => {
  assert.equal(normalizeProfile("green"), "green");
  assert.equal(normalizeProfile("unknown"), "balanced");
});

test("green profile prioritizes energy-aware alternatives", () => {
  const alternatives = [
    { id: "a", title: "Readable simple implementation", description: "Simple readable code", expectedRuntimeChange: "Similar runtime", expectedMemoryChange: "Similar memory", simplicity: "High", readability: "High", maintainability: "High", portability: "High", projectedEnergyChange: "Potentially higher energy", projectedCarbonChange: "Potentially higher emissions" },
    { id: "b", title: "Streaming one-pass", description: "Use bounded streaming to reduce memory and repeated work", expectedRuntimeChange: "Often faster for large inputs", expectedMemoryChange: "Lower memory", simplicity: "Medium", readability: "High", maintainability: "High", portability: "High", projectedEnergyChange: "Potentially lower energy", projectedCarbonChange: "Potentially lower emissions" },
  ];
  assert.equal(rankAlternatives(alternatives, "green")[0].id, "b");
});

import { normalizePriorityWeights } from "./preferences.ts";

test("custom weights are clamped and can change ranking", () => {
  const weights = normalizePriorityWeights({ runtime: 150, memory: -10, carbon: 80 }, "balanced");
  assert.equal(weights.runtime, 100);
  assert.equal(weights.memory, 0);
  assert.equal(weights.carbon, 80);
  const alternatives = [
    { id: "readable", title: "Readable implementation", description: "Simple and maintainable", expectedRuntimeChange: "Unknown", expectedMemoryChange: "Same memory", simplicity: "High", readability: "High", maintainability: "High", portability: "High", projectedEnergyChange: "Same energy", projectedCarbonChange: "Same carbon" },
    { id: "fast", title: "Faster implementation", description: "Lower runtime for large inputs", expectedRuntimeChange: "Faster", expectedMemoryChange: "Same memory", simplicity: "Medium", readability: "Medium", maintainability: "Medium", portability: "High", projectedEnergyChange: "Potentially lower energy", projectedCarbonChange: "Potentially lower carbon" },
  ];
  assert.equal(rankAlternatives(alternatives, "balanced", { runtime: 100 })[0].id, "fast");
});
