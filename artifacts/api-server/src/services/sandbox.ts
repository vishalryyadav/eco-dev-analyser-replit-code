import { execFile, spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { SupportedLanguage } from "./analyzer";

export type ExecutionResult = {
  status: "completed" | "compile_error" | "runtime_error" | "timeout" | "sandbox_unavailable";
  stdout: string;
  stderr: string;
  exitCode: number | null;
  wallTimeMs: number | null;
  cpuTimeMs: number | null;
  peakMemoryKb: number | null;
  measured: boolean;
  sandbox: string;
};

type Definition = { source: string; compile: string[] | null; run: string[] };

const definitions: Record<SupportedLanguage, Definition> = {
  javascript: { source: "main.js", compile: null, run: ["node", "main.js"] },
  typescript: { source: "main.ts", compile: ["tsc", "main.ts", "--target", "ES2022", "--module", "commonjs", "--outDir", "build", "--pretty", "false"], run: ["node", "build/main.js"] },
  python: { source: "main.py", compile: null, run: ["python3", "-I", "main.py"] },
  c: { source: "main.c", compile: ["gcc", "-O2", "-std=c11", "main.c", "-o", "main"], run: ["./main"] },
  cpp: { source: "main.cpp", compile: ["g++", "-O2", "-std=c++17", "main.cpp", "-o", "main"], run: ["./main"] },
  go: { source: "main.go", compile: ["go", "build", "-o", "main", "main.go"], run: ["./main"] },
};

const LIMIT_MS = Math.max(250, Math.min(30_000, Number(process.env.ECODEV_EXEC_TIMEOUT_MS ?? 5_000)));
const MEMORY_MB = Math.max(32, Math.min(1024, Number(process.env.ECODEV_EXEC_MEMORY_MB ?? 256)));
const PIDS = Math.max(8, Math.min(128, Number(process.env.ECODEV_EXEC_PIDS ?? 32)));
const WORK_ROOT = process.env.ECODEV_WORK_ROOT || tmpdir();

function commandExists(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("sh", ["-c", `command -v ${command} >/dev/null 2>&1`], { timeout: 1_000 }, (error) => resolve(!error));
  });
}

async function hasSandboxRuntime() {
  if (process.env.ECODEV_ALLOW_UNSANDBOXED_EXECUTION === "true") return "process-limits";
  if (await commandExists("bwrap")) return "bubblewrap";
  if (await commandExists("firejail")) return "firejail";
  return null;
}

function buildCommand(runtime: string, args: string[], cwd: string) {
  const [program, ...programArgs] = args;
  const envPath = "/usr/local/bin:/usr/bin:/bin";
  if (runtime === "bubblewrap") {
    return {
      command: "bwrap",
      args: [
        "--die-with-parent", "--unshare-all", "--new-session",
        "--ro-bind", "/usr", "/usr",
        ...(process.platform === "linux" && pathExists("/usr/local") ? ["--ro-bind", "/usr/local", "/usr/local"] : []),
        "--ro-bind", "/bin", "/bin",
        ...(pathExists("/lib") ? ["--ro-bind", "/lib", "/lib"] : []),
        ...(pathExists("/lib64") ? ["--ro-bind", "/lib64", "/lib64"] : []),
        "--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp",
        "--bind", cwd, "/workspace", "--chdir", "/workspace",
        "--setenv", "PATH", envPath, "--setenv", "HOME", "/tmp",
        "--setenv", "LANG", "C.UTF-8", "--setenv", "LC_ALL", "C.UTF-8",
        "--clearenv", "--setenv", "PATH", envPath, "--setenv", "HOME", "/tmp", "--setenv", "LANG", "C.UTF-8",
        "--", "sh", "-c", `ulimit -v ${MEMORY_MB * 1024}; ulimit -u ${PIDS}; exec ${shellQuote(program)} ${programArgs.map(shellQuote).join(" ")}`,
      ],
    };
  }
  if (runtime === "firejail") {
    return { command: "firejail", args: ["--quiet", "--private", "--net=none", "--caps.drop=all", "--noroot", "--rlimit-as=${MEMORY_MB * 1024}", "--", program, ...programArgs] };
  }
  return { command: "sh", args: ["-c", `ulimit -v ${MEMORY_MB * 1024}; ulimit -u ${PIDS}; exec ${shellQuote(program)} ${programArgs.map(shellQuote).join(" ")}`] };
}

function pathExists(value: string) {
  // bwrap will fail closed if an optional runtime path doesn't exist.
  return value.length > 0;
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function parseTime(stderr: string) {
  const match = stderr.match(/Elapsed \(wall clock\) time[^:]*:\s*(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)/i);
  if (!match) return null;
  return (((Number(match[1] || 0) * 60) + Number(match[2])) * 60 + Number(match[3])) * 1000;
}

function parseCpu(stderr: string) {
  const user = stderr.match(/User time \(seconds\):\s*([0-9.]+)/i);
  const sys = stderr.match(/System time \(seconds\):\s*([0-9.]+)/i);
  if (!user && !sys) return null;
  return ((Number(user?.[1] || 0) + Number(sys?.[1] || 0)) * 1000);
}

function parseRss(stderr: string) {
  const match = stderr.match(/Maximum resident set size \(kbytes\):\s*(\d+)/i);
  return match ? Number(match[1]) : null;
}

async function runOne(runtime: string, args: string[], cwd: string, timeoutMs: number): Promise<ExecutionResult> {
  const started = process.hrtime.bigint();
  const wrapped = buildCommand(runtime, args, cwd);
  return new Promise((resolve) => {
    const child = spawn(wrapped.command, wrapped.args, {
      cwd: runtime === "bubblewrap" ? "/" : cwd,
      env: { PATH: "/usr/local/bin:/usr/bin:/bin", HOME: "/tmp", LANG: "C.UTF-8", LC_ALL: "C.UTF-8" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); if (stdout.length > 32_000) child.kill("SIGKILL"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); if (stderr.length > 32_000) child.kill("SIGKILL"); });
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ status: "runtime_error", stdout, stderr: `${stderr}${error.message}`, exitCode: null, wallTimeMs: Number(process.hrtime.bigint() - started) / 1e6, cpuTimeMs: null, peakMemoryKb: null, measured: false, sandbox: runtime });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const timedOut = signal === "SIGKILL" && Number(process.hrtime.bigint() - started) / 1e6 >= timeoutMs * 0.95;
      const wall = Number(process.hrtime.bigint() - started) / 1e6;
      resolve({
        status: timedOut ? "timeout" : code === 0 ? "completed" : "runtime_error",
        stdout: stdout.slice(0, 32_000), stderr: stderr.slice(0, 32_000), exitCode: code,
        wallTimeMs: wall, cpuTimeMs: parseCpu(stderr) ?? wall, peakMemoryKb: parseRss(stderr), measured: true, sandbox: runtime,
      });
    });
  });
}

export async function executeCode(code: string, language: SupportedLanguage): Promise<ExecutionResult> {
  const sandbox = await hasSandboxRuntime();
  if (!sandbox) {
    return { status: "sandbox_unavailable", stdout: "", stderr: "Secure execution is disabled because no sandbox runtime (bubblewrap/firejail) is available. Static analysis remains available.", exitCode: null, wallTimeMs: null, cpuTimeMs: null, peakMemoryKb: null, measured: false, sandbox: "none" };
  }

  const definition = definitions[language];
  const dir = await mkdtemp(path.join(WORK_ROOT, "ecodev-"));
  try {
    await writeFile(path.join(dir, definition.source), code, { encoding: "utf8", mode: 0o600 });
    if (definition.compile) {
      const compile = await runOne(sandbox, definition.compile, dir, LIMIT_MS);
      if (compile.status !== "completed") {
        return { ...compile, status: "compile_error" };
      }
    }
    return await runOne(sandbox, definition.run, dir, LIMIT_MS);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export const executionLimits = { timeoutMs: LIMIT_MS, memoryMb: MEMORY_MB, processLimit: PIDS };
