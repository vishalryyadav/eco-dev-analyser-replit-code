import { Router } from "express";
import { privacyMetadata } from "../services/privacy";

const router = Router();

router.get("/privacy", (_req, res) => res.json({ ok: true, ...privacyMetadata }));

export default router;
