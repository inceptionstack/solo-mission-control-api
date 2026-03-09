import { Router } from "express";
import { getTargetAccountId } from "../auth/middleware.js";
import { handleListStacks, handleGetStack, handleDetectDrift } from "../services/stacks.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const targetAccountId = getTargetAccountId(req.user, req);
    const result = await handleListStacks(req.user, req.query as Record<string, string | undefined>, targetAccountId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/:name", async (req, res, next) => {
  try {
    const targetAccountId = getTargetAccountId(req.user, req);
    const result = await handleGetStack(req.user, req.params.name, req.query as Record<string, string | undefined>, targetAccountId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post("/:name/drift", async (req, res, next) => {
  try {
    const targetAccountId = getTargetAccountId(req.user, req);
    const result = await handleDetectDrift(req.user, req.params.name, req.query as Record<string, string | undefined>, targetAccountId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
