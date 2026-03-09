import { Router } from "express";
import { getTargetAccountId } from "../auth/middleware.js";
import { handleGetInstance, handleGetVpc, handleGetAgent } from "../services/dashboard.js";

const router = Router();

router.get("/instance", async (req, res, next) => {
  try {
    const targetAccountId = getTargetAccountId(req.user, req);
    const result = await handleGetInstance(req.user, req.query as Record<string, string | undefined>, targetAccountId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/vpc", async (req, res, next) => {
  try {
    const targetAccountId = getTargetAccountId(req.user, req);
    const result = await handleGetVpc(req.user, req.query as Record<string, string | undefined>, targetAccountId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/agent", async (req, res, next) => {
  try {
    const targetAccountId = getTargetAccountId(req.user, req);
    const result = await handleGetAgent(req.user, req.query as Record<string, string | undefined>, targetAccountId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
