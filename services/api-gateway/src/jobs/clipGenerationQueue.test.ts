import type { JobsOptions } from "bullmq";
import { describe, expect, it } from "vitest";

import {
  CLIP_GENERATION_JOB_NAME,
  type ClipGenerationJobData,
  type ClipGenerationQueue,
  enqueueClipGenerationJob,
  getClipGenerationJobId,
} from "./clipGenerationQueue.js";

class InMemoryDedupeQueue implements ClipGenerationQueue {
  readonly jobs = new Map<
    string,
    { id: string; data: ClipGenerationJobData; name: string }
  >();

  async add(
    name: typeof CLIP_GENERATION_JOB_NAME,
    data: ClipGenerationJobData,
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

describe("clipGenerationQueue", () => {
  const basePayload = {
    creator_id: "creator-1",
    requested_by: "user-1",
    source_platform: "twitch" as const,
    source_url: "https://www.twitch.tv/videos/123",
    transcript: "A clutch moment with a strong opening hook.",
  };

  it("derives stable BullMQ job IDs from stream_id", () => {
    const firstJobId = getClipGenerationJobId("stream-123");
    const secondJobId = getClipGenerationJobId("stream-123");

    expect(firstJobId).toBe(secondJobId);
    expect(firstJobId).toMatch(/^clip-generation-/);
    expect(firstJobId).not.toContain(":");
  });

  it("deduplicates clip generation by stream_id through BullMQ jobId", async () => {
    const queue = new InMemoryDedupeQueue();

    const first = await enqueueClipGenerationJob(queue, {
      ...basePayload,
      stream_id: "stream-123",
    });
    const second = await enqueueClipGenerationJob(queue, {
      ...basePayload,
      stream_id: "stream-123",
    });

    expect(first.jobId).toBe(second.jobId);
    expect(queue.jobs.size).toBe(1);
    expect(queue.jobs.get(first.jobId)?.name).toBe(CLIP_GENERATION_JOB_NAME);
  });

  it("queues separate jobs for different stream_id values", async () => {
    const queue = new InMemoryDedupeQueue();

    await enqueueClipGenerationJob(queue, {
      ...basePayload,
      stream_id: "stream-123",
    });
    await enqueueClipGenerationJob(queue, {
      ...basePayload,
      source_url: "https://www.twitch.tv/videos/456",
      stream_id: "stream-456",
    });

    expect(queue.jobs.size).toBe(2);
  });
});
