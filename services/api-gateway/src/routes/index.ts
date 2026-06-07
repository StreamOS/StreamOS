import express from "express";
import type { Router } from "express";

import type { RedisDeduplicationClient } from "../lib/deduplication.js";
import { createTwitchWebhookRouter } from "./webhooks/twitch.js";
import { createYouTubeWebhookRouter } from "./webhooks/youtube.js";
import type { ProviderWebhookDispatcher } from "../webhooks/providerEvents.js";

export type CreateRoutesOptions = {
  deduplicationClient: RedisDeduplicationClient;
  dispatcher?: ProviderWebhookDispatcher;
  now: () => number;
  twitchWebhookSecret: string | undefined;
  youtubeWebhookSecret: string | undefined;
};

export function createRoutes({
  deduplicationClient,
  dispatcher,
  now,
  twitchWebhookSecret,
  youtubeWebhookSecret,
}: CreateRoutesOptions): Router {
  const router = express.Router();

  router.use(
    "/webhooks/twitch",
    createTwitchWebhookRouter({
      deduplicationClient,
      dispatcher,
      now,
      secret: twitchWebhookSecret,
    }),
  );
  router.use(
    "/webhooks/youtube",
    createYouTubeWebhookRouter({
      dispatcher,
      now,
      secret: youtubeWebhookSecret,
    }),
  );

  return router;
}
