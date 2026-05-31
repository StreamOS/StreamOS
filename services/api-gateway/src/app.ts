import express from "express";
import type { Express } from "express";
import helmet from "helmet";

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_request, response) => {
    response.status(200).json({ service: "api-gateway", status: "ok" });
  });

  app.get("/api/platforms", (_request, response) => {
    response.status(200).json({
      platforms: ["twitch", "youtube", "tiktok", "kick"],
      next: "Implement OAuth state handling and encrypted token storage."
    });
  });

  return app;
}
