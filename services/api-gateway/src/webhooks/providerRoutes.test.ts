import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import type { ProviderWebhookEvent } from "./providerEvents.js";

const NOW = new Date("2026-06-06T10:00:00.000Z");
const STREAM_EVENT_WEBHOOK_SECRET = "test-stream-event-webhook-secret-123";
const YOUTUBE_WEBSUB_SECRET = "test-youtube-websub-secret-123";

function createTwitchEventSubHeaders({
  body,
  messageId = "eventsub-message-1",
  messageType = "notification",
  secret = STREAM_EVENT_WEBHOOK_SECRET,
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

function createWebSubSignature(body: string, secret = YOUTUBE_WEBSUB_SECRET) {
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
    streamEventWebhookSecret: STREAM_EVENT_WEBHOOK_SECRET,
    webhookNow: () => NOW.getTime(),
    youtubeWebSubSecret: YOUTUBE_WEBSUB_SECRET,
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

describe("provider webhook routes", () => {
  it("serves the production Twitch webhook path with STREAM_EVENT_WEBHOOK_SECRET", async () => {
    const events: ProviderWebhookEvent[] = [];
    const app = createApp({
      providerWebhookDispatcher: async (event) => {
        events.push(event);
      },
      streamEventWebhookSecret: STREAM_EVENT_WEBHOOK_SECRET,
      webhookNow: () => NOW.getTime(),
      youtubeWebSubSecret: YOUTUBE_WEBSUB_SECRET,
    });
    const server = app.listen(0);

    try {
      const address = server.address();

      if (!address || typeof address === "string") {
        throw new Error("Expected TCP server address.");
      }

      const body = JSON.stringify({ challenge: "top-level-twitch-challenge" });
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
      expect(text).toBe("top-level-twitch-challenge");
      expect(events).toEqual([]);
    } finally {
      server.close();
    }
  });

  it("serves the production YouTube verification path and rejects non-YouTube topics", async () => {
    const app = createApp({
      streamEventWebhookSecret: STREAM_EVENT_WEBHOOK_SECRET,
      webhookNow: () => NOW.getTime(),
      youtubeWebSubSecret: YOUTUBE_WEBSUB_SECRET,
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
      validUrl.searchParams.set("hub.challenge", "youtube-challenge-token");

      const invalidUrl = new URL(
        `http://127.0.0.1:${address.port}/webhooks/youtube`,
      );
      invalidUrl.searchParams.set("hub.mode", "subscribe");
      invalidUrl.searchParams.set(
        "hub.topic",
        "https://evil.example/feeds/videos.xml?channel_id=youtube-channel-1",
      );
      invalidUrl.searchParams.set("hub.challenge", "bad-topic");

      const validResponse = await fetch(validUrl);
      const invalidResponse = await fetch(invalidUrl);

      expect(validResponse.status).toBe(200);
      expect(await validResponse.text()).toBe("youtube-challenge-token");
      expect(invalidResponse.status).toBe(400);
    } finally {
      server.close();
    }
  });

  it("responds to Twitch EventSub verification challenges as plain text", async () => {
    const events: ProviderWebhookEvent[] = [];

    await withServer(events, async (baseUrl) => {
      const body = JSON.stringify({ challenge: "twitch-challenge-token" });
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
      expect(text).toBe("twitch-challenge-token");
      expect(events).toEqual([]);
    });
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
      url.searchParams.set(
        "hub.topic",
        "https://www.youtube.com/feeds/videos.xml?channel_id=youtube-channel-1",
      );
      url.searchParams.set("hub.challenge", "youtube-challenge-token");
      url.searchParams.set("hub.verify_token", YOUTUBE_WEBSUB_SECRET);

      const response = await fetch(url);
      const text = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/plain");
      expect(text).toBe("youtube-challenge-token");
      expect(events).toEqual([]);
    });
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
});
