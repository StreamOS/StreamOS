import type { JobsOptions } from "bullmq";
import { describe, expect, it } from "vitest";

import type { MetricsSyncJobData } from "@streamos/types";

import {
  METRICS_SYNC_JOB_NAME,
  type MetricsSyncQueue,
  enqueueMetricsSyncJob,
  getMetricsSyncJobId,
  normalizeMetricsSyncProviders,
} from "./index.js";

class InMemoryDedupeQueue implements MetricsSyncQueue {
  readonly jobs = new Map<
    string,
    { id: string; data: MetricsSyncJobData; name: typeof METRICS_SYNC_JOB_NAME }
  >();

  async add(
    name: typeof METRICS_SYNC_JOB_NAME,
    data: MetricsSyncJobData,
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

describe("metricsSyncQueue", () => {
  it("normalizes provider order and deduplicates repeated providers", () => {
    expect(
      normalizeMetricsSyncProviders(["kick", "twitch", "kick", "youtube"]),
    ).toEqual(["twitch", "youtube", "kick"]);
  });

  it("derives stable BullMQ job IDs from the user and provider set", () => {
    const firstJobId = getMetricsSyncJobId(
      "11111111-1111-4111-8111-111111111111",
      ["kick", "twitch"],
    );
    const secondJobId = getMetricsSyncJobId(
      "11111111-1111-4111-8111-111111111111",
      ["twitch", "kick", "kick"],
    );

    expect(firstJobId).toBe(secondJobId);
    expect(firstJobId).toMatch(/^metrics-sync-/);
  });

  it("deduplicates sync jobs through the BullMQ jobId", async () => {
    const queue = new InMemoryDedupeQueue();

    const first = await enqueueMetricsSyncJob(queue, {
      providers: ["kick", "twitch"],
      user_id: "11111111-1111-4111-8111-111111111111",
    });
    const second = await enqueueMetricsSyncJob(queue, {
      providers: ["twitch", "kick", "kick"],
      user_id: "11111111-1111-4111-8111-111111111111",
    });

    expect(first.job_id).toBe(second.job_id);
    expect(queue.jobs.size).toBe(1);
    expect(queue.jobs.get(first.job_id)?.name).toBe(METRICS_SYNC_JOB_NAME);
    expect(queue.jobs.get(first.job_id)?.data.providers).toEqual([
      "twitch",
      "kick",
    ]);
    expect(first.status).toBe("queued");
  });
});
