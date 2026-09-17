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

test("performance and energy custom-weight cases rank their distinct evidence", () => {
  const alternatives = [
    { id: "energy", title: "Low-power operation", description: "Reduced electricity use", expectedRuntimeChange: "Unchanged", expectedMemoryChange: "Unchanged storage", simplicity: "", readability: "", maintainability: "", portability: "", projectedEnergyChange: "Lower energy", projectedCarbonChange: "Lower carbon" },
    { id: "performance", title: "CPU speed", description: "Fast algorithm", expectedRuntimeChange: "Faster", expectedMemoryChange: "Unchanged storage", simplicity: "", readability: "", maintainability: "", portability: "", projectedEnergyChange: "Unknown", projectedCarbonChange: "Unknown" },
  ];
  const otherWeights = { memory: 50, carbon: 50, readable: 50, maintain: 50, secure: 50, reliable: 50, scalable: 50, portable: 50 };
  assert.equal(rankAlternatives(alternatives, "balanced", { ...otherWeights, runtime: 100, energy: 0 })[0].id, "performance");
  assert.equal(rankAlternatives(alternatives, "balanced", { ...otherWeights, runtime: 0, energy: 100 })[0].id, "energy");
});

test("an optimization goal breaks ranking ties without changing profile or custom weights", () => {
  const alternatives = [
    { id: "memory", title: "Memory-bounded implementation", description: "Use bounded memory", expectedRuntimeChange: "Unchanged", expectedMemoryChange: "Lower memory", simplicity: "Medium", readability: "Medium", maintainability: "Medium", portability: "High", projectedEnergyChange: "Unknown", projectedCarbonChange: "Unknown" },
    { id: "fast", title: "Faster implementation", description: "Lower runtime", expectedRuntimeChange: "Faster", expectedMemoryChange: "Unchanged", simplicity: "Medium", readability: "Medium", maintainability: "Medium", portability: "High", projectedEnergyChange: "Unknown", projectedCarbonChange: "Unknown" },
  ];
  const zeroWeights = { runtime: 0, memory: 0, energy: 0, carbon: 0, readable: 0, maintain: 0, secure: 0, reliable: 0, scalable: 0, portable: 0 };
  assert.equal(rankAlternatives(alternatives, "balanced", zeroWeights, "minimize memory without hurting runtime")[0].id, "memory");
  assert.equal(rankAlternatives(alternatives, "balanced", zeroWeights, "minimize runtime")[0].id, "fast");
});
