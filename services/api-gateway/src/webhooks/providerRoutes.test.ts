import { createHmac } from "node:crypto";
import express from "express";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../app.js";
import { InMemoryDeduplicationClient } from "../lib/deduplication.js";
import { WEBHOOK_CHALLENGE_MAX_LENGTH } from "../lib/webhook-challenge.js";
import { createTwitchWebhookRouter } from "../routes/webhooks/twitch.js";
import { createYouTubeWebhookRouter } from "../routes/webhooks/youtube.js";
import type { ProviderWebhookEvent } from "./providerEvents.js";
import { createProviderWebhookRouter } from "./providerRoutes.js";

const NOW = new Date("2026-06-06T10:00:00.000Z");
const STREAM_EVENT_WEBHOOK_SECRET = "test-stream-event-webhook-secret-123";
const TWITCH_EVENTSUB_SECRET = "test-twitch-eventsub-secret-123";
const YOUTUBE_WEBHOOK_SECRET = "test-youtube-webhook-secret-123";
const ALLOWED_YOUTUBE_TOPIC =
  "https://www.youtube.com/feeds/videos.xml?channel_id=youtube-channel-1";

type ProviderWebhookRouterOptions = Parameters<
  typeof createProviderWebhookRouter
>[0];
type YouTubeWebSubChallengeTracker = NonNullable<
  ProviderWebhookRouterOptions["youtubeWebSubChallengeTracker"]
>;

function createTwitchEventSubHeaders({
  body,
  messageId = "eventsub-message-1",
  messageType = "notification",
  secret = TWITCH_EVENTSUB_SECRET,
  timestamp = NOW.toISOString(),
}: {
  body: string;
  messageId?: string;
  messageType?: string;
  secret?: string;
  timestamp?: string;
}) {
  const signature = `sha256=${createHmac("sha256", secret)
    .update(messageId)
    .update(timestamp)
    .update(body)
    .digest("hex")}`;

  return {
    "twitch-eventsub-message-id": messageId,
    "twitch-eventsub-message-signature": signature,
    "twitch-eventsub-message-timestamp": timestamp,
    "twitch-eventsub-message-type": messageType,
  };
}

function createWebSubSignature(body: string, secret = YOUTUBE_WEBHOOK_SECRET) {
  return `sha1=${createHmac("sha1", secret).update(body).digest("hex")}`;
}

async function withServer<T>(
  events: ProviderWebhookEvent[],
  run: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const app = createApp({
    providerWebhookDispatcher: async (event) => {
      events.push(event);
    },
    twitchEventSubSecret: TWITCH_EVENTSUB_SECRET,
    webhookNow: () => NOW.getTime(),
    youtubeWebhookSecret: YOUTUBE_WEBHOOK_SECRET,
    youtubeWebSubVerifyToken: "youtube-verify-token",
  });
  const server = app.listen(0);

  try {
    const address = server.address();

    if (!address || typeof address === "string") {
      throw new Error("Expected TCP server address.");
    }

    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
  }
}

async function withProviderWebhookRouter<T>(
  options: Partial<ProviderWebhookRouterOptions>,
  run: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const app = express();
  app.set("trust proxy", 1);
  app.use(
    "/api/webhooks",
    createProviderWebhookRouter({
      now: () => NOW.getTime(),
      twitchEventSubSecret: TWITCH_EVENTSUB_SECRET,
      youtubeWebSubSecret: YOUTUBE_WEBHOOK_SECRET,
      ...options,
    }),
  );
  const server = app.listen(0);

  try {
    const address = server.address();

    if (!address || typeof address === "string") {
      throw new Error("Expected TCP server address.");
    }

    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
  }
}

describe("provider webhook routes", () => {
  it("serves the production Twitch webhook path with STREAM_EVENT_WEBHOOK_SECRET", async () => {
    const events: ProviderWebhookEvent[] = [];
    const app = createApp({
      providerWebhookDispatcher: async (event) => {
        events.push(event);
      },
      streamEventWebhookSecret: STREAM_EVENT_WEBHOOK_SECRET,
      twitchEventSubSecret: TWITCH_EVENTSUB_SECRET,
      webhookNow: () => NOW.getTime(),
      youtubeWebhookSecret: YOUTUBE_WEBHOOK_SECRET,
    });
    const server = app.listen(0);

    try {
      const address = server.address();

      if (!address || typeof address === "string") {
        throw new Error("Expected TCP server address.");
      }

      const body = JSON.stringify({
        challenge: "<top-level-twitch-challenge>",
      });
      const response = await fetch(
        `http://127.0.0.1:${address.port}/webhooks/twitch`,
        {
          body,
          headers: {
            "content-type": "application/json",
            ...createTwitchEventSubHeaders({
              body,
              messageType: "webhook_callback_verification",
              secret: STREAM_EVENT_WEBHOOK_SECRET,
            }),
          },
          method: "POST",
        },
      );
      const text = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/plain");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(text).toBe("<top-level-twitch-challenge>");
      expect(events).toEqual([]);
    } finally {
      server.close();
    }
  });

  it("serves the production YouTube verification path and rejects non-YouTube topics", async () => {
    const app = createApp({
      streamEventWebhookSecret: STREAM_EVENT_WEBHOOK_SECRET,
      twitchEventSubSecret: TWITCH_EVENTSUB_SECRET,
      webhookNow: () => NOW.getTime(),
      youtubeWebhookSecret: YOUTUBE_WEBHOOK_SECRET,
    });
    const server = app.listen(0);

    try {
      const address = server.address();

      if (!address || typeof address === "string") {
        throw new Error("Expected TCP server address.");
      }

      const validUrl = new URL(
        `http://127.0.0.1:${address.port}/webhooks/youtube`,
      );
      validUrl.searchParams.set("hub.mode", "subscribe");
      validUrl.searchParams.set(
        "hub.topic",
        "https://www.youtube.com/feeds/videos.xml?channel_id=youtube-channel-1",
      );
      validUrl.searchParams.set("hub.challenge", "<youtube-challenge-token>");

      const invalidUrl = new URL(
        `http://127.0.0.1:${address.port}/webhooks/youtube`,
      );
      invalidUrl.searchParams.set("hub.mode", "subscribe");
      invalidUrl.searchParams.set(
        "hub.topic",
        "https://evil.example/feeds/videos.xml?channel_id=youtube-channel-1",
      );
      invalidUrl.searchParams.set("hub.challenge", "bad-topic");

      const invalidChallengeUrl = new URL(
        `http://127.0.0.1:${address.port}/webhooks/youtube`,
      );
      invalidChallengeUrl.searchParams.set("hub.mode", "subscribe");
      invalidChallengeUrl.searchParams.set(
        "hub.topic",
        "https://www.youtube.com/feeds/videos.xml?channel_id=youtube-channel-1",
      );
      invalidChallengeUrl.searchParams.set(
        "hub.challenge",
        "x".repeat(WEBHOOK_CHALLENGE_MAX_LENGTH + 1),
      );

      const validResponse = await fetch(validUrl);
      const invalidResponse = await fetch(invalidUrl);
      const invalidChallengeResponse = await fetch(invalidChallengeUrl);
      const invalidChallengePayload = await invalidChallengeResponse.json();

      expect(validResponse.status).toBe(200);
      expect(validResponse.headers.get("content-type")).toContain("text/plain");
      expect(validResponse.headers.get("x-content-type-options")).toBe(
        "nosniff",
      );
      expect(await validResponse.text()).toBe("<youtube-challenge-token>");
      expect(invalidResponse.status).toBe(400);
      expect(invalidChallengeResponse.status).toBe(400);
      expect(JSON.stringify(invalidChallengePayload)).not.toContain(
        "x".repeat(32),
      );
    } finally {
      server.close();
    }
  });

  it("responds to Twitch EventSub verification challenges as plain text", async () => {
    const events: ProviderWebhookEvent[] = [];

    await withServer(events, async (baseUrl) => {
      const body = JSON.stringify({ challenge: "<twitch-challenge-token>" });
      const response = await fetch(`${baseUrl}/api/webhooks/twitch/eventsub`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...createTwitchEventSubHeaders({
            body,
            messageType: "webhook_callback_verification",
          }),
        },
        body,
      });
      const text = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/plain");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(text).toBe("<twitch-challenge-token>");
      expect(events).toEqual([]);
    });
  });

  it("rejects invalid Twitch EventSub verification challenges without reflecting them", async () => {
    const events: ProviderWebhookEvent[] = [];

    await withServer(events, async (baseUrl) => {
      const body = JSON.stringify({
        challenge: "x".repeat(WEBHOOK_CHALLENGE_MAX_LENGTH + 1),
      });

      const response = await fetch(`${baseUrl}/api/webhooks/twitch/eventsub`, {
        body,
        headers: {
          "content-type": "application/json",
          ...createTwitchEventSubHeaders({
            body,
            messageType: "webhook_callback_verification",
          }),
        },
        method: "POST",
      });
      const payload = await response.json();

      expect(response.status).toBe(400);
      expect(payload.error).toBe("invalid_twitch_eventsub_challenge");
      expect(JSON.stringify(payload)).not.toContain("x".repeat(32));
      expect(events).toEqual([]);
    });
  });

  it("rate limits Twitch EventSub requests at the provider webhook boundary", async () => {
    const events: ProviderWebhookEvent[] = [];
    const app = express();
    app.set("trust proxy", 1);
    app.use(
      "/api/webhooks",
      createProviderWebhookRouter({
        dispatcher: async (event) => {
          events.push(event);
        },
        now: () => NOW.getTime(),
        twitchEventSubRateLimit: {
          maxRequests: 1,
          windowMs: 60_000,
        },
        twitchEventSubSecret: TWITCH_EVENTSUB_SECRET,
        youtubeWebSubSecret: YOUTUBE_WEBHOOK_SECRET,
      }),
    );
    const server = app.listen(0);

    try {
      const address = server.address();

      if (!address || typeof address === "string") {
        throw new Error("Expected TCP server address.");
      }

      const body = JSON.stringify({ challenge: "twitch-challenge-token" });
      const url = `http://127.0.0.1:${address.port}/api/webhooks/twitch/eventsub`;
      const headers = {
        "content-type": "application/json",
        ...createTwitchEventSubHeaders({
          body,
          messageType: "webhook_callback_verification",
        }),
      };

      const acceptedResponse = await fetch(url, {
        body,
        headers,
        method: "POST",
      });
      const limitedResponse = await fetch(url, {
        body,
        headers,
        method: "POST",
      });
      const limitedPayload = await limitedResponse.json();
      const serializedLimitPayload = JSON.stringify(limitedPayload);

      expect(acceptedResponse.status).toBe(200);
      expect(await acceptedResponse.text()).toBe("twitch-challenge-token");
      expect(limitedResponse.status).toBe(429);
      expect(limitedPayload).toEqual({
        error: "rate_limit_exceeded",
        message: "Too many Twitch EventSub webhook requests.",
      });
      expect(serializedLimitPayload).not.toContain(TWITCH_EVENTSUB_SECRET);
      expect(serializedLimitPayload).not.toContain("twitch-challenge-token");
      expect(events).toEqual([]);
    } finally {
      server.close();
    }
  });

  it("dispatches signed Twitch EventSub notifications", async () => {
    const events: ProviderWebhookEvent[] = [];

    await withServer(events, async (baseUrl) => {
      const body = JSON.stringify({
        subscription: { type: "stream.online" },
        event: {
          id: "twitch-stream-123",
          broadcaster_user_id: "twitch-channel-1",
          broadcaster_user_login: "streamer",
          type: "live",
          started_at: "2026-06-06T09:59:00Z",
        },
      });
      const response = await fetch(`${baseUrl}/api/webhooks/twitch/eventsub`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...createTwitchEventSubHeaders({ body }),
        },
        body,
      });
      const payload = await response.json();

      expect(response.status).toBe(202);
      expect(payload).toMatchObject({
        dispatched: true,
        event_id: "eventsub-message-1",
        event_type: "stream.online",
        received: true,
      });
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        id: "eventsub-message-1",
        provider: "twitch",
        type: "stream.online",
        channelId: "twitch-channel-1",
        streamId: "twitch-stream-123",
        startedAt: "2026-06-06T09:59:00Z",
      });
    });
  });

  it("rejects Twitch EventSub notifications with invalid signatures", async () => {
    const events: ProviderWebhookEvent[] = [];

    await withServer(events, async (baseUrl) => {
      const body = JSON.stringify({
        subscription: { type: "stream.online" },
        event: {
          id: "twitch-stream-123",
          broadcaster_user_id: "twitch-channel-1",
        },
      });
      const response = await fetch(`${baseUrl}/api/webhooks/twitch/eventsub`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...createTwitchEventSubHeaders({
            body,
            secret: "wrong-twitch-eventsub-secret",
          }),
        },
        body,
      });
      const payload = await response.json();

      expect(response.status).toBe(401);
      expect(payload.error).toBe("invalid_twitch_eventsub_signature");
      expect(events).toEqual([]);
    });
  });

  it("responds to YouTube WebSub hub challenges as plain text", async () => {
    const events: ProviderWebhookEvent[] = [];

    await withServer(events, async (baseUrl) => {
      const url = new URL(`${baseUrl}/api/webhooks/youtube/websub`);
      url.searchParams.set("hub.mode", "subscribe");
      url.searchParams.set("hub.topic", ALLOWED_YOUTUBE_TOPIC);
      url.searchParams.set("hub.challenge", "<youtube-challenge-token>");
      url.searchParams.set("hub.verify_token", "youtube-verify-token");

      const response = await fetch(url);
      const text = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/plain");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(text).toBe("<youtube-challenge-token>");
      expect(events).toEqual([]);
    });
  });

  it("rejects invalid YouTube WebSub hub challenges without reflecting them", async () => {
    const events: ProviderWebhookEvent[] = [];

    await withServer(events, async (baseUrl) => {
      const url = new URL(`${baseUrl}/api/webhooks/youtube/websub`);
      url.searchParams.set("hub.mode", "subscribe");
      url.searchParams.set("hub.topic", ALLOWED_YOUTUBE_TOPIC);
      url.searchParams.set("hub.challenge", "bad\r\nchallenge");
      url.searchParams.set("hub.verify_token", "youtube-verify-token");

      const response = await fetch(url);
      const payload = await response.json();

      expect(response.status).toBe(400);
      expect(payload.error).toBe("invalid_youtube_websub_challenge");
      expect(JSON.stringify(payload)).not.toContain("bad");
      expect(events).toEqual([]);
    });
  });

  it("rejects YouTube WebSub hub challenges for non-allowlisted topics without tracking", async () => {
    const tracker = vi.fn<YouTubeWebSubChallengeTracker>(async () => undefined);

    await withProviderWebhookRouter(
      {
        youtubeWebSubChallengeTracker: tracker,
        youtubeWebSubVerifyToken: "youtube-verify-token",
      },
      async (baseUrl) => {
        const url = new URL(`${baseUrl}/api/webhooks/youtube/websub`);
        url.searchParams.set("hub.mode", "subscribe");
        url.searchParams.set(
          "hub.topic",
          "https://www.example.com/feeds/videos.xml?channel_id=youtube-channel-1",
        );
        url.searchParams.set("hub.challenge", "<youtube-challenge-token>");
        url.searchParams.set("hub.verify_token", "youtube-verify-token");

        const response = await fetch(url);
        const payload = await response.json();
        const serializedPayload = JSON.stringify(payload);

        expect(response.status).toBe(400);
        expect(payload.error).toBe("invalid_youtube_websub_topic");
        expect(serializedPayload).not.toContain("<youtube-challenge-token>");
        expect(serializedPayload).not.toContain("example.com");
        expect(tracker).not.toHaveBeenCalled();
      },
    );
  });

  it("tracks YouTube WebSub hub challenges only after an allowlisted topic passes validation", async () => {
    const tracker = vi.fn<YouTubeWebSubChallengeTracker>(async () => undefined);

    await withProviderWebhookRouter(
      {
        youtubeWebSubChallengeTracker: tracker,
        youtubeWebSubVerifyToken: "youtube-verify-token",
      },
      async (baseUrl) => {
        const url = new URL(`${baseUrl}/api/webhooks/youtube/websub`);
        url.searchParams.set("hub.mode", "subscribe");
        url.searchParams.set("hub.topic", ALLOWED_YOUTUBE_TOPIC);
        url.searchParams.set("hub.challenge", "<youtube-challenge-token>");
        url.searchParams.set("hub.verify_token", "youtube-verify-token");
        url.searchParams.set("hub.lease_seconds", "1234");

        const response = await fetch(url);
        const text = await response.text();

        expect(response.status).toBe(200);
        expect(text).toBe("<youtube-challenge-token>");
        expect(tracker).toHaveBeenCalledTimes(1);
        expect(tracker).toHaveBeenCalledWith({
          leaseSeconds: 1234,
          mode: "subscribe",
          now: expect.any(Function),
          topic: ALLOWED_YOUTUBE_TOPIC,
        });
      },
    );
  });

  it("rejects YouTube WebSub hub challenges with verify-token mismatch without tracking", async () => {
    const tracker = vi.fn<YouTubeWebSubChallengeTracker>(async () => undefined);

    await withProviderWebhookRouter(
      {
        youtubeWebSubChallengeTracker: tracker,
        youtubeWebSubVerifyToken: "youtube-verify-token",
      },
      async (baseUrl) => {
        const url = new URL(`${baseUrl}/api/webhooks/youtube/websub`);
        url.searchParams.set("hub.mode", "subscribe");
        url.searchParams.set("hub.topic", ALLOWED_YOUTUBE_TOPIC);
        url.searchParams.set("hub.challenge", "<youtube-challenge-token>");
        url.searchParams.set("hub.verify_token", "wrong-verify-token");

        const response = await fetch(url);
        const payload = await response.json();
        const serializedPayload = JSON.stringify(payload);

        expect(response.status).toBe(403);
        expect(payload.error).toBe("invalid_youtube_websub_verify_token");
        expect(serializedPayload).not.toContain("<youtube-challenge-token>");
        expect(serializedPayload).not.toContain("wrong-verify-token");
        expect(tracker).not.toHaveBeenCalled();
      },
    );
  });

  it("rate limits YouTube WebSub challenge requests at the provider webhook boundary", async () => {
    const events: ProviderWebhookEvent[] = [];
    const app = express();
    app.set("trust proxy", 1);
    app.use(
      "/api/webhooks",
      createProviderWebhookRouter({
        dispatcher: async (event) => {
          events.push(event);
        },
        now: () => NOW.getTime(),
        twitchEventSubSecret: TWITCH_EVENTSUB_SECRET,
        youtubeWebSubChallengeRateLimit: {
          maxRequests: 1,
          windowMs: 60_000,
        },
        youtubeWebSubSecret: YOUTUBE_WEBHOOK_SECRET,
        youtubeWebSubVerifyToken: "youtube-verify-token",
      }),
    );
    const server = app.listen(0);

    try {
      const address = server.address();

      if (!address || typeof address === "string") {
        throw new Error("Expected TCP server address.");
      }

      const url = new URL(
        `http://127.0.0.1:${address.port}/api/webhooks/youtube/websub`,
      );
      url.searchParams.set("hub.mode", "subscribe");
      url.searchParams.set("hub.topic", ALLOWED_YOUTUBE_TOPIC);
      url.searchParams.set("hub.challenge", "youtube-challenge-token");
      url.searchParams.set("hub.verify_token", "youtube-verify-token");

      const acceptedResponse = await fetch(url);
      const limitedResponse = await fetch(url);
      const limitedPayload = await limitedResponse.json();
      const serializedLimitPayload = JSON.stringify(limitedPayload);

      expect(acceptedResponse.status).toBe(200);
      expect(await acceptedResponse.text()).toBe("youtube-challenge-token");
      expect(limitedResponse.status).toBe(429);
      expect(limitedPayload).toEqual({
        error: "rate_limit_exceeded",
        message: "Too many YouTube WebSub challenge requests.",
      });
      expect(serializedLimitPayload).not.toContain(YOUTUBE_WEBHOOK_SECRET);
      expect(serializedLimitPayload).not.toContain("youtube-challenge-token");
      expect(events).toEqual([]);
    } finally {
      server.close();
    }
  });

  it("dispatches signed YouTube WebSub Atom feed notifications", async () => {
    const events: ProviderWebhookEvent[] = [];

    await withServer(events, async (baseUrl) => {
      const body = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>yt:video:youtube-video-1</id>
    <yt:videoId>youtube-video-1</yt:videoId>
    <yt:channelId>youtube-channel-1</yt:channelId>
    <title>First Upload</title>
    <published>2026-06-06T09:55:00+00:00</published>
    <updated>2026-06-06T09:56:00+00:00</updated>
  </entry>
</feed>`;
      const response = await fetch(`${baseUrl}/api/webhooks/youtube/websub`, {
        method: "POST",
        headers: {
          "content-type": "application/atom+xml",
          "x-hub-signature": createWebSubSignature(body),
        },
        body,
      });
      const payload = await response.json();

      expect(response.status).toBe(202);
      expect(payload).toEqual({
        dispatched: true,
        entries: 1,
        received: true,
      });
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        provider: "youtube",
        type: "video.published",
        channelId: "youtube-channel-1",
        videoId: "youtube-video-1",
        title: "First Upload",
        publishedAt: "2026-06-06T09:55:00+00:00",
        updatedAt: "2026-06-06T09:56:00+00:00",
      });
    });
  });

  it("rate limits signed YouTube WebSub Atom feed notifications at the route boundary", async () => {
    const events: ProviderWebhookEvent[] = [];
    const app = express();
    app.set("trust proxy", 1);
    app.use(
      "/api/webhooks",
      createProviderWebhookRouter({
        dispatcher: async (event) => {
          events.push(event);
        },
        now: () => NOW.getTime(),
        twitchEventSubSecret: TWITCH_EVENTSUB_SECRET,
        youtubeWebSubPostRateLimit: {
          maxRequests: 1,
          windowMs: 60_000,
        },
        youtubeWebSubSecret: YOUTUBE_WEBHOOK_SECRET,
        youtubeWebSubVerifyToken: "youtube-verify-token",
      }),
    );
    const server = app.listen(0);

    try {
      const address = server.address();

      if (!address || typeof address === "string") {
        throw new Error("Expected TCP server address.");
      }

      const body = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>yt:video:youtube-video-1</id>
    <yt:videoId>youtube-video-1</yt:videoId>
    <yt:channelId>youtube-channel-1</yt:channelId>
    <title>First Upload</title>
    <published>2026-06-06T09:55:00+00:00</published>
    <updated>2026-06-06T09:56:00+00:00</updated>
  </entry>
</feed>`;
      const url = `http://127.0.0.1:${address.port}/api/webhooks/youtube/websub`;
      const headers = {
        "content-type": "application/atom+xml",
        "x-hub-signature": createWebSubSignature(body),
      };

      const acceptedResponse = await fetch(url, {
        body,
        headers,
        method: "POST",
      });
      const limitedResponse = await fetch(url, {
        body,
        headers,
        method: "POST",
      });
      const acceptedPayload = await acceptedResponse.json();
      const limitedPayload = await limitedResponse.json();
      const serializedLimitPayload = JSON.stringify(limitedPayload);

      expect(acceptedResponse.status).toBe(202);
      expect(acceptedPayload).toEqual({
        dispatched: true,
        entries: 1,
        received: true,
      });
      expect(limitedResponse.status).toBe(429);
      expect(limitedResponse.headers.get("retry-after")).toBe("60");
      expect(limitedPayload).toEqual({
        error: "rate_limit_exceeded",
        message: "Too many YouTube WebSub webhook requests.",
      });
      expect(serializedLimitPayload).not.toContain(YOUTUBE_WEBHOOK_SECRET);
      expect(serializedLimitPayload).not.toContain("youtube-video-1");
      expect(events).toHaveLength(1);
    } finally {
      server.close();
    }
  });

  it("rejects YouTube WebSub notifications with invalid signatures", async () => {
    const events: ProviderWebhookEvent[] = [];

    await withServer(events, async (baseUrl) => {
      const body = "<feed><entry /></feed>";
      const response = await fetch(`${baseUrl}/api/webhooks/youtube/websub`, {
        method: "POST",
        headers: {
          "content-type": "application/atom+xml",
          "x-hub-signature": createWebSubSignature(
            body,
            "wrong-youtube-websub-secret",
          ),
        },
        body,
      });
      const payload = await response.json();

      expect(response.status).toBe(401);
      expect(payload.error).toBe("invalid_youtube_websub_signature");
      expect(events).toEqual([]);
    });
  });

  it("rate limits the legacy Twitch webhook route before repeated signature work", async () => {
    const events: ProviderWebhookEvent[] = [];
    const app = express();
    app.set("trust proxy", 1);
    app.use(express.raw({ limit: "1mb", type: "*/*" }));
    app.use(
      "/webhooks/twitch",
      createTwitchWebhookRouter({
        deduplicationClient: new InMemoryDeduplicationClient(),
        dispatcher: async (event) => {
          events.push(event);
        },
        now: () => NOW.getTime(),
        rateLimit: {
          maxRequests: 1,
          windowMs: 60_000,
        },
        secret: TWITCH_EVENTSUB_SECRET,
      }),
    );
    const server = app.listen(0);

    try {
      const address = server.address();

      if (!address || typeof address === "string") {
        throw new Error("Expected TCP server address.");
      }

      const body = JSON.stringify({ challenge: "legacy-twitch-challenge" });
      const url = `http://127.0.0.1:${address.port}/webhooks/twitch`;
      const headers = {
        "content-type": "application/json",
        ...createTwitchEventSubHeaders({
          body,
          messageType: "webhook_callback_verification",
        }),
      };

      const acceptedResponse = await fetch(url, {
        body,
        headers,
        method: "POST",
      });
      const limitedResponse = await fetch(url, {
        body,
        headers,
        method: "POST",
      });
      const limitedPayload = await limitedResponse.json();

      expect(acceptedResponse.status).toBe(200);
      expect(await acceptedResponse.text()).toBe("legacy-twitch-challenge");
      expect(limitedResponse.status).toBe(429);
      expect(limitedPayload.error).toBe("rate_limit_exceeded");
      expect(JSON.stringify(limitedPayload)).not.toContain(
        TWITCH_EVENTSUB_SECRET,
      );
      expect(events).toEqual([]);
    } finally {
      server.close();
    }
  });

  it("rate limits the legacy YouTube webhook route before repeated signature work", async () => {
    const events: ProviderWebhookEvent[] = [];
    const app = express();
    app.set("trust proxy", 1);
    app.use(express.raw({ limit: "1mb", type: "*/*" }));
    app.use(
      "/webhooks/youtube",
      createYouTubeWebhookRouter({
        dispatcher: async (event) => {
          events.push(event);
        },
        now: () => NOW.getTime(),
        rateLimit: {
          maxRequests: 1,
          windowMs: 60_000,
        },
        secret: YOUTUBE_WEBHOOK_SECRET,
      }),
    );
    const server = app.listen(0);

    try {
      const address = server.address();

      if (!address || typeof address === "string") {
        throw new Error("Expected TCP server address.");
      }

      const body = "<feed><entry /></feed>";
      const url = `http://127.0.0.1:${address.port}/webhooks/youtube`;
      const headers = {
        "content-type": "application/atom+xml",
        "x-hub-signature": createWebSubSignature(body),
      };

      const acceptedResponse = await fetch(url, {
        body,
        headers,
        method: "POST",
      });
      const limitedResponse = await fetch(url, {
        body,
        headers,
        method: "POST",
      });
      const acceptedPayload = await acceptedResponse.json();
      const limitedPayload = await limitedResponse.json();

      expect(acceptedResponse.status).toBe(200);
      expect(acceptedPayload).toMatchObject({
        entries: 0,
        queued: 0,
        received: true,
      });
      expect(limitedResponse.status).toBe(429);
      expect(limitedPayload.error).toBe("rate_limit_exceeded");
      expect(JSON.stringify(limitedPayload)).not.toContain(
        YOUTUBE_WEBHOOK_SECRET,
      );
      expect(events).toEqual([]);
    } finally {
      server.close();
    }
  });
});
