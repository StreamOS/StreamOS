import { ZodError } from "zod";

import type {
  ContentJobRetryStore,
  RetryableContentJob,
} from "./contentJobStore.js";
import {
  clipGenerationPayloadSchema,
  CLIP_GENERATION_JOB_NAME,
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

function buildRetryQueueJob(job: RetryableContentJob): RetryQueueJob {
  if (job.job_type === "clip_scoring") {
    return {
      data: clipGenerationPayloadSchema.parse(job.payload),
      name: CLIP_GENERATION_JOB_NAME,
      queue: "clip_generation",
    };
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

    if (job.retry_count >= effectiveMaxRetries) {
      result.exhausted += 1;
      continue;
    }

    const retryCount = job.retry_count + 1;
    let retryQueueJob: RetryQueueJob;

    try {
      retryQueueJob = buildRetryQueueJob(job);
    } catch (error) {
      await store.markUnretryable({
        errorMessage: getErrorMessage(error),
        job,
        now,
      });
      result.exhausted += 1;
      continue;
    }

    const queueJobId = getQueueJobId(job, retryCount);
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
