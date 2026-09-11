import type { Finding, SupportedLanguage } from "./analyzer";

export type SecurityReport = {
  score: number;
  findings: Finding[];
  checks: { id: string; status: "pass" | "warn"; title: string; detail: string }[];
};

const checks = [
  { id: "eval", re: /\b(eval|Function)\s*\(/g, title: "Dynamic code execution", detail: "Dynamic evaluation can turn untrusted data into executable code. Prefer data-driven logic or a safe parser." },
  { id: "shell", re: /\b(child_process|execSync|spawnSync|system)\b|\bos\.system\s*\(/g, title: "Shell/process invocation", detail: "Shell or process APIs can create command-injection and privilege risks. Validate arguments and avoid shell interpolation." },
  { id: "secret", re: /(?:api[_-]?key|secret|password|token)\s*[:=]\s*[\"'][^\"']{6,}[\"']/gi, title: "Possible hard-coded secret", detail: "A credential-like literal appears in source. Move secrets to a secret manager or environment configuration." },
  { id: "sql", re: /(?:SELECT|INSERT|UPDATE|DELETE)[\s\S]{0,200}(?:\+|\$\{|%s|\.format\()/i, title: "Possible SQL string construction", detail: "SQL assembled from string interpolation can be vulnerable to injection. Use parameterized queries." },
  { id: "path", re: /(?:readFile|writeFile|open|fopen)\s*\([^\n]*(?:req\.|request|query|params|argv)/i, title: "User-controlled file path", detail: "File paths derived from request or command-line data should be constrained to an allow-listed directory." },
  { id: "unsafe-memory", re: /\b(strcpy|strcat|sprintf|gets)\s*\(/g, title: "Unsafe C/C++ memory API", detail: "Prefer bounded alternatives such as snprintf, strncpy_s where appropriate, or safer C++ containers." },
  { id: "insecure-random", re: /\b(Math\.random|rand)\s*\(/g, title: "Non-cryptographic randomness", detail: "Do not use general-purpose PRNGs for secrets, tokens, authentication codes, or security decisions." },
] as const;

export function securityAnalyze(code: string, language: SupportedLanguage): SecurityReport {
  const findings: Finding[] = [];
  const resultChecks: SecurityReport["checks"] = [];
  let penalty = 0;
  for (const check of checks) {
    if (check.re.test(code)) {
      findings.push({ severity: check.id === "secret" || check.id === "shell" || check.id === "eval" ? "high" : "medium", title: check.title, detail: `${check.detail} Language: ${language}.` });
      resultChecks.push({ id: check.id, status: "warn", title: check.title, detail: check.detail });
      penalty += check.id === "secret" || check.id === "shell" || check.id === "eval" ? 18 : 10;
    } else {
      resultChecks.push({ id: check.id, status: "pass", title: check.title, detail: "No matching pattern was detected by this static check." });
    }
    check.re.lastIndex = 0;
  }
  if (!findings.length) findings.push({ severity: "info", title: "No obvious security pattern detected", detail: "The lightweight static checks found no matching high-risk pattern. This is not a substitute for a full security review." });
  const score = Math.max(10, 100 - penalty);
  return { score, findings, checks: resultChecks };
}
