import { Router } from "express";
import { analyzeCode, normalizeLanguage } from "../services/analyzer";
import { securityAnalyze } from "../services/security";
import { coachCode } from "../services/coach";

const router = Router();
const MAX_CODE_BYTES = 120_000;

router.post("/coach", async (req, res) => {
  const body = req.body as { code?: unknown; language?: unknown; instruction?: unknown };
  if (!body || typeof body.code !== "string" || !body.code.trim()) return res.status(400).json({ error: "code must be a non-empty string" });
  if (Buffer.byteLength(body.code, "utf8") > MAX_CODE_BYTES) return res.status(413).json({ error: `code exceeds the ${MAX_CODE_BYTES} byte limit` });
  const language = body.language == null ? null : normalizeLanguage(String(body.language));
  const analysis = analyzeCode(body.code, language);
  const security = securityAnalyze(body.code, analysis.language);
  const result = await coachCode({ code: body.code, language: analysis.language, analysis, security, instruction: typeof body.instruction === "string" ? body.instruction.slice(0, 2000) : null });
  return res.json({ ok: true, ...result, analysis, security });
});

export default router;
