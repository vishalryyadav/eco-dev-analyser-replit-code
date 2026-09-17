import { spawn } from "node:child_process";
import { access, constants, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import type { SupportedLanguage } from "./analyzer";
import { logger } from "../lib/logger.ts";

export type ExecutionStatus = "completed" | "compile_error" | "runtime_error" | "timeout" | "output_limit" | "sandbox_unavailable" | "sandbox_busy";
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
export type ExecutionOptions = { input?: string };
type Definition = { source: string; compile: string[] | null; run: string[] };

const definitions: Record<SupportedLanguage, Definition> = {
  javascript: { source: "main.js", compile: null, run: ["node", "--max-old-space-size=192", "main.js"] },
  typescript: { source: "main.ts", compile: ["node", "--max-old-space-size=384", "/opt/ecodev-typescript/bin/tsc", "main.ts", "--target", "ES2022", "--module", "commonjs", "--outDir", "build", "--pretty", "false"], run: ["node", "--max-old-space-size=192", "build/main.js"] },
  python: { source: "main.py", compile: null, run: ["python3", "-I", "main.py"] },
  c: { source: "main.c", compile: ["gcc", "-O2", "-std=c11", "-D_POSIX_C_SOURCE=200809L", "main.c", "-o", "main", "-lm"], run: ["./main"] },
  cpp: { source: "main.cpp", compile: ["g++", "-O2", "-std=c++17", "main.cpp", "-o", "main"], run: ["./main"] },
  go: { source: "main.go", compile: ["go", "build", "-p", "1", "-o", "main", "main.go"], run: ["./main"] },
};

function positiveNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const LIMIT_MS = Math.max(250, Math.min(30_000, positiveNumber("ECODEV_EXEC_TIMEOUT_MS", 5_000)));
// Compilers, especially a cold Go toolchain, need more time than submitted
// programs. This remains independently bounded and never changes run limits.
const COMPILE_LIMIT_MS = Math.max(LIMIT_MS, Math.min(30_000, positiveNumber("ECODEV_COMPILE_TIMEOUT_MS", 20_000)));
const MEMORY_MB = Math.max(32, Math.min(1_024, positiveNumber("ECODEV_EXEC_MEMORY_MB", 256)));
const PIDS = Math.max(8, Math.min(128, positiveNumber("ECODEV_EXEC_PIDS", 128)));
const WORK_ROOT = process.env.ECODEV_WORK_ROOT || tmpdir();
const OUTPUT_LIMIT = 32_000;
const FILE_SIZE_KB = Math.max(64, Math.min(16_384, Math.floor(positiveNumber("ECODEV_EXEC_FILE_SIZE_KB", 1_024))));
const MAX_CONCURRENT_EXECUTIONS = Math.max(1, Math.min(4, Math.floor(positiveNumber("ECODEV_EXEC_CONCURRENCY", 1))));
let activeExecutions = 0;
// A WSL installation may use an operator-managed Node distribution outside
// /usr.  Bind that trusted runtime read-only into the existing Bubblewrap
// namespace so submitted JavaScript still never executes in the backend.
const SANDBOX_NODE_ROOT = process.env.ECODEV_SANDBOX_NODE_ROOT || path.dirname(path.dirname(process.execPath));
const SANDBOX_TSC_ROOT = process.env.ECODEV_SANDBOX_TSC_ROOT || path.resolve(process.cwd(), "node_modules", "typescript");
const requireFromHere = createRequire(import.meta.url);
let resolvedTypeScriptRoot: Promise<string | null> | null = null;

async function sandboxTypeScriptRoot() {
  resolvedTypeScriptRoot ??= (async () => {
    // pnpm commonly exposes node_modules/typescript as a symlink. Bubblewrap
    // must receive the resolved target, otherwise /opt/ecodev-typescript can
    // contain a dangling link inside the isolated namespace.
    // A workspace command may set cwd to artifacts/api-server, where TypeScript
    // is not directly linked. Resolve it from this module as well so the same
    // secure mount works in tests and when the server starts from a subfolder.
    let resolvedModuleRoot: string | null = null;
    try { resolvedModuleRoot = path.dirname(requireFromHere.resolve("typescript/package.json")); } catch {}
    for (const candidate of [SANDBOX_TSC_ROOT, resolvedModuleRoot, "/usr/local/lib/node_modules/typescript"]) {
      if (!candidate) continue;
      try { return await realpath(candidate); } catch {}
    }
    return null;
  })();
  return resolvedTypeScriptRoot;
}

async function executableAvailable(paths: string[]) {
  for (const candidate of paths) {
    try { await access(candidate, constants.X_OK); return true; } catch {}
  }
  return false;
}

async function findSandbox() {
  if (await executableAvailable(["/usr/bin/bwrap", "/bin/bwrap", "/usr/local/bin/bwrap"])) return "bubblewrap" as const;
  if (await executableAvailable(["/usr/bin/firejail", "/bin/firejail", "/usr/local/bin/firejail"])) return "firejail" as const;
  return null;
}

function quote(value: string) {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function commandLine(args: string[]) {
  return args.map(quote).join(" ");
}

function buildCommand(runtime: "bubblewrap" | "firejail", args: string[], cwd: string, timeoutMs: number, typeScriptRoot: string | null, compilation = false, largeVirtualAddressSpace = false) {
  const command = commandLine(args);
  // Node plus the Go compiler/runtime reserve large virtual address spaces on
  // startup. Applying RLIMIT_AS to those tools makes harmless programs fail before they
  // execute; the outer deployment still enforces the physical-memory ceiling.
  const usesLargeCompilerAddressSpace = largeVirtualAddressSpace || args[0] === "node" || args[0] === "tsc" || args[0] === "go";
  const memoryLimit = usesLargeCompilerAddressSpace ? "" : `ulimit -v ${MEMORY_MB * 1024} 2>/dev/null || true; `;
  // `ulimit -f` uses 512-byte blocks. It bounds generated artifacts and files
  // within one run; the deployment must additionally put WORK_ROOT on a sized tmpfs.
  // Go's standard-library compilation writes individual cache artifacts above
  // the normal submitted-file cap. Keep a bounded 16 MiB compiler-file cap;
  // the executed user program retains the configured cap.
  const fileSizeKb = compilation && args[0] === "go" ? Math.max(FILE_SIZE_KB, 16_384) : FILE_SIZE_KB;
  const limitScript = `${memoryLimit}ulimit -u ${PIDS} 2>/dev/null || true; ulimit -f ${fileSizeKb * 2} 2>/dev/null || true; ulimit -t ${Math.max(1, Math.ceil(timeoutMs / 1000))} 2>/dev/null || true; exec ${command}`;
  const limited = `if [ -x /usr/bin/time ]; then /usr/bin/time -v sh -c ${quote(limitScript)}; else sh -c ${quote(limitScript)}; fi`;

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
      "--dir", "/opt",
      "--tmpfs", "/tmp",
      "--bind", cwd, "/workspace",
      "--chdir", "/workspace",
      "--clearenv",
      "--setenv", "PATH", "/usr/local/bin:/usr/bin:/bin",
      "--setenv", "HOME", "/tmp",
      "--setenv", "LANG", "C.UTF-8",
      "--setenv", "LC_ALL", "C.UTF-8",
      "--setenv", "GOMAXPROCS", "1",
    ];
    binds.push("--ro-bind-try", "/usr/local", "/usr/local");
    binds.push("--ro-bind-try", "/lib64", "/lib64");
    if (typeScriptRoot) binds.push("--ro-bind", typeScriptRoot, "/opt/ecodev-typescript");
    if (SANDBOX_NODE_ROOT !== "/usr" && SANDBOX_NODE_ROOT !== "/usr/local") {
      binds.push("--ro-bind", SANDBOX_NODE_ROOT, "/opt/ecodev-node");
      binds.push("--setenv", "PATH", "/opt/ecodev-node/bin:/usr/local/bin:/usr/bin:/bin");
    }
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

function runnerFailedToInitialize(runtime: "bubblewrap" | "firejail", code: number | null, stderr: string) {
  return code !== 0 && (new RegExp(`^${runtime === "bubblewrap" ? "bwrap" : "firejail"}:`, "i").test(stderr.trim()) || /(?:failed to create|no permissions to create) new namespace/i.test(stderr));
}

function terminate(child: ReturnType<typeof spawn>, signal: NodeJS.Signals) {
  try {
    if (child.pid && process.platform !== "win32") process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch {}
}

async function runOne(runtime: "bubblewrap" | "firejail", args: string[], cwd: string, timeoutMs: number, compilation = false, largeVirtualAddressSpace = false, input?: string): Promise<ExecutionResult> {
  const started = process.hrtime.bigint();
  const typeScriptRoot = await sandboxTypeScriptRoot();
  const wrapped = buildCommand(runtime, args, cwd, timeoutMs, typeScriptRoot, compilation, largeVirtualAddressSpace);

  return new Promise((resolve) => {
    const child = spawn(wrapped.command, wrapped.args, {
      cwd: "/",
      env: { PATH: "/usr/local/bin:/usr/bin:/bin", HOME: "/tmp", LANG: "C.UTF-8", LC_ALL: "C.UTF-8", GOMAXPROCS: "1" },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      detached: process.platform !== "win32",
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let outputKilled = false;
    let outputBytes = 0;

    const append = (target: "stdout" | "stderr", chunk: Buffer | string) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const remaining = Math.max(0, OUTPUT_LIMIT - outputBytes);
      const captured = bytes.subarray(0, remaining).toString("utf8");
      outputBytes += Math.min(bytes.length, remaining);
      if (target === "stdout") stdout += captured;
      else stderr += captured;
      if (bytes.length > remaining && !outputKilled) {
        outputKilled = true;
        terminate(child, "SIGKILL");
      }
    };

    child.stdout.on("data", (chunk: Buffer) => append("stdout", chunk));
    child.stderr.on("data", (chunk: Buffer) => append("stderr", chunk));
    // Representative input is delivered only over the sandboxed program's stdin.
    // It is bounded before this point and is never interpolated into a shell command.
    child.stdin.end(input ?? "");

    const timer = setTimeout(() => {
      timedOut = true;
      terminate(child, "SIGKILL");
    }, timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timer);
      const wallTimeMs = Number(process.hrtime.bigint() - started) / 1e6;
      // Spawn errors describe the host runner rather than the submitted program.
      // Keep their diagnostics in server logs instead of reflecting paths/configuration.
      resolve({ status: "sandbox_unavailable", stdout: "", stderr: "Secure execution could not start in this deployment. Static analysis remains available.", exitCode: null, signal: null, wallTimeMs, cpuTimeMs: null, peakMemoryKb: null, measured: false, sandbox: runtime });
    });

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const wallTimeMs = Number(process.hrtime.bigint() - started) / 1e6;
      if (runnerFailedToInitialize(runtime, code, stderr)) {
        logger.warn({ sandbox: runtime, exitCode: code, stderr: cap(stderr) }, "Secure runner initialization failed");
        return resolve({ status: "sandbox_unavailable", stdout: "", stderr: "Secure execution is unavailable in this deployment. Static analysis remains available.", exitCode: null, signal: null, wallTimeMs: null, cpuTimeMs: null, peakMemoryKb: null, measured: false, sandbox: runtime });
      }
      resolve({
        status: timedOut ? "timeout" : outputKilled ? "output_limit" : code === 0 ? "completed" : "runtime_error",
        stdout: cap(stdout),
        stderr: cap(outputKilled ? `${stderr}\n[output limit exceeded]` : stderr),
        exitCode: code,
        signal,
        wallTimeMs,
        cpuTimeMs: parseCpu(stderr),
        peakMemoryKb: parseRss(stderr),
        measured: !timedOut && !outputKilled && code === 0,
        sandbox: runtime,
      });
    });
  });
}

export async function executeCode(code: string, language: SupportedLanguage, options: ExecutionOptions = {}): Promise<SandboxRun> {
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

  if (activeExecutions >= MAX_CONCURRENT_EXECUTIONS) {
    return { compile: null, execution: { status: "sandbox_busy", stdout: "", stderr: "The secure runner is busy. Please retry shortly.", exitCode: null, signal: null, wallTimeMs: null, cpuTimeMs: null, peakMemoryKb: null, measured: false, sandbox } };
  }
  activeExecutions += 1;

  const def = definitions[language];
  try {
    const dir = await mkdtemp(path.join(WORK_ROOT, "ecodev-"));
    try {
    await writeFile(path.join(dir, def.source), code, { encoding: "utf8", mode: 0o600 });
    let compile: ExecutionResult | null = null;
    if (def.compile) {
      compile = await runOne(sandbox, def.compile, dir, COMPILE_LIMIT_MS, true, language === "go");
      if (compile.status !== "completed") {
        return { compile: compile.status === "sandbox_unavailable" ? compile : { ...compile, status: "compile_error" }, execution: null };
      }
    }
    return { compile, execution: await runOne(sandbox, def.run, dir, LIMIT_MS, false, language === "go", options.input) };
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  } finally {
    activeExecutions -= 1;
  }
}

export const executionLimits = { timeoutMs: LIMIT_MS, memoryMb: MEMORY_MB, processLimit: PIDS, fileSizeKb: FILE_SIZE_KB, concurrency: MAX_CONCURRENT_EXECUTIONS, outputLimitBytes: OUTPUT_LIMIT };
