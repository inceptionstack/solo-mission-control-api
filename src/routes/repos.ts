import { Router } from "express";
import { getTargetAccountId } from "../auth/middleware.js";
import { handleListRepos, handleGetRepoFiles } from "../services/pipelines.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const targetAccountId = getTargetAccountId(req.user, req);
    const result = await handleListRepos(req.user, req.query as Record<string, string | undefined>, targetAccountId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/:name/files", async (req, res, next) => {
  try {
    const targetAccountId = getTargetAccountId(req.user, req);
    const result = await handleGetRepoFiles(req.user, req.params.name, req.query as Record<string, string | undefined>, targetAccountId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
