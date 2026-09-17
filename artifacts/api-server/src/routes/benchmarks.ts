import { Router } from "express";
import { benchmarkAvailability, getBenchmark, listBenchmarks, runBenchmark } from "../services/benchmarks";

const router = Router();

router.get("/benchmarks", (_req, res) => {
  res.json({ ok: true, suite: "EcoDev built-in benchmarks", defaults: { warmups: 2, iterations: 3 }, languages: benchmarkAvailability(), benchmarks: listBenchmarks() });
});

router.post("/benchmarks/:id/run", async (req, res) => {
  if (!getBenchmark(req.params.id)) return res.status(404).json({ ok: false, error: "Unknown benchmark case." });
  if (req.body != null && (typeof req.body !== "object" || Array.isArray(req.body))) return res.status(400).json({ ok: false, error: "Benchmark options must be a JSON object." });
  const warmups = req.body?.warmups == null ? undefined : Number(req.body.warmups);
  const iterations = req.body?.iterations == null ? undefined : Number(req.body.iterations);
  const inputSize = req.body?.inputSize == null ? undefined : Number(req.body.inputSize);
  if (warmups != null && (!Number.isInteger(warmups) || warmups < 0 || warmups > 2)) return res.status(400).json({ ok: false, error: "warmups must be an integer from 0 to 2" });
  if (iterations != null && (!Number.isInteger(iterations) || iterations < 1 || iterations > 5)) return res.status(400).json({ ok: false, error: "iterations must be an integer from 1 to 5" });
  if (inputSize != null && (!Number.isInteger(inputSize) || !getBenchmark(req.params.id)?.inputSizes.includes(inputSize))) return res.status(400).json({ ok: false, error: "inputSize must be one of this benchmark's documented inputSizes" });
  const result = await runBenchmark(req.params.id, { inputSize, warmups, iterations });
  return res.json({ ok: true, ...result });
});

export default router;
