import { analyzeCode, type SupportedLanguage } from "./analyzer.ts";
import { aggregateRuns, validateExpectedOutput } from "./benchmark-harness.ts";
import { ecoEstimate } from "./eco.ts";
import { executeCode, type ExecutionResult } from "./sandbox.ts";

export type BenchmarkStatus = "IMPLEMENTED" | "UNAVAILABLE";
type Workload = { code: string; expectedOutput: string };
export type BenchmarkCase = {
  id: string;
  title: string;
  category: string;
  language: SupportedLanguage;
  expected: { time: string; space: string };
  inputSizes: number[];
  notes: string;
  workload: (inputSize: number) => Workload;
};

function javascriptWorkload(inputSize: number, body: string, expectedOutput: string): Workload {
  return { code: `const inputSize = ${inputSize};\n${body}`, expectedOutput };
}

const cases: BenchmarkCase[] = [
  { id: "ECO-01", title: "Sum", category: "linear reduction", language: "javascript", expected: { time: "O(n)", space: "O(1) auxiliary" }, inputSizes: [100, 1000, 5000, 10000], notes: "Manual accumulation compared with a language-appropriate reduction.", workload: (size) => javascriptWorkload(size, "let total = 0; for (let index = 0; index < inputSize; index += 1) total += index; console.log(total);", String(size * (size - 1) / 2)) },
  { id: "ECO-02", title: "Duplicate detection", category: "lookup", language: "javascript", expected: { time: "O(n²)", space: "O(1) auxiliary" }, inputSizes: [100, 1000, 2000], notes: "Nested comparison baseline for a Set/Map alternative.", workload: (size) => javascriptWorkload(size, "const values = Array.from({ length: inputSize }, (_, index) => index); let duplicate = false; for (let left = 0; left < values.length; left += 1) for (let right = left + 1; right < values.length; right += 1) if (values[left] === values[right]) duplicate = true; console.log(duplicate);", "false") },
  { id: "ECO-03", title: "Bubble sort", category: "sorting", language: "javascript", expected: { time: "O(n²)", space: "O(1) auxiliary" }, inputSizes: [100, 1000, 10000], notes: "Quadratic sorting baseline for the platform sort implementation.", workload: (size) => javascriptWorkload(size, "const values = Array.from({ length: inputSize }, (_, index) => inputSize - index); for (let outer = 0; outer < values.length; outer += 1) for (let inner = 0; inner < values.length - outer - 1; inner += 1) if (values[inner] > values[inner + 1]) [values[inner], values[inner + 1]] = [values[inner + 1], values[inner]]; console.log(values[0]);", "1") },
  { id: "ECO-04", title: "Fibonacci", category: "recursion", language: "javascript", expected: { time: "O(2^n)", space: "O(n) stack" }, inputSizes: [10, 20, 25, 30], notes: "Small safe input only; never scale this exponential case automatically to large values.", workload: (size) => javascriptWorkload(size, "function fibonacci(value) { return value < 2 ? value : fibonacci(value - 1) + fibonacci(value - 2); } console.log(fibonacci(inputSize));", String([0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597, 2584, 4181, 6765, 10946, 17711, 28657, 46368, 75025, 121393, 196418, 317811, 514229, 832040][size] ?? "UNSUPPORTED")) },
  { id: "ECO-05", title: "String construction", category: "allocation", language: "javascript", expected: { time: "O(n) typical", space: "O(n)" }, inputSizes: [100, 1000, 5000, 50000], notes: "Compare repeated concatenation with a language-appropriate buffering/join approach.", workload: (size) => javascriptWorkload(size, "let output = \"\"; for (let index = 0; index < inputSize; index += 1) output += String(index % 10); console.log(output.length);", String(size)) },
  { id: "ECO-06", title: "Repeated search", category: "membership", language: "javascript", expected: { time: "O(n·m)", space: "O(n)" }, inputSizes: [100, 1000, 10000], notes: "Repeated linear membership baseline for an indexed or hashed lookup.", workload: (size) => javascriptWorkload(size, "const values = Array.from({ length: inputSize }, (_, index) => index); const searches = Math.min(1000, inputSize); let hits = 0; for (let index = 0; index < searches; index += 1) if (values.includes(index * 2)) hits += 1; console.log(hits);", String(Math.min(1000, Math.ceil(size / 2)))) },
];

const languages: SupportedLanguage[] = ["javascript", "typescript", "python", "c", "cpp", "go"];

export function benchmarkAvailability() { return languages.map((language) => ({ language, status: cases.some((item) => item.language === language) ? "IMPLEMENTED" as const : "UNAVAILABLE" as const })); }
export function listBenchmarks() { return cases.map(({ workload, ...metadata }) => ({ ...metadata, status: "IMPLEMENTED" as const })); }
export function getBenchmark(id: string) { return cases.find((item) => item.id.toLowerCase() === id.toLowerCase()) ?? null; }
export function createBenchmarkWorkload(id: string, inputSize: number) {
  const benchmark = getBenchmark(id);
  if (!benchmark || !benchmark.inputSizes.includes(inputSize)) return null;
  return { benchmark, inputSize, ...benchmark.workload(inputSize) };
}

function bounded(value: number | undefined, fallback: number, minimum: number, maximum: number) { return Number.isInteger(value) ? Math.max(minimum, Math.min(maximum, value as number)) : fallback; }

export async function runBenchmark(id: string, options: { inputSize?: number; warmups?: number; iterations?: number; execute?: (code: string, language: SupportedLanguage) => Promise<{ compile: ExecutionResult | null; execution: ExecutionResult | null }> } = {}) {
  const benchmark = getBenchmark(id);
  if (!benchmark) return { status: "not_found" as const };
  const inputSize = options.inputSize ?? benchmark.inputSizes[benchmark.inputSizes.length - 1];
  const workload = createBenchmarkWorkload(id, inputSize);
  if (!workload) return { status: "invalid_input_size" as const, benchmark: { id: benchmark.id, inputSizes: benchmark.inputSizes } };
  const warmups = bounded(options.warmups, 2, 0, 2);
  const iterations = bounded(options.iterations, 3, 1, 5);
  const execute = options.execute ?? executeCode;
  const analysis = analyzeCode(workload.code, benchmark.language);
  for (let index = 0; index < warmups; index += 1) await execute(workload.code, benchmark.language);
  const runs: ExecutionResult[] = [];
  let compile: ExecutionResult | null = null;
  for (let index = 0; index < iterations; index += 1) {
    const run = await execute(workload.code, benchmark.language);
    compile ??= run.compile;
    if (run.execution) runs.push(run.execution);
    if (run.execution?.status !== "completed") break;
  }
  const aggregate = aggregateRuns(runs);
  const correctness = validateExpectedOutput(runs, workload.expectedOutput);
  const benchmarkStatus: BenchmarkStatus = "IMPLEMENTED";
  return { status: aggregate.representative?.status === "completed" ? "completed" as const : aggregate.representative?.status ?? "unavailable" as const, benchmark: { id: benchmark.id, title: benchmark.title, category: benchmark.category, language: benchmark.language, expected: benchmark.expected, inputSizes: benchmark.inputSizes, notes: benchmark.notes, status: benchmarkStatus, inputSize, expectedOutput: workload.expectedOutput }, analysis, compile, execution: aggregate.representative, samples: { warmups, iterationsRequested: iterations, iterationsCompleted: aggregate.completed, medianWallTimeMs: aggregate.wallTimeMs, medianCpuTimeMs: aggregate.cpuTimeMs, maximumRssKb: aggregate.peakMemoryKb, runs: runs.length }, correctness, eco: ecoEstimate(aggregate.representative, {}), model: { measured: aggregate.representative?.measured === true, note: "Runtime and memory are measured only when the secure sandbox completes; energy and carbon remain modeled." } };
}
