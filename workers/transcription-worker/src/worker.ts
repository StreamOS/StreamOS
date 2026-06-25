import {
  CLIP_GENERATION_JOB_NAME,
  type ClipGenerationJobData,
} from "@streamos/types";
import { getClipGenerationJobId } from "@streamos/queue";
import {
  type PublicHttpsAssetResolver,
  UnsafePublicHttpsAssetUrlError,
  validatePublicHttpsAssetUrl,
} from "@streamos/utils";
import type { Job, JobsOptions } from "bullmq";

import { isAutomationServiceError } from "./automationClient.js";
import type { AutomationTranscriptionResponse } from "./automationClient.js";
import { transcriptionTriggerJobDataSchema } from "./jobSchema.js";
import type { JobStatusStore } from "./statusStore.js";

export type TranscriptionAutomationClient = {
  processTranscription(payload: {
    asset_url: string;
    channel_id?: string;
    creator_id?: string;
    job_id: string;
    language: string;
    source_platform: string;
    stream_id: string;
  }): Promise<AutomationTranscriptionResponse>;
};

export type ProcessTranscriptionJobOptions = {
  assetUrlResolver?: PublicHttpsAssetResolver;
  automationClient: TranscriptionAutomationClient;
  clipGenerationQueue?: TranscriptionClipGenerationQueue;
  statusStore: JobStatusStore;
};

export type TranscriptionClipGenerationQueue = {
  add(
    name: typeof CLIP_GENERATION_JOB_NAME,
    data: ClipGenerationJobData,
    opts: JobsOptions,
  ): Promise<unknown>;
};

const clipGenerationJobOptions: JobsOptions = {
  attempts: 3,
  backoff: {
    delay: 30_000,
    type: "exponential",
  },
  removeOnComplete: {
    age: 86_400,
    count: 1_000,
  },
  removeOnFail: {
    age: 604_800,
  },
};

export async function processTranscriptionJob(
  job: Pick<Job, "attemptsMade" | "data" | "id" | "opts"> & {
    discard?: () => Promise<void> | void;
  },
  {
    assetUrlResolver,
    automationClient,
    clipGenerationQueue,
    statusStore,
  }: ProcessTranscriptionJobOptions,
): Promise<AutomationTranscriptionResponse> {
  const payload = transcriptionTriggerJobDataSchema.parse(job.data);
  const jobId = String(job.id ?? `transcription-${payload.stream_id}`);
  const maxRetries = getBullMqAttempts(job);
  let result: AutomationTranscriptionResponse;

  try {
    await validatePublicHttpsAssetUrl(payload.vod_asset_url, assetUrlResolver);

    await statusStore.update(jobId, payload, {
      last_retried_at:
        job.attemptsMade > 0 ? new Date().toISOString() : undefined,
      max_retries: maxRetries,
      retry_count: job.attemptsMade,
      status: "running",
    });

    result = await automationClient.processTranscription({
      asset_url: payload.vod_asset_url,
      channel_id: payload.channel_id,
      creator_id: payload.creator_id,
      job_id: jobId,
      language: payload.language,
      source_platform: payload.platform,
      stream_id: payload.stream_id,
    });

    await statusStore.update(jobId, payload, {
      last_retried_at:
        job.attemptsMade > 0 ? new Date().toISOString() : undefined,
      max_retries: maxRetries,
      result: {
        model: result.model,
        provider: result.provider,
        segments: result.segments,
        transcript: result.transcript,
      },
      retry_count: job.attemptsMade,
      status: "done",
    });
  } catch (error) {
    const attemptNumber = job.attemptsMade + 1;
    const isUnsafeAssetUrl = error instanceof UnsafePublicHttpsAssetUrlError;
    if (isUnsafeAssetUrl) {
      await job.discard?.();
    }

    const hasRemainingAttempts =
      !isUnsafeAssetUrl && hasRemainingBullMqAttempts(job);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    const failureResult = buildFailureResult({
      error,
      errorMessage,
      hasRemainingAttempts,
      job,
      maxRetries,
    });

    await statusStore.update(jobId, payload, {
      error_message: errorMessage,
      last_retried_at: new Date().toISOString(),
      max_retries: maxRetries,
      next_retry_at: null,
      result: failureResult,
      retry_count: attemptNumber,
      status: hasRemainingAttempts ? "pending" : "failed",
    });
    throw error;
  }

  if (clipGenerationQueue) {
    const clipPayload: ClipGenerationJobData = {
      creator_id: payload.creator_id,
      requested_by: payload.user_id,
      source_platform: payload.platform,
      source_url: payload.vod_asset_url,
      stream_id: payload.stream_id,
      transcript: result.transcript,
    };
    const clipJobId = getClipGenerationJobId(payload.stream_id);

    await clipGenerationQueue.add(CLIP_GENERATION_JOB_NAME, clipPayload, {
      ...clipGenerationJobOptions,
      jobId: clipJobId,
    });

    await statusStore.enqueueClipGeneration?.(clipJobId, clipPayload);
  }

  return result;
}

function buildFailureResult({
  error,
  errorMessage,
  hasRemainingAttempts,
  job,
  maxRetries,
}: {
  error: unknown;
  errorMessage: string;
  hasRemainingAttempts: boolean;
  job: Pick<Job, "attemptsMade" | "opts">;
  maxRetries: number;
}): Record<string, unknown> {
  const attemptNumber = job.attemptsMade + 1;
  const nextAttemptInMs = hasRemainingAttempts
    ? getBullMqBackoffDelayMs(job, attemptNumber)
    : null;

  if (isAutomationServiceError(error)) {
    return {
      error: errorMessage,
      error_code: error.code,
      http_status: error.httpStatus,
      max_retries: maxRetries,
      provider: error.provider ?? null,
      retry_after_seconds: error.retryAfterSeconds ?? null,
      retry_count: attemptNumber,
      retry_owner: hasRemainingAttempts ? "bullmq" : null,
      retryable: error.retryable,
      next_attempt_in_ms: nextAttemptInMs,
      upstream_status: error.upstreamStatus ?? null,
    };
  }

  return {
    error: errorMessage,
    error_code: "automation_service_error",
    max_retries: maxRetries,
    retry_count: attemptNumber,
    retry_owner: hasRemainingAttempts ? "bullmq" : null,
    retryable: hasRemainingAttempts,
    next_attempt_in_ms: nextAttemptInMs,
  };
}

function getBullMqAttempts(job: Pick<Job, "opts">): number {
  return typeof job.opts.attempts === "number" && job.opts.attempts > 0
    ? job.opts.attempts
    : 1;
}

function getBullMqBackoffDelayMs(
  job: Pick<Job, "opts">,
  attemptNumber: number,
): number | null {
  const backoff = job.opts.backoff;

  if (typeof backoff === "number") {
    return backoff;
  }

  if (!backoff || typeof backoff !== "object") {
    return null;
  }

  const delay =
    typeof backoff.delay === "number" && backoff.delay >= 0
      ? backoff.delay
      : null;

  if (delay === null) {
    return null;
  }

  if (backoff.type === "exponential") {
    return delay * 2 ** Math.max(attemptNumber - 1, 0);
  }

  return delay;
}

function hasRemainingBullMqAttempts(
  job: Pick<Job, "attemptsMade" | "opts">,
): boolean {
  return job.attemptsMade + 1 < getBullMqAttempts(job);
}
