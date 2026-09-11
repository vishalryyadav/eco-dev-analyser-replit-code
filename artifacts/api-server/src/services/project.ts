import { analyzeCode, normalizeLanguage, type SupportedLanguage } from "./analyzer.ts";
import { securityAnalyze } from "./security.ts";

export type ProjectFile = { path: string; code: string; language?: string | null };
export type ProjectReport = {
  filesScanned: number;
  totalLines: number;
  totalBytes: number;
  languages: Record<string, number>;
  score: number;
  securityScore: number;
  hotspots: Array<{ path: string; score: number; complexity: string; securityScore: number; findingCount: number }>;
  findings: Array<{ path: string; severity: string; title: string; detail: string }>;
  alternatives: Array<{ title: string; description: string; files: string[] }>;
};

const ignored = /(^|\/)node_modules\/|(^|\/)\.git\/|(^|\/)(dist|build|coverage)\/|\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|mp4|mov|woff2?|ttf|so|dll|exe)$/i;
const extLanguage: Record<string, SupportedLanguage> = { js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript", ts: "typescript", tsx: "typescript", py: "python", c: "c", h: "c", cc: "cpp", cpp: "cpp", cxx: "cpp", hpp: "cpp", go: "go" };
function infer(path: string, explicit?: string | null) { if (explicit) return normalizeLanguage(explicit); const ext = path.toLowerCase().split(".").pop() ?? ""; return extLanguage[ext] ?? null; }

export function analyzeProject(files: ProjectFile[]): ProjectReport {
  const usable = files.filter((f) => f && typeof f.path === "string" && typeof f.code === "string" && f.path.length <= 240 && !ignored.test(f.path)).slice(0, 200);
  let totalLines = 0, totalBytes = 0, weightedScore = 0, securityScore = 0, filesScanned = 0;
  const languages: Record<string, number> = {};
  const hotspots: ProjectReport["hotspots"] = [];
  const findings: ProjectReport["findings"] = [];
  const alternatives = new Map<string, { title: string; description: string; files: string[] }>();
  for (const file of usable) {
    const language = infer(file.path, file.language);
    if (!language) continue;
    filesScanned += 1;
    const analysis = analyzeCode(file.code, language);
    const security = securityAnalyze(file.code, analysis.language);
    totalLines += analysis.lines; totalBytes += analysis.bytes; weightedScore += analysis.score * Math.max(1, analysis.lines); securityScore += security.score * Math.max(1, analysis.lines);
    languages[analysis.language] = (languages[analysis.language] ?? 0) + 1;
    const allFindings = [...analysis.findings, ...security.findings].filter((f) => f.severity !== "info");
    hotspots.push({ path: file.path, score: analysis.score, complexity: analysis.complexity.time, securityScore: security.score, findingCount: allFindings.length });
    for (const f of allFindings) findings.push({ path: file.path, severity: f.severity, title: f.title, detail: f.detail });
    for (const alt of analysis.alternatives) {
      const current = alternatives.get(alt.id) ?? { title: alt.title, description: alt.description, files: [] };
      if (!current.files.includes(file.path)) current.files.push(file.path);
      alternatives.set(alt.id, current);
    }
  }
  const weight = Math.max(1, totalLines);
  hotspots.sort((a, b) => (a.score + a.securityScore) - (b.score + b.securityScore));
  return { filesScanned, totalLines, totalBytes, languages, score: Number((weightedScore / weight).toFixed(1)), securityScore: Number((securityScore / weight).toFixed(1)), hotspots: hotspots.slice(0, 25), findings: findings.slice(0, 100), alternatives: [...alternatives.values()].slice(0, 20) };
}
