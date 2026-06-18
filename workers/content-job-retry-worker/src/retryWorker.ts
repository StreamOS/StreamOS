import { ZodError } from "zod";

import type {
  ContentJobRetryStore,
  RetryableContentJob,
} from "./contentJobStore.js";
import {
  clipGenerationPayloadSchema,
  CLIP_GENERATION_JOB_NAME,
  repurposingPlanJobPayloadSchema,
  REPURPOSING_PLAN_JOB_NAME,
  transcriptionTriggerJobDataSchema,
  TRANSCRIPTION_TRIGGER_JOB_NAME,
} from "./jobSchemas.js";
import type {
  AddRetryQueueJobInput,
  ContentJobRetryQueues,
  RetryQueueJob,
} from "./retryQueues.js";

export type RetryFailedContentJobsOptions = {
  bullMqAttempts: number;
  bullMqBackoffMs: number;
  now?: Date;
  queues: ContentJobRetryQueues;
  store: ContentJobRetryStore;
};

export type RetryFailedContentJobsResult = {
  claimed: number;
  exhausted: number;
  failed: number;
  requeued: number;
  scanned: number;
  skipped: number;
};

function getQueueJobId(job: RetryableContentJob, retryCount: number): string {
  return `content-job-${job.job_type}-${job.id}-retry-${retryCount}`;
}

function getNextRetryAt({
  backoffMs,
  now,
  retryCount,
}: {
  backoffMs: number;
  now: Date;
  retryCount: number;
}): Date {
  const multiplier = 2 ** Math.max(retryCount - 1, 0);
  return new Date(now.getTime() + backoffMs * multiplier);
}

function buildRepurposingQueueJob(
  job: RetryableContentJob,
  queueJobId: string,
): RetryQueueJob {
  const durablePayload = repurposingPlanJobPayloadSchema.parse(job.payload);

  return {
    data: {
      asset_reference: {
        kind: "vod",
        status: "asset_available",
        url: durablePayload.vod_asset_url,
      },
      brand_context: durablePayload.brand_profile_id
        ? {
            brand_profile_id: durablePayload.brand_profile_id,
          }
        : undefined,
      content_job_id: job.id,
      content_policy_hints: durablePayload.content_policy_profile
        ? {
            content_policy_profile: durablePayload.content_policy_profile,
          }
        : undefined,
      language: undefined,
      locale: undefined,
      manual_review_required: true,
      provider: durablePayload.source_provider,
      provider_video_id: durablePayload.source_video_id,
      queue_job_id: queueJobId,
      source_event_type: "video.published",
      source_metadata: durablePayload,
      target_platforms: durablePayload.target_platforms,
      transcript_reference: durablePayload.stream_id
        ? {
            stream_id: durablePayload.stream_id,
          }
        : undefined,
      user_id: job.user_id,
    },
    name: REPURPOSING_PLAN_JOB_NAME,
    queue: "repurposing",
  };
}

function buildRetryQueueJob(
  job: RetryableContentJob,
  queueJobId: string,
): RetryQueueJob {
  if (job.job_type === "clip_scoring") {
    return {
      data: clipGenerationPayloadSchema.parse(job.payload),
      name: CLIP_GENERATION_JOB_NAME,
      queue: "clip_generation",
    };
  }

  if (job.job_type === "repurposing") {
    return buildRepurposingQueueJob(job, queueJobId);
  }

  if (job.job_type === "transcription") {
    return {
      data: transcriptionTriggerJobDataSchema.parse(job.payload),
      name: TRANSCRIPTION_TRIGGER_JOB_NAME,
      queue: "transcription",
    };
  }

  throw new Error(`content job type ${job.job_type} is not retryable yet.`);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ZodError) {
    return `Invalid content job retry payload: ${error.message}`;
  }

  return error instanceof Error ? error.message : "Unknown retry error.";
}

export async function retryFailedContentJobs({
  bullMqAttempts,
  bullMqBackoffMs,
  now = new Date(),
  queues,
  store,
}: RetryFailedContentJobsOptions): Promise<RetryFailedContentJobsResult> {
  const jobs = await store.listFailedJobs(now);
  const result: RetryFailedContentJobsResult = {
    claimed: 0,
    exhausted: 0,
    failed: 0,
    requeued: 0,
    scanned: jobs.length,
    skipped: 0,
  };

  for (const job of jobs) {
    const effectiveMaxRetries = job.max_retries;

    if (isManualReviewRequiredRepurposingJob(job)) {
      await store.markUnretryable({
        errorMessage: "Repurposing plan requires manual review.",
        job,
        now,
      });
      result.exhausted += 1;
      continue;
    }

    if (job.retry_count >= effectiveMaxRetries) {
      result.exhausted += 1;
      continue;
    }

    const retryCount = job.retry_count + 1;
    const queueJobId = getQueueJobId(job, retryCount);
    let retryQueueJob: RetryQueueJob;

    try {
      retryQueueJob = buildRetryQueueJob(job, queueJobId);
    } catch (error) {
      await store.markUnretryable({
        errorMessage: getErrorMessage(error),
        job,
        now,
      });
      result.exhausted += 1;
      continue;
    }

    const claimed = await store.claimForRetry({
      job,
      now,
      queueJobId,
      retryCount,
    });

    if (!claimed) {
      result.skipped += 1;
      continue;
    }

    result.claimed += 1;

    const queueInput: AddRetryQueueJobInput = {
      ...retryQueueJob,
      backoffMs: bullMqBackoffMs,
      bullMqAttempts,
      queueJobId,
    };

    try {
      await queues.add(queueInput);
      result.requeued += 1;
    } catch (error) {
      await store.markRequeueFailed({
        errorMessage: getErrorMessage(error),
        jobId: job.id,
        nextRetryAt:
          retryCount >= effectiveMaxRetries
            ? null
            : getNextRetryAt({
                backoffMs: bullMqBackoffMs,
                now,
                retryCount,
              }),
        now,
        queueJobId,
      });
      result.failed += 1;
    }
  }

  return result;
}

function isManualReviewRequiredRepurposingJob(
  job: RetryableContentJob,
): boolean {
  if (job.job_type !== "repurposing") {
    return false;
  }

  if (!isRecord(job.result)) {
    return false;
  }

  return (
    job.result.review_required === true || job.result.retry_owner === "manual"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
