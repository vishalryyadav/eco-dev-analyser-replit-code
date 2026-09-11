const { app, BrowserWindow, session } = require('electron');
const os = require('node:os');
const http = require('node:http');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const exec = promisify(execFile);
const PORT = Number(process.env.ECODEV_AGENT_PORT || 17777);

async function run(command, args) {
  try { return (await exec(command, args, { timeout: 2000, windowsHide: true })).stdout; } catch { return ''; }
}
async function battery() {
  if (process.platform === 'linux') {
    const output = await run('sh', ['-c', 'for f in /sys/class/power_supply/BAT*/capacity; do cat $f; break; done']);
    const status = await run('sh', ['-c', 'for f in /sys/class/power_supply/BAT*/status; do cat $f; break; done']);
    const n = Number(output.trim());
    return Number.isFinite(n) ? { percent: Math.max(0, Math.min(100, n)), charging: /charging/i.test(status) } : { percent: null, charging: null };
  }
  if (process.platform === 'darwin') { const output = await run('pmset', ['-g', 'batt']); const match = output.match(/(\d+)%/); return { percent: match ? Number(match[1]) : null, charging: /AC Power/i.test(output) }; }
  if (process.platform === 'win32') { const output = await run('powershell', ['-NoProfile', '-Command', 'Get-CimInstance Win32_Battery | Select-Object -First 1 EstimatedChargeRemaining,BatteryStatus | ConvertTo-Json -Compress']); try { const value = JSON.parse(output); return { percent: Number(value.EstimatedChargeRemaining), charging: Number(value.BatteryStatus) === 2 }; } catch { return { percent: null, charging: null }; } }
  return { percent: null, charging: null };
}
async function processes() {
  if (process.platform === 'win32') return [];
  const output = await run('ps', ['-eo', 'pid=,comm=,pcpu=,pmem=,--sort=-pcpu']);
  return output.split(/\r?\n/).slice(0, 9).map((line) => { const match = line.trim().match(/^(\d+)\s+(.+?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)$/); return match ? { pid: match[1], name: match[2], cpuPercent: Number(match[3]), memoryPercent: Number(match[4]) } : null; }).filter(Boolean);
}
async function deviceSnapshot() {
  const total = os.totalmem(), free = os.freemem(), used = (1 - free / total) * 100, load = os.loadavg(), b = await battery(), topProcesses = await processes();
  const recommendations = [];
  if (used > 85) recommendations.push('High memory pressure: close unused applications or reduce build/test concurrency.');
  if (b.percent != null && b.percent < 25 && !b.charging) recommendations.push('Battery is low: enable OS power saver and defer non-urgent builds or benchmarks.');
  if (load[0] > Math.max(2, os.cpus().length * 0.9)) recommendations.push('CPU load is high: batch background work and avoid redundant watchers during benchmarks.');
  const heavy = topProcesses.filter((p) => p.cpuPercent > 25).slice(0, 3); if (heavy.length) recommendations.push(`High-CPU processes detected: ${heavy.map((p) => p.name).join(', ')}.`);
  recommendations.push('Use display sleep and OS power-management settings during idle periods.');
  return { timestamp: new Date().toISOString(), platform: process.platform, cpuCount: os.cpus().length, loadAverage: load, memoryTotalBytes: total, memoryFreeBytes: free, memoryUsedPercent: Number(used.toFixed(2)), batteryPercent: b.percent, batteryCharging: b.charging, topProcesses, energy: { available: false, source: 'embedded-electron-agent', energyJoules: null, sampleJoules: null, sampleIntervalMs: null, estimatedWatts: null }, recommendations };
}
function startAgent() {
  const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS' };
  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') { res.writeHead(204, headers); return res.end(); }
    if (req.method === 'GET' && req.url === '/healthz') { res.writeHead(200, headers); return res.end(JSON.stringify({ ok: true, service: 'ecodev-desktop-agent' })); }
    if (req.method === 'GET' && req.url === '/v1/device') { res.writeHead(200, headers); return res.end(JSON.stringify(await deviceSnapshot())); }
    res.writeHead(404, headers); res.end(JSON.stringify({ error: 'not found' }));
  });
  server.listen(PORT, '127.0.0.1');
  app.on('before-quit', () => server.close());
}

function createWindow() {
  const win = new BrowserWindow({ width: 1360, height: 900, minWidth: 1000, minHeight: 700, backgroundColor: '#0d1b14', webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false } });
  const url = process.env.ECODEV_WEB_URL || 'http://localhost:5000';
  win.loadURL(url);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  startAgent();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
