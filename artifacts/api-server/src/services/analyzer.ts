export type SupportedLanguage = "javascript" | "typescript" | "python" | "c" | "cpp" | "go";

export type Finding = {
  severity: "high" | "medium" | "low" | "info";
  title: string;
  detail: string;
  line?: number;
};

export type Alternative = {
  id: string;
  title: string;
  description: string;
  complexity: string;
  expectedRuntimeChange: string;
  expectedMemoryChange: string;
  simplicity: string;
  readability: string;
  maintainability: string;
  portability: string;
  projectedEnergyChange: string;
  projectedCarbonChange: string;
  code?: string;
};

export type StaticAnalysis = {
  language: SupportedLanguage;
  confidence: "high" | "medium" | "low";
  lines: number;
  bytes: number;
  complexity: { time: string; space: string; basis: string };
  score: number;
  findings: Finding[];
  alternatives: Alternative[];
};

const aliases: Record<string, SupportedLanguage> = {
  js: "javascript", javascript: "javascript", node: "javascript",
  ts: "typescript", typescript: "typescript",
  py: "python", python: "python",
  c: "c", cc: "cpp", cpp: "cpp", "c++": "cpp",
  go: "go", golang: "go",
};

export function normalizeLanguage(value?: string | null): SupportedLanguage | null {
  if (!value) return null;
  return aliases[value.trim().toLowerCase()] ?? null;
}

export function detectLanguage(code: string, hint?: string | null): { language: SupportedLanguage; confidence: "high" | "medium" | "low" } {
  const hinted = normalizeLanguage(hint);
  if (hinted) return { language: hinted, confidence: "high" };
  if (/\bpackage\s+main\b|\bfunc\s+\w+\s*\(/.test(code)) return { language: "go", confidence: "high" };
  if (/\busing\s+namespace\s+std\b|#include\s*<(iostream|vector|string|unordered_map)>/.test(code)) return { language: "cpp", confidence: "high" };
  if (/#include\s*<[^>]+>|\b(size_t|printf|scanf|malloc|free)\s*\(/.test(code)) return { language: "c", confidence: "high" };
  if (/^\s*(def|class)\s+\w+|\b(import|from)\s+[a-zA-Z_][\w.]*/m.test(code) && !/[{};]/.test(code)) return { language: "python", confidence: "medium" };
  if (/\b(interface|type|enum)\s+\w+|:\s*(string|number|boolean|unknown|any)(\b|\[)/.test(code)) return { language: "typescript", confidence: "medium" };
  if (/\b(function|const|let|var)\b|=>|console\.log/.test(code)) return { language: "javascript", confidence: "medium" };
  return { language: "javascript", confidence: "low" };
}

function countMatches(code: string, re: RegExp) { return [...code.matchAll(re)].length; }

function hasNestedLoop(code: string) {
  const starts = [...code.matchAll(/\b(for|while|do)\b/g)].map((m) => m.index ?? 0);
  for (let i = 0; i < starts.length - 1; i++) {
    if (/\b(for|while|do)\b/.test(code.slice(starts[i]!, starts[i + 1]! + 500))) return true;
  }
  return false;
}

function uniqueItemsAlternative(code: string) {
  const replaced = code.replace(
    /function\s+(uniqueItems)\s*\(items\)\s*\{[\s\S]*?return\s+result;\s*\}/m,
    `function uniqueItems(items) {\n  const seen = new Set();\n  const result = [];\n  for (const item of items) {\n    if (!seen.has(item)) {\n      seen.add(item);\n      result.push(item);\n    }\n  }\n  return result;\n}`,
  );
  return replaced === code ? undefined : replaced;
}

function pythonDictAlternative(code: string) {
  if (!/\bif\s+\w+\s+not\s+in\s+\w+/.test(code)) return undefined;
  return `${code}\n\n# EcoDev suggestion: when membership is repeated, keep a separate set of keys.\n`;
}

export function analyzeCode(code: string, languageHint?: string | null): StaticAnalysis {
  const detected = detectLanguage(code, languageHint);
  const language = detected.language;
  const lines = code.split("\n").length;
  const bytes = Buffer.byteLength(code, "utf8");
  const findings: Finding[] = [];
  const nested = hasNestedLoop(code);
  const membershipInsideLoop = /\b(for|while)\b[\s\S]{0,1000}\.(includes|indexOf|find|some)\s*\(/.test(code);
  const sorting = /\.(sort)\s*\(|\bsorted\s*\(/.test(code);
  const recursion = /\b([A-Za-z_]\w*)\s*\([^\n]*\)[\s\S]{0,350}\b\1\s*\(/.test(code);
  const allocations = countMatches(code, /\bnew\s+|Array\(|Object\.|Map\(|Set\(|dict\(|list\(|malloc\s*\(/g);

  let time = "O(n)";
  let space = allocations > 0 ? "O(n) inferred" : "O(1) inferred";
  let basis = "Structural static analysis of the submitted source; runtime is measured separately.";

  if (recursion && /fibonacci|fib/i.test(code)) {
    time = "O(2^n) inferred";
    findings.push({ severity: "high", title: "Explosive recursive growth", detail: "A Fibonacci-like recursive pattern was detected. Memoization or iteration can eliminate repeated subproblems." });
  } else if (nested) {
    time = "O(n²) inferred";
    findings.push({ severity: "high", title: "Nested iteration hotspot", detail: "Nested loops can multiply work as input grows. Consider indexing, hashing, sorting once, or reducing repeated scans." });
  } else if (sorting) {
    time = "O(n log n) inferred";
    findings.push({ severity: "medium", title: "Full sort detected", detail: "A full collection sort is typically O(n log n). Avoid it when only a small ordered subset is needed." });
  }

  if (membershipInsideLoop) {
    time = nested ? time : "O(n²) inferred";
    findings.push({ severity: "high", title: "Repeated linear membership lookup", detail: "includes/indexOf/find inside a loop can rescan data on every pass. Set/Map/dict indexing can reduce repeated lookup work." });
  }

  if (allocations >= 3) {
    findings.push({ severity: "low", title: "Allocation pressure", detail: "Several allocation-heavy constructs were detected. Benchmark peak memory before trading memory for speed." });
  }

  if (findings.length === 0) {
    findings.push({ severity: "info", title: "No obvious hotspot detected", detail: "Static heuristics found no high-confidence optimization target in this submission." });
  }

  let score = 96;
  score -= findings.filter((f) => f.severity === "high").length * 13;
  score -= findings.filter((f) => f.severity === "medium").length * 6;
  score -= findings.filter((f) => f.severity === "low").length * 2;
  score = Math.max(10, Math.min(99, score));

  const alternatives: Alternative[] = [];
  if (membershipInsideLoop || nested) {
    const codeAlt = language === "javascript" || language === "typescript" ? uniqueItemsAlternative(code) : language === "python" ? pythonDictAlternative(code) : undefined;
    alternatives.push({
      id: "hash-lookup", title: "Hash-backed lookup", description: "Build a Set/Map/dict-style index once and use average constant-time membership checks.",
      complexity: "Usually O(n) overall", expectedRuntimeChange: "Potentially much faster when repeated scans dominate; verify with a benchmark.", expectedMemoryChange: "+O(n) auxiliary state", simplicity: "Medium", readability: "High", maintainability: "High", portability: "High",
      projectedEnergyChange: "Projected lower energy per run when CPU time falls.", projectedCarbonChange: "Projected lower emissions per run; this is modelled, not directly measured.", code: codeAlt,
    });
    alternatives.push({
      id: "sort-once", title: "Sort once, then scan", description: "Sort once when deterministic ordering is useful, then perform a linear pass instead of repeated membership scans.",
      complexity: "O(n log n)", expectedRuntimeChange: "Often better than O(n²) scans for large inputs.", expectedMemoryChange: "Low to moderate", simplicity: "Medium", readability: "Medium", maintainability: "High", portability: "Very high",
      projectedEnergyChange: "Potentially lower energy than quadratic scans; workload-dependent.", projectedCarbonChange: "Potentially lower emissions after measured runtime improvement.",
    });
    alternatives.push({
      id: "streaming", title: "Streaming / one-pass state", description: "Keep only the minimum state required and process the input once, reducing unnecessary allocations and passes.",
      complexity: "Often O(n)", expectedRuntimeChange: "Potentially lower constant factors and memory traffic.", expectedMemoryChange: "Can reduce peak memory substantially", simplicity: "Medium", readability: "High", maintainability: "Medium", portability: "High",
      projectedEnergyChange: "Potentially lower memory-movement and CPU energy.", projectedCarbonChange: "Projected lower emissions when resource use falls.",
    });
  } else if (sorting) {
    alternatives.push({
      id: "top-k", title: "Avoid a full sort for top-k", description: "Use a heap or selection strategy when only the best k records are required.", complexity: "Often O(n log k)", expectedRuntimeChange: "Can materially reduce work when k << n.", expectedMemoryChange: "O(k)", simplicity: "Medium", readability: "Medium", maintainability: "Medium", portability: "High",
      projectedEnergyChange: "Projected lower energy by avoiding a full sort.", projectedCarbonChange: "Projected lower carbon when measured runtime decreases.",
    });
    alternatives.push({
      id: "chunked", title: "Chunked processing", description: "Process bounded batches and release intermediate data promptly.", complexity: "Work is spread across bounded batches", expectedRuntimeChange: "May trade a small coordination cost for stable memory.", expectedMemoryChange: "Lower peak memory", simplicity: "Medium", readability: "Medium", maintainability: "High", portability: "High",
      projectedEnergyChange: "Potentially lower memory-related energy at scale.", projectedCarbonChange: "Projected reduction depends on the measured resource profile.",
    });
  } else {
    alternatives.push({
      id: "hot-path", title: "Tune the measured hot path", description: "Keep the algorithm, but remove unnecessary allocation, conversion, and repeated work around the measured hotspot.", complexity: time, expectedRuntimeChange: "Workload-dependent", expectedMemoryChange: "Neutral to slightly lower", simplicity: "High", readability: "High", maintainability: "Very high", portability: "Very high",
      projectedEnergyChange: "Usually a modest improvement unless the hotspot is allocation-heavy.", projectedCarbonChange: "Projected modest reduction; verify with a before/after run.",
    });
    alternatives.push({
      id: "batch-work", title: "Batch repeated work", description: "Move invariant work out of loops and combine repeated I/O or serialization operations.", complexity: time, expectedRuntimeChange: "Potentially lower constant factors", expectedMemoryChange: "Low to moderate", simplicity: "High", readability: "High", maintainability: "High", portability: "Very high",
      projectedEnergyChange: "Potentially lower CPU energy through less repeated work.", projectedCarbonChange: "Projected lower emissions when runtime falls.",
    });
  }

  return { language, confidence: detected.confidence, lines, bytes, complexity: { time, space, basis }, score, findings, alternatives };
}
