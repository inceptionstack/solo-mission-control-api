import express from "express";
import cors from "cors";
import _pinoHttp from "pino-http";
import { config } from "./config.js";
import { authMiddleware } from "./auth/middleware.js";
import { logger } from "./logger.js";

import adminRoutes from "./routes/admin.js";
import meRoutes from "./routes/me.js";
import dashboardRoutes from "./routes/dashboard.js";
import connectRoutes from "./routes/connect.js";
import costsRoutes from "./routes/costs.js";
import pipelinesRoutes from "./routes/pipelines.js";
import reposRoutes from "./routes/repos.js";
import promptsRoutes from "./routes/prompts.js";
import stacksRoutes from "./routes/stacks.js";

const app = express();

// Middleware
const pinoHttp = (_pinoHttp as unknown as (opts: object) => express.RequestHandler);
app.use(pinoHttp({ logger }));
app.use(cors({
  origin: config.corsOrigin,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Account-Id"],
  maxAge: 86400,
}));
app.use(express.json());

// Health check (unauthenticated)
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// All API routes require auth
const api = express.Router();
api.use(authMiddleware());

api.use("/admin", adminRoutes);
api.use("/me", meRoutes);
api.use("/dashboard", dashboardRoutes);
api.use("/connect", connectRoutes);
api.use("/costs", costsRoutes);
api.use("/pipelines", pipelinesRoutes);
api.use("/repos", reposRoutes);
api.use("/prompts", promptsRoutes);
api.use("/stacks", stacksRoutes);

app.use("/api", api);

// Error handling middleware
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err.message || "Internal server error";

  if (message.startsWith("NOT_FOUND:")) {
    res.status(404).json({ error: message.replace("NOT_FOUND:", "").trim() });
    return;
  }
  if (message.startsWith("FORBIDDEN:")) {
    res.status(403).json({ error: message.replace("FORBIDDEN:", "").trim() });
    return;
  }
  if (message.startsWith("BAD_REQUEST:")) {
    res.status(400).json({ error: message.replace("BAD_REQUEST:", "").trim() });
    return;
  }

  logger.error({ err }, "Unhandled error");
  res.status(500).json({ error: "Internal server error" });
});

export { app };
