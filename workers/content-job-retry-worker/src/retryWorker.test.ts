import { describe, expect, it, vi } from "vitest";

import type {
  ContentJobRetryStore,
  RetryableContentJob,
} from "./contentJobStore.js";
import type { ContentJobRetryQueues } from "./retryQueues.js";
import { retryFailedContentJobs } from "./retryWorker.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const STREAM_ID = "22222222-2222-4222-8222-222222222222";
const JOB_ID = "33333333-3333-4333-8333-333333333333";
const NOW = new Date("2026-06-01T12:00:00.000Z");

function createStore(jobs: RetryableContentJob[]): ContentJobRetryStore & {
  claimForRetry: ReturnType<typeof vi.fn>;
  markRequeueFailed: ReturnType<typeof vi.fn>;
  markUnretryable: ReturnType<typeof vi.fn>;
} {
  return {
    claimForRetry: vi.fn().mockResolvedValue(true),
    listFailedJobs: vi.fn().mockResolvedValue(jobs),
    markRequeueFailed: vi.fn().mockResolvedValue(undefined),
    markUnretryable: vi.fn().mockResolvedValue(undefined),
  };
}

function createQueues(): ContentJobRetryQueues & {
  add: ReturnType<typeof vi.fn>;
} {
  return {
    add: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function createFailedClipJob(
  overrides: Partial<RetryableContentJob> = {},
): RetryableContentJob {
  return {
    error_message: "previous failure",
    id: JOB_ID,
    job_type: "clip_scoring",
    max_retries: 3,
    next_retry_at: null,
    payload: {
      creator_id: USER_ID,
      requested_by: USER_ID,
      source_url: "https://video.example.com/vod.mp4",
      stream_id: STREAM_ID,
    },
    queue_job_id: "old-queue-job",
    retry_count: 0,
    status: "failed",
    stream_id: STREAM_ID,
    user_id: USER_ID,
    ...overrides,
  };
}

describe("retryFailedContentJobs", () => {
  it("claims and requeues a failed clip_scoring content job", async () => {
    const store = createStore([createFailedClipJob()]);
    const queues = createQueues();

    await expect(
      retryFailedContentJobs({
        bullMqAttempts: 3,
        bullMqBackoffMs: 30_000,
        now: NOW,
        queues,
        store,
      }),
    ).resolves.toEqual({
      claimed: 1,
      exhausted: 0,
      failed: 0,
      requeued: 1,
      scanned: 1,
      skipped: 0,
    });

    expect(store.claimForRetry).toHaveBeenCalledWith({
      job: expect.objectContaining({ id: JOB_ID }),
      now: NOW,
      queueJobId: `content-job-clip_scoring-${JOB_ID}-retry-1`,
      retryCount: 1,
    });
    expect(queues.add).toHaveBeenCalledWith({
      backoffMs: 30_000,
      bullMqAttempts: 3,
      data: expect.objectContaining({ stream_id: STREAM_ID }),
      name: "clip.generate",
      queue: "clip_generation",
      queueJobId: `content-job-clip_scoring-${JOB_ID}-retry-1`,
    });
  });

  it("marks unsupported job types as unretryable", async () => {
    const job = createFailedClipJob({
      job_type: "title_generation",
      payload: { prompt: "title" },
    });
    const store = createStore([job]);
    const queues = createQueues();

    await retryFailedContentJobs({
      bullMqAttempts: 3,
      bullMqBackoffMs: 30_000,
      now: NOW,
      queues,
      store,
    });

    expect(store.markUnretryable).toHaveBeenCalledWith({
      errorMessage: "content job type title_generation is not retryable yet.",
      job,
      now: NOW,
    });
    expect(queues.add).not.toHaveBeenCalled();
  });

  it("skips jobs that already reached their retry limit", async () => {
    const store = createStore([
      createFailedClipJob({ retry_count: 3, max_retries: 3 }),
    ]);
    const queues = createQueues();

    await expect(
      retryFailedContentJobs({
        bullMqAttempts: 3,
        bullMqBackoffMs: 30_000,
        now: NOW,
        queues,
        store,
      }),
    ).resolves.toMatchObject({
      exhausted: 1,
      requeued: 0,
      scanned: 1,
    });

    expect(store.claimForRetry).not.toHaveBeenCalled();
    expect(queues.add).not.toHaveBeenCalled();
  });

  it("requeues an exhausted job after max_retries was raised manually", async () => {
    const store = createStore([
      createFailedClipJob({ retry_count: 3, max_retries: 4 }),
    ]);
    const queues = createQueues();

    await expect(
      retryFailedContentJobs({
        bullMqAttempts: 3,
        bullMqBackoffMs: 30_000,
        now: NOW,
        queues,
        store,
      }),
    ).resolves.toMatchObject({
      claimed: 1,
      requeued: 1,
      scanned: 1,
    });

    expect(store.claimForRetry).toHaveBeenCalledWith({
      job: expect.objectContaining({ id: JOB_ID }),
      now: NOW,
      queueJobId: `content-job-clip_scoring-${JOB_ID}-retry-4`,
      retryCount: 4,
    });
    expect(queues.add).toHaveBeenCalledWith(
      expect.objectContaining({
        queueJobId: `content-job-clip_scoring-${JOB_ID}-retry-4`,
      }),
    );
  });
});
