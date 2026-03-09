import { Router } from "express";
import { getTargetAccountId } from "../auth/middleware.js";
import {
  handleListPrompts,
  handleGetPrompt,
  handleCreatePrompt,
  handleUpdatePrompt,
  handleDeletePrompt,
  handleForkPrompt,
} from "../services/prompts.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const targetAccountId = getTargetAccountId(req.user, req);
    const result = await handleListPrompts(req.user, req.query as Record<string, string | undefined>, targetAccountId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const targetAccountId = getTargetAccountId(req.user, req);
    const result = await handleCreatePrompt(req.user, req.body, targetAccountId);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.post("/:id/fork", async (req, res, next) => {
  try {
    const targetAccountId = getTargetAccountId(req.user, req);
    const result = await handleForkPrompt(req.user, req.params.id, targetAccountId);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const targetAccountId = getTargetAccountId(req.user, req);
    const result = await handleGetPrompt(req.user, req.params.id, targetAccountId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    const targetAccountId = getTargetAccountId(req.user, req);
    const result = await handleUpdatePrompt(req.user, req.params.id, req.body, targetAccountId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const targetAccountId = getTargetAccountId(req.user, req);
    await handleDeletePrompt(req.user, req.params.id, targetAccountId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
