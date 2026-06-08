import type { JobsOptions } from "bullmq";
import { describe, expect, it } from "vitest";

import {
  TRANSCRIPTION_TRIGGER_JOB_NAME,
  type TranscriptionQueue,
  type TranscriptionTriggerJobData,
  enqueueTranscriptionTriggerJob,
  getTranscriptionTriggerJobId,
} from "./transcriptionQueue.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CREATOR_ID = "22222222-2222-4222-8222-222222222222";
const STREAM_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_STREAM_ID = "44444444-4444-4444-8444-444444444444";

class InMemoryDedupeQueue implements TranscriptionQueue {
  readonly jobs = new Map<
    string,
    { id: string; data: TranscriptionTriggerJobData; name: string }
  >();

  async add(
    name: typeof TRANSCRIPTION_TRIGGER_JOB_NAME,
    data: TranscriptionTriggerJobData,
    opts: JobsOptions,
  ): Promise<{ id: string }> {
    if (!opts.jobId) {
      throw new Error("Expected BullMQ jobId to be set.");
    }

    const jobId = String(opts.jobId);
    const existingJob = this.jobs.get(jobId);

    if (existingJob) {
      return existingJob;
    }

    const job = { id: jobId, data, name };
    this.jobs.set(jobId, job);

    return job;
  }
}

describe("transcriptionQueue", () => {
  it("derives stable BullMQ job IDs from stream_id", () => {
    expect(getTranscriptionTriggerJobId(STREAM_ID)).toBe(
      getTranscriptionTriggerJobId(STREAM_ID),
    );
  });

  it("deduplicates stream-ended transcription triggers by stream_id", async () => {
    const queue = new InMemoryDedupeQueue();

    const first = await enqueueTranscriptionTriggerJob(queue, {
      user_id: USER_ID,
      stream_id: STREAM_ID,
      platform: "twitch",
      creator_id: CREATOR_ID,
      vod_asset_url: "https://cdn.example.com/vods/stream-123.mp4",
    });
    const second = await enqueueTranscriptionTriggerJob(queue, {
      user_id: USER_ID,
      stream_id: STREAM_ID,
      platform: "twitch",
      creator_id: CREATOR_ID,
      vod_asset_url: "https://cdn.example.com/vods/stream-123.mp4",
    });

    expect(first.jobId).toBe(second.jobId);
    expect(queue.jobs.size).toBe(1);
    expect(queue.jobs.get(first.jobId)?.name).toBe(
      TRANSCRIPTION_TRIGGER_JOB_NAME,
    );
    expect(queue.jobs.get(first.jobId)?.data.trigger).toBe("stream_ended");
  });

  it("queues separate transcription triggers for different stream_id values", async () => {
    const queue = new InMemoryDedupeQueue();

    await enqueueTranscriptionTriggerJob(queue, {
      user_id: USER_ID,
      stream_id: STREAM_ID,
      platform: "twitch",
      vod_asset_url: "https://cdn.example.com/vods/stream-123.mp4",
    });
    await enqueueTranscriptionTriggerJob(queue, {
      user_id: USER_ID,
      stream_id: OTHER_STREAM_ID,
      platform: "twitch",
      vod_asset_url: "https://cdn.example.com/vods/stream-456.mp4",
    });

    expect(queue.jobs.size).toBe(2);
  });
});
