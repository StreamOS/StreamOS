import { createHmac, timingSafeEqual } from "node:crypto";
import express from "express";
import type { Express, NextFunction, Request, Response } from "express";
import helmet from "helmet";
import { ZodError } from "zod";

import {
  clipGenerationPayloadSchema,
  enqueueClipGenerationJob,
  type ClipGenerationQueue,
} from "./jobs/clipGenerationQueue.js";
import {
  enqueueTranscriptionTriggerJob,
  streamEndedPayloadSchema,
  type TranscriptionQueue,
} from "./jobs/transcriptionQueue.js";

type CreateAppOptions = {
  allowedOrigins?: string[];
  apiGatewaySecret?: string;
  clipGenerationQueue?: ClipGenerationQueue;
  nodeEnv?: string;
  rateLimit?: Partial<RateLimitConfig>;
  streamEventWebhookSecret?: string;
  transcriptionQueue?: TranscriptionQueue;
  webhookNow?: () => number;
};

type RateLimitConfig = {
  enabled: boolean;
  maxRequests: number;
  windowMs: number;
};

type SecurityConfig = {
  allowedOrigins: string[];
  apiGatewaySecret: string | undefined;
  rateLimit: RateLimitConfig;
  streamEventWebhookSecret: string | undefined;
  webhookNow: () => number;
};

type RawBodyRequest = Request & {
  rawBody?: Buffer;
};

const DEFAULT_ALLOWED_DEV_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];
const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 120;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
const MIN_PRODUCTION_SECRET_LENGTH = 24;
const WEBHOOK_TIMESTAMP_TOLERANCE_MS = 10 * 60 * 1000;

function hasValidSecret(
  headerValue: string | string[] | undefined,
  expectedSecret: string | undefined,
): boolean {
  if (!expectedSecret) {
    return true;
  }

  const receivedSecret = Array.isArray(headerValue)
    ? headerValue[0]
    : headerValue;

  if (!receivedSecret) {
    return false;
  }

  const receivedBuffer = Buffer.from(receivedSecret);
  const expectedBuffer = Buffer.from(expectedSecret);

  return (
    receivedBuffer.byteLength === expectedBuffer.byteLength &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

function getBearerToken(headerValue: string | string[] | undefined) {
  const authorizationHeader = Array.isArray(headerValue)
    ? headerValue[0]
    : headerValue;

  if (!authorizationHeader?.startsWith("Bearer ")) {
    return undefined;
  }

  return authorizationHeader.slice("Bearer ".length);
}

function parseCommaSeparatedEnv(value: string | undefined) {
  return (
    value
      ?.split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0) ?? []
  );
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getRequestPath(request: Request) {
  return (
    request.path || request.originalUrl.split("?")[0] || request.originalUrl
  );
}

function isProduction(nodeEnv: string | undefined) {
  return nodeEnv === "production";
}

function resolveSecurityConfig(options: CreateAppOptions): SecurityConfig {
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;
  const apiGatewaySecret = (
    options.apiGatewaySecret ?? process.env.API_GATEWAY_SECRET
  )?.trim();
  const streamEventWebhookSecret = (
    options.streamEventWebhookSecret ?? process.env.STREAM_EVENT_WEBHOOK_SECRET
  )?.trim();
  const envAllowedOrigins = parseCommaSeparatedEnv(
    process.env.API_GATEWAY_ALLOWED_ORIGINS,
  );
  const fallbackAllowedOrigins =
    envAllowedOrigins.length > 0
      ? envAllowedOrigins
      : parseCommaSeparatedEnv(process.env.NEXT_PUBLIC_APP_URL);
  const allowedOrigins =
    options.allowedOrigins ??
    (fallbackAllowedOrigins.length > 0
      ? fallbackAllowedOrigins
      : isProduction(nodeEnv)
        ? []
        : DEFAULT_ALLOWED_DEV_ORIGINS);
  const rateLimit: RateLimitConfig = {
    enabled:
      options.rateLimit?.enabled ??
      process.env.API_GATEWAY_RATE_LIMIT_ENABLED !== "false",
    maxRequests:
      options.rateLimit?.maxRequests ??
      parsePositiveInteger(
        process.env.API_GATEWAY_RATE_LIMIT_MAX,
        DEFAULT_RATE_LIMIT_MAX_REQUESTS,
      ),
    windowMs:
      options.rateLimit?.windowMs ??
      parsePositiveInteger(
        process.env.API_GATEWAY_RATE_LIMIT_WINDOW_MS,
        DEFAULT_RATE_LIMIT_WINDOW_MS,
      ),
  };

  if (isProduction(nodeEnv) && !apiGatewaySecret) {
    throw new Error("API_GATEWAY_SECRET is required in production.");
  }

  if (isProduction(nodeEnv) && !streamEventWebhookSecret) {
    throw new Error("STREAM_EVENT_WEBHOOK_SECRET is required in production.");
  }

  if (
    isProduction(nodeEnv) &&
    apiGatewaySecret &&
    apiGatewaySecret.length < MIN_PRODUCTION_SECRET_LENGTH
  ) {
    throw new Error(
      "API_GATEWAY_SECRET must be at least 24 characters in production.",
    );
  }

  if (
    isProduction(nodeEnv) &&
    streamEventWebhookSecret &&
    streamEventWebhookSecret.length < MIN_PRODUCTION_SECRET_LENGTH
  ) {
    throw new Error(
      "STREAM_EVENT_WEBHOOK_SECRET must be at least 24 characters in production.",
    );
  }

  if (isProduction(nodeEnv) && allowedOrigins.length === 0) {
    throw new Error(
      "API_GATEWAY_ALLOWED_ORIGINS or NEXT_PUBLIC_APP_URL is required in production.",
    );
  }

  if (isProduction(nodeEnv) && allowedOrigins.includes("*")) {
    throw new Error("Wildcard CORS origins are not allowed in production.");
  }

  if (isProduction(nodeEnv) && !rateLimit.enabled) {
    throw new Error(
      "API Gateway rate limiting cannot be disabled in production.",
    );
  }

  return {
    allowedOrigins,
    apiGatewaySecret,
    rateLimit,
    streamEventWebhookSecret,
    webhookNow: options.webhookNow ?? Date.now,
  };
}

function createCorsMiddleware(allowedOrigins: string[]) {
  const allowedOriginSet = new Set(allowedOrigins);

  return (request: Request, response: Response, next: NextFunction) => {
    const requestOrigin = request.headers.origin;

    if (!requestOrigin) {
      if (request.method === "OPTIONS") {
        response.sendStatus(204);
        return;
      }

      next();
      return;
    }

    if (!allowedOriginSet.has(requestOrigin)) {
      response.setHeader("Vary", "Origin");
      response.status(403).json({
        error: "origin_not_allowed",
        message: "Request origin is not allowed by the API gateway.",
      });
      return;
    }

    response.setHeader("Access-Control-Allow-Origin", requestOrigin);
    response.setHeader("Access-Control-Allow-Credentials", "false");
    response.setHeader(
      "Access-Control-Allow-Headers",
      [
        "Authorization",
        "Content-Type",
        "X-StreamOS-API-Secret",
        "X-StreamOS-Event-Id",
        "X-StreamOS-Signature",
        "X-StreamOS-Timestamp",
        "Twitch-Eventsub-Message-Id",
        "Twitch-Eventsub-Message-Signature",
        "Twitch-Eventsub-Message-Timestamp",
      ].join(", "),
    );
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.setHeader("Access-Control-Max-Age", "600");
    response.setHeader("Vary", "Origin");

    if (request.method === "OPTIONS") {
      response.sendStatus(204);
      return;
    }

    next();
  };
}

function getHeaderValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function getSignedWebhookHeaders(request: Request) {
  const eventId =
    getHeaderValue(request.headers["x-streamos-event-id"]) ??
    getHeaderValue(request.headers["twitch-eventsub-message-id"]);
  const timestamp =
    getHeaderValue(request.headers["x-streamos-timestamp"]) ??
    getHeaderValue(request.headers["twitch-eventsub-message-timestamp"]);
  const signature =
    getHeaderValue(request.headers["x-streamos-signature"]) ??
    getHeaderValue(request.headers["twitch-eventsub-message-signature"]);

  return { eventId, signature, timestamp };
}

function isFreshWebhookTimestamp(timestamp: string, now: number): boolean {
  const timestampMs = Date.parse(timestamp);

  if (!Number.isFinite(timestampMs)) {
    return false;
  }

  return Math.abs(now - timestampMs) <= WEBHOOK_TIMESTAMP_TOLERANCE_MS;
}

function verifyWebhookSignature({
  eventId,
  rawBody,
  receivedSignature,
  secret,
  timestamp,
}: {
  eventId: string;
  rawBody: Buffer;
  receivedSignature: string;
  secret: string;
  timestamp: string;
}): boolean {
  const expectedSignature = `sha256=${createHmac("sha256", secret)
    .update(eventId)
    .update(timestamp)
    .update(rawBody)
    .digest("hex")}`;
  const receivedBuffer = Buffer.from(receivedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);

  return (
    receivedBuffer.byteLength === expectedBuffer.byteLength &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

function requireSignedWebhook({
  expectedSecret,
  now,
}: {
  expectedSecret: string | undefined;
  now: () => number;
}) {
  return (request: Request, response: Response, next: NextFunction) => {
    if (!expectedSecret) {
      next();
      return;
    }

    const { eventId, signature, timestamp } = getSignedWebhookHeaders(request);

    const rawBody = (request as RawBodyRequest).rawBody;

    if (!eventId || !signature || !timestamp || !rawBody) {
      response.status(401).json({
        error: "invalid_webhook_signature",
        message: "Signed webhook headers and raw body are required.",
      });
      return;
    }

    if (!isFreshWebhookTimestamp(timestamp, now())) {
      response.status(401).json({
        error: "stale_webhook_timestamp",
        message: "Webhook timestamp is outside the allowed replay window.",
      });
      return;
    }

    if (
      !verifyWebhookSignature({
        eventId,
        rawBody,
        receivedSignature: signature,
        secret: expectedSecret,
        timestamp,
      })
    ) {
      response.status(401).json({
        error: "invalid_webhook_signature",
        message: "Webhook signature is invalid.",
      });
      return;
    }

    next();
  };
}

function requireAppApiSecret(expectedSecret: string | undefined) {
  return (request: Request, response: Response, next: NextFunction) => {
    const receivedSecret =
      getBearerToken(request.headers.authorization) ??
      request.headers["x-streamos-api-secret"];

    if (!hasValidSecret(receivedSecret, expectedSecret)) {
      response.status(401).json({
        error: "invalid_api_gateway_secret",
        message: "API gateway secret is invalid.",
      });
      return;
    }

    next();
  };
}

function createRateLimitMiddleware(config: RateLimitConfig) {
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return (request: Request, response: Response, next: NextFunction) => {
    if (!config.enabled) {
      next();
      return;
    }

    const now = Date.now();
    const key = `${request.ip}:${request.method}:${getRequestPath(request)}`;
    const existingBucket = buckets.get(key);
    const bucket =
      existingBucket && existingBucket.resetAt > now
        ? existingBucket
        : { count: 0, resetAt: now + config.windowMs };

    bucket.count += 1;
    buckets.set(key, bucket);

    const remaining = Math.max(config.maxRequests - bucket.count, 0);
    const resetSeconds = Math.ceil(bucket.resetAt / 1000);

    response.setHeader("X-RateLimit-Limit", String(config.maxRequests));
    response.setHeader("X-RateLimit-Remaining", String(remaining));
    response.setHeader("X-RateLimit-Reset", String(resetSeconds));

    if (bucket.count > config.maxRequests) {
      response.setHeader(
        "Retry-After",
        String(Math.max(Math.ceil((bucket.resetAt - now) / 1000), 1)),
      );
      response.status(429).json({
        error: "rate_limit_exceeded",
        message: "Too many API gateway requests. Retry after the reset time.",
      });
      return;
    }

    if (buckets.size > 1_000) {
      for (const [bucketKey, bucketValue] of buckets.entries()) {
        if (bucketValue.resetAt <= now) {
          buckets.delete(bucketKey);
        }
      }
    }

    next();
  };
}

export function createApp(options: CreateAppOptions = {}): Express {
  const app = express();
  const securityConfig = resolveSecurityConfig(options);
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;

  if (
    isProduction(nodeEnv) &&
    (!options.clipGenerationQueue || !options.transcriptionQueue)
  ) {
    throw new Error(
      "REDIS_URL is required in production for API Gateway queues.",
    );
  }

  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(createCorsMiddleware(securityConfig.allowedOrigins));
  app.use(
    express.json({
      limit: "1mb",
      verify(request, _response, body) {
        (request as RawBodyRequest).rawBody = Buffer.from(body);
      },
    }),
  );

  app.get("/health", (_request, response) => {
    response.status(200).json({ service: "api-gateway", status: "ok" });
  });

  app.use("/api", createRateLimitMiddleware(securityConfig.rateLimit));

  app.get(
    "/api/platforms",
    requireAppApiSecret(securityConfig.apiGatewaySecret),
    (_request, response) => {
      response.status(200).json({
        platforms: ["twitch", "youtube", "tiktok", "kick"],
        next: "Implement OAuth state handling and encrypted token storage.",
      });
    },
  );

  app.post(
    "/api/clips/generate",
    requireAppApiSecret(securityConfig.apiGatewaySecret),
    async (request, response) => {
      if (!options.clipGenerationQueue) {
        response.status(503).json({
          error: "clip_generation_queue_unavailable",
          message:
            "REDIS_URL is required before clip-generation jobs can be queued.",
        });
        return;
      }

      try {
        const payload = clipGenerationPayloadSchema.parse(request.body);
        const job = await enqueueClipGenerationJob(
          options.clipGenerationQueue,
          payload,
        );

        response.status(202).json({
          job_id: job.jobId,
          queue_job_id: job.queueJobId,
          stream_id: job.streamId,
          status: "queued",
        });
      } catch (error) {
        if (error instanceof ZodError) {
          response.status(400).json({
            error: "invalid_clip_generation_payload",
            issues: error.issues,
          });
          return;
        }

        response.status(502).json({
          error: "clip_generation_queue_failed",
          message: "Clip-generation job could not be queued.",
        });
      }
    },
  );

  app.post(
    "/api/webhooks/streams/ended",
    requireSignedWebhook({
      expectedSecret: securityConfig.streamEventWebhookSecret,
      now: securityConfig.webhookNow,
    }),
    async (request, response) => {
      if (!options.transcriptionQueue) {
        response.status(503).json({
          error: "transcription_queue_unavailable",
          message:
            "REDIS_URL is required before transcription jobs can be queued.",
        });
        return;
      }

      try {
        const payload = streamEndedPayloadSchema.parse(request.body);
        const job = await enqueueTranscriptionTriggerJob(
          options.transcriptionQueue,
          payload,
        );

        response.status(202).json({
          job_id: job.jobId,
          queue_job_id: job.queueJobId,
          stream_id: job.streamId,
          status: "queued",
        });
      } catch (error) {
        if (error instanceof ZodError) {
          response.status(400).json({
            error: "invalid_stream_ended_payload",
            issues: error.issues,
          });
          return;
        }

        response.status(502).json({
          error: "transcription_queue_failed",
          message: "Transcription trigger job could not be queued.",
        });
      }
    },
  );

  return app;
}
