import type { Request, Response, NextFunction } from "express";
import { config } from "../config.js";
import type { AuthAdapter, UserContext } from "./types.js";
import { CognitoAdapter } from "./adapters/cognito.js";
import { OidcAdapter } from "./adapters/oidc.js";

declare global {
  namespace Express {
    interface Request {
      user: UserContext;
    }
  }
}

let adapter: AuthAdapter | null = null;

function getAdapter(): AuthAdapter {
  if (!adapter) {
    adapter =
      config.authProvider === "oidc"
        ? new OidcAdapter()
        : new CognitoAdapter();
  }
  return adapter;
}

export function authMiddleware() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing or invalid Authorization header" });
      return;
    }

    const token = authHeader.slice(7);
    try {
      const auth = getAdapter();
      const payload = await auth.validateToken(token);
      req.user = auth.extractUser(payload);
      next();
    } catch (err) {
      res.status(401).json({ error: "Invalid or expired token" });
    }
  };
}

export function isAdmin(user: UserContext): boolean {
  return user.groups.includes("admin") || !user.accountId;
}

export function getTargetAccountId(user: UserContext, req: Request): string {
  if (isAdmin(user)) {
    const headerAccountId = req.headers["x-account-id"];
    if (typeof headerAccountId === "string" && headerAccountId) return headerAccountId;

    const queryAccountId = req.query.accountId;
    if (typeof queryAccountId === "string" && queryAccountId) return queryAccountId;
  }
  return user.accountId;
}
