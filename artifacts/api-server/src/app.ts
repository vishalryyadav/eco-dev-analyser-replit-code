import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import { existsSync } from "node:fs";
import path from "node:path";
import pinoHttp from "pino-http";
import { HealthCheckResponse } from "@workspace/api-zod";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();
// Trust forwarded client addresses/protocol only when a known reverse proxy is
// actually deployed in front of this process. Otherwise spoofed X-Forwarded-For
// headers could undermine the in-memory per-IP rate limit.
app.set("trust proxy", process.env.ECODEV_TRUST_PROXY === "1");
app.use(pinoHttp({ logger, serializers: { req(req) { return { id: req.id, method: req.method, url: req.url?.split("?")[0] }; }, res(res) { return { statusCode: res.statusCode }; } } }));
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  next();
});
const allowedOrigins = new Set((process.env.ECODEV_CORS_ORIGIN ?? "").split(",").map(value => value.trim()).filter(value => value && value !== "*"));
function isAllowedOrigin(req: Request) {
  const origin = req.get("origin");
  if (!origin) return true;
  return origin === `${req.protocol}://${req.get("host")}` || allowedOrigins.has(origin);
}
app.use(cors({ origin(origin, callback) { callback(null, Boolean(origin && allowedOrigins.has(origin))); }, methods: ["GET", "POST", "OPTIONS"], allowedHeaders: ["Content-Type", "X-EcoDev-Client"], maxAge: 600 }));
app.use(express.json({ limit: "1mb", strict: true }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.get("/healthz", (_req, res) => res.json(HealthCheckResponse.parse({ status: "ok" })));
function boundedInteger(name: string, fallback: number, minimum: number, maximum: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}
const windowMs = boundedInteger("ECODEV_RATE_WINDOW_MS", 60_000, 10_000, 3_600_000);
const maxRequests = boundedInteger("ECODEV_RATE_LIMIT", 30, 5, 10_000);
const buckets = new Map<string, { started: number; count: number }>();
function rateLimit(req: Request, res: Response, next: NextFunction) { const now = Date.now(); const key = req.ip || "unknown"; const current = buckets.get(key); const bucket = !current || now - current.started >= windowMs ? { started: now, count: 0 } : current; if (bucket !== current) { const expiry = setTimeout(() => { if (buckets.get(key) === bucket) buckets.delete(key); }, windowMs); expiry.unref(); } bucket.count += 1; buckets.set(key, bucket); if (bucket.count > maxRequests) return res.status(429).json({ error: "Too many requests. Please retry after the rate-limit window." }); return next(); }
app.use("/api", (req, res, next) => isAllowedOrigin(req) ? next() : res.status(403).json({ error: "This origin is not allowed to use the EcoDev API." }), rateLimit, router);
const frontendDist = path.resolve(process.env.ECODEV_FRONTEND_DIST || "artifacts/ecodev/dist");
if (existsSync(frontendDist)) { app.use(express.static(frontendDist, { index: "index.html", maxAge: "1h" })); app.use((req, res, next) => { if (req.method === "GET" && !req.path.startsWith("/api/") && req.path !== "/healthz" && req.accepts("html")) return res.sendFile(path.join(frontendDist, "index.html")); return next(); }); }
app.use((error: any, req: Request, res: Response, _next: NextFunction) => { if (error?.type === "entity.too.large") return res.status(413).json({ error: "Request body is too large." }); if (error?.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON request body." }); req.log?.error({ err: error }, "Unhandled API error"); return res.status(500).json({ error: "Internal server error." }); });
export default app;
