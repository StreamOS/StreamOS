import { createHmac, timingSafeEqual } from "node:crypto";
import express from "express";
import type { Express, NextFunction, Request, Response } from "express";
import helmet from "helmet";
import { Redis } from "ioredis";
import {
  dispatchStreamOSJob,
  getTranscriptionTriggerJobId,
  type StreamOSJob,
} from "@streamos/queue";
import { assertRedisTls } from "@streamos/redis";
import { ZodError } from "zod";

import {
  enqueueClipGenerationJob,
  getClipGenerationJobId,
  type ClipGenerationQueue,
} from "./jobs/clipGenerationQueue.js";
import { streamEndedPayloadSchema } from "./jobs/transcriptionQueue.js";
import {
  createOAuthRouter,
  type CreateOAuthRouterOptions,
} from "./oauth/routes.js";
import {
  InMemoryDeduplicationClient,
  type RedisDeduplicationClient,
} from "./lib/deduplication.js";
import { attachRawBodyMiddleware } from "./middleware/raw-body.js";
import { createAuthHandoffRouter } from "./routes/auth/handoff.js";
import { createAutomationCallbackRouter } from "./routes/callbacks/automation.js";
import {
  clipGenerationRequestSchema,
  createContentJobsRouter,
  getClipQueuePayload,
  type ClipGenerationRequest,
  upsertClipContentJob,
} from "./routes/contentJobs.js";
import { createRoutes } from "./routes/index.js";
import { createMetricsSyncRouter } from "./routes/metricsSync.js";
import { createPlatformConnectionsRouter } from "./routes/platformConnections.js";
import {
  createSupabaseRestClient,
  readSupabaseRows,
} from "./lib/supabaseRest.js";
import type { ApiGatewayRuntimeProvenance } from "./runtimeProvenance.js";
import { createProviderWebhookRouter } from "./webhooks/providerRoutes.js";
import type { ProviderWebhookDispatcher } from "./webhooks/providerEvents.js";

type CreateAppOptions = {
  allowedOrigins?: string[];
  apiGatewaySecret?: string;
  clipGenerationQueue?: ClipGenerationQueue;
  nodeEnv?: string;
  oauth?: Partial<
    Pick<CreateOAuthRouterOptions, "fetchImpl" | "repository" | "stateStore">
  >;
  providerWebhookDispatcher?: ProviderWebhookDispatcher;
  rateLimit?: Partial<RateLimitConfig>;
  runtimeProvenance?: ApiGatewayRuntimeProvenance | null;
  streamEventWebhookSecret?: string;
  twitchEventSubSecret?: string;
  webhookDeduplicationClient?: RedisDeduplicationClient;
  webhookNow?: () => number;
  youtubeWebhookSecret?: string;
  youtubeWebSubSecret?: string;
  youtubeWebSubVerifyToken?: string;
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
  twitchEventSubSecret: string | undefined;
  webhookNow: () => number;
  youtubeWebhookSecret: string | undefined;
  youtubeWebSubSecret: string | undefined;
  youtubeWebSubVerifyToken: string | undefined;
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

class StreamNotFoundError extends Error {
  constructor(message = "Stream could not be resolved for this request.") {
    super(message);
    this.name = "StreamNotFoundError";
  }
}

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
  const twitchEventSubSecret = (
    options.twitchEventSubSecret ??
    process.env.TWITCH_EVENTSUB_SECRET ??
    process.env.TWITCH_WEBHOOK_SECRET
  )?.trim();
  const youtubeWebhookSecret = (
    options.youtubeWebhookSecret ?? process.env.YOUTUBE_WEBHOOK_SECRET
  )?.trim();
  const youtubeWebSubSecret = (
    options.youtubeWebSubSecret ??
    process.env.YOUTUBE_WEBHOOK_SECRET ??
    process.env.YOUTUBE_WEBSUB_SECRET
  )?.trim();
  const youtubeWebSubVerifyToken = (
    options.youtubeWebSubVerifyToken ?? process.env.YOUTUBE_WEBSUB_VERIFY_TOKEN
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

  if (isProduction(nodeEnv) && !twitchEventSubSecret) {
    throw new Error("TWITCH_EVENTSUB_SECRET is required in production.");
  }

  if (isProduction(nodeEnv) && !youtubeWebhookSecret && !youtubeWebSubSecret) {
    throw new Error("YOUTUBE_WEBHOOK_SECRET is required in production.");
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

  if (
    isProduction(nodeEnv) &&
    twitchEventSubSecret &&
    twitchEventSubSecret.length < MIN_PRODUCTION_SECRET_LENGTH
  ) {
    throw new Error(
      "TWITCH_EVENTSUB_SECRET must be at least 24 characters in production.",
    );
  }

  if (
    isProduction(nodeEnv) &&
    (youtubeWebhookSecret ?? youtubeWebSubSecret) &&
    (youtubeWebhookSecret ?? youtubeWebSubSecret)!.length <
      MIN_PRODUCTION_SECRET_LENGTH
  ) {
    throw new Error(
      "YOUTUBE_WEBHOOK_SECRET must be at least 24 characters in production.",
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
    twitchEventSubSecret,
    webhookNow: options.webhookNow ?? Date.now,
    youtubeWebhookSecret,
    youtubeWebSubSecret,
    youtubeWebSubVerifyToken,
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
        "Twitch-Eventsub-Message-Type",
        "X-Hub-Signature",
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

function createDefaultDeduplicationClient(
  nodeEnv = process.env.NODE_ENV,
): RedisDeduplicationClient {
  const redisUrl = process.env.REDIS_URL?.trim();

  if (!redisUrl) {
    return new InMemoryDeduplicationClient();
  }

  assertRedisTls(redisUrl, { nodeEnv });

  const redis = new Redis(redisUrl, {
    enableReadyCheck: true,
    lazyConnect: true,
    maxRetriesPerRequest: null,
  });

  return {
    async set(key, value, mode, ttlMode, ttlSeconds) {
      const result = await redis.call(
        "SET",
        key,
        value,
        mode,
        ttlMode,
        String(ttlSeconds),
      );

      return result === "OK" ? "OK" : null;
    },
  };
}

async function upsertFailedClipContentJob({
  error,
  fetchImpl,
  input,
}: {
  error: unknown;
  fetchImpl?: typeof fetch;
  input: ClipGenerationRequest;
}): Promise<void> {
  try {
    const supabase = createSupabaseRestClient({ fetchImpl });

    await upsertClipContentJob({
      errorMessage:
        error instanceof Error
          ? error.message
          : "Clip generation queue request failed.",
      input,
      queueJobId: getClipGenerationJobId(input.stream_id),
      result: {
        error:
          error instanceof Error
            ? error.message
            : "Clip generation queue request failed.",
      },
      status: "failed",
      supabase,
    });
  } catch (updateError) {
    console.error("Clip content job failure update failed.", {
      error: updateError instanceof Error ? updateError.message : updateError,
      streamId: input.stream_id,
      userId: input.requested_by,
    });
  }
}

async function assertKnownStreamForTranscription({
  fetchImpl,
  streamId,
  userId,
}: {
  fetchImpl?: typeof fetch;
  streamId: string;
  userId: string;
}): Promise<void> {
  const supabase = createSupabaseRestClient({ fetchImpl });
  const rows = await readSupabaseRows<{ id: string }>({
    client: supabase,
    params: {
      id: `eq.${streamId}`,
      select: "id",
      user_id: `eq.${userId}`,
    },
    table: "streams",
  });

  if (rows.length === 0) {
    throw new StreamNotFoundError(
      `No stream found for stream_id=${streamId} and user_id=${userId}.`,
    );
  }
}

export function createApp(options: CreateAppOptions = {}): Express {
  const app = express();
  const securityConfig = resolveSecurityConfig(options);
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;
  const providerWebhookDispatcher =
    options.providerWebhookDispatcher ?? dispatchStreamOSJob;
  const deduplicationClient =
    options.webhookDeduplicationClient ??
    createDefaultDeduplicationClient(nodeEnv);

  if (
    isProduction(nodeEnv) &&
    (!options.clipGenerationQueue ||
      (!options.providerWebhookDispatcher && !process.env.REDIS_URL?.trim()))
  ) {
    throw new Error(
      "REDIS_URL is required in production for API Gateway queues.",
    );
  }

  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(createCorsMiddleware(securityConfig.allowedOrigins));
  app.use(
    "/webhooks",
    createRateLimitMiddleware({
      enabled: securityConfig.rateLimit.enabled,
      maxRequests: 500,
      windowMs: 60_000,
    }),
  );
  app.use(
    "/api/webhooks",
    createRateLimitMiddleware({
      enabled: securityConfig.rateLimit.enabled,
      maxRequests: 500,
      windowMs: 60_000,
    }),
  );
  attachRawBodyMiddleware(app);
  app.use(
    createRoutes({
      deduplicationClient,
      dispatcher: providerWebhookDispatcher,
      now: securityConfig.webhookNow,
      twitchWebhookSecret: securityConfig.streamEventWebhookSecret,
      youtubeWebhookSecret:
        securityConfig.youtubeWebhookSecret ??
        securityConfig.youtubeWebSubSecret,
    }),
  );
  app.use(
    "/api/webhooks",
    createProviderWebhookRouter({
      dispatcher: providerWebhookDispatcher,
      now: securityConfig.webhookNow,
      twitchEventSubSecret: securityConfig.twitchEventSubSecret,
      youtubeWebSubSecret:
        securityConfig.youtubeWebhookSecret ??
        securityConfig.youtubeWebSubSecret,
      youtubeWebSubVerifyToken: securityConfig.youtubeWebSubVerifyToken,
    }),
  );
  app.use("/api", createRateLimitMiddleware(securityConfig.rateLimit));
  app.use(
    express.json({
      limit: "1mb",
      verify(request, _response, body) {
        (request as RawBodyRequest).rawBody = Buffer.from(body);
      },
    }),
  );

  app.get("/health", (_request, response) => {
    if (options.runtimeProvenance) {
      response.setHeader(
        "x-streamos-runtime-service",
        options.runtimeProvenance.service,
      );
      response.setHeader(
        "x-streamos-runtime-commit",
        options.runtimeProvenance.gitCommit,
      );
      response.setHeader(
        "x-streamos-runtime-environment",
        options.runtimeProvenance.environment,
      );
    }

    response.status(200).json({ service: "api-gateway", status: "ok" });
  });

  app.use("/auth", createAuthHandoffRouter());
  app.use(
    "/api/auth",
    createOAuthRouter({
      allowedOrigins: securityConfig.allowedOrigins,
      apiGatewaySecret: securityConfig.apiGatewaySecret,
      fetchImpl: options.oauth?.fetchImpl,
      repository: options.oauth?.repository,
      stateStore: options.oauth?.stateStore,
      now: securityConfig.webhookNow,
    }),
  );
  app.use(
    "/api/callbacks/automation",
    createAutomationCallbackRouter({
      apiGatewaySecret: securityConfig.apiGatewaySecret,
    }),
  );
  app.use(
    "/api/metrics",
    requireAppApiSecret(securityConfig.apiGatewaySecret),
    createMetricsSyncRouter({
      fetchImpl: options.oauth?.fetchImpl,
      now: securityConfig.webhookNow,
    }),
  );
  app.use(
    "/api/content-jobs",
    requireAppApiSecret(securityConfig.apiGatewaySecret),
    createContentJobsRouter({
      fetchImpl: options.oauth?.fetchImpl,
    }),
  );
  app.use(
    "/api/platforms",
    requireAppApiSecret(securityConfig.apiGatewaySecret),
    createPlatformConnectionsRouter({
      fetchImpl: options.oauth?.fetchImpl,
    }),
  );

  app.get(
    "/api/platforms",
    requireAppApiSecret(securityConfig.apiGatewaySecret),
    (_request, response) => {
      response.status(200).json({
        platforms: ["twitch", "youtube", "tiktok", "kick"],
        next: "Gateway OAuth is available at /api/auth/:provider/connect for twitch, youtube, tiktok, and kick.",
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
        const input = clipGenerationRequestSchema.parse(request.body);
        const payload = getClipQueuePayload(input);
        const queueJobId = getClipGenerationJobId(input.stream_id);
        const supabase = createSupabaseRestClient({
          fetchImpl: options.oauth?.fetchImpl,
        });

        await upsertClipContentJob({
          errorMessage: null,
          input,
          queueJobId,
          result: null,
          status: "pending",
          supabase,
        });

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

        if (error instanceof Error && error.message.includes("SUPABASE_URL")) {
          response.status(503).json({
            error: "supabase_not_configured",
            message: "Supabase service credentials are required.",
          });
          return;
        }

        const parsedInput = clipGenerationRequestSchema.safeParse(request.body);

        if (parsedInput.success) {
          await upsertFailedClipContentJob({
            error,
            fetchImpl: options.oauth?.fetchImpl,
            input: parsedInput.data,
          });
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
      try {
        const payload = streamEndedPayloadSchema.parse(request.body);
        await assertKnownStreamForTranscription({
          fetchImpl: options.oauth?.fetchImpl,
          streamId: payload.stream_id,
          userId: payload.user_id,
        });
        const signedHeaders = getSignedWebhookHeaders(request);
        const queueJobId = getTranscriptionTriggerJobId(payload.stream_id);
        const mediaJob: StreamOSJob = {
          id:
            signedHeaders.eventId ??
            `stream-ended:${payload.stream_id}:${securityConfig.webhookNow()}`,
          provider: payload.platform,
          type: "stream.offline",
          enqueuedAt: new Date(securityConfig.webhookNow()).toISOString(),
          endedAt: payload.ended_at,
          internalStreamId: payload.stream_id,
          language: payload.language,
          raw: payload,
          receivedAt: new Date(securityConfig.webhookNow()).toISOString(),
          streamId: undefined,
          userId: payload.user_id,
          vodAssetUrl: payload.vod_asset_url,
        };

        await providerWebhookDispatcher(mediaJob);

        response.status(202).json({
          job_id: queueJobId,
          queue_job_id: queueJobId,
          stream_id: payload.stream_id,
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

        if (error instanceof StreamNotFoundError) {
          response.status(404).json({
            error: "stream_not_found",
            message: error.message,
          });
          return;
        }

        if (error instanceof Error && error.message.includes("SUPABASE_URL")) {
          response.status(503).json({
            error: "supabase_not_configured",
            message: "Supabase service credentials are required.",
          });
          return;
        }

        response.status(502).json({
          error: "transcription_queue_failed",
          message: "Stream-ended event could not be queued for transcription.",
        });
      }
    },
  );

  return app;
}
