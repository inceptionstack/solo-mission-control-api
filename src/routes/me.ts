import { Router } from "express";
import { getTargetAccountId } from "../auth/middleware.js";

const router = Router();

router.get("/", (req, res) => {
  const targetAccountId = getTargetAccountId(req.user, req);
  res.json({
    sub: req.user.sub,
    email: req.user.email,
    accountId: req.user.accountId,
    targetAccountId,
    groups: req.user.groups,
  });
});

export default router;
