import express from "express";
import type { Request, Response, Router } from "express";

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

type CreateProviderWebhookRouterOptions = {
  dispatcher?: ProviderWebhookDispatcher;
  now: () => number;
  twitchEventSubSecret: string | undefined;
  youtubeWebSubSecret: string | undefined;
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
  twitchEventSubSecret,
  youtubeWebSubSecret,
  youtubeWebSubVerifyToken,
}: CreateProviderWebhookRouterOptions): Router {
  const router = express.Router();
  const rawBodyParser = express.raw({ limit: "1mb", type: "*/*" });

  router.post(
    "/twitch/eventsub",
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
        const challenge =
          typeof body.challenge === "string" ? body.challenge : undefined;

        if (!challenge) {
          response.status(400).json({
            error: "invalid_twitch_eventsub_challenge",
            message:
              "Twitch EventSub verification payload is missing challenge.",
          });
          return;
        }

        response.status(200).type("text/plain").send(challenge);
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

      try {
        const event = normalizeTwitchNotification({
          eventId: messageId,
          payload: body,
          receivedAt: getReceivedAt(now),
        });

        if (!event) {
          response.status(202).json({ received: true, handled: false });
          return;
        }

        const dispatched = await dispatchIfConfigured({ dispatcher, event });

        response.status(202).json({
          received: true,
          dispatched,
          event_id: event.id,
          event_type: event.type,
        });
      } catch {
        response.status(422).json({
          error: "invalid_twitch_eventsub_notification",
          message: "Twitch EventSub notification payload is incomplete.",
        });
      }
    },
  );

  router.get("/youtube/websub", (request: Request, response: Response) => {
    const mode = getQueryString(request.query["hub.mode"]);
    const topic = getQueryString(request.query["hub.topic"]);
    const challenge = getQueryString(request.query["hub.challenge"]);
    const verifyToken = getQueryString(request.query["hub.verify_token"]);

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

    response.status(200).type("text/plain").send(challenge);
  });

  router.post(
    "/youtube/websub",
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
