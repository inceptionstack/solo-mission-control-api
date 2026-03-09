import { app } from "./app.js";
import { config } from "./config.js";
import { logger } from "./logger.js";

const server = app.listen(config.port, () => {
  logger.info({ port: config.port }, "Solo API server started");
});

function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down gracefully");
  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
  setTimeout(() => {
    logger.warn("Forced shutdown after timeout");
    process.exit(1);
  }, 10_000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
