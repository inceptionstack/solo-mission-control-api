import { Router } from "express";
import { getTargetAccountId } from "../auth/middleware.js";
import { handleGetConnectionDetails, handleGenerateAccessKeys } from "../services/connect.js";

const router = Router();

router.get("/details", async (req, res, next) => {
  try {
    const targetAccountId = getTargetAccountId(req.user, req);
    const result = await handleGetConnectionDetails(req.user, req.query as Record<string, string | undefined>, targetAccountId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post("/access-keys", async (req, res, next) => {
  try {
    const targetAccountId = getTargetAccountId(req.user, req);
    const result = await handleGenerateAccessKeys(req.user, targetAccountId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
