import { describe, expect, it, vi } from "vitest";

import type {
  ContentJobRetryStore,
  RetryableContentJob,
} from "./contentJobStore.js";
import type { ContentJobRetryQueues } from "./retryQueues.js";
import { REPURPOSING_PLAN_JOB_NAME } from "./jobSchemas.js";
import { retryFailedContentJobs } from "./retryWorker.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const STREAM_ID = "22222222-2222-4222-8222-222222222222";
const JOB_ID = "33333333-3333-4333-8333-333333333333";
const NOW = new Date("2026-06-01T12:00:00.000Z");
const publicAssetResolver = () => ["93.184.216.34"];

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
      source_platform: "twitch",
      source_url: "https://video.example.com/vod.mp4",
      stream_id: STREAM_ID,
      transcript: "Huge comeback after a risky play in the final round.",
    },
    queue_job_id: "old-queue-job",
    retry_count: 0,
    status: "failed",
    stream_id: STREAM_ID,
    user_id: USER_ID,
    ...overrides,
  };
}

function createFailedRepurposingJob(
  overrides: Partial<RetryableContentJob> = {},
): RetryableContentJob {
  return {
    error_message: "previous failure",
    id: JOB_ID,
    job_type: "repurposing",
    max_retries: 3,
    next_retry_at: null,
    payload: {
      auto_repurpose_enabled: true,
      channel_id: "youtube-channel-1",
      content_policy_profile: "short-form-safe",
      creator_id: USER_ID,
      enrichment_status: "asset_available",
      manual_review_required: true,
      published_at: "2026-06-17T12:10:00.000Z",
      source_event_type: "video.published",
      source_provider: "youtube",
      source_video_id: "video-123",
      source_video_title: "New VOD",
      stream_id: STREAM_ID,
      target_platforms: ["youtube"],
      updated_at: "2026-06-17T12:10:00.000Z",
      user_id: USER_ID,
      vod_asset_url: "https://video.example.com/vod.mp4",
      workflow: "repurposing_plan",
    },
    queue_job_id: "old-queue-job",
    retry_count: 0,
    status: "failed",
    stream_id: STREAM_ID,
    user_id: USER_ID,
    ...overrides,
  };
}

function createFailedTranscriptionJob(
  overrides: Partial<RetryableContentJob> = {},
): RetryableContentJob {
  return {
    error_message: "previous failure",
    id: JOB_ID,
    job_type: "transcription",
    max_retries: 3,
    next_retry_at: null,
    payload: {
      user_id: USER_ID,
      stream_id: STREAM_ID,
      platform: "twitch",
      creator_id: USER_ID,
      vod_asset_url: "https://video.example.com/vod.mp4",
      language: "en",
      trigger: "stream_ended",
    },
    queue_job_id: "old-queue-job",
    retry_count: 0,
    status: "failed",
    stream_id: STREAM_ID,
    user_id: USER_ID,
    ...overrides,
  };
}

function withPayload(
  job: RetryableContentJob,
  payload: Record<string, unknown>,
): RetryableContentJob {
  return {
    ...job,
    payload,
  };
}

function getPayload(job: RetryableContentJob): Record<string, unknown> {
  if (typeof job.payload !== "object" || job.payload === null) {
    throw new Error("Expected test content job payload to be an object.");
  }

  return job.payload as Record<string, unknown>;
}

describe("retryFailedContentJobs", () => {
  it("claims and requeues a failed clip_scoring content job", async () => {
    const store = createStore([createFailedClipJob()]);
    const queues = createQueues();

    await expect(
      retryFailedContentJobs({
        assetUrlResolver: publicAssetResolver,
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

  it("claims and requeues a failed repurposing content job", async () => {
    const store = createStore([createFailedRepurposingJob()]);
    const queues = createQueues();

    await expect(
      retryFailedContentJobs({
        assetUrlResolver: publicAssetResolver,
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
      queueJobId: `content-job-repurposing-${JOB_ID}-retry-1`,
      retryCount: 1,
    });
    expect(queues.add).toHaveBeenCalledWith({
      backoffMs: 30_000,
      bullMqAttempts: 3,
      data: expect.objectContaining({
        asset_reference: expect.objectContaining({
          kind: "vod",
          status: "asset_available",
        }),
        content_job_id: JOB_ID,
        manual_review_required: true,
        provider: "youtube",
        queue_job_id: `content-job-repurposing-${JOB_ID}-retry-1`,
        source_event_type: "video.published",
        target_platforms: ["youtube"],
        user_id: USER_ID,
      }),
      name: REPURPOSING_PLAN_JOB_NAME,
      queue: "repurposing",
      queueJobId: `content-job-repurposing-${JOB_ID}-retry-1`,
    });
  });

  it("claims and requeues a failed transcription content job", async () => {
    const store = createStore([createFailedTranscriptionJob()]);
    const queues = createQueues();

    await expect(
      retryFailedContentJobs({
        assetUrlResolver: publicAssetResolver,
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
      queueJobId: `content-job-transcription-${JOB_ID}-retry-1`,
      retryCount: 1,
    });
    expect(queues.add).toHaveBeenCalledWith({
      backoffMs: 30_000,
      bullMqAttempts: 3,
      data: expect.objectContaining({
        stream_id: STREAM_ID,
        vod_asset_url: "https://video.example.com/vod.mp4",
      }),
      name: "transcription.trigger",
      queue: "transcription",
      queueJobId: `content-job-transcription-${JOB_ID}-retry-1`,
    });
  });

  it("marks repurposing jobs that require manual review as unretryable", async () => {
    const store = createStore([
      createFailedRepurposingJob({
        result: {
          error: "Repurposing plan requires manual review.",
          error_code: "manual_review_required",
          retry_owner: "manual",
          review_required: true,
        },
        retry_count: 0,
      }),
    ]);
    const queues = createQueues();

    await expect(
      retryFailedContentJobs({
        assetUrlResolver: publicAssetResolver,
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

    expect(store.markUnretryable).toHaveBeenCalledWith({
      errorMessage: "Repurposing plan requires manual review.",
      job: expect.objectContaining({
        id: JOB_ID,
        job_type: "repurposing",
      }),
      now: NOW,
    });
    expect(store.claimForRetry).not.toHaveBeenCalled();
    expect(queues.add).not.toHaveBeenCalled();
  });

  it("marks unsupported job types as unretryable", async () => {
    const job = createFailedClipJob({
      job_type: "title_generation",
      payload: { prompt: "title" },
    });
    const store = createStore([job]);
    const queues = createQueues();

    await retryFailedContentJobs({
      assetUrlResolver: publicAssetResolver,
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
        assetUrlResolver: publicAssetResolver,
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
        assetUrlResolver: publicAssetResolver,
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

  it.each([
    [
      "clip http source URL",
      withPayload(
        createFailedClipJob(),
        {
          ...getPayload(createFailedClipJob()),
          source_url: "http://video.example.com/vod.mp4",
        },
      ),
    ],
    [
      "clip source URL with credentials",
      withPayload(
        createFailedClipJob(),
        {
          ...getPayload(createFailedClipJob()),
          source_url: "https://user:pass@video.example.com/vod.mp4",
        },
      ),
    ],
    [
      "transcription localhost VOD URL",
      withPayload(
        createFailedTranscriptionJob(),
        {
          ...getPayload(createFailedTranscriptionJob()),
          vod_asset_url: "https://localhost/vod.mp4",
        },
      ),
    ],
    [
      "transcription private VOD URL",
      withPayload(
        createFailedTranscriptionJob(),
        {
          ...getPayload(createFailedTranscriptionJob()),
          vod_asset_url: "https://10.0.0.5/vod.mp4",
        },
      ),
    ],
    [
      "repurposing link-local VOD URL",
      withPayload(
        createFailedRepurposingJob(),
        {
          ...getPayload(createFailedRepurposingJob()),
          vod_asset_url: "https://169.254.169.254/latest/meta-data",
        },
      ),
    ],
    [
      "repurposing reserved VOD URL",
      withPayload(
        createFailedRepurposingJob(),
        {
          ...getPayload(createFailedRepurposingJob()),
          vod_asset_url: "https://192.0.2.1/vod.mp4",
        },
      ),
    ],
  ])("marks unsafe asset payloads unretryable before requeue: %s", async (
    _name,
    job,
  ) => {
    const store = createStore([job]);
    const queues = createQueues();

    await expect(
      retryFailedContentJobs({
        assetUrlResolver: publicAssetResolver,
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

    expect(store.markUnretryable).toHaveBeenCalledWith({
      errorMessage: expect.stringMatching(/^Unsafe content job asset URL:/),
      job,
      now: NOW,
    });
    expect(store.claimForRetry).not.toHaveBeenCalled();
    expect(queues.add).not.toHaveBeenCalled();
  });

  it("marks payloads resolving to private IPs unretryable before requeue", async () => {
    const job = createFailedClipJob();
    const store = createStore([job]);
    const queues = createQueues();

    await expect(
      retryFailedContentJobs({
        assetUrlResolver: () => ["10.0.0.5"],
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

    expect(store.markUnretryable).toHaveBeenCalledWith({
      errorMessage:
        "Unsafe content job asset URL: Asset URL resolves to a non-public IP address.",
      job,
      now: NOW,
    });
    expect(store.claimForRetry).not.toHaveBeenCalled();
    expect(queues.add).not.toHaveBeenCalled();
  });
});
