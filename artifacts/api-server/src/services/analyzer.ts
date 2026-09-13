export type SupportedLanguage = "javascript" | "typescript" | "python" | "c" | "cpp" | "go";

export type FindingConfidence = "high" | "medium" | "low";
export type Finding = { severity: "high" | "medium" | "low" | "info"; title: string; detail: string; ruleId?: string; line?: number; column?: number; location?: { line: number; column: number }; evidence?: string; effect?: string; recommendation?: string; confidence?: FindingConfidence; benchmarkRequired?: boolean };
export type AlternativeTradeoffs = { performance: "better" | "same" | "worse" | "unknown"; memory: "better" | "same" | "worse" | "unknown"; energy: "better" | "same" | "worse" | "unknown" | "potentially-better"; carbon: "better" | "same" | "worse" | "unknown" | "potentially-lower"; security: "high" | "medium" | "low" | "review-required"; reliability: "high" | "medium" | "low"; scalability: "high" | "medium" | "low"; portability: "high" | "medium" | "low"; effort: "low" | "medium" | "high"; functionalRisk: "low" | "medium" | "high" };
export type Alternative = { id: string; title: string; description: string; complexity: string; expectedRuntimeChange: string; expectedMemoryChange: string; simplicity: string; readability: string; maintainability: string; portability: string; projectedEnergyChange: string; projectedCarbonChange: string; code?: string; tradeoffs?: AlternativeTradeoffs };
export type StaticStructure = { functions: number; calls: number; loops: number; nestedLoops: number; recursion: number; conditionals: number; allocations: number; ioOperations: number; repeatedWorkSignals: number };
export type StaticAnalysis = { language: SupportedLanguage; confidence: "high" | "medium" | "low"; lines: number; bytes: number; complexity: { time: string; space: string; basis: string; timeClass?: string; spaceClass?: string }; structure: StaticStructure; score: number; findings: Finding[]; alternatives: Alternative[] };

const aliases: Record<string, SupportedLanguage> = { js: "javascript", javascript: "javascript", node: "javascript", ts: "typescript", typescript: "typescript", py: "python", python: "python", c: "c", cc: "cpp", cpp: "cpp", "c++": "cpp", go: "go", golang: "go" };
export function normalizeLanguage(value?: string | null): SupportedLanguage | null { return value ? aliases[value.trim().toLowerCase()] ?? null : null; }

export function detectLanguage(code: string, hint?: string | null): { language: SupportedLanguage; confidence: "high" | "medium" | "low" } {
  const explicit = normalizeLanguage(hint); if (explicit) return { language: explicit, confidence: "high" };
  if (/\bpackage\s+main\b|\bfunc\s+\w+\s*\(/.test(code)) return { language: "go", confidence: "high" };
  if (/\busing\s+namespace\s+std\b|#include\s*<(iostream|vector|string|unordered_map)>/.test(code)) return { language: "cpp", confidence: "high" };
  if (/#include\s*<[^>]+>|\b(size_t|printf|scanf|malloc|free)\s*\(/.test(code)) return { language: "c", confidence: "high" };
  if (/^\s*(def|class)\s+\w+|^\s*(from|import)\s+[A-Za-z_][\w.]*/m.test(code) && !/[{};]/.test(code)) return { language: "python", confidence: "medium" };
  if (/\b(interface|type|enum)\s+\w+|:\s*(string|number|boolean|unknown|any)(\b|\[)/.test(code)) return { language: "typescript", confidence: "medium" };
  if (/\b(function|const|let|var)\b|=>|console\.log/.test(code)) return { language: "javascript", confidence: "medium" };
  return { language: "javascript", confidence: "low" };
}

function count(code: string, re: RegExp) { return [...code.matchAll(re)].length; }
function hasNestedLoops(code: string) { return /\b(for|while|do)\b[\s\S]{0,1200}\b(for|while|do)\b/.test(code); }
function lineAt(code: string, index: number) { return code.slice(0, Math.max(0, index)).split("\n").length; }

function structuralMetrics(code: string): StaticStructure {
  const functions = count(code, /\b(function|def|func)\s+[A-Za-z_]\w*|[A-Za-z_]\w*\s*=>/g);
  const calls = count(code, /\b[A-Za-z_]\w*\s*\(/g);
  const loops = count(code, /\b(for|while|do)\b/g);
  const conditionals = count(code, /\b(if|else\s+if|switch|case|when)\b/g);
  const ioOperations = count(code, /\b(console\.|print\s*\(|printf\s*\(|fmt\.Print|readFile|writeFile|fetch\s*\(|requests\.|http\.)/g);
  const repeatedWorkSignals = count(code, /\.(includes|indexOf|find|some|sort)\s*\(|\b(JSON\.(parse|stringify)|parseInt|parseFloat)\s*\(/g);
  return { functions, calls, loops, nestedLoops: hasNestedLoops(code) ? 1 : 0, recursion: /\b([A-Za-z_]\w*)\s*\([^\n]*\)[\s\S]{0,450}\b\1\s*\(/.test(code) ? 1 : 0, conditionals, allocations: count(code, /\bnew\s+|Array\(|Object\.|Map\(|Set\(|dict\(|list\(|malloc\s*\(/g), ioOperations, repeatedWorkSignals };
}

function completeFindings(findings: Finding[]): Finding[] {
  return findings.map((finding, index) => {
    const stable = (finding.title || "finding").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
    const severity = finding.severity;
    return {
      ...finding,
      ruleId: finding.ruleId ?? `ECO-${stable || "RULE"}-${index + 1}`,
      line: finding.line ?? 1,
      column: finding.column ?? 1,
      location: finding.location ?? { line: finding.line ?? 1, column: finding.column ?? 1 },
      evidence: finding.evidence ?? finding.detail,
      effect: finding.effect ?? (severity === "info" ? "No material hotspot was established by this rule." : "This pattern may increase work, resource use, or engineering risk as the workload grows."),
      recommendation: finding.recommendation ?? finding.detail,
      confidence: finding.confidence ?? (severity === "high" ? "medium" : severity === "info" ? "low" : "medium"),
      benchmarkRequired: finding.benchmarkRequired ?? severity !== "info",
    };
  });
}

function uniqueItemsAlternative(code: string) {
  const match = code.match(/function\s+uniqueItems\s*\(items\)[\s\S]*?\n\}/m);
  if (!match) return undefined;
  return code.replace(match[0], `function uniqueItems(items) {\n  const seen = new Set();\n  const result = [];\n  for (const item of items) {\n    if (!seen.has(item)) {\n      seen.add(item);\n      result.push(item);\n    }\n  }\n  return result;\n}`);
}

function suggestionCode(language: SupportedLanguage, id: string) {
  if (id === "hash-lookup") {
    if (language === "python") return `seen = set()\nunique = []\nfor item in items:\n    if item not in seen:\n        seen.add(item)\n        unique.append(item)\nreturn unique`;
    if (language === "go") return `seen := make(map[string]struct{})\nunique := make([]Item, 0, len(items))\nfor _, item := range items {\n    key := keyFor(item)\n    if _, ok := seen[key]; ok { continue }\n    seen[key] = struct{}{}\n    unique = append(unique, item)\n}`;
    if (language === "c") return `/* Use a bounded lookup table when the value domain is known.\n   Validate every input before indexing the table. */\nunsigned char seen[VALUE_LIMIT] = {0};\nfor (size_t i = 0; i < n; i++) {\n    if (data[i] < 0 || data[i] >= VALUE_LIMIT) continue;\n    if (!seen[data[i]]) {\n        seen[data[i]] = 1;\n        /* process data[i] once */\n    }\n}`;
    if (language === "cpp") return `std::unordered_set<int> seen;\nseen.reserve(items.size());\nfor (const auto& item : items) {\n    if (seen.insert(item).second) {\n        // process item once\n    }\n}`;
    return `const seen = new Set();\nconst unique = [];\nfor (const item of items) {\n  if (!seen.has(item)) {\n    seen.add(item);\n    unique.push(item);\n  }\n}\nreturn unique;`;
  }
  if (id === "top-k") return language === "python" ? `import heapq\nresult = heapq.nsmallest(k, items, key=score)` : `// Use a bounded heap/selection structure when k is much smaller than input size.\nconst topK = selectTopK(items, k);`;
  if (id === "streaming") return language === "python" ? `for item in stream:\n    process(item)\n# Keep only the state needed for the final result` : `for (const item of input) {\n  process(item);\n}\n// Release temporary batches promptly; do not retain the full input.`;
  if (id === "batch-work") return language === "python" ? `for batch in batched(items, BATCH_SIZE):\n    process_batch(batch)` : `for (const batch of batches(items, BATCH_SIZE)) {\n  processBatch(batch);\n}`;
  return `// Candidate optimization for ${language}.\n// Preserve behavior, add representative tests, then benchmark before adoption.`;
}

export function analyzeCode(code: string, languageHint?: string | null): StaticAnalysis {
  const detected = detectLanguage(code, languageHint), language = detected.language;
  const lines = code.split("\n").length, bytes = Buffer.byteLength(code, "utf8");
  const findings: Finding[] = [];
  const nested = hasNestedLoops(code);
  const membership = /\b(for|while)\b[\s\S]{0,1500}\.(includes|indexOf|find|some)\s*\(/.test(code);
  const sort = /\.(sort)\s*\(|\bsorted\s*\(/.test(code);
  const recursion = /\b([A-Za-z_]\w*)\s*\([^\n]*\)[\s\S]{0,450}\b\1\s*\(/.test(code);
  const allocations = count(code, /\bnew\s+|Array\(|Object\.|Map\(|Set\(|dict\(|list\(|malloc\s*\(/g);
  const trailingControl = /(^|\n)\s*(if|for|while|switch)\s*\([^\n]*\)\s*$/.test(code.trim());

  let time = "O(n) inferred";
  let space = allocations > 0 ? "O(n) inferred" : "O(1) inferred";
  const basis = "Static structural inference from the submitted source. It is separate from measured runtime/resource metrics.";
  if (recursion && /fibonacci|fib/i.test(code)) { time = "O(2^n) inferred"; findings.push({ severity: "high", title: "Explosive recursive growth", detail: "A Fibonacci-like recursive pattern was detected; memoization or iteration can avoid repeated subproblems.", line: lineAt(code, code.search(/fibonacci|fib/i)) }); }
  else if (nested) { time = "O(n²) inferred"; findings.push({ severity: "high", title: "Nested iteration hotspot", detail: "Nested loops can multiply work as input grows. Consider indexing, hashing, sorting once, or reducing repeated scans." }); }
  else if (sort) { time = "O(n log n) inferred"; findings.push({ severity: "medium", title: "Full sort detected", detail: "A full collection sort is typically O(n log n). Avoid it when only a small ordered subset is needed." }); }
  if (membership) { time = nested ? time : "O(n²) inferred"; findings.push({ severity: "high", title: "Repeated linear membership lookup", detail: "includes/indexOf/find/some inside iteration can rescan data. Set/Map/dict indexing can reduce repeated lookup work." }); }
  if (allocations >= 3) findings.push({ severity: "low", title: "Allocation pressure", detail: "Several allocation-heavy constructs were detected. Benchmark peak memory before trading memory for speed." });
  if (trailingControl) findings.push({ severity: "high", title: "Source appears incomplete", detail: "The file ends with a control statement that has no body. Add the missing block and closing braces before benchmarking runtime or energy." });
  if (!findings.length) findings.push({ severity: "info", title: "No obvious hotspot detected", detail: "Static heuristics found no high-confidence optimization target in this submission." });

  let score = 96 - findings.filter(f => f.severity === "high").length * 13 - findings.filter(f => f.severity === "medium").length * 6 - findings.filter(f => f.severity === "low").length * 2;
  score = Math.max(10, Math.min(99, score));
  const alternatives: Alternative[] = [];
  if (membership || nested) {
    alternatives.push({ id: "hash-lookup", title: "Hash-backed lookup", description: "Build a Set/Map/dict-style index once and use average constant-time membership checks.", complexity: "Usually O(n) overall", expectedRuntimeChange: "Potentially much faster when repeated scans dominate; verify with a benchmark.", expectedMemoryChange: "+O(n) auxiliary state", simplicity: "Medium", readability: "High", maintainability: "High", portability: "High", projectedEnergyChange: "Projected lower energy per run when CPU time falls.", projectedCarbonChange: "Projected lower emissions per run; modelled, not directly measured.", code: language === "javascript" || language === "typescript" ? uniqueItemsAlternative(code) ?? suggestionCode(language, "hash-lookup") : suggestionCode(language, "hash-lookup") });
    alternatives.push({ id: "sort-once", title: "Sort once, then scan", description: "Sort once when ordering is useful, then perform a linear pass instead of repeated membership scans.", complexity: "O(n log n)", expectedRuntimeChange: "Often better than O(n²) scans for large inputs.", expectedMemoryChange: "Low to moderate", simplicity: "Medium", readability: "Medium", maintainability: "High", portability: "Very high", projectedEnergyChange: "Potentially lower energy than quadratic scans; workload-dependent.", projectedCarbonChange: "Potentially lower emissions after measured runtime improvement.", code: suggestionCode(language, "sort-once") });
    alternatives.push({ id: "streaming", title: "Streaming / one-pass state", description: "Keep only the minimum state required and process the input once, reducing unnecessary allocations and passes.", complexity: "Often O(n)", expectedRuntimeChange: "Potentially lower constant factors and memory traffic.", expectedMemoryChange: "Can reduce peak memory substantially", simplicity: "Medium", readability: "High", maintainability: "Medium", portability: "High", projectedEnergyChange: "Potentially lower memory-movement and CPU energy.", projectedCarbonChange: "Projected lower emissions when resource use falls.", code: suggestionCode(language, "streaming") });
  } else if (sort) {
    alternatives.push({ id: "top-k", title: "Avoid a full sort for top-k", description: "Use a heap or selection strategy when only the best k records are required.", complexity: "Often O(n log k)", expectedRuntimeChange: "Can materially reduce work when k << n.", expectedMemoryChange: "O(k)", simplicity: "Medium", readability: "Medium", maintainability: "Medium", portability: "High", projectedEnergyChange: "Projected lower energy by avoiding a full sort.", projectedCarbonChange: "Projected lower carbon when measured runtime decreases.", code: suggestionCode(language, "top-k") });
    alternatives.push({ id: "chunked", title: "Chunked processing", description: "Process bounded batches and release intermediate data promptly.", complexity: "Batch-bounded work", expectedRuntimeChange: "May trade coordination overhead for stable memory.", expectedMemoryChange: "Lower peak memory", simplicity: "Medium", readability: "Medium", maintainability: "High", portability: "High", projectedEnergyChange: "Potentially lower memory-related energy at scale.", projectedCarbonChange: "Projected reduction depends on the measured resource profile.", code: suggestionCode(language, "batch-work") });
  } else {
    alternatives.push({ id: "hot-path", title: "Tune the measured hot path", description: "Keep the algorithm, but remove unnecessary allocation, conversion, and repeated work around the measured hotspot.", complexity: time, expectedRuntimeChange: "Workload-dependent", expectedMemoryChange: "Neutral to slightly lower", simplicity: "High", readability: "High", maintainability: "Very high", portability: "Very high", projectedEnergyChange: "Usually a modest improvement unless the hotspot is allocation-heavy.", projectedCarbonChange: "Projected modest reduction; verify with a before/after run." });
    alternatives.push({ id: "batch-work", title: "Batch repeated work", description: "Move invariant work out of loops and combine repeated I/O or serialization operations.", complexity: time, expectedRuntimeChange: "Potentially lower constant factors", expectedMemoryChange: "Low to moderate", simplicity: "High", readability: "High", maintainability: "High", portability: "Very high", projectedEnergyChange: "Potentially lower CPU energy through less repeated work.", projectedCarbonChange: "Projected lower emissions when runtime falls.", code: suggestionCode(language, "batch-work") });
  }
  const structure = structuralMetrics(code);
  const completeAlternatives = alternatives.map((alternative): Alternative => ({
    ...alternative,
    tradeoffs: alternative.tradeoffs ?? {
      performance: /faster|lower constant|reduce work|o\(n\)|top-k/i.test(`${alternative.expectedRuntimeChange} ${alternative.description}`) ? "better" : "unknown",
      memory: /lower|reduce|o\(k\)|o\(1\)/i.test(alternative.expectedMemoryChange) ? "better" : /\+o\(n\)|additional/i.test(alternative.expectedMemoryChange) ? "worse" : "unknown",
      energy: /potential|projected|lower/i.test(alternative.projectedEnergyChange) ? "potentially-better" : "unknown",
      carbon: /potential|projected|lower/i.test(alternative.projectedCarbonChange) ? "potentially-lower" : "unknown",
      security: "review-required", reliability: "medium", scalability: /large|scale|o\(n\)|stream|batch/i.test(`${alternative.title} ${alternative.description}`) ? "high" : "medium", portability: /very high|high/i.test(alternative.portability) ? "high" : "medium", effort: /simple|low/i.test(alternative.simplicity) ? "low" : "medium", functionalRisk: "medium",
    },
  }));
  return { language, confidence: detected.confidence, lines, bytes, complexity: { time, space, basis, timeClass: time.replace(/ inferred$/, ""), spaceClass: space.replace(/ inferred$/, "") }, structure, score, findings: completeFindings(findings), alternatives: completeAlternatives };
}
