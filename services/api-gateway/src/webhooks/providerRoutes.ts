import express from "express";
import type { Request, Response, Router } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";

import {
  sendPlainTextWebhookChallenge,
  validateWebhookChallenge,
} from "../lib/webhook-challenge.js";
import {
  normalizeTwitchNotification,
  normalizeYouTubeAtomEntry,
  parseYouTubeAtomEntries,
  type ProviderWebhookDispatcher,
} from "./providerEvents.js";
import {
  verifyTwitchEventSubSignature,
  verifyWebSubSignature,
} from "./signatures.js";

const TWITCH_HEADER_MESSAGE_ID = "twitch-eventsub-message-id";
const TWITCH_HEADER_MESSAGE_SIGNATURE = "twitch-eventsub-message-signature";
const TWITCH_HEADER_MESSAGE_TIMESTAMP = "twitch-eventsub-message-timestamp";
const TWITCH_HEADER_MESSAGE_TYPE = "twitch-eventsub-message-type";

const TWITCH_MESSAGE_TYPE_NOTIFICATION = "notification";
const TWITCH_MESSAGE_TYPE_REVOCATION = "revocation";
const TWITCH_MESSAGE_TYPE_VERIFICATION = "webhook_callback_verification";

const WEBHOOK_TIMESTAMP_TOLERANCE_MS = 10 * 60 * 1000;
const TWITCH_EVENTSUB_RATE_LIMIT_WINDOW_MS = 60_000;
const TWITCH_EVENTSUB_RATE_LIMIT_MAX_REQUESTS = 500;
const YOUTUBE_WEBSUB_CHALLENGE_RATE_LIMIT_WINDOW_MS = 60_000;
const YOUTUBE_WEBSUB_CHALLENGE_RATE_LIMIT_MAX_REQUESTS = 120;
const YOUTUBE_WEBSUB_POST_RATE_LIMIT_WINDOW_MS = 60_000;
const YOUTUBE_WEBSUB_POST_RATE_LIMIT_MAX_REQUESTS = 500;

type CreateProviderWebhookRouterOptions = {
  dispatcher?: ProviderWebhookDispatcher;
  now: () => number;
  twitchEventSubRateLimit?: {
    maxRequests?: number;
    windowMs?: number;
  };
  twitchEventSubSecret: string | undefined;
  youtubeWebSubChallengeRateLimit?: {
    maxRequests?: number;
    windowMs?: number;
  };
  youtubeWebSubSecret: string | undefined;
  youtubeWebSubPostRateLimit?: {
    maxRequests?: number;
    windowMs?: number;
  };
  youtubeWebSubVerifyToken?: string | undefined;
};

function getHeaderValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function getRawBody(request: Request): Buffer | undefined {
  return Buffer.isBuffer(request.body) ? request.body : undefined;
}

function getReceivedAt(now: () => number): string {
  return new Date(now()).toISOString();
}

function isFreshWebhookTimestamp(timestamp: string, now: number): boolean {
  const timestampMs = Date.parse(timestamp);

  return (
    Number.isFinite(timestampMs) &&
    Math.abs(now - timestampMs) <= WEBHOOK_TIMESTAMP_TOLERANCE_MS
  );
}

function parseJsonBody(rawBody: Buffer): Record<string, unknown> {
  const parsed = JSON.parse(rawBody.toString("utf8")) as unknown;

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Expected a JSON object.");
  }

  return parsed as Record<string, unknown>;
}

function validateYouTubeVerifyToken({
  expectedToken,
  receivedToken,
}: {
  expectedToken?: string;
  receivedToken: string | null;
}): boolean {
  return !expectedToken || receivedToken === expectedToken;
}

function getQueryString(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }

  return null;
}

function getQueryInteger(value: unknown): number | null {
  const rawValue = getQueryString(value);
  const parsed = rawValue ? Number.parseInt(rawValue, 10) : NaN;

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function dispatchIfConfigured({
  dispatcher,
  event,
}: {
  dispatcher: ProviderWebhookDispatcher | undefined;
  event: Parameters<ProviderWebhookDispatcher>[0];
}): Promise<boolean> {
  if (!dispatcher) {
    return false;
  }

  await dispatcher(event);
  return true;
}

export function createProviderWebhookRouter({
  dispatcher,
  now,
  twitchEventSubRateLimit,
  twitchEventSubSecret,
  youtubeWebSubChallengeRateLimit,
  youtubeWebSubPostRateLimit,
  youtubeWebSubSecret,
  youtubeWebSubVerifyToken,
}: CreateProviderWebhookRouterOptions): Router {
  const router = express.Router();
  const rawBodyParser = express.raw({ limit: "1mb", type: "*/*" });
  const twitchEventSubRateLimiter = rateLimit({
    keyGenerator: (request) =>
      `twitch:eventsub:${ipKeyGenerator(request.ip ?? "0.0.0.0")}`,
    legacyHeaders: false,
    limit:
      twitchEventSubRateLimit?.maxRequests ??
      TWITCH_EVENTSUB_RATE_LIMIT_MAX_REQUESTS,
    message: {
      error: "rate_limit_exceeded",
      message: "Too many Twitch EventSub webhook requests.",
    },
    standardHeaders: "draft-7",
    windowMs:
      twitchEventSubRateLimit?.windowMs ?? TWITCH_EVENTSUB_RATE_LIMIT_WINDOW_MS,
  });
  const youtubeWebSubChallengeRateLimiter = rateLimit({
    keyGenerator: (request) =>
      `youtube:websub:challenge:${ipKeyGenerator(request.ip ?? "0.0.0.0")}`,
    legacyHeaders: false,
    limit:
      youtubeWebSubChallengeRateLimit?.maxRequests ??
      YOUTUBE_WEBSUB_CHALLENGE_RATE_LIMIT_MAX_REQUESTS,
    message: {
      error: "rate_limit_exceeded",
      message: "Too many YouTube WebSub challenge requests.",
    },
    standardHeaders: "draft-7",
    windowMs:
      youtubeWebSubChallengeRateLimit?.windowMs ??
      YOUTUBE_WEBSUB_CHALLENGE_RATE_LIMIT_WINDOW_MS,
  });
  const youtubeWebSubPostRateLimiter = rateLimit({
    keyGenerator: (request) =>
      `youtube:websub:post:${ipKeyGenerator(request.ip ?? "0.0.0.0")}`,
    legacyHeaders: false,
    limit:
      youtubeWebSubPostRateLimit?.maxRequests ??
      YOUTUBE_WEBSUB_POST_RATE_LIMIT_MAX_REQUESTS,
    message: {
      error: "rate_limit_exceeded",
      message: "Too many YouTube WebSub webhook requests.",
    },
    standardHeaders: "draft-7",
    windowMs:
      youtubeWebSubPostRateLimit?.windowMs ??
      YOUTUBE_WEBSUB_POST_RATE_LIMIT_WINDOW_MS,
  });

  router.post(
    "/twitch/eventsub",
    twitchEventSubRateLimiter,
    rawBodyParser,
    async (request: Request, response: Response) => {
      if (!twitchEventSubSecret) {
        response.status(503).json({
          error: "twitch_eventsub_secret_missing",
          message:
            "TWITCH_EVENTSUB_SECRET or TWITCH_WEBHOOK_SECRET is required.",
        });
        return;
      }

      const rawBody = getRawBody(request);
      const messageId = getHeaderValue(
        request.headers[TWITCH_HEADER_MESSAGE_ID],
      );
      const messageSignature = getHeaderValue(
        request.headers[TWITCH_HEADER_MESSAGE_SIGNATURE],
      );
      const messageTimestamp = getHeaderValue(
        request.headers[TWITCH_HEADER_MESSAGE_TIMESTAMP],
      );
      const messageType = getHeaderValue(
        request.headers[TWITCH_HEADER_MESSAGE_TYPE],
      );

      if (
        !rawBody ||
        !messageId ||
        !messageSignature ||
        !messageTimestamp ||
        !messageType
      ) {
        response.status(401).json({
          error: "invalid_twitch_eventsub_signature",
          message: "Twitch EventSub signed headers and raw body are required.",
        });
        return;
      }

      if (!isFreshWebhookTimestamp(messageTimestamp, now())) {
        response.status(401).json({
          error: "stale_twitch_eventsub_timestamp",
          message: "Twitch EventSub timestamp is outside the replay window.",
        });
        return;
      }

      if (
        !verifyTwitchEventSubSignature({
          messageId,
          rawBody,
          receivedSignature: messageSignature,
          secret: twitchEventSubSecret,
          timestamp: messageTimestamp,
        })
      ) {
        response.status(401).json({
          error: "invalid_twitch_eventsub_signature",
          message: "Twitch EventSub signature is invalid.",
        });
        return;
      }

      let body: Record<string, unknown>;

      try {
        body = parseJsonBody(rawBody);
      } catch {
        response.status(400).json({
          error: "invalid_twitch_eventsub_payload",
          message: "Twitch EventSub payload must be valid JSON.",
        });
        return;
      }

      if (messageType === TWITCH_MESSAGE_TYPE_VERIFICATION) {
        const challenge = validateWebhookChallenge(body.challenge);

        if (!challenge) {
          response.status(400).json({
            error: "invalid_twitch_eventsub_challenge",
            message:
              "Twitch EventSub verification payload is missing challenge.",
          });
          return;
        }

        sendPlainTextWebhookChallenge(response, challenge);
        return;
      }

      if (messageType === TWITCH_MESSAGE_TYPE_REVOCATION) {
        response.status(202).json({ received: true, revoked: true });
        return;
      }

      if (messageType !== TWITCH_MESSAGE_TYPE_NOTIFICATION) {
        response.status(202).json({ received: true, handled: false });
        return;
      }

      const event = (() => {
        try {
          return normalizeTwitchNotification({
            eventId: messageId,
            payload: body,
            receivedAt: getReceivedAt(now),
          });
        } catch {
          response.status(422).json({
            error: "invalid_twitch_eventsub_notification",
            message: "Twitch EventSub notification payload is incomplete.",
          });
          return undefined;
        }
      })();

      if (!event) {
        if (!response.headersSent) {
          response.status(202).json({ received: true, handled: false });
        }
        return;
      }

      try {
        const dispatched = await dispatchIfConfigured({ dispatcher, event });

        response.status(202).json({
          received: true,
          dispatched,
          event_id: event.id,
          event_type: event.type,
        });
      } catch {
        response.status(503).json({
          error: "stream_job_dispatch_failed",
          message: "StreamOS job could not be queued.",
        });
      }
    },
  );

  router.get(
    "/youtube/websub",
    youtubeWebSubChallengeRateLimiter,
    (request: Request, response: Response) => {
      const mode = getQueryString(request.query["hub.mode"]);
      const topic = getQueryString(request.query["hub.topic"]);
      const challenge = validateWebhookChallenge(
        getQueryString(request.query["hub.challenge"]),
      );
      const verifyToken = getQueryString(request.query["hub.verify_token"]);
      const leaseSeconds = getQueryInteger(request.query["hub.lease_seconds"]);

      if (mode !== "subscribe" && mode !== "unsubscribe") {
        response.status(400).json({
          error: "invalid_youtube_websub_mode",
          message: "hub.mode must be subscribe or unsubscribe.",
        });
        return;
      }

      if (!topic || !challenge) {
        response.status(400).json({
          error: "invalid_youtube_websub_challenge",
          message: "hub.topic and hub.challenge are required.",
        });
        return;
      }

      if (
        !validateYouTubeVerifyToken({
          expectedToken: youtubeWebSubVerifyToken,
          receivedToken: verifyToken,
        })
      ) {
        response.status(403).json({
          error: "invalid_youtube_websub_verify_token",
          message: "YouTube WebSub verify token is invalid.",
        });
        return;
      }

      sendPlainTextWebhookChallenge(response, challenge);

      void updateYouTubeWebSubChallengeTracking({
        leaseSeconds,
        mode,
        now,
        topic,
      });
    },
  );

  router.post(
    "/youtube/websub",
    youtubeWebSubPostRateLimiter,
    rawBodyParser,
    async (request: Request, response: Response) => {
      if (!youtubeWebSubSecret) {
        response.status(503).json({
          error: "youtube_websub_secret_missing",
          message: "YOUTUBE_WEBSUB_SECRET is required.",
        });
        return;
      }

      const rawBody = getRawBody(request);
      const hubSignature = getHeaderValue(request.headers["x-hub-signature"]);

      if (!rawBody || !hubSignature) {
        response.status(401).json({
          error: "invalid_youtube_websub_signature",
          message: "YouTube WebSub signature and raw body are required.",
        });
        return;
      }

      if (
        !verifyWebSubSignature({
          rawBody,
          receivedSignature: hubSignature,
          secret: youtubeWebSubSecret,
        })
      ) {
        response.status(401).json({
          error: "invalid_youtube_websub_signature",
          message: "YouTube WebSub signature is invalid.",
        });
        return;
      }

      let entries;

      try {
        entries = parseYouTubeAtomEntries(rawBody.toString("utf8"));
      } catch {
        response.status(400).json({
          error: "invalid_youtube_websub_payload",
          message: "YouTube WebSub payload must be valid Atom XML.",
        });
        return;
      }

      const events = entries.map((entry) =>
        normalizeYouTubeAtomEntry({
          entry,
          receivedAt: getReceivedAt(now),
        }),
      );

      for (const event of events) {
        await dispatchIfConfigured({ dispatcher, event });
      }

      response.status(202).json({
        received: true,
        dispatched: Boolean(dispatcher),
        entries: events.length,
      });
    },
  );

  return router;
}

async function updateYouTubeWebSubChallengeTracking({
  leaseSeconds,
  mode,
  now,
  topic,
}: {
  leaseSeconds: number | null;
  mode: "subscribe" | "unsubscribe";
  now: () => number;
  topic: string;
}): Promise<void> {
  const supabaseUrl =
    process.env.SUPABASE_URL?.trim() ??
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    return;
  }

  try {
    const rows = await queryYouTubeWebSubRows({
      serviceRoleKey,
      supabaseUrl,
      topic,
    });
    const verifiedAt = new Date(now());
    const resolvedLeaseSeconds = leaseSeconds ?? 864_000;
    const expiresAt = new Date(
      verifiedAt.getTime() + resolvedLeaseSeconds * 1000,
    ).toISOString();
    const subscribedAt = verifiedAt.toISOString();
    const status = mode === "subscribe" ? "active" : "unsubscribed";

    await patchSupabaseRows({
      filter: `topic_url=eq.${topic}`,
      payload: {
        expires_at: expiresAt,
        failed_renewals: 0,
        lease_seconds: resolvedLeaseSeconds,
        status,
        subscribed_at: subscribedAt,
      },
      serviceRoleKey,
      supabaseUrl,
      table: "youtube_websub_subscriptions",
    });

    await Promise.all(
      rows.map((row) =>
        updatePlatformConnectionWebSubMetadata({
          connectionId: row.channel_connection_id,
          serviceRoleKey,
          status,
          subscriptionPatch: {
            expiresAt,
            leaseSeconds: resolvedLeaseSeconds,
            status,
            subscribedAt,
            topicUrl: topic,
          },
          supabaseUrl,
        }),
      ),
    );
  } catch (error) {
    console.error("YouTube WebSub challenge tracking update failed.", {
      error,
      topic,
    });
  }
}

async function queryYouTubeWebSubRows({
  serviceRoleKey,
  supabaseUrl,
  topic,
}: {
  serviceRoleKey: string;
  supabaseUrl: string;
  topic: string;
}): Promise<{ channel_connection_id: string }[]> {
  const url = new URL("/rest/v1/youtube_websub_subscriptions", supabaseUrl);
  url.searchParams.set("topic_url", `eq.${topic}`);
  url.searchParams.set("select", "channel_connection_id");

  const response = await fetch(url, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `YouTube WebSub tracking lookup failed with status ${response.status}.`,
    );
  }

  return (await response.json()) as { channel_connection_id: string }[];
}

async function updatePlatformConnectionWebSubMetadata({
  connectionId,
  serviceRoleKey,
  status,
  subscriptionPatch,
  supabaseUrl,
}: {
  connectionId: string;
  serviceRoleKey: string;
  status: "active" | "unsubscribed";
  subscriptionPatch: {
    expiresAt: string;
    leaseSeconds: number;
    status: string;
    subscribedAt: string;
    topicUrl: string;
  };
  supabaseUrl: string;
}): Promise<void> {
  const metadata = await getPlatformConnectionMetadata({
    connectionId,
    serviceRoleKey,
    supabaseUrl,
  });
  const websub = toJsonRecord(metadata.websub);
  const subscriptions = Array.isArray(websub.subscriptions)
    ? websub.subscriptions.map((subscription) =>
        isMatchingSubscription(subscription, subscriptionPatch.topicUrl)
          ? {
              ...toJsonRecord(subscription),
              ...subscriptionPatch,
            }
          : subscription,
      )
    : [];

  if (
    !subscriptions.some((subscription) =>
      isMatchingSubscription(subscription, subscriptionPatch.topicUrl),
    )
  ) {
    subscriptions.push(subscriptionPatch);
  }

  await patchSupabaseRows({
    filter: `id=eq.${connectionId}`,
    payload: {
      metadata: {
        ...metadata,
        websub: {
          ...websub,
          failedRenewals: 0,
          lastRenewedAt:
            status === "active"
              ? subscriptionPatch.subscribedAt
              : (websub.lastRenewedAt ?? null),
          subscriptions,
        },
      },
    },
    serviceRoleKey,
    supabaseUrl,
    table: "platform_connections",
  });
}

async function getPlatformConnectionMetadata({
  connectionId,
  serviceRoleKey,
  supabaseUrl,
}: {
  connectionId: string;
  serviceRoleKey: string;
  supabaseUrl: string;
}): Promise<Record<string, unknown>> {
  const url = new URL("/rest/v1/platform_connections", supabaseUrl);
  url.searchParams.set("id", `eq.${connectionId}`);
  url.searchParams.set("select", "metadata");
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Platform connection metadata lookup failed with status ${response.status}.`,
    );
  }

  const rows = (await response.json()) as { metadata?: unknown }[];
  return toJsonRecord(rows[0]?.metadata);
}

async function patchSupabaseRows({
  filter,
  payload,
  serviceRoleKey,
  supabaseUrl,
  table,
}: {
  filter: string;
  payload: Record<string, unknown>;
  serviceRoleKey: string;
  supabaseUrl: string;
  table: string;
}): Promise<void> {
  const url = new URL(`/rest/v1/${table}`, supabaseUrl);
  const separatorIndex = filter.indexOf("=");
  const key = filter.slice(0, separatorIndex);
  const value = filter.slice(separatorIndex + 1);

  if (separatorIndex < 1 || !value) {
    throw new Error("Supabase patch filter is invalid.");
  }

  url.searchParams.set(key, value);

  const response = await fetch(url, {
    body: JSON.stringify(payload),
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    method: "PATCH",
  });

  if (!response.ok) {
    throw new Error(
      `Supabase ${table} patch failed with status ${response.status}.`,
    );
  }
}

function isMatchingSubscription(value: unknown, topicUrl: string): boolean {
  return toJsonRecord(value).topicUrl === topicUrl;
}

function toJsonRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}
