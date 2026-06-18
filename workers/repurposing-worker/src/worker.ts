import type { Job } from "bullmq";
import type { RepurposingPlanFailureResult } from "@streamos/types";

import {
  AutomationServiceError,
  ProviderModelUnavailableError,
  ProviderRateLimitError,
  type RepurposingPlanAutomationRequest,
  type RepurposingPlanAutomationResponse,
} from "./automationClient.js";
import { repurposingPlanJobDataSchema } from "./jobSchema.js";
import type { RepurposingPlanContentJobStore } from "./contentJobStore.js";

export type RepurposingAutomationClient = {
  planRepurposing(
    payload: RepurposingPlanAutomationRequest,
  ): Promise<RepurposingPlanAutomationResponse>;
};

export type ProcessRepurposingPlanJobOptions = {
  automationClient: RepurposingAutomationClient;
  statusStore: RepurposingPlanContentJobStore;
};

export class PermanentRepurposingPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentRepurposingPlanError";
  }
}

export async function processRepurposingPlanJob(
  job: Pick<Job, "attemptsMade" | "data" | "discard" | "id" | "opts">,
  { automationClient, statusStore }: ProcessRepurposingPlanJobOptions,
): Promise<RepurposingPlanAutomationResponse> {
  const payload = repurposingPlanJobDataSchema.parse(job.data);
  const now = new Date();
  const maxRetries = getBullMqAttempts(job);
  const loadedJob = await statusStore.loadById({
    contentJobId: payload.content_job_id,
    queueJobId: payload.queue_job_id,
    userId: payload.user_id,
  });

  try {
    if (!loadedJob) {
      throw new PermanentRepurposingPlanError(
        `Repurposing content job ${payload.content_job_id} was not found for queue_job_id=${payload.queue_job_id}.`,
      );
    }

    if (loadedJob.payload.manual_review_required !== true) {
      throw new PermanentRepurposingPlanError(
        `Repurposing content job ${payload.content_job_id} must require manual review.`,
      );
    }

    await statusStore.updateById(payload.content_job_id, {
      error_message: null,
      last_retried_at: job.attemptsMade > 0 ? now.toISOString() : undefined,
      max_retries: maxRetries,
      retry_count: job.attemptsMade,
      started_at: now.toISOString(),
      status: "processing",
    });

    const result = await automationClient.planRepurposing({
      ...payload,
      manual_review_required: true,
    });

    await statusStore.updateById(payload.content_job_id, {
      completed_at: now.toISOString(),
      error_message: null,
      max_retries: maxRetries,
      result,
      retry_count: job.attemptsMade,
      status: "done",
    });

    return result;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    const hasRemainingAttempts = hasRemainingBullMqAttempts(job);
    const classification = classifyFailure(error);
    const retryable = classification.retryable && hasRemainingAttempts;
    const retryCount = classification.reviewRequired
      ? maxRetries
      : job.attemptsMade + 1;
    const nextAttemptInMs = retryable
      ? getBullMqBackoffDelayMs(job, job.attemptsMade + 1)
      : null;
    const failureResult: RepurposingPlanFailureResult = {
      error: errorMessage,
      error_code: classification.code,
      max_retries: maxRetries,
      next_attempt_in_ms: nextAttemptInMs,
      provider: classification.provider ?? null,
      retry_after_seconds: classification.retryAfterSeconds ?? null,
      retry_count: retryCount,
      retry_owner: classification.reviewRequired
        ? "manual"
        : retryable
          ? "bullmq"
          : null,
      retryable,
      review_required: classification.reviewRequired || undefined,
      upstream_status: classification.upstreamStatus ?? null,
    };

    await statusStore.updateById(payload.content_job_id, {
      completed_at: retryable ? undefined : now.toISOString(),
      error_message: errorMessage,
      last_retried_at: now.toISOString(),
      max_retries: maxRetries,
      next_retry_at: retryable
        ? new Date(now.getTime() + (nextAttemptInMs ?? 0)).toISOString()
        : null,
      result: failureResult,
      retry_count: retryCount,
      status: retryable ? "pending" : "failed",
    });

    if (error instanceof PermanentRepurposingPlanError || !retryable) {
      await job.discard();
    }

    throw error;
  }
}

function classifyFailure(error: unknown): {
  code: string;
  provider?: string;
  retryAfterSeconds?: number;
  retryable: boolean;
  reviewRequired: boolean;
  upstreamStatus?: number;
} {
  if (error instanceof ProviderRateLimitError) {
    return {
      code: "provider_rate_limited",
      provider: error.provider,
      retryAfterSeconds: error.retryAfterSeconds ?? undefined,
      retryable: true,
      reviewRequired: false,
      upstreamStatus: error.upstreamStatus,
    };
  }

  if (error instanceof ProviderModelUnavailableError) {
    return {
      code: "model_unavailable",
      provider: error.provider,
      retryable: true,
      reviewRequired: false,
      upstreamStatus: error.upstreamStatus,
    };
  }

  if (error instanceof AutomationServiceError) {
    return {
      code: error.code,
      provider: error.provider,
      retryAfterSeconds: error.retryAfterSeconds,
      retryable:
        error.retryable &&
        ![
          "invalid_input",
          "unsupported_target_platform",
          "budget_exceeded",
        ].includes(error.code),
      reviewRequired: [
        "asset_missing",
        "policy_blocked",
        "transcript_missing",
      ].includes(error.code),
      upstreamStatus: error.upstreamStatus,
    };
  }

  if (error instanceof PermanentRepurposingPlanError) {
    return {
      code: "manual_review_required",
      retryable: false,
      reviewRequired: true,
    };
  }

  return {
    code: "automation_service_error",
    retryable: false,
    reviewRequired: false,
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
