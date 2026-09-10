import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import http from "node:http";

const exec = promisify(execFile);
const PORT = Number(process.env.ECODEV_AGENT_PORT || 17777);
const INTERVAL_MS = Math.max(1000, Number(process.env.ECODEV_AGENT_INTERVAL_MS || 5000));

type Snapshot = {
  timestamp: string;
  platform: string;
  cpuCount: number;
  loadAverage: number[];
  memoryTotalBytes: number;
  memoryFreeBytes: number;
  memoryUsedPercent: number;
  batteryPercent: number | null;
  batteryCharging: boolean | null;
  topProcesses: Array<{ pid: string; name: string; cpuPercent: number | null; memoryPercent: number | null }>;
  recommendations: string[];
};

async function run(command: string, args: string[]) {
  try { return (await exec(command, args, { timeout: 2000, windowsHide: true })).stdout; }
  catch { return ""; }
}

async function battery() {
  if (process.platform === "linux") {
    const output = await run("sh", ["-c", "for f in /sys/class/power_supply/BAT*/capacity; do cat $f; break; done"]);
    const status = await run("sh", ["-c", "for f in /sys/class/power_supply/BAT*/status; do cat $f; break; done"]);
    const n = Number(output.trim()); return Number.isFinite(n) ? { percent: Math.max(0, Math.min(100, n)), charging: /charging/i.test(status) } : { percent: null, charging: null };
  }
  if (process.platform === "darwin") {
    const output = await run("pmset", ["-g", "batt"]); const m = output.match(/(\d+)%/); const percent = m ? Number(m[1]) : null;
    return { percent, charging: /AC Power/i.test(output) };
  }
  if (process.platform === "win32") {
    const output = await run("powershell", ["-NoProfile", "-Command", "Get-CimInstance Win32_Battery | Select-Object -First 1 EstimatedChargeRemaining,BatteryStatus | ConvertTo-Json -Compress"]);
    try { const v = JSON.parse(output); return { percent: Number(v.EstimatedChargeRemaining), charging: Number(v.BatteryStatus) === 2 }; } catch { return { percent: null, charging: null }; }
  }
  return { percent: null, charging: null };
}

async function processes() {
  if (process.platform === "win32") {
    const output = await run("powershell", ["-NoProfile", "-Command", "Get-Process | Sort-Object CPU -Descending | Select-Object -First 12 Id,ProcessName,CPU,WorkingSet64 | ConvertTo-Csv -NoTypeInformation"]);
    return output.split(/\r?\n/).slice(2).filter(Boolean).slice(0, 8).map(line => { const m = line.match(/^(\d+),([^,]+),([^,]*),(\d+)/); return m ? { pid: m[1], name: m[2], cpuPercent: null, memoryPercent: Number(m[4]) / os.totalmem() * 100 } : null; }).filter(Boolean) as any;
  }
  const output = await run("ps", ["-eo", "pid=,comm=,pcpu=,pmem=,--sort=-pcpu"]);
  return output.split(/\r?\n/).slice(0, 9).map(line => { const m = line.trim().match(/^(\d+)\s+(.+?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)$/); return m ? { pid: m[1], name: m[2], cpuPercent: Number(m[3]), memoryPercent: Number(m[4]) } : null; }).filter(Boolean) as any;
}

function recommendations(input: { memoryUsedPercent: number; batteryPercent: number | null; batteryCharging: boolean | null; load: number[]; topProcesses: Snapshot["topProcesses"] }) {
  const out: string[] = [];
  if (input.memoryUsedPercent > 85) out.push("High memory pressure: close unused applications or reduce build/test concurrency.");
  if (input.batteryPercent != null && input.batteryPercent < 25 && !input.batteryCharging) out.push("Battery is low: enable the OS power-saver mode and defer non-urgent builds or benchmarks.");
  if (input.load[0] > Math.max(2, os.cpus().length * 0.9)) out.push("CPU load is high: batch background work and avoid running redundant watchers during benchmarks.");
  const heavy = input.topProcesses.filter(p => (p.cpuPercent ?? 0) > 25).slice(0, 3);
  if (heavy.length) out.push(`High-CPU processes detected: ${heavy.map(p => p.name).join(", ")}. Close or pause non-essential workloads when measuring EcoDev results.`);
  out.push("Use display sleep and OS power-management settings during idle periods to avoid unnecessary device energy use.");
  return out;
}

async function snapshot(): Promise<Snapshot> {
  const total = os.totalmem(), free = os.freemem(), memoryUsedPercent = (1 - free / total) * 100;
  const b = await battery(); const topProcesses = await processes(); const loadAverage = os.loadavg();
  return { timestamp: new Date().toISOString(), platform: process.platform, cpuCount: os.cpus().length, loadAverage, memoryTotalBytes: total, memoryFreeBytes: free, memoryUsedPercent: Number(memoryUsedPercent.toFixed(2)), batteryPercent: b.percent, batteryCharging: b.charging, topProcesses, recommendations: recommendations({ memoryUsedPercent, batteryPercent: b.percent, batteryCharging: b.charging, load: loadAverage, topProcesses }) };
}

const securityHeaders = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*", "access-control-allow-methods": "GET, OPTIONS" };
const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, securityHeaders); res.end(); return; }
  if (req.url === "/healthz") { res.writeHead(200, securityHeaders); res.end(JSON.stringify({ ok: true, service: "ecodev-desktop-agent" })); return; }
  if (req.method === "GET" && req.url === "/v1/device") { const data = await snapshot(); res.writeHead(200, securityHeaders); res.end(JSON.stringify(data)); return; }
  res.writeHead(404, securityHeaders); res.end(JSON.stringify({ error: "not found" }));
});
server.listen(PORT, "127.0.0.1", () => console.log(`EcoDev desktop agent listening on http://127.0.0.1:${PORT}`));
setInterval(() => void snapshot(), INTERVAL_MS).unref();
