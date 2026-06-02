import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import type { ClipGenerationQueue } from "./jobs/clipGenerationQueue.js";
import type { TranscriptionQueue } from "./jobs/transcriptionQueue.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CREATOR_ID = "22222222-2222-4222-8222-222222222222";
const STREAM_ID = "33333333-3333-4333-8333-333333333333";

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

  it("queues clip generation idempotently by stream_id", async () => {
    const jobIds = new Set<string>();
    const clipGenerationQueue: ClipGenerationQueue = {
      async add(_name, _data, opts) {
        const jobId = String(opts.jobId);
        jobIds.add(jobId);

        return { id: jobId };
      },
    };
    const app = createApp({ clipGenerationQueue });
    const server = app.listen(0);

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected TCP server address.");
      }

      const body = JSON.stringify({
        stream_id: "stream-123",
        creator_id: "creator-1",
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
    } finally {
      server.close();
    }
  });

  it("queues transcription trigger after stream end idempotently by stream_id", async () => {
    const jobIds = new Set<string>();
    const transcriptionQueue: TranscriptionQueue = {
      async add(_name, _data, opts) {
        const jobId = String(opts.jobId);
        jobIds.add(jobId);

        return { id: jobId };
      },
    };
    const app = createApp({
      streamEventWebhookSecret: "test-secret",
      transcriptionQueue,
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
            "x-streamos-webhook-secret": "test-secret",
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
            "x-streamos-webhook-secret": "test-secret",
          },
          body,
        },
      );

      const firstBody = await firstResponse.json();
      const secondBody = await secondResponse.json();

      expect(firstResponse.status).toBe(202);
      expect(secondResponse.status).toBe(202);
      expect(firstBody.job_id).toBe(secondBody.job_id);
      expect(firstBody.stream_id).toBe(STREAM_ID);
      expect(jobIds.size).toBe(1);
    } finally {
      server.close();
    }
  });

  it("rejects stream-ended webhooks with an invalid secret", async () => {
    const transcriptionQueue: TranscriptionQueue = {
      async add() {
        throw new Error("Queue should not be called.");
      },
    };
    const app = createApp({
      streamEventWebhookSecret: "test-secret",
      transcriptionQueue,
    });
    const server = app.listen(0);

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected TCP server address.");
      }

      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/webhooks/streams/ended`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-streamos-webhook-secret": "wrong-secret",
          },
          body: JSON.stringify({
            stream_id: "stream-123",
            platform: "twitch",
          }),
        },
      );
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error).toBe("invalid_stream_event_secret");
    } finally {
      server.close();
    }
  });
});
