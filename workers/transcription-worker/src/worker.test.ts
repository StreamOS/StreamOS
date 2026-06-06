import { describe, expect, it, vi } from "vitest";

import { processTranscriptionJob } from "./worker.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const STREAM_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_STREAM_ID = "33333333-3333-4333-8333-333333333333";

function createJob({
  attempts = 1,
  attemptsMade = 0,
  data,
  id,
}: {
  attempts?: number;
  attemptsMade?: number;
  data: Record<string, unknown>;
  id: string;
}) {
  return {
    attemptsMade,
    data,
    id,
    opts: {
      attempts,
    },
  };
}

describe("processTranscriptionJob", () => {
  it("marks a valid BullMQ transcription job as completed", async () => {
    const statusStore = {
      update: vi.fn().mockResolvedValue(undefined),
    };
    const automationClient = {
      processTranscription: vi.fn().mockResolvedValue({
        job_id: "job-1",
        language: "en",
        model: "gpt-4o-transcribe",
        provider: "openai",
        segments: [{ end: 1.5, start: 0, text: "A clean transcript." }],
        stream_id: STREAM_ID,
        transcript: "A clean transcript.",
      }),
    };

    await expect(
      processTranscriptionJob(
        createJob({
          id: "job-1",
          data: {
            user_id: USER_ID,
            language: "en",
            platform: "twitch",
            stream_id: STREAM_ID,
            trigger: "stream_ended",
            vod_asset_url: "https://cdn.example.com/audio.mp4",
          },
        }),
        { automationClient, statusStore },
      ),
    ).resolves.toMatchObject({
      transcript: "A clean transcript.",
    });

    expect(statusStore.update).toHaveBeenNthCalledWith(
      1,
      "job-1",
      expect.objectContaining({ stream_id: STREAM_ID, user_id: USER_ID }),
      { status: "running" },
    );
    expect(statusStore.update).toHaveBeenNthCalledWith(
      2,
      "job-1",
      expect.objectContaining({ stream_id: STREAM_ID, user_id: USER_ID }),
      {
        result: {
          model: "gpt-4o-transcribe",
          provider: "openai",
          segments: [{ end: 1.5, start: 0, text: "A clean transcript." }],
          transcript: "A clean transcript.",
        },
        status: "done",
      },
    );
  });

  it("queues clip generation after a successful transcription", async () => {
    const statusStore = {
      enqueueClipGeneration: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    };
    const clipGenerationQueue = {
      add: vi.fn().mockResolvedValue({ id: "clip-job-1" }),
    };
    const automationClient = {
      processTranscription: vi.fn().mockResolvedValue({
        job_id: "job-1",
        language: "en",
        model: "gpt-4o-transcribe",
        provider: "openai",
        segments: [{ end: 1.5, start: 0, text: "A clean transcript." }],
        stream_id: STREAM_ID,
        transcript: "A clean transcript.",
      }),
    };

    await processTranscriptionJob(
      createJob({
        id: "job-1",
        data: {
          user_id: USER_ID,
          language: "en",
          platform: "twitch",
          stream_id: STREAM_ID,
          trigger: "stream_ended",
          vod_asset_url: "https://cdn.example.com/audio.mp4",
        },
      }),
      { automationClient, clipGenerationQueue, statusStore },
    );

    expect(clipGenerationQueue.add).toHaveBeenCalledWith(
      "clip.generate",
      {
        requested_by: USER_ID,
        source_platform: "twitch",
        source_url: "https://cdn.example.com/audio.mp4",
        stream_id: STREAM_ID,
        transcript: "A clean transcript.",
      },
      expect.objectContaining({
        attempts: 3,
        jobId: `clip-generation-${STREAM_ID}`,
      }),
    );
    expect(statusStore.enqueueClipGeneration).toHaveBeenCalledWith(
      `clip-generation-${STREAM_ID}`,
      {
        requested_by: USER_ID,
        source_platform: "twitch",
        source_url: "https://cdn.example.com/audio.mp4",
        stream_id: STREAM_ID,
        transcript: "A clean transcript.",
      },
    );
  });

  it("marks the job as failed when automation-service fails", async () => {
    const statusStore = {
      update: vi.fn().mockResolvedValue(undefined),
    };
    const automationClient = {
      processTranscription: vi
        .fn()
        .mockRejectedValue(new Error("automation unavailable")),
    };

    await expect(
      processTranscriptionJob(
        createJob({
          id: "job-2",
          data: {
            user_id: USER_ID,
            language: "auto",
            platform: "youtube",
            stream_id: OTHER_STREAM_ID,
            trigger: "stream_ended",
            vod_asset_url: "https://cdn.example.com/audio.webm",
          },
        }),
        { automationClient, statusStore },
      ),
    ).rejects.toThrow("automation unavailable");

    expect(statusStore.update).toHaveBeenLastCalledWith(
      "job-2",
      expect.objectContaining({ stream_id: OTHER_STREAM_ID, user_id: USER_ID }),
      {
        error_message: "automation unavailable",
        result: {
          error: "automation unavailable",
        },
        status: "failed",
      },
    );
  });

  it("keeps the job pending while BullMQ still has attempts left", async () => {
    const statusStore = {
      update: vi.fn().mockResolvedValue(undefined),
    };
    const automationClient = {
      processTranscription: vi
        .fn()
        .mockRejectedValue(new Error("temporary automation failure")),
    };

    await expect(
      processTranscriptionJob(
        createJob({
          attempts: 3,
          attemptsMade: 0,
          id: "job-3",
          data: {
            user_id: USER_ID,
            language: "auto",
            platform: "youtube",
            stream_id: OTHER_STREAM_ID,
            trigger: "stream_ended",
            vod_asset_url: "https://cdn.example.com/audio.webm",
          },
        }),
        { automationClient, statusStore },
      ),
    ).rejects.toThrow("temporary automation failure");

    expect(statusStore.update).toHaveBeenLastCalledWith(
      "job-3",
      expect.objectContaining({ stream_id: OTHER_STREAM_ID, user_id: USER_ID }),
      {
        error_message: "temporary automation failure",
        result: undefined,
        status: "pending",
      },
    );
  });
});
