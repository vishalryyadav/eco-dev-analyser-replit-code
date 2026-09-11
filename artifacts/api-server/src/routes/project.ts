import { Router } from "express";
import { analyzeProject, type ProjectFile } from "../services/project";

const router = Router();
const MAX_FILES = 200;
const MAX_TOTAL_BYTES = 500_000;
const MAX_FILE_BYTES = 100_000;

router.post("/project/analyze", (req, res) => {
  const body = req.body as { files?: unknown };
  if (!body || !Array.isArray(body.files) || body.files.length === 0) return res.status(400).json({ error: "files must be a non-empty array" });
  if (body.files.length > MAX_FILES) return res.status(413).json({ error: `projects are limited to ${MAX_FILES} files per scan` });
  let total = 0;
  const files: ProjectFile[] = [];
  for (const raw of body.files) {
    if (!raw || typeof raw !== "object") continue;
    const file = raw as { path?: unknown; code?: unknown; language?: unknown };
    if (typeof file.path !== "string" || typeof file.code !== "string") continue;
    const bytes = Buffer.byteLength(file.code, "utf8");
    if (bytes > MAX_FILE_BYTES) continue;
    total += bytes;
    if (total > MAX_TOTAL_BYTES) return res.status(413).json({ error: `project source exceeds the ${MAX_TOTAL_BYTES} byte total limit` });
    files.push({ path: file.path.replaceAll("\\", "/"), code: file.code, language: typeof file.language === "string" ? file.language : null });
  }
  if (!files.length) return res.status(400).json({ error: "No supported text source files were supplied" });
  return res.json({ ok: true, report: analyzeProject(files) });
});

export default router;
