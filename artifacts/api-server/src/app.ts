import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import { existsSync } from "node:fs";
import path from "node:path";
import pinoHttp from "pino-http";
import { HealthCheckResponse } from "@workspace/api-zod";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();
app.set("trust proxy", 1);
app.use(pinoHttp({ logger, serializers: { req(req) { return { id: req.id, method: req.method, url: req.url?.split("?")[0] }; }, res(res) { return { statusCode: res.statusCode }; } } }));
app.disable("x-powered-by");
app.use(cors({ origin: process.env.ECODEV_CORS_ORIGIN ? process.env.ECODEV_CORS_ORIGIN.split(",").map(v => v.trim()).filter(Boolean) : false, methods: ["GET", "POST", "OPTIONS"], allowedHeaders: ["Content-Type", "X-EcoDev-Client"] }));
app.use(express.json({ limit: "256kb", strict: true }));
app.use(express.urlencoded({ extended: false, limit: "256kb" }));
app.get("/healthz", (_req, res) => res.json(HealthCheckResponse.parse({ status: "ok" })));
const windowMs = Math.max(10_000, Number(process.env.ECODEV_RATE_WINDOW_MS ?? 60_000));
const maxRequests = Math.max(5, Number(process.env.ECODEV_RATE_LIMIT ?? 30));
const buckets = new Map<string, { started: number; count: number }>();
function rateLimit(req: Request, res: Response, next: NextFunction) { const now = Date.now(); const key = req.ip || "unknown"; const current = buckets.get(key); const bucket = !current || now - current.started >= windowMs ? { started: now, count: 0 } : current; bucket.count += 1; buckets.set(key, bucket); if (bucket.count > maxRequests) return res.status(429).json({ error: "Too many requests. Please retry after the rate-limit window." }); if (buckets.size > 10_000) for (const [k, v] of buckets) if (now - v.started >= windowMs) buckets.delete(k); return next(); }
app.use("/api", rateLimit, router);
const frontendDist = path.resolve(process.env.ECODEV_FRONTEND_DIST || "artifacts/ecodev/dist");
if (existsSync(frontendDist)) { app.use(express.static(frontendDist, { index: "index.html", maxAge: "1h" })); app.use((req, res, next) => { if (req.method === "GET" && !req.path.startsWith("/api/") && req.path !== "/healthz" && req.accepts("html")) return res.sendFile(path.join(frontendDist, "index.html")); return next(); }); }
app.use((error: any, _req: Request, res: Response, _next: NextFunction) => { if (error?.type === "entity.too.large") return res.status(413).json({ error: "Request body is too large." }); if (error?.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON request body." }); return res.status(500).json({ error: "Internal server error." }); });
export default app;
