import { analyzeCode, type SupportedLanguage } from "./analyzer.ts";
import { executeCode, type ExecutionResult } from "./sandbox.ts";
import { ecoEstimate } from "./eco.ts";

export type BenchmarkCase = {
  id: string;
  title: string;
  category: string;
  language: SupportedLanguage;
  code: string;
  expected: { time: string; space: string; output: string };
  inputSizes: number[];
  notes: string;
};

const cases: BenchmarkCase[] = [
  { id: "ECO-01", title: "Sum", category: "linear reduction", language: "javascript", code: "const values = Array.from({ length: 10000 }, (_, i) => i); let total = 0; for (const value of values) total += value; console.log(total);", expected: { time: "O(n)", space: "O(1) auxiliary", output: "49995000" }, inputSizes: [100, 1000, 5000, 10000], notes: "Manual accumulation compared with a language-appropriate reduction." },
  { id: "ECO-02", title: "Duplicate detection", category: "lookup", language: "javascript", code: "const values = Array.from({ length: 2000 }, (_, i) => i); let duplicate = false; for (let i = 0; i < values.length; i++) for (let j = i + 1; j < values.length; j++) if (values[i] === values[j]) duplicate = true; console.log(duplicate);", expected: { time: "O(n²)", space: "O(1) auxiliary", output: "false" }, inputSizes: [100, 1000, 2000], notes: "Nested comparison baseline for a Set/Map alternative." },
  { id: "ECO-03", title: "Bubble sort", category: "sorting", language: "javascript", code: "const values = Array.from({ length: 100 }, (_, i) => 100 - i); for (let i = 0; i < values.length; i++) for (let j = 0; j < values.length - i - 1; j++) if (values[j] > values[j + 1]) [values[j], values[j + 1]] = [values[j + 1], values[j]]; console.log(values[0]);", expected: { time: "O(n²)", space: "O(1) auxiliary", output: "1" }, inputSizes: [100, 1000, 10000], notes: "Quadratic sorting baseline for the platform sort implementation." },
  { id: "ECO-04", title: "Fibonacci", category: "recursion", language: "javascript", code: "function fibonacci(n) { if (n < 2) return n; return fibonacci(n - 1) + fibonacci(n - 2); } console.log(fibonacci(20));", expected: { time: "O(2^n)", space: "O(n) stack", output: "6765" }, inputSizes: [10, 20, 25, 30], notes: "Small safe input only; never scale this exponential case automatically to large values." },
  { id: "ECO-05", title: "String construction", category: "allocation", language: "javascript", code: "let output = \"\"; for (let i = 0; i < 50000; i++) output += String(i % 10); console.log(output.length);", expected: { time: "O(n) typical", space: "O(n)", output: "50000" }, inputSizes: [100, 1000, 5000, 50000], notes: "Compare repeated concatenation with a language-appropriate buffering/join approach." },
  { id: "ECO-06", title: "Repeated search", category: "membership", language: "javascript", code: "const values = Array.from({ length: 10000 }, (_, i) => i); let hits = 0; for (let i = 0; i < 1000; i++) if (values.includes(i * 2)) hits++; console.log(hits);", expected: { time: "O(n·m)", space: "O(n)", output: "1000" }, inputSizes: [100, 1000, 10000], notes: "Repeated linear membership baseline for an indexed or hashed lookup." },
];

export function listBenchmarks() { return cases.map(({ code, ...metadata }) => metadata); }
export function getBenchmark(id: string) { return cases.find((item) => item.id.toLowerCase() === id.toLowerCase()) ?? null; }

function percentileMedian(values: number[]) { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)] ?? null; }
function stats(values: number[]) { if (!values.length) return null; const mean = values.reduce((sum, value) => sum + value, 0) / values.length; const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length; return { min: Number(Math.min(...values).toFixed(3)), max: Number(Math.max(...values).toFixed(3)), mean: Number(mean.toFixed(3)), median: Number((percentileMedian(values) ?? mean).toFixed(3)), standardDeviation: Number(Math.sqrt(variance).toFixed(3)), coefficientOfVariation: mean === 0 ? 0 : Number((Math.sqrt(variance) / mean).toFixed(4)) }; }

export async function runBenchmark(id: string, options: { warmups?: number; iterations?: number } = {}) {
  const benchmark = getBenchmark(id);
  if (!benchmark) return { status: "not_found" as const };
  const warmups = Number.isInteger(options.warmups) ? Math.max(0, Math.min(2, options.warmups as number)) : 2;
  const iterations = Number.isInteger(options.iterations) ? Math.max(1, Math.min(5, options.iterations as number)) : 5;
  const analysis = analyzeCode(benchmark.code, benchmark.language);
  for (let i = 0; i < warmups; i++) await executeCode(benchmark.code, benchmark.language);
  const runs: ExecutionResult[] = [];
  let compile: ExecutionResult | null = null;
  for (let i = 0; i < iterations; i++) {
    const run = await executeCode(benchmark.code, benchmark.language);
    compile ??= run.compile;
    if (run.execution) runs.push(run.execution);
    if (run.execution?.status !== "completed") break;
  }
  const completed = runs.filter((run) => run.status === "completed");
  const wall = stats(completed.flatMap((run) => run.wallTimeMs == null ? [] : [run.wallTimeMs]));
  const cpu = stats(completed.flatMap((run) => run.cpuTimeMs == null ? [] : [run.cpuTimeMs]));
  const memory = completed.flatMap((run) => run.peakMemoryKb == null ? [] : [run.peakMemoryKb]);
  const representative = completed[0] && wall ? { ...completed[0], wallTimeMs: wall.median, cpuTimeMs: cpu?.median ?? completed[0].cpuTimeMs, peakMemoryKb: memory.length ? Math.max(...memory) : completed[0].peakMemoryKb } : completed[0] ?? runs[0] ?? null;
  return { status: representative?.status === "completed" ? "completed" as const : representative?.status ?? "unavailable" as const, benchmark: { id: benchmark.id, title: benchmark.title, category: benchmark.category, language: benchmark.language, expected: benchmark.expected, inputSizes: benchmark.inputSizes, notes: benchmark.notes }, analysis, compile, execution: representative, samples: { warmups, iterationsRequested: iterations, iterationsCompleted: completed.length, wall, cpu, peakMemoryKb: memory.length ? Math.max(...memory) : null }, eco: ecoEstimate(representative, {}), model: { measured: representative?.measured === true, note: "Runtime and memory are measured only when the secure sandbox completes; energy and carbon remain modeled." } };
}
