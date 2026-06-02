import { describe, expect, it, vi } from "vitest";

import { processTranscriptionJob } from "./worker.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const STREAM_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_STREAM_ID = "33333333-3333-4333-8333-333333333333";

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
        {
          id: "job-1",
          data: {
            user_id: USER_ID,
            language: "en",
            platform: "twitch",
            stream_id: STREAM_ID,
            trigger: "stream_ended",
            vod_asset_url: "https://cdn.example.com/audio.mp4",
          },
        },
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
          segments: [{ end: 1.5, start: 0, text: "A clean transcript." }],
          transcript: "A clean transcript.",
        },
        status: "done",
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
        {
          id: "job-2",
          data: {
            user_id: USER_ID,
            language: "auto",
            platform: "youtube",
            stream_id: OTHER_STREAM_ID,
            trigger: "stream_ended",
            vod_asset_url: "https://cdn.example.com/audio.webm",
          },
        },
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
});
