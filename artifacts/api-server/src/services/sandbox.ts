import { execFile, spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { SupportedLanguage } from "./analyzer";

export type ExecutionStatus = "completed" | "compile_error" | "runtime_error" | "timeout" | "sandbox_unavailable";
export type ExecutionResult = {
  status: ExecutionStatus;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: string | null;
  wallTimeMs: number | null;
  cpuTimeMs: number | null;
  peakMemoryKb: number | null;
  measured: boolean;
  sandbox: string;
};
export type SandboxRun = { compile: ExecutionResult | null; execution: ExecutionResult | null };
type Definition = { source: string; compile: string[] | null; run: string[] };

const definitions: Record<SupportedLanguage, Definition> = {
  javascript: { source: "main.js", compile: null, run: ["node", "main.js"] },
  typescript: { source: "main.ts", compile: ["tsc", "main.ts", "--target", "ES2022", "--module", "commonjs", "--outDir", "build", "--pretty", "false"], run: ["node", "build/main.js"] },
  python: { source: "main.py", compile: null, run: ["python3", "-I", "main.py"] },
  c: { source: "main.c", compile: ["gcc", "-O2", "-std=c11", "main.c", "-o", "main"], run: ["./main"] },
  cpp: { source: "main.cpp", compile: ["g++", "-O2", "-std=c++17", "main.cpp", "-o", "main"], run: ["./main"] },
  go: { source: "main.go", compile: ["go", "build", "-o", "main", "main.go"], run: ["./main"] },
};

function positiveNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const LIMIT_MS = Math.max(250, Math.min(30_000, positiveNumber("ECODEV_EXEC_TIMEOUT_MS", 5_000)));
const MEMORY_MB = Math.max(32, Math.min(1_024, positiveNumber("ECODEV_EXEC_MEMORY_MB", 256)));
const PIDS = Math.max(8, Math.min(128, positiveNumber("ECODEV_EXEC_PIDS", 32)));
const WORK_ROOT = process.env.ECODEV_WORK_ROOT || tmpdir();
const OUTPUT_LIMIT = 32_000;

function commandExists(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("sh", ["-c", `command -v ${command} >/dev/null 2>&1`], { timeout: 1_000 }, (error) => resolve(!error));
  });
}

async function findSandbox() {
  if (await commandExists("bwrap")) return "bubblewrap" as const;
  if (await commandExists("firejail")) return "firejail" as const;
  return null;
}

function quote(value: string) {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function commandLine(args: string[]) {
  return args.map(quote).join(" ");
}

function buildCommand(runtime: "bubblewrap" | "firejail", args: string[], cwd: string) {
  const command = commandLine(args);
  const limited = `ulimit -v ${MEMORY_MB * 1024}; ulimit -u ${PIDS}; if [ -x /usr/bin/time ]; then /usr/bin/time -v sh -c ${quote(command)}; else sh -c ${quote(command)}; fi`;

  if (runtime === "bubblewrap") {
    const binds: string[] = [
      "--die-with-parent",
      "--unshare-all",
      "--new-session",
      "--ro-bind", "/usr", "/usr",
      "--ro-bind", "/bin", "/bin",
      "--ro-bind", "/lib", "/lib",
      "--proc", "/proc",
      "--dev", "/dev",
      "--tmpfs", "/tmp",
      "--bind", cwd, "/workspace",
      "--chdir", "/workspace",
      "--clearenv",
      "--setenv", "PATH", "/usr/local/bin:/usr/bin:/bin",
      "--setenv", "HOME", "/tmp",
      "--setenv", "LANG", "C.UTF-8",
      "--setenv", "LC_ALL", "C.UTF-8",
    ];
    binds.push("--ro-bind-try", "/usr/local", "/usr/local");
    binds.push("--ro-bind-try", "/lib64", "/lib64");
    return { command: "bwrap", args: [...binds, "--", "sh", "-c", limited] };
  }

  return {
    command: "firejail",
    args: ["--quiet", "--private", "--net=none", "--caps.drop=all", "--noroot", `--rlimit-as=${MEMORY_MB * 1024}`, "--rlimit-nproc=${PIDS}", "--", "sh", "-c", limited],
  };
}

function parseCpu(stderr: string) {
  const user = stderr.match(/User time \(seconds\):\s*([0-9.]+)/i);
  const sys = stderr.match(/System time \(seconds\):\s*([0-9.]+)/i);
  return user || sys ? (Number(user?.[1] || 0) + Number(sys?.[1] || 0)) * 1_000 : null;
}

function parseRss(stderr: string) {
  const match = stderr.match(/Maximum resident set size \(kbytes\):\s*(\d+)/i);
  return match ? Number(match[1]) : null;
}

function cap(value: string) {
  return value.length > OUTPUT_LIMIT ? `${value.slice(0, OUTPUT_LIMIT)}\n[output truncated]` : value;
}

async function runOne(runtime: "bubblewrap" | "firejail", args: string[], cwd: string, timeoutMs: number): Promise<ExecutionResult> {
  const started = process.hrtime.bigint();
  const wrapped = buildCommand(runtime, args, cwd);

  return new Promise((resolve) => {
    const child = spawn(wrapped.command, wrapped.args, {
      cwd: "/",
      env: { PATH: "/usr/local/bin:/usr/bin:/bin", HOME: "/tmp", LANG: "C.UTF-8", LC_ALL: "C.UTF-8" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let outputKilled = false;

    const append = (target: "stdout" | "stderr", chunk: Buffer | string) => {
      if (target === "stdout") stdout += chunk.toString();
      else stderr += chunk.toString();
      if ((stdout.length > OUTPUT_LIMIT || stderr.length > OUTPUT_LIMIT) && !outputKilled) {
        outputKilled = true;
        child.kill("SIGKILL");
      }
    };

    child.stdout.on("data", (chunk: Buffer) => append("stdout", chunk));
    child.stderr.on("data", (chunk: Buffer) => append("stderr", chunk));

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timer);
      const wallTimeMs = Number(process.hrtime.bigint() - started) / 1e6;
      resolve({ status: "runtime_error", stdout: cap(stdout), stderr: cap(`${stderr}${error.message}`), exitCode: null, signal: null, wallTimeMs, cpuTimeMs: null, peakMemoryKb: null, measured: false, sandbox: runtime });
    });

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const wallTimeMs = Number(process.hrtime.bigint() - started) / 1e6;
      resolve({
        status: timedOut ? "timeout" : code === 0 ? "completed" : "runtime_error",
        stdout: cap(stdout),
        stderr: cap(outputKilled ? `${stderr}\n[output limit exceeded]` : stderr),
        exitCode: code,
        signal,
        wallTimeMs,
        cpuTimeMs: parseCpu(stderr),
        peakMemoryKb: parseRss(stderr),
        measured: !outputKilled,
        sandbox: runtime,
      });
    });
  });
}

export async function executeCode(code: string, language: SupportedLanguage): Promise<SandboxRun> {
  const sandbox = await findSandbox();
  if (!sandbox) {
    const unavailable: ExecutionResult = {
      status: "sandbox_unavailable",
      stdout: "",
      stderr: "Secure execution is unavailable in this deployment because Bubblewrap and Firejail were not found. Static analysis remains available.",
      exitCode: null,
      signal: null,
      wallTimeMs: null,
      cpuTimeMs: null,
      peakMemoryKb: null,
      measured: false,
      sandbox: "none",
    };
    return { compile: null, execution: unavailable };
  }

  const def = definitions[language];
  const dir = await mkdtemp(path.join(WORK_ROOT, "ecodev-"));
  try {
    await writeFile(path.join(dir, def.source), code, { encoding: "utf8", mode: 0o600 });
    let compile: ExecutionResult | null = null;
    if (def.compile) {
      compile = await runOne(sandbox, def.compile, dir, LIMIT_MS);
      if (compile.status !== "completed") return { compile: { ...compile, status: "compile_error" }, execution: null };
    }
    return { compile, execution: await runOne(sandbox, def.run, dir, LIMIT_MS) };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export const executionLimits = { timeoutMs: LIMIT_MS, memoryMb: MEMORY_MB, processLimit: PIDS };
