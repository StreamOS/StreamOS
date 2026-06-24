import express from "express";
import type { Request, Response, Router } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import type { StreamOSJob } from "@streamos/queue";

import {
  isMessageDuplicate,
  type RedisDeduplicationClient,
} from "../../lib/deduplication.js";
import { verifyTwitchSignature } from "../../lib/webhook-signatures.js";
import { getRawBody } from "../../middleware/raw-body.js";
import {
  asString,
  getChannelFollowerCount,
  getHeaderValue,
  isRecord,
  lookupPlatformConnection,
  parseJsonObject,
  patchChannel,
  patchPlatformConnectionMetadata,
} from "./shared.js";
import type { ProviderWebhookDispatcher } from "../../webhooks/providerEvents.js";

const TWITCH_HEADER_MESSAGE_ID = "twitch-eventsub-message-id";
const TWITCH_HEADER_MESSAGE_SIGNATURE = "twitch-eventsub-message-signature";
const TWITCH_HEADER_PROMPT_SIGNATURE = "twitch-eventsub-signature";
const TWITCH_HEADER_MESSAGE_TIMESTAMP = "twitch-eventsub-message-timestamp";
const TWITCH_HEADER_MESSAGE_TYPE = "twitch-eventsub-message-type";
const TWITCH_MESSAGE_TYPE_NOTIFICATION = "notification";
const TWITCH_MESSAGE_TYPE_REVOCATION = "revocation";
const TWITCH_MESSAGE_TYPE_VERIFICATION = "webhook_callback_verification";
const TWITCH_DEDUP_TTL_SECONDS = 600;
const TWITCH_WEBHOOK_RATE_LIMIT_WINDOW_MS = 60_000;
const TWITCH_WEBHOOK_RATE_LIMIT_MAX_REQUESTS = 500;

export type CreateTwitchWebhookRouterOptions = {
  deduplicationClient: RedisDeduplicationClient;
  dispatcher?: ProviderWebhookDispatcher;
  now: () => number;
  rateLimit?: {
    maxRequests?: number;
    windowMs?: number;
  };
  secret: string | undefined;
};

type TwitchNotificationContext = {
  body: Record<string, unknown>;
  messageId: string;
  receivedAt: string;
};

function getTwitchSignatureHeader(request: Request): string | undefined {
  return (
    getHeaderValue(request.headers[TWITCH_HEADER_MESSAGE_SIGNATURE]) ??
    getHeaderValue(request.headers[TWITCH_HEADER_PROMPT_SIGNATURE])
  );
}

function getTwitchSubscriptionType(body: Record<string, unknown>): string {
  const subscription = body.subscription;
  const type = isRecord(subscription) ? asString(subscription.type) : undefined;

  if (!type) {
    throw new Error("Twitch payload is missing subscription.type.");
  }

  return type;
}

function getTwitchEvent(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const event = body.event;

  if (!isRecord(event)) {
    throw new Error("Twitch payload is missing event.");
  }

  return event;
}

function getBroadcasterId(event: Record<string, unknown>): string {
  const broadcasterId =
    asString(event.broadcaster_user_id) ??
    asString(event.to_broadcaster_user_id);

  if (!broadcasterId) {
    throw new Error("Twitch event is missing broadcaster_user_id.");
  }

  return broadcasterId;
}

function createBaseJob({
  channelId,
  context,
  event,
  type,
}: {
  channelId: string;
  context: TwitchNotificationContext;
  event: Record<string, unknown>;
  type: StreamOSJob["type"];
}): StreamOSJob {
  return {
    id: context.messageId,
    channelId,
    provider: "twitch",
    raw: event,
    receivedAt: context.receivedAt,
    type,
  };
}

async function handleStreamOnline(
  context: TwitchNotificationContext,
): Promise<StreamOSJob | null> {
  const event = getTwitchEvent(context.body);
  const channelId = getBroadcasterId(event);
  const connection = await lookupPlatformConnection({
    externalChannelId: channelId,
    provider: "twitch",
  });

  if (!connection) {
    return null;
  }

  return {
    ...createBaseJob({
      channelId,
      context,
      event,
      type: "stream.online",
    }),
    startedAt: asString(event.started_at),
    streamId: asString(event.id),
    userId: connection.userId,
    enqueuedAt: context.receivedAt,
  } as StreamOSJob;
}

async function handleStreamOffline(
  context: TwitchNotificationContext,
): Promise<StreamOSJob | null> {
  const event = getTwitchEvent(context.body);
  const channelId = getBroadcasterId(event);
  const connection = await lookupPlatformConnection({
    externalChannelId: channelId,
    provider: "twitch",
  });

  if (connection) {
    await patchPlatformConnectionMetadata({
      externalChannelId: channelId,
      metadata: {
        ...connection.metadata,
        streamStatus: {
          provider: "twitch",
          status: "offline",
          updatedAt: context.receivedAt,
        },
      },
      provider: "twitch",
    });
  }

  return {
    ...createBaseJob({
      channelId,
      context,
      event,
      type: "stream.offline",
    }),
    endedAt: context.receivedAt,
    userId: connection?.userId,
    enqueuedAt: context.receivedAt,
  } as StreamOSJob;
}

async function handleChannelUpdate(
  context: TwitchNotificationContext,
): Promise<StreamOSJob | null> {
  const event = getTwitchEvent(context.body);
  const channelId = getBroadcasterId(event);
  const connection = await lookupPlatformConnection({
    externalChannelId: channelId,
    provider: "twitch",
  });
  const displayName = asString(event.broadcaster_user_name);

  if (connection?.channelRowId) {
    await patchChannel({
      channelRowId: connection.channelRowId,
      displayName,
    });
  }

  return {
    ...createBaseJob({
      channelId,
      context,
      event,
      type: "channel.update",
    }),
    gameName: asString(event.category_name),
    title: asString(event.title),
    userId: connection?.userId,
    enqueuedAt: context.receivedAt,
  } as StreamOSJob;
}

async function handleChannelFollow(
  context: TwitchNotificationContext,
): Promise<null> {
  const event = getTwitchEvent(context.body);
  const channelId = getBroadcasterId(event);
  const connection = await lookupPlatformConnection({
    externalChannelId: channelId,
    provider: "twitch",
  });

  if (!connection?.channelRowId) {
    return null;
  }

  const followerCount = await getChannelFollowerCount(connection.channelRowId);

  if (typeof followerCount === "number") {
    await patchChannel({
      channelRowId: connection.channelRowId,
      followerCount: followerCount + 1,
    });
  }

  return null;
}

async function routeTwitchEvent(
  context: TwitchNotificationContext,
): Promise<StreamOSJob | null> {
  const type = getTwitchSubscriptionType(context.body);

  switch (type) {
    case "stream.online":
      return handleStreamOnline(context);
    case "stream.offline":
      return handleStreamOffline(context);
    case "channel.update":
      return handleChannelUpdate(context);
    case "channel.follow":
      return handleChannelFollow(context);
    default:
      return null;
  }
}

function logWebhookReceived({
  latencyMs,
  messageId,
  type,
  userId,
}: {
  latencyMs: number;
  messageId: string;
  type: string;
  userId?: string;
}): void {
  console.info("webhook_received", {
    event: "webhook_received",
    latencyMs,
    messageId,
    provider: "twitch",
    type,
    userId,
  });
}

function isFreshTwitchTimestamp(timestamp: string, now: number): boolean {
  const timestampMs = Date.parse(timestamp);

  return Number.isFinite(timestampMs) && Math.abs(now - timestampMs) <= 600_000;
}

export function createTwitchWebhookRouter({
  deduplicationClient,
  dispatcher,
  now,
  rateLimit: routeRateLimit,
  secret,
}: CreateTwitchWebhookRouterOptions): Router {
  const router = express.Router();
  const twitchWebhookRateLimiter = rateLimit({
    keyGenerator: (request) =>
      `legacy:twitch:webhook:${ipKeyGenerator(request.ip ?? "0.0.0.0")}`,
    legacyHeaders: false,
    limit:
      routeRateLimit?.maxRequests ?? TWITCH_WEBHOOK_RATE_LIMIT_MAX_REQUESTS,
    message: {
      error: "rate_limit_exceeded",
      message: "Too many Twitch webhook requests.",
    },
    standardHeaders: "draft-7",
    windowMs: routeRateLimit?.windowMs ?? TWITCH_WEBHOOK_RATE_LIMIT_WINDOW_MS,
  });

  router.post(
    "/",
    twitchWebhookRateLimiter,
    async (request: Request, response: Response) => {
      const startedAt = now();

      if (!secret) {
        response.sendStatus(503);
        return;
      }

      const rawBody = getRawBody(request);
      const messageId = getHeaderValue(
        request.headers[TWITCH_HEADER_MESSAGE_ID],
      );
      const messageTimestamp = getHeaderValue(
        request.headers[TWITCH_HEADER_MESSAGE_TIMESTAMP],
      );
      const messageSignature = getTwitchSignatureHeader(request);
      const messageType = getHeaderValue(
        request.headers[TWITCH_HEADER_MESSAGE_TYPE],
      );

      if (!rawBody || !messageId || !messageTimestamp || !messageSignature) {
        response.sendStatus(403);
        return;
      }

      if (!isFreshTwitchTimestamp(messageTimestamp, now())) {
        response.sendStatus(403);
        return;
      }

      if (
        !verifyTwitchSignature(
          messageId,
          messageTimestamp,
          rawBody,
          messageSignature,
          secret,
        )
      ) {
        response.sendStatus(403);
        return;
      }

      let body: Record<string, unknown>;

      try {
        body = parseJsonObject(rawBody);
      } catch {
        response.status(400).json({ error: "invalid_twitch_payload" });
        return;
      }

      if (messageType === TWITCH_MESSAGE_TYPE_VERIFICATION) {
        const challenge = asString(body.challenge);

        if (!challenge) {
          response.status(400).json({ error: "missing_twitch_challenge" });
          return;
        }

        response.status(200).type("text/plain").send(challenge);
        return;
      }

      const duplicate = await isMessageDuplicate(
        deduplicationClient,
        `twitch:msg:${messageId}`,
        TWITCH_DEDUP_TTL_SECONDS,
      );

      if (duplicate) {
        console.info("webhook_duplicate", {
          event: "webhook_duplicate",
          messageId,
          provider: "twitch",
        });
        response.status(200).json({ received: true, duplicate: true });
        return;
      }

      if (messageType === TWITCH_MESSAGE_TYPE_REVOCATION) {
        response.status(200).json({ received: true, revoked: true });
        return;
      }

      if (messageType !== TWITCH_MESSAGE_TYPE_NOTIFICATION) {
        response.status(200).json({ received: true, handled: false });
        return;
      }

      try {
        const type = getTwitchSubscriptionType(body);
        const job = await routeTwitchEvent({
          body,
          messageId,
          receivedAt: new Date(startedAt).toISOString(),
        });

        if (job && dispatcher) {
          await dispatcher(job);
        }

        logWebhookReceived({
          latencyMs: now() - startedAt,
          messageId,
          type,
          userId:
            job && "userId" in job && typeof job.userId === "string"
              ? job.userId
              : undefined,
        });

        response.status(200).json({
          dispatched: Boolean(job && dispatcher),
          event_id: messageId,
          event_type: type,
          received: true,
        });
      } catch (error) {
        console.error("twitch_webhook_processing_failed", {
          error: error instanceof Error ? error.message : String(error),
          messageId,
          provider: "twitch",
        });
        response.sendStatus(500);
      }
    },
  );

  return router;
}
