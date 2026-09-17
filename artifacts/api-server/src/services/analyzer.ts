export type SupportedLanguage = "javascript" | "typescript" | "python" | "c" | "cpp" | "go";

export type FindingConfidence = "high" | "medium" | "low";
export type Finding = { severity: "high" | "medium" | "low" | "info"; title: string; detail: string; ruleId?: string; line?: number; column?: number; location?: { line: number; column: number }; evidence?: string; effect?: string; recommendation?: string; confidence?: FindingConfidence; benchmarkRequired?: boolean };
export type AlternativeTradeoffs = { performance: "better" | "same" | "worse" | "unknown"; memory: "better" | "same" | "worse" | "unknown"; energy: "better" | "same" | "worse" | "unknown" | "potentially-better"; carbon: "better" | "same" | "worse" | "unknown" | "potentially-lower"; security: "high" | "medium" | "low" | "review-required"; reliability: "high" | "medium" | "low"; scalability: "high" | "medium" | "low"; portability: "high" | "medium" | "low"; effort: "low" | "medium" | "high"; functionalRisk: "low" | "medium" | "high" };
export type Alternative = { id: string; title: string; description: string; complexity: string; expectedRuntimeChange: string; expectedMemoryChange: string; simplicity: string; readability: string; maintainability: string; portability: string; projectedEnergyChange: string; projectedCarbonChange: string; supportedBy?: string; category?: "performance" | "energy-efficiency"; code?: string; tradeoffs?: AlternativeTradeoffs };
export type StaticStructure = { functions: number; calls: number; loops: number; nestedLoops: number; recursion: number; conditionals: number; allocations: number; ioOperations: number; repeatedWorkSignals: number };
export type StaticCapabilities = { membershipScan: "AVAILABLE" | "UNAVAILABLE"; sorting: "AVAILABLE" | "UNAVAILABLE"; allocationPressure: "AVAILABLE" | "UNAVAILABLE" };
export type StaticAnalysis = { language: SupportedLanguage; confidence: "high" | "medium" | "low"; lines: number; bytes: number; complexity: { time: string; space: string; basis: string; timeClass?: string; spaceClass?: string }; structure: StaticStructure; capabilities: StaticCapabilities; score: number; findings: Finding[]; alternatives: Alternative[] };

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
function hasNestedLoops(code: string, language: SupportedLanguage) {
  if (language === "python") {
    const stack: number[] = [];
    for (const line of code.split("\n")) {
      const match = line.match(/^(\s*)(for|while)\b/);
      if (!match) continue;
      const indent = match[1].replace(/\t/g, "    ").length;
      while (stack.length && stack.at(-1)! >= indent) stack.pop();
      if (stack.length) return true;
      stack.push(indent);
    }
    return false;
  }
  // A same-line loop chain is nested in C-like languages. For blocks, inspect
  // only to the matching brace so sequential loops do not become false positives.
  if (/\b(for|while|do)\b[^\n{]{0,360}\)\s*(?:\{\s*)?\b(for|while|do)\b/.test(code)) return true;
  for (const loop of code.matchAll(/\b(for|while|do)\b/g)) {
    const open = code.indexOf("{", loop.index);
    if (open < 0 || open - (loop.index ?? 0) > 600) continue;
    let depth = 0, close = -1;
    for (let index = open; index < Math.min(code.length, open + 1600); index += 1) {
      if (code[index] === "{") depth += 1;
      if (code[index] === "}" && --depth === 0) { close = index; break; }
    }
    if (close > open && /\b(for|while|do)\b/.test(code.slice(open + 1, close))) return true;
  }
  return false;
}
function lineAt(code: string, index: number) { return code.slice(0, Math.max(0, index)).split("\n").length; }

function languagePatterns(language: SupportedLanguage) {
  const common = { loops: /\b(for|while|do)\b/g, conditionals: /\b(if|else\s+if|switch|case|when)\b/g, functions: /\b(function|def|func)\s+[A-Za-z_]\w*|[A-Za-z_]\w*\s*=>/g };
  if (language === "python") return { ...common, loops: /\b(for|while)\b/g, conditionals: /\b(if|elif|else|match|case)\b/g, functions: /\b(def|class)\s+[A-Za-z_]\w*/g, membership: /\.(count|index)\s*\(/g, sorting: /\b(sorted|list\.sort)\s*\(/g, allocations: /\b(dict|list|set|tuple|bytearray)\s*\(|\[[^\]]*\]|\{[^}]*\}/g, membershipAvailable: true, sortingAvailable: true };
  if (language === "go") return { ...common, loops: /\bfor\b/g, conditionals: /\b(if|switch|case|select)\b/g, functions: /\bfunc\s+(?:\([^)]*\)\s*)?[A-Za-z_]\w*/g, membership: /\b(?:slices\.Contains|strings\.Contains|maps\.Keys)\s*\(/g, sorting: /\bsort\.(?:Slice|Ints|Strings|Search)\s*\(/g, allocations: /\b(make|new)\s*\(|\[\][A-Za-z_]/g, membershipAvailable: true, sortingAvailable: true };
  if (language === "cpp") return { ...common, functions: /(?:\b[A-Za-z_]\w*(?:\s*<[^>]+>)?\s+)+[A-Za-z_]\w*\s*\([^;{}]*\)\s*\{/g, membership: /\b(?:std::find|find)\s*\(/g, sorting: /\b(?:std::sort|sort)\s*\(/g, allocations: /\b(new|std::vector|std::string|std::unordered_(?:map|set)|std::map|std::set)\b/g, membershipAvailable: true, sortingAvailable: true };
  if (language === "c") return { ...common, functions: /\b[A-Za-z_]\w*\s+[*\s]*[A-Za-z_]\w*\s*\([^;{}]*\)\s*\{/g, membership: /$^/g, sorting: /\bqsort\s*\(/g, allocations: /\b(calloc|malloc|realloc)\s*\(/g, membershipAvailable: false, sortingAvailable: true };
  return { ...common, membership: /\.(includes|indexOf|find|some)\s*\(/g, sorting: /\.sort\s*\(/g, allocations: /\bnew\s+|\b(Array|Object|Map|Set)\s*\(/g, membershipAvailable: true, sortingAvailable: true };
}

function membershipInsideLoop(code: string, language: SupportedLanguage, membership: RegExp) {
  if (language === "python") return /\b(for|while)\b[^\n]*:\s*(?:\n[ \t]+[^\n]*){0,12}\b(?:if|while)\b[^\n]*\b[A-Za-z_]\w*\s+in\s+[A-Za-z_]\w*/.test(code) || membership.test(code);
  return /\b(for|while)\b[\s\S]{0,1500}/.test(code) && membership.test(code);
}

function structuralMetrics(code: string, language: SupportedLanguage): StaticStructure {
  const patterns = languagePatterns(language);
  const functions = count(code, patterns.functions);
  const calls = count(code, /\b[A-Za-z_]\w*\s*\(/g);
  const loops = count(code, patterns.loops);
  const conditionals = count(code, patterns.conditionals);
  const ioOperations = count(code, /\b(console\.|print\s*\(|printf\s*\(|fmt\.Print|readFile|writeFile|fetch\s*\(|requests\.|http\.)/g);
  const repeatedWorkSignals = count(code, patterns.membership) + count(code, patterns.sorting) + count(code, /\b(JSON\.(parse|stringify)|parseInt|parseFloat)\s*\(/g);
  return { functions, calls, loops, nestedLoops: hasNestedLoops(code, language) ? 1 : 0, recursion: /\b([A-Za-z_]\w*)\s*\([^\n]*\)[\s\S]{0,450}\b\1\s*\(/.test(code) ? 1 : 0, conditionals, allocations: count(code, patterns.allocations), ioOperations, repeatedWorkSignals };
}

function completeFindings(findings: Finding[]): Finding[] {
  return findings.map((finding, index) => {
    const stable = (finding.title || "finding").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
    const severity = finding.severity;
    return {
      ...finding,
      ruleId: finding.ruleId ?? `ECO-${stable || "RULE"}-${index + 1}`,
      ...(finding.line != null ? { line: finding.line, column: finding.column ?? 1, location: finding.location ?? { line: finding.line, column: finding.column ?? 1 } } : {}),
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
  const patterns = languagePatterns(language);
  const lines = code.split("\n").length, bytes = Buffer.byteLength(code, "utf8");
  const findings: Finding[] = [];
  const nested = hasNestedLoops(code, language);
  const membership = patterns.membershipAvailable && membershipInsideLoop(code, language, patterns.membership);
  const sort = patterns.sorting.test(code);
  const recursion = /\b([A-Za-z_]\w*)\s*\([^\n]*\)[\s\S]{0,450}\b\1\s*\(/.test(code);
  const allocations = count(code, patterns.allocations);
  const trailingControl = /(^|\n)\s*(if|for|while|switch)\s*\([^\n]*\)\s*$/.test(code.trim());

  let time = "O(n)-like inferred";
  let space = allocations > 0 ? "O(n)-like inferred" : "O(1)-like inferred";
  const basis = "INFERRED: source-structure heuristics only. Loop bounds, input distributions, library implementations, and runtime data can change actual complexity.";
  if (recursion && /fibonacci|fib/i.test(code)) { time = "O(2^n)-like inferred"; findings.push({ severity: "high", title: "Explosive recursive growth", detail: "A Fibonacci-like recursive call pattern was detected. This is a structural inference, not a proof of recurrence behavior.", evidence: "A function-like declaration/call pattern refers to the same name within the inspected source region.", effect: "INFERRED: repeated subproblems can grow rapidly when this recurrence is reached.", recommendation: "Consider memoization or an iterative formulation, then validate representative behavior and benchmark.", confidence: "medium", benchmarkRequired: true, line: lineAt(code, code.search(/fibonacci|fib/i)) }); }
  else if (nested) { time = "O(n²)-like inferred"; findings.push({ severity: "high", title: "Nested iteration hotspot", detail: "Nested loops were observed in the same structural block; an O(n²)-like upper-bound pattern is inferred from loop structure.", evidence: "Two loop constructs appear in a nested block rather than as separate sequential loops.", effect: "INFERRED: work can multiply as loop inputs grow; bounds may be constant or data-dependent.", recommendation: "Consider indexing, hashing, sorting once, or removing repeated scans; benchmark before adopting a change.", confidence: "medium", benchmarkRequired: true }); }
  else if (sort) { time = "O(n log n)-like inferred"; findings.push({ severity: "medium", title: "Full sort detected", detail: "A language-recognized full-sort call was observed; common implementations are O(n log n), but library and comparator behavior are runtime-dependent.", evidence: `Recognized ${language} sorting call in submitted source.`, effect: "INFERRED: sorting the entire collection can dominate work when only a subset is needed.", recommendation: "Use a top-k/selection strategy only when the required result permits it; benchmark representative input sizes.", confidence: "medium", benchmarkRequired: true }); }
  if (membership) { time = nested ? time : "O(n²)-like inferred"; findings.push({ severity: "high", title: "Repeated linear membership lookup", detail: "A language-recognized membership/search operation was observed inside an iteration. It may rescan a collection on each pass.", evidence: `Loop plus ${language} membership/search syntax in the same inspected source region.`, effect: "INFERRED: repeated scans can create an O(n²)-like pattern when collections grow together.", recommendation: "Consider a Set/Map/dict or an indexed lookup when semantics allow; validate behavior and benchmark.", confidence: "medium", benchmarkRequired: true }); }
  if (allocations >= 3) findings.push({ severity: "low", title: "Allocation pressure", detail: "Several language-recognized allocation constructs were observed. Static source cannot determine object lifetime or actual RSS.", evidence: `${allocations} allocation-like constructs were found in the submitted source.`, effect: "INFERRED: allocation churn may increase memory traffic or garbage-collection work.", recommendation: "Measure maximum RSS with a representative benchmark before trading memory for speed.", confidence: "low", benchmarkRequired: true });
  if (trailingControl) findings.push({ severity: "high", title: "Source appears incomplete", detail: "The file ends with a control statement that has no body. Add the missing block and closing braces before benchmarking runtime or energy." });
  if (!findings.length) findings.push({ severity: "info", title: "No obvious hotspot detected", detail: "Static heuristics found no high-confidence optimization target in this submission." });

  let score = 96 - findings.filter(f => f.severity === "high").length * 13 - findings.filter(f => f.severity === "medium").length * 6 - findings.filter(f => f.severity === "low").length * 2;
  score = Math.max(10, Math.min(99, score));
  const alternatives: Alternative[] = [];
  if (membership || nested) {
    const supportedBy = membership ? "Repeated linear membership lookup" : "Nested iteration hotspot";
    alternatives.push({ id: "hash-lookup", title: "Hash-backed lookup", description: "Build a Set/Map/dict-style index once and use average constant-time membership checks.", complexity: "Usually O(n) overall", expectedRuntimeChange: "Potentially much faster when repeated scans dominate; verify with a benchmark.", expectedMemoryChange: "+O(n) auxiliary state", simplicity: "Medium", readability: "High", maintainability: "High", portability: "High", projectedEnergyChange: "Projected lower energy per run when CPU time falls.", projectedCarbonChange: "Projected lower emissions per run; modelled, not directly measured.", supportedBy, category: "performance", code: language === "javascript" || language === "typescript" ? uniqueItemsAlternative(code) ?? suggestionCode(language, "hash-lookup") : suggestionCode(language, "hash-lookup") });
    alternatives.push({ id: "sort-once", title: "Sort once, then scan", description: "Sort once when ordering is useful, then perform a linear pass instead of repeated membership scans.", complexity: "O(n log n)", expectedRuntimeChange: "Often better than O(n²) scans for large inputs.", expectedMemoryChange: "Low to moderate", simplicity: "Medium", readability: "Medium", maintainability: "High", portability: "Very high", projectedEnergyChange: "Potentially lower energy than quadratic scans; workload-dependent.", projectedCarbonChange: "Potentially lower emissions after measured runtime improvement.", supportedBy, category: "performance", code: suggestionCode(language, "sort-once") });
    alternatives.push({ id: "streaming", title: "Streaming / one-pass state", description: "Keep only the minimum state required and process the input once, reducing unnecessary allocations and passes.", complexity: "Often O(n)", expectedRuntimeChange: "Potentially lower constant factors and memory traffic.", expectedMemoryChange: "Can reduce peak memory substantially", simplicity: "Medium", readability: "High", maintainability: "Medium", portability: "High", projectedEnergyChange: "Potentially lower memory-movement and CPU energy.", projectedCarbonChange: "Projected lower emissions when resource use falls.", supportedBy, category: "energy-efficiency", code: suggestionCode(language, "streaming") });
  } else if (sort) {
    alternatives.push({ id: "top-k", title: "Avoid a full sort for top-k", description: "Use a heap or selection strategy when only the best k records are required.", complexity: "Often O(n log k)", expectedRuntimeChange: "Can materially reduce work when k << n.", expectedMemoryChange: "O(k)", simplicity: "Medium", readability: "Medium", maintainability: "Medium", portability: "High", projectedEnergyChange: "Projected lower energy by avoiding a full sort.", projectedCarbonChange: "Projected lower carbon when measured runtime decreases.", supportedBy: "Full sort detected", category: "performance", code: suggestionCode(language, "top-k") });
    alternatives.push({ id: "chunked", title: "Chunked processing", description: "Process bounded batches and release intermediate data promptly.", complexity: "Batch-bounded work", expectedRuntimeChange: "May trade coordination overhead for stable memory.", expectedMemoryChange: "Lower peak memory", simplicity: "Medium", readability: "Medium", maintainability: "High", portability: "High", projectedEnergyChange: "Potentially lower memory-related energy at scale.", projectedCarbonChange: "Projected reduction depends on the measured resource profile.", supportedBy: "Full sort detected", category: "energy-efficiency", code: suggestionCode(language, "batch-work") });
  }
  const structure = structuralMetrics(code, language);
  const capabilities: StaticCapabilities = { membershipScan: patterns.membershipAvailable ? "AVAILABLE" : "UNAVAILABLE", sorting: patterns.sortingAvailable ? "AVAILABLE" : "UNAVAILABLE", allocationPressure: "AVAILABLE" };
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
  return { language, confidence: detected.confidence, lines, bytes, complexity: { time, space, basis, timeClass: time.replace(/ inferred$/, ""), spaceClass: space.replace(/ inferred$/, "") }, structure, capabilities, score, findings: completeFindings(findings), alternatives: completeAlternatives };
}
