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
    creator_id: "22222222-2222-4222-8222-222222222222",
    requested_by: "11111111-1111-4111-8111-111111111111",
    source_platform: "twitch" as const,
    source_url: "https://www.twitch.tv/videos/123",
    transcript: "A clutch moment with a strong opening hook.",
  };

  it("derives stable BullMQ job IDs from stream_id", () => {
    const firstJobId = getClipGenerationJobId(
      "33333333-3333-4333-8333-333333333333",
    );
    const secondJobId = getClipGenerationJobId(
      "33333333-3333-4333-8333-333333333333",
    );

    expect(firstJobId).toBe(secondJobId);
    expect(firstJobId).toMatch(/^clip-generation-/);
    expect(firstJobId).not.toContain(":");
  });

  it("deduplicates clip generation by stream_id through BullMQ jobId", async () => {
    const queue = new InMemoryDedupeQueue();

    const first = await enqueueClipGenerationJob(queue, {
      ...basePayload,
      stream_id: "33333333-3333-4333-8333-333333333333",
    });
    const second = await enqueueClipGenerationJob(queue, {
      ...basePayload,
      stream_id: "33333333-3333-4333-8333-333333333333",
    });

    expect(first.jobId).toBe(second.jobId);
    expect(queue.jobs.size).toBe(1);
    expect(queue.jobs.get(first.jobId)?.name).toBe(CLIP_GENERATION_JOB_NAME);
  });

  it("queues separate jobs for different stream_id values", async () => {
    const queue = new InMemoryDedupeQueue();

    await enqueueClipGenerationJob(queue, {
      ...basePayload,
      stream_id: "33333333-3333-4333-8333-333333333333",
    });
    await enqueueClipGenerationJob(queue, {
      ...basePayload,
      source_url: "https://www.twitch.tv/videos/456",
      stream_id: "44444444-4444-4444-8444-444444444444",
    });

    expect(queue.jobs.size).toBe(2);
  });
});
