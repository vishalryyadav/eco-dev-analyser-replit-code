import { Router, type IRouter } from "express";
import healthRouter from "./health";
import analyzeRouter from "./analyze";
import coachRouter from "./coach";
import reportRouter from "./report";

const router: IRouter = Router();

router.use(healthRouter);
router.use(analyzeRouter);
router.use(coachRouter);
router.use(reportRouter);

export default router;
