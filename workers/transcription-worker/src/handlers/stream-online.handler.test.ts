import { describe, expect, it, vi } from "vitest";

import type { ContentJobStore } from "../contentJobStore.js";
import type { StreamOnlinePayload } from "../mediaJobSchema.js";
import { VodNotReadyError } from "../providerClients.js";
import { handleStreamOnlineJob } from "./stream-online.handler.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CONTENT_JOB_ID = "22222222-2222-4222-8222-222222222222";

function createPayload(
  overrides: Partial<StreamOnlinePayload> = {},
): StreamOnlinePayload {
  return {
    channelId: "twitch-channel-1",
    enqueuedAt: "2026-06-07T10:00:00.000Z",
    provider: "twitch",
    startedAt: "2026-06-07T09:59:00.000Z",
    streamId: "twitch-stream-1",
    type: "STREAM_ONLINE",
    userId: USER_ID,
    ...overrides,
  };
}

function createStore(): ContentJobStore {
  return {
    create: vi.fn().mockResolvedValue({
      id: CONTENT_JOB_ID,
      max_retries: 3,
      retry_count: 0,
    }),
    findYouTubeConnection: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
    updateYouTubeConnection: vi.fn(),
  };
}

describe("handleStreamOnlineJob", () => {
  it("creates a transcription content job and starts automation", async () => {
    const contentJobStore = createStore();
    const automationClient = {
      enqueueTranscription: vi.fn().mockResolvedValue({
        jobId: "automation-job-1",
        status: "queued",
      }),
    };
    const twitchClient = {
      resolveLatestVodUrl: vi
        .fn()
        .mockResolvedValue("https://www.twitch.tv/videos/123"),
    };

    await handleStreamOnlineJob(
      {
        data: createPayload(),
        id: "bullmq-job-1",
        name: "STREAM_ONLINE",
        opts: {},
      },
      {
        automationClient,
        contentJobStore,
        now: () => new Date("2026-06-07T10:01:00.000Z"),
        twitchClient,
      },
    );

    expect(contentJobStore.create).toHaveBeenCalledWith({
      jobType: "transcription",
      payload: {
        channelId: "twitch-channel-1",
        provider: "twitch",
        startedAt: "2026-06-07T09:59:00.000Z",
        streamId: "twitch-stream-1",
      },
      queueJobId: "media:bullmq-job-1:transcription",
      userId: USER_ID,
    });
    expect(automationClient.enqueueTranscription).toHaveBeenCalledWith({
      contentJobId: CONTENT_JOB_ID,
      provider: "twitch",
      streamId: "twitch-stream-1",
      userId: USER_ID,
      vodUrl: "https://www.twitch.tv/videos/123",
    });
    expect(contentJobStore.update).toHaveBeenCalledWith({
      id: CONTENT_JOB_ID,
      result: { automationJobId: "automation-job-1" },
      startedAt: "2026-06-07T10:01:00.000Z",
      status: "processing",
    });
  });

  it("re-enqueues with a delay when the Twitch VOD is not ready", async () => {
    const contentJobStore = createStore();
    const mediaQueue = {
      add: vi.fn().mockResolvedValue({ id: "delayed-job" }),
    };

    await handleStreamOnlineJob(
      {
        data: createPayload(),
        id: "bullmq-job-2",
        name: "STREAM_ONLINE",
        opts: { attempts: 1 },
      },
      {
        automationClient: {
          enqueueTranscription: vi.fn(),
        },
        contentJobStore,
        delayMs: 300_000,
        mediaQueue,
        twitchClient: {
          resolveLatestVodUrl: vi
            .fn()
            .mockRejectedValue(new VodNotReadyError()),
        },
      },
    );

    expect(mediaQueue.add).toHaveBeenCalledWith(
      "STREAM_ONLINE",
      expect.objectContaining({ vodLookupAttempt: 1 }),
      expect.objectContaining({
        delay: 300_000,
        jobId: "bullmq-job-2:vod-retry:1",
      }),
    );
    expect(contentJobStore.update).not.toHaveBeenCalled();
  });

  it("marks the content job failed after max VOD lookup retries", async () => {
    const contentJobStore = createStore();

    await handleStreamOnlineJob(
      {
        data: createPayload({ vodLookupAttempt: 2 }),
        id: "bullmq-job-3",
        name: "STREAM_ONLINE",
        opts: {},
      },
      {
        automationClient: {
          enqueueTranscription: vi.fn(),
        },
        contentJobStore,
        maxVodLookupRetries: 3,
        now: () => new Date("2026-06-07T10:05:00.000Z"),
        twitchClient: {
          resolveLatestVodUrl: vi
            .fn()
            .mockRejectedValue(new VodNotReadyError()),
        },
      },
    );

    expect(contentJobStore.update).toHaveBeenCalledWith({
      completedAt: "2026-06-07T10:05:00.000Z",
      errorMessage:
        "Twitch VOD is not available yet. Max VOD lookup retries exhausted (3).",
      id: CONTENT_JOB_ID,
      result: {
        error:
          "Twitch VOD is not available yet. Max VOD lookup retries exhausted (3).",
      },
      status: "failed",
    });
  });
});
