import { Router } from "express";
import { getTargetAccountId } from "../auth/middleware.js";
import { handleListAccounts } from "../services/admin.js";

const router = Router();

router.get("/accounts", async (req, res, next) => {
  try {
    const result = await handleListAccounts(req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
