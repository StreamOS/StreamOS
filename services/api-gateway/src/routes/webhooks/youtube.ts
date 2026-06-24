import express from "express";
import type { Request, Response, Router } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import type { StreamOSJob } from "@streamos/queue";

import {
  sendPlainTextWebhookChallenge,
  validateWebhookChallenge,
} from "../../lib/webhook-challenge.js";
import { verifyYouTubeSignature } from "../../lib/webhook-signatures.js";
import { getRawBody } from "../../middleware/raw-body.js";
import {
  asString,
  getHeaderValue,
  getQueryString,
  isAllowedYouTubeTopic,
  isRecord,
  lookupPlatformConnection,
} from "./shared.js";
import type { ProviderWebhookDispatcher } from "../../webhooks/providerEvents.js";
import { XMLParser } from "fast-xml-parser";

export type CreateYouTubeWebhookRouterOptions = {
  dispatcher?: ProviderWebhookDispatcher;
  now: () => number;
  rateLimit?: {
    maxRequests?: number;
    windowMs?: number;
  };
  secret: string | undefined;
};

type YouTubeAtomEntry = {
  channelId: string;
  publishedAt?: string;
  raw: Record<string, unknown>;
  title?: string;
  updatedAt?: string;
  videoId: string;
};

const parser = new XMLParser({
  attributeNamePrefix: "@_",
  ignoreAttributes: false,
  parseAttributeValue: false,
  parseTagValue: false,
  textNodeName: "#text",
  trimValues: true,
});
const YOUTUBE_WEBHOOK_RATE_LIMIT_WINDOW_MS = 60_000;
const YOUTUBE_WEBHOOK_RATE_LIMIT_MAX_REQUESTS = 500;

function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }

  return isRecord(value) ? [value] : [];
}

function parseYouTubeAtomEntries(rawXml: string): YouTubeAtomEntry[] {
  const parsed = parser.parse(rawXml) as unknown;

  if (!isRecord(parsed) || !isRecord(parsed.feed)) {
    throw new Error("YouTube payload is missing Atom feed.");
  }

  const entries: YouTubeAtomEntry[] = [];

  for (const entry of asRecordArray(parsed.feed.entry)) {
    const channelId = asString(entry["yt:channelId"]);
    const videoId = asString(entry["yt:videoId"]);

    if (!channelId || !videoId) {
      continue;
    }

    entries.push({
      channelId,
      publishedAt: asString(entry.published),
      raw: entry,
      title: asString(entry.title),
      updatedAt: asString(entry.updated),
      videoId,
    });
  }

  return entries;
}

async function createYouTubeJob({
  entry,
  receivedAt,
}: {
  entry: YouTubeAtomEntry;
  receivedAt: string;
}): Promise<StreamOSJob | null> {
  const connection = await lookupPlatformConnection({
    externalChannelId: entry.channelId,
    provider: "youtube",
  });

  if (!connection) {
    return null;
  }

  return {
    id: `youtube:${entry.channelId}:${entry.videoId}:${entry.updatedAt ?? receivedAt}`,
    channelId: entry.channelId,
    enqueuedAt: receivedAt,
    provider: "youtube",
    publishedAt: entry.publishedAt,
    raw: entry.raw,
    receivedAt,
    title: entry.title,
    type: "video.published",
    updatedAt: entry.updatedAt,
    userId: connection.userId,
    videoId: entry.videoId,
  } as StreamOSJob;
}

export function createYouTubeWebhookRouter({
  dispatcher,
  now,
  rateLimit: routeRateLimit,
  secret,
}: CreateYouTubeWebhookRouterOptions): Router {
  const router = express.Router();
  const youtubeWebhookRateLimiter = rateLimit({
    keyGenerator: (request) =>
      `legacy:youtube:webhook:${ipKeyGenerator(request.ip ?? "0.0.0.0")}`,
    legacyHeaders: false,
    limit:
      routeRateLimit?.maxRequests ?? YOUTUBE_WEBHOOK_RATE_LIMIT_MAX_REQUESTS,
    message: {
      error: "rate_limit_exceeded",
      message: "Too many YouTube webhook requests.",
    },
    standardHeaders: "draft-7",
    windowMs: routeRateLimit?.windowMs ?? YOUTUBE_WEBHOOK_RATE_LIMIT_WINDOW_MS,
  });

  router.get("/", (request: Request, response: Response) => {
    const mode = getQueryString(request.query["hub.mode"]);
    const topic = getQueryString(request.query["hub.topic"]);
    const challenge = validateWebhookChallenge(
      getQueryString(request.query["hub.challenge"]),
    );

    if (mode !== "subscribe" && mode !== "unsubscribe") {
      response.status(400).json({ error: "invalid_youtube_mode" });
      return;
    }

    if (!topic || !challenge || !isAllowedYouTubeTopic(topic)) {
      response.status(400).json({ error: "invalid_youtube_topic" });
      return;
    }

    sendPlainTextWebhookChallenge(response, challenge);
  });

  router.post(
    "/",
    youtubeWebhookRateLimiter,
    async (request: Request, response: Response) => {
      const startedAt = now();

      if (!secret) {
        response.sendStatus(503);
        return;
      }

      const rawBody = getRawBody(request);
      const signature = getHeaderValue(request.headers["x-hub-signature"]);

      if (!rawBody || !signature) {
        response.sendStatus(403);
        return;
      }

      if (!verifyYouTubeSignature(rawBody, signature, secret)) {
        response.sendStatus(403);
        return;
      }

      let entries: YouTubeAtomEntry[];

      try {
        entries = parseYouTubeAtomEntries(rawBody.toString("utf8"));
      } catch {
        response.status(400).json({ error: "invalid_youtube_atom_feed" });
        return;
      }

      try {
        const receivedAt = new Date(startedAt).toISOString();
        const jobs = (
          await Promise.all(
            entries.map((entry) => createYouTubeJob({ entry, receivedAt })),
          )
        ).filter((job): job is StreamOSJob => Boolean(job));

        if (dispatcher) {
          for (const job of jobs) {
            await dispatcher(job);
          }
        }

        for (const job of jobs) {
          console.info("webhook_received", {
            event: "webhook_received",
            latencyMs: now() - startedAt,
            messageId: job.id,
            provider: "youtube",
            type: "video.published",
            userId:
              "userId" in job && typeof job.userId === "string"
                ? job.userId
                : undefined,
          });
        }

        response.status(200).json({
          dispatched: Boolean(dispatcher),
          entries: entries.length,
          queued: jobs.length,
          received: true,
        });
      } catch (error) {
        console.error("youtube_webhook_processing_failed", {
          error: error instanceof Error ? error.message : String(error),
          provider: "youtube",
        });
        response.sendStatus(500);
      }
    },
  );

  return router;
}
