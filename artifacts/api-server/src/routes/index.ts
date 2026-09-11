import { Router, type IRouter } from "express";
import healthRouter from "./health";
import analyzeRouter from "./analyze";
import coachRouter from "./coach";
import reportRouter from "./report";
import projectRouter from "./project";

const router: IRouter = Router();

router.use(healthRouter);
router.use(analyzeRouter);
router.use(coachRouter);
router.use(reportRouter);
router.use(projectRouter);

export default router;
