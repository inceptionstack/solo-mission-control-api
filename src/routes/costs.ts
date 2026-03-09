import { Router } from "express";
import { getTargetAccountId } from "../auth/middleware.js";
import { handleGetCostSummary, handleGetCostsByService, handleGetDailyCosts } from "../services/costs.js";

const router = Router();

router.get("/summary", async (req, res, next) => {
  try {
    const targetAccountId = getTargetAccountId(req.user, req);
    const result = await handleGetCostSummary(req.user, req.query as Record<string, string | undefined>, targetAccountId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/by-service", async (req, res, next) => {
  try {
    const targetAccountId = getTargetAccountId(req.user, req);
    const result = await handleGetCostsByService(req.user, req.query as Record<string, string | undefined>, targetAccountId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/daily", async (req, res, next) => {
  try {
    const targetAccountId = getTargetAccountId(req.user, req);
    const result = await handleGetDailyCosts(req.user, req.query as Record<string, string | undefined>, targetAccountId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
