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
const publicAssetResolver = () => ["93.184.216.34"];

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

    const first = await enqueueTranscriptionTriggerJob(
      queue,
      {
        user_id: USER_ID,
        stream_id: STREAM_ID,
        platform: "twitch",
        creator_id: CREATOR_ID,
        vod_asset_url: "https://cdn.example.com/vods/stream-123.mp4",
      },
      { assetUrlResolver: publicAssetResolver },
    );
    const second = await enqueueTranscriptionTriggerJob(
      queue,
      {
        user_id: USER_ID,
        stream_id: STREAM_ID,
        platform: "twitch",
        creator_id: CREATOR_ID,
        vod_asset_url: "https://cdn.example.com/vods/stream-123.mp4",
      },
      { assetUrlResolver: publicAssetResolver },
    );

    expect(first.jobId).toBe(second.jobId);
    expect(queue.jobs.size).toBe(1);
    expect(queue.jobs.get(first.jobId)?.name).toBe(
      TRANSCRIPTION_TRIGGER_JOB_NAME,
    );
    expect(queue.jobs.get(first.jobId)?.data.trigger).toBe("stream_ended");
  });

  it("queues separate transcription triggers for different stream_id values", async () => {
    const queue = new InMemoryDedupeQueue();

    await enqueueTranscriptionTriggerJob(
      queue,
      {
        user_id: USER_ID,
        stream_id: STREAM_ID,
        platform: "twitch",
        vod_asset_url: "https://cdn.example.com/vods/stream-123.mp4",
      },
      { assetUrlResolver: publicAssetResolver },
    );
    await enqueueTranscriptionTriggerJob(
      queue,
      {
        user_id: USER_ID,
        stream_id: OTHER_STREAM_ID,
        platform: "twitch",
        vod_asset_url: "https://cdn.example.com/vods/stream-456.mp4",
      },
      { assetUrlResolver: publicAssetResolver },
    );

    expect(queue.jobs.size).toBe(2);
  });

  it.each([
    ["HTTP scheme", "http://cdn.example.com/vods/stream-123.mp4"],
    ["localhost", "https://localhost/vods/stream-123.mp4"],
    ["private IPv4", "https://10.0.0.5/vods/stream-123.mp4"],
    ["link-local IPv4", "https://169.254.169.254/latest/meta-data"],
    ["reserved IPv4", "https://192.0.2.1/vods/stream-123.mp4"],
    ["credentials", "https://user:pass@cdn.example.com/vods/stream-123.mp4"],
    ["non-default port", "https://cdn.example.com:8443/vods/stream-123.mp4"],
  ])(
    "rejects unsafe VOD asset URLs before queueing: %s",
    async (_name, url) => {
      const queue = new InMemoryDedupeQueue();

      await expect(
        enqueueTranscriptionTriggerJob(
          queue,
          {
            user_id: USER_ID,
            stream_id: STREAM_ID,
            platform: "twitch",
            vod_asset_url: url,
          },
          { assetUrlResolver: publicAssetResolver },
        ),
      ).rejects.toThrow(/Asset URL/);

      expect(queue.jobs.size).toBe(0);
    },
  );

  it("rejects VOD asset URLs that resolve to private IPs before queueing", async () => {
    const queue = new InMemoryDedupeQueue();

    await expect(
      enqueueTranscriptionTriggerJob(
        queue,
        {
          user_id: USER_ID,
          stream_id: STREAM_ID,
          platform: "twitch",
          vod_asset_url: "https://cdn.example.com/vods/stream-123.mp4",
        },
        { assetUrlResolver: () => ["10.0.0.5"] },
      ),
    ).rejects.toThrow("Asset URL resolves to a non-public IP address.");

    expect(queue.jobs.size).toBe(0);
  });
});
