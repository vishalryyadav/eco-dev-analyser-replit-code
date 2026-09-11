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
  typescript: {
    source: "main.ts",
    compile: ["tsc", "main.ts", "--target", "ES2022", "--module", "commonjs", "--outDir", "build", "--pretty", "false"],
    run: ["node", "build/main.js"],
  },
  python: { source: "main.py", compile: null, run: ["python3", "-I", "main.py"] },
  c: { source: "main.c", compile: ["gcc", "-O2", "-std=c11", "main.c", "-o", "main"], run: ["./main"] },
  cpp: { source: "main.cpp", compile: ["g++", "-O2", "-std=c++17", "main.cpp", "-o", "main"], run: ["./main"] },
  go: { source: "main.go", compile: ["go", "build", "-o", "main", "main.go"], run: ["./main"] },
};

const LIMIT_MS = Math.max(250, Math.min(30_000, Number(process.env.ECODEV_EXEC_TIMEOUT_MS ?? 5_000)));
const MEMORY_MB = Math.max(32, Math.min(1024, Number(process.env.ECODEV_EXEC_MEMORY_MB ?? 256)));
const PIDS = Math.max(8, Math.min(128, Number(process.env.ECODEV_EXEC_PIDS ?? 32)));
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
      "--ro-bind", "/usr", "/usr",
      "--ro-bind", "/bin", "/bin",
      "--ro-bind", "/lib", "/lib",
      "--proc", "/proc",
      "--dev", "/dev",
      "--tmpfs", "/tmp",
      "--bind", cwd, "/workspace",
      "--chdir", "/workspace",
    ];
    if (process.platform === "linux") binds.push("--ro-bind", "/usr/local", "/usr/local");
    if (process.platform === "linux") binds.push("--ro-bind-try", "/lib64", "/lib64");

    return {
      command: "bwrap",
      args: [
        "--die-with-parent",
        "--unshare-all",
        "--new-session",
        ...binds,
        "--clearenv",
        "--setenv", "PATH", "/usr/local/bin:/usr/bin:/bin",
        "--setenv", "HOME", "/tmp",
        "--setenv", "LANG", "C.UTF-8",
        "--setenv", "LC_ALL", "C.UTF-8",
        "--",
        "sh", "-c", limited,
      ],
    };
  }

  return {
    command: "firejail",
    args: [
      "--quiet",
      "--private",
      "--net=none",
      "--caps.drop=all",
      "--noroot",
      `--rlimit-as=${MEMORY_MB * 1024}`,
      "--",
      "sh", "-c", limited,
    ],
  };
}

function parseCpu(stderr: string) {
  const user = stderr.match(/User time \(seconds\):\s*([0-9.]+)/i);
  const sys = stderr.match(/System time \(seconds\):\s*([0-9.]+)/i);
  return user || sys ? (Number(user?.[1] || 0) + Number(sys?.[1] || 0)) * 1000 : null;
}

function parseRss(stderr: string) {
  const m = stderr.match(/Maximum resident set size \(kbytes\):\s*(\d+)/i);
  return m ? Number(m[1]) : null;
}

function cap(value: string) {
  return value.slice(0, OUTPUT_LIMIT);
}

async function runOne(
  runtime: "bubblewrap" | "firejail",
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<ExecutionResult> {
  const started = process.hrtime.bigint();
  const wrapped = buildCommand(runtime, args, cwd);

  return new Promise((resolve) => {
    const child = spawn(wrapped.command, wrapped.args, {
      cwd: runtime === "bubblewrap" ? "/" : cwd,
      env: {
        PATH: "/usr/local/bin:/usr/bin:/bin",
        HOME: "/tmp",
        LANG: "C.UTF-8",
        LC_ALL: "C.UTF-8",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let outputKilled = false;

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      if (stdout.length > OUTPUT_LIMIT && !outputKilled) {
        outputKilled = true;
        child.kill("SIGKILL");
      }
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > OUTPUT_LIMIT && !outputKilled) {
        outputKilled = true;
        child.kill("SIGKILL");
      }
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        status: "runtime_error",
        stdout: cap(stdout),
        stderr: cap(`${stderr}${error.message}`),
        exitCode: null,
        wallTimeMs: Number(process.hrtime.bigint() - started) / 1e6,
        cpuTimeMs: null,
        peakMemoryKb: null,
        measured: false,
        sandbox: runtime,
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const wall = Number(process.hrtime.bigint() - started) / 1e6;
      resolve({
        status: timedOut ? "timeout" : code === 0 ? "completed" : "runtime_error",
        stdout: cap(stdout),
        stderr: cap(stderr),
        exitCode: code,
        wallTimeMs: wall,
        cpuTimeMs: parseCpu(stderr) ?? (code === 0 && !timedOut && !outputKilled ? wall : null),
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
      if (compile.status !== "completed") {
        return { compile: { ...compile, status: "compile_error" }, execution: null };
      }
    }

    return { compile, execution: await runOne(sandbox, def.run, dir, LIMIT_MS) };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export const executionLimits = { timeoutMs: LIMIT_MS, memoryMb: MEMORY_MB, processLimit: PIDS };
