import { createHmac } from "node:crypto";
import type { StreamOSJob } from "@streamos/queue";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import type { ClipGenerationQueue } from "./jobs/clipGenerationQueue.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CREATOR_ID = "22222222-2222-4222-8222-222222222222";
const STREAM_ID = "33333333-3333-4333-8333-333333333333";
const API_SECRET = "test-api-gateway-secret-123";
const WEBHOOK_SECRET = "test-stream-webhook-secret-123";
const TWITCH_EVENTSUB_SECRET = "test-twitch-eventsub-secret-123";
const YOUTUBE_WEBHOOK_SECRET = "test-youtube-webhook-secret-123";
const WEBHOOK_NOW = new Date("2026-06-06T10:00:00.000Z");
const SUPABASE_URL = "https://supabase.streamos.test";
const SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

function createClipGenerationQueue(): ClipGenerationQueue {
  return {
    async add(_name, _data, opts) {
      return { id: String(opts.jobId) };
    },
  };
}

function createProviderWebhookDispatcher() {
  return async (_event: StreamOSJob) => undefined;
}

function setSupabaseEnv() {
  const originalSupabaseUrl = process.env.SUPABASE_URL;
  const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SUPABASE_SERVICE_ROLE_KEY;

  return () => {
    if (originalSupabaseUrl === undefined) {
      delete process.env.SUPABASE_URL;
    } else {
      process.env.SUPABASE_URL = originalSupabaseUrl;
    }

    if (originalServiceRoleKey === undefined) {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey;
    }
  };
}

function createSignedWebhookHeaders({
  body,
  eventId = "event-1",
  secret = WEBHOOK_SECRET,
  timestamp = WEBHOOK_NOW.toISOString(),
}: {
  body: string;
  eventId?: string;
  secret?: string;
  timestamp?: string;
}) {
  const signature = `sha256=${createHmac("sha256", secret)
    .update(eventId)
    .update(timestamp)
    .update(body)
    .digest("hex")}`;

  return {
    "x-streamos-event-id": eventId,
    "x-streamos-signature": signature,
    "x-streamos-timestamp": timestamp,
  };
}

describe("api-gateway", () => {
  it("serves health status", async () => {
    const app = createApp();
    const server = app.listen(0);

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected TCP server address.");
      }

      const response = await fetch(`http://127.0.0.1:${address.port}/health`);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ service: "api-gateway", status: "ok" });
    } finally {
      server.close();
    }
  });

  it("requires production app and webhook secrets at startup", () => {
    expect(() =>
      createApp({
        nodeEnv: "production",
        allowedOrigins: ["https://app.streamos.test"],
        twitchEventSubSecret: TWITCH_EVENTSUB_SECRET,
        youtubeWebhookSecret: YOUTUBE_WEBHOOK_SECRET,
        streamEventWebhookSecret: WEBHOOK_SECRET,
        clipGenerationQueue: createClipGenerationQueue(),
      }),
    ).toThrow("API_GATEWAY_SECRET is required in production.");

    expect(() =>
      createApp({
        allowedOrigins: ["https://app.streamos.test"],
        apiGatewaySecret: API_SECRET,
        clipGenerationQueue: createClipGenerationQueue(),
        nodeEnv: "production",
        twitchEventSubSecret: TWITCH_EVENTSUB_SECRET,
        youtubeWebhookSecret: YOUTUBE_WEBHOOK_SECRET,
      }),
    ).toThrow("STREAM_EVENT_WEBHOOK_SECRET is required in production.");

    expect(() =>
      createApp({
        allowedOrigins: ["https://app.streamos.test"],
        apiGatewaySecret: API_SECRET,
        clipGenerationQueue: createClipGenerationQueue(),
        nodeEnv: "production",
        streamEventWebhookSecret: WEBHOOK_SECRET,
        youtubeWebhookSecret: YOUTUBE_WEBHOOK_SECRET,
      }),
    ).toThrow("TWITCH_EVENTSUB_SECRET is required in production.");

    expect(() =>
      createApp({
        allowedOrigins: ["https://app.streamos.test"],
        apiGatewaySecret: API_SECRET,
        clipGenerationQueue: createClipGenerationQueue(),
        nodeEnv: "production",
        streamEventWebhookSecret: WEBHOOK_SECRET,
        twitchEventSubSecret: TWITCH_EVENTSUB_SECRET,
      }),
    ).toThrow("YOUTUBE_WEBHOOK_SECRET is required in production.");

    expect(() =>
      createApp({
        allowedOrigins: ["https://app.streamos.test"],
        apiGatewaySecret: "short",
        clipGenerationQueue: createClipGenerationQueue(),
        nodeEnv: "production",
        streamEventWebhookSecret: WEBHOOK_SECRET,
        twitchEventSubSecret: TWITCH_EVENTSUB_SECRET,
        youtubeWebhookSecret: YOUTUBE_WEBHOOK_SECRET,
      }),
    ).toThrow(
      "API_GATEWAY_SECRET must be at least 24 characters in production.",
    );

    expect(() =>
      createApp({
        apiGatewaySecret: API_SECRET,
        clipGenerationQueue: createClipGenerationQueue(),
        nodeEnv: "production",
        streamEventWebhookSecret: WEBHOOK_SECRET,
        twitchEventSubSecret: TWITCH_EVENTSUB_SECRET,
        youtubeWebhookSecret: YOUTUBE_WEBHOOK_SECRET,
      }),
    ).toThrow(
      "API_GATEWAY_ALLOWED_ORIGINS or NEXT_PUBLIC_APP_URL is required in production.",
    );

    expect(() =>
      createApp({
        allowedOrigins: ["*"],
        apiGatewaySecret: API_SECRET,
        clipGenerationQueue: createClipGenerationQueue(),
        nodeEnv: "production",
        streamEventWebhookSecret: WEBHOOK_SECRET,
        twitchEventSubSecret: TWITCH_EVENTSUB_SECRET,
        youtubeWebhookSecret: YOUTUBE_WEBHOOK_SECRET,
      }),
    ).toThrow("Wildcard CORS origins are not allowed in production.");

    expect(() =>
      createApp({
        allowedOrigins: ["https://app.streamos.test"],
        apiGatewaySecret: API_SECRET,
        clipGenerationQueue: createClipGenerationQueue(),
        nodeEnv: "production",
        rateLimit: { enabled: false },
        streamEventWebhookSecret: WEBHOOK_SECRET,
        twitchEventSubSecret: TWITCH_EVENTSUB_SECRET,
        youtubeWebhookSecret: YOUTUBE_WEBHOOK_SECRET,
      }),
    ).toThrow("API Gateway rate limiting cannot be disabled in production.");

    expect(() =>
      createApp({
        allowedOrigins: ["https://app.streamos.test"],
        apiGatewaySecret: API_SECRET,
        nodeEnv: "production",
        providerWebhookDispatcher: createProviderWebhookDispatcher(),
        streamEventWebhookSecret: WEBHOOK_SECRET,
        twitchEventSubSecret: TWITCH_EVENTSUB_SECRET,
        youtubeWebhookSecret: YOUTUBE_WEBHOOK_SECRET,
      }),
    ).toThrow("REDIS_URL is required in production for API Gateway queues.");
  });

  it("allows configured CORS origins and blocks unknown origins", async () => {
    const app = createApp({
      allowedOrigins: ["https://app.streamos.test"],
    });
    const server = app.listen(0);

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected TCP server address.");
      }

      const allowedResponse = await fetch(
        `http://127.0.0.1:${address.port}/health`,
        {
          headers: { origin: "https://app.streamos.test" },
        },
      );
      const blockedResponse = await fetch(
        `http://127.0.0.1:${address.port}/health`,
        {
          headers: { origin: "https://evil.example" },
        },
      );
      const blockedBody = await blockedResponse.json();

      expect(allowedResponse.status).toBe(200);
      expect(allowedResponse.headers.get("access-control-allow-origin")).toBe(
        "https://app.streamos.test",
      );
      expect(blockedResponse.status).toBe(403);
      expect(blockedBody.error).toBe("origin_not_allowed");
    } finally {
      server.close();
    }
  });

  it("requires the API gateway secret when configured", async () => {
    const app = createApp({
      apiGatewaySecret: "gateway-secret",
    });
    const server = app.listen(0);

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected TCP server address.");
      }

      const rejectedResponse = await fetch(
        `http://127.0.0.1:${address.port}/api/platforms`,
      );
      const acceptedResponse = await fetch(
        `http://127.0.0.1:${address.port}/api/platforms`,
        {
          headers: { authorization: "Bearer gateway-secret" },
        },
      );
      const rejectedBody = await rejectedResponse.json();
      const acceptedBody = await acceptedResponse.json();

      expect(rejectedResponse.status).toBe(401);
      expect(rejectedBody.error).toBe("invalid_api_gateway_secret");
      expect(acceptedResponse.status).toBe(200);
      expect(acceptedBody.platforms).toContain("twitch");
    } finally {
      server.close();
    }
  });

  it("rate limits API routes", async () => {
    const app = createApp({
      apiGatewaySecret: "gateway-secret",
      rateLimit: {
        maxRequests: 1,
        windowMs: 60_000,
      },
    });
    const server = app.listen(0);

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected TCP server address.");
      }

      const url = `http://127.0.0.1:${address.port}/api/platforms`;
      const firstResponse = await fetch(url, {
        headers: { authorization: "Bearer gateway-secret" },
      });
      const secondResponse = await fetch(url, {
        headers: { authorization: "Bearer gateway-secret" },
      });
      const secondBody = await secondResponse.json();

      expect(firstResponse.status).toBe(200);
      expect(secondResponse.status).toBe(429);
      expect(secondResponse.headers.get("retry-after")).toBe("60");
      expect(secondBody.error).toBe("rate_limit_exceeded");
    } finally {
      server.close();
    }
  });

  it("queues clip generation idempotently by stream_id", async () => {
    const jobIds = new Set<string>();
    const contentJobUpserts: unknown[] = [];
    const clipGenerationQueue: ClipGenerationQueue = {
      async add(_name, _data, opts) {
        const jobId = String(opts.jobId);
        jobIds.add(jobId);

        return { id: jobId };
      },
    };
    const originalSupabaseUrl = process.env.SUPABASE_URL;
    const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_URL = "https://supabase.streamos.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

    const fetchImpl: typeof fetch = async (input, init) => {
      const url = input.toString();

      if (
        url.startsWith("https://supabase.streamos.test/rest/v1/content_jobs")
      ) {
        contentJobUpserts.push(JSON.parse(init?.body?.toString() ?? "{}"));

        return new Response(null, { status: 201 });
      }

      return new Response("Unexpected URL", { status: 500 });
    };
    const app = createApp({
      clipGenerationQueue,
      oauth: { fetchImpl },
    });
    const server = app.listen(0);

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected TCP server address.");
      }

      const body = JSON.stringify({
        creator_id: CREATOR_ID,
        requested_by: USER_ID,
        source_platform: "twitch",
        source_url: "https://www.twitch.tv/videos/123",
        stream_id: STREAM_ID,
        transcript: "A clutch moment with a strong opening hook.",
      });
      const firstResponse = await fetch(
        `http://127.0.0.1:${address.port}/api/clips/generate`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
        },
      );
      const secondResponse = await fetch(
        `http://127.0.0.1:${address.port}/api/clips/generate`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
        },
      );

      const firstBody = await firstResponse.json();
      const secondBody = await secondResponse.json();

      expect(firstResponse.status).toBe(202);
      expect(secondResponse.status).toBe(202);
      expect(firstBody.job_id).toBe(secondBody.job_id);
      expect(jobIds.size).toBe(1);
      expect(contentJobUpserts).toHaveLength(2);
    } finally {
      server.close();
      if (originalSupabaseUrl === undefined) {
        delete process.env.SUPABASE_URL;
      } else {
        process.env.SUPABASE_URL = originalSupabaseUrl;
      }

      if (originalServiceRoleKey === undefined) {
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      } else {
        process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey;
      }
    }
  });

  it("queues transcription trigger after stream end idempotently by stream_id", async () => {
    const restoreEnv = setSupabaseEnv();
    const jobIds = new Set<string>();
    const dispatchedEvents: StreamOSJob[] = [];
    const app = createApp({
      oauth: {
        fetchImpl: async (input) => {
          const url = input.toString();

          if (url.startsWith(`${SUPABASE_URL}/rest/v1/streams`)) {
            return new Response(JSON.stringify([{ id: STREAM_ID }]), {
              status: 200,
            });
          }

          return new Response("Unexpected URL", { status: 500 });
        },
      },
      providerWebhookDispatcher: async (event) => {
        dispatchedEvents.push(event);
        if (event.internalStreamId) {
          jobIds.add(event.internalStreamId);
        }
      },
      streamEventWebhookSecret: WEBHOOK_SECRET,
      webhookNow: () => WEBHOOK_NOW.getTime(),
    });
    const server = app.listen(0);

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected TCP server address.");
      }

      const body = JSON.stringify({
        user_id: USER_ID,
        stream_id: STREAM_ID,
        platform: "twitch",
        creator_id: CREATOR_ID,
        vod_asset_url: "https://cdn.example.com/vods/stream-123.mp4",
        ended_at: "2026-06-01T10:00:00.000Z",
      });
      const firstResponse = await fetch(
        `http://127.0.0.1:${address.port}/api/webhooks/streams/ended`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...createSignedWebhookHeaders({
              body,
              eventId: "stream-ended-1",
            }),
          },
          body,
        },
      );
      const secondResponse = await fetch(
        `http://127.0.0.1:${address.port}/api/webhooks/streams/ended`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...createSignedWebhookHeaders({
              body,
              eventId: "stream-ended-2",
            }),
          },
          body,
        },
      );

      const firstBody = await firstResponse.json();
      const secondBody = await secondResponse.json();

      expect(firstResponse.status).toBe(202);
      expect(secondResponse.status).toBe(202);
      expect(firstBody.job_id).toBe(secondBody.job_id);
      expect(firstBody.queue_job_id).toBe(firstBody.job_id);
      expect(firstBody.stream_id).toBe(STREAM_ID);
      expect(dispatchedEvents).toHaveLength(2);
      expect(dispatchedEvents[0]).toMatchObject({
        endedAt: "2026-06-01T10:00:00.000Z",
        internalStreamId: STREAM_ID,
        language: "auto",
        provider: "twitch",
        type: "stream.offline",
        userId: USER_ID,
        vodAssetUrl: "https://cdn.example.com/vods/stream-123.mp4",
      });
      expect(jobIds.size).toBe(1);
    } finally {
      restoreEnv();
      server.close();
    }
  });

  it("rejects stream-ended webhooks when the internal stream_id does not exist", async () => {
    const restoreEnv = setSupabaseEnv();
    let dispatchCalls = 0;
    const app = createApp({
      oauth: {
        fetchImpl: async (input) => {
          const url = input.toString();

          if (url.startsWith(`${SUPABASE_URL}/rest/v1/streams`)) {
            return new Response(JSON.stringify([]), {
              status: 200,
            });
          }

          return new Response("Unexpected URL", { status: 500 });
        },
      },
      providerWebhookDispatcher: async () => {
        dispatchCalls += 1;
      },
      streamEventWebhookSecret: WEBHOOK_SECRET,
      webhookNow: () => WEBHOOK_NOW.getTime(),
    });
    const server = app.listen(0);

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected TCP server address.");
      }

      const body = JSON.stringify({
        user_id: USER_ID,
        stream_id: STREAM_ID,
        platform: "twitch",
        creator_id: CREATOR_ID,
        vod_asset_url: "https://cdn.example.com/vods/stream-123.mp4",
      });
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/webhooks/streams/ended`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...createSignedWebhookHeaders({
              body,
              eventId: "stream-ended-missing",
            }),
          },
          body,
        },
      );
      const responseBody = await response.json();

      expect(response.status).toBe(404);
      expect(responseBody.error).toBe("stream_not_found");
      expect(dispatchCalls).toBe(0);
    } finally {
      restoreEnv();
      server.close();
    }
  });

  it("rejects stream-ended webhooks with an invalid signature", async () => {
    const app = createApp({
      providerWebhookDispatcher: async () => {
        throw new Error("Queue should not be called.");
      },
      streamEventWebhookSecret: WEBHOOK_SECRET,
      webhookNow: () => WEBHOOK_NOW.getTime(),
    });
    const server = app.listen(0);

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected TCP server address.");
      }

      const bodyPayload = JSON.stringify({
        stream_id: "stream-123",
        platform: "twitch",
      });
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/webhooks/streams/ended`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...createSignedWebhookHeaders({
              body: bodyPayload,
              secret: "wrong-stream-webhook-secret",
            }),
          },
          body: bodyPayload,
        },
      );
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error).toBe("invalid_webhook_signature");
    } finally {
      server.close();
    }
  });

  it("rejects stream-ended webhooks outside the replay window", async () => {
    const app = createApp({
      providerWebhookDispatcher: createProviderWebhookDispatcher(),
      streamEventWebhookSecret: WEBHOOK_SECRET,
      webhookNow: () => WEBHOOK_NOW.getTime(),
    });
    const server = app.listen(0);

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected TCP server address.");
      }

      const bodyPayload = JSON.stringify({
        stream_id: STREAM_ID,
        platform: "twitch",
      });
      const staleTimestamp = new Date(
        WEBHOOK_NOW.getTime() - 11 * 60 * 1000,
      ).toISOString();
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/webhooks/streams/ended`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...createSignedWebhookHeaders({
              body: bodyPayload,
              timestamp: staleTimestamp,
            }),
          },
          body: bodyPayload,
        },
      );
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error).toBe("stale_webhook_timestamp");
    } finally {
      server.close();
    }
  });
});
