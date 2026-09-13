import { Router } from "express";
import { getBenchmark, listBenchmarks, runBenchmark } from "../services/benchmarks";

const router = Router();

router.get("/benchmarks", (_req, res) => {
  res.json({ ok: true, suite: "EcoDev built-in benchmarks", defaults: { warmups: 2, iterations: 5 }, benchmarks: listBenchmarks() });
});

router.post("/benchmarks/:id/run", async (req, res) => {
  if (!getBenchmark(req.params.id)) return res.status(404).json({ ok: false, error: "Unknown benchmark case." });
  const warmups = req.body?.warmups == null ? undefined : Number(req.body.warmups);
  const iterations = req.body?.iterations == null ? undefined : Number(req.body.iterations);
  if (warmups != null && (!Number.isInteger(warmups) || warmups < 0 || warmups > 2)) return res.status(400).json({ ok: false, error: "warmups must be an integer from 0 to 2" });
  if (iterations != null && (!Number.isInteger(iterations) || iterations < 1 || iterations > 5)) return res.status(400).json({ ok: false, error: "iterations must be an integer from 1 to 5" });
  const result = await runBenchmark(req.params.id, { warmups, iterations });
  return res.json({ ok: true, ...result });
});

export default router;
