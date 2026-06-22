import { randomUUID } from "node:crypto";
import type { JobsOptions } from "bullmq";
import {
  getPublicationExecutionJobId,
  PUBLICATION_EXECUTION_JOB_NAME,
  PUBLICATION_JOB_OPTIONS,
} from "@streamos/queue";
import type { PublicationExecutionJobPayload } from "@streamos/types/jobs";

import {
  buildPublicationExecutionRetryAt,
  type PublicationSchedulerRunAttemptKind,
  type PublicationSchedulerRunAttemptStatus,
  type PublicationSchedulerExecutionRow,
  type PublicationSchedulerStore,
} from "./publicationSchedulerStore.js";

export type PublicationSchedulerQueue = {
  add(
    name: typeof PUBLICATION_EXECUTION_JOB_NAME,
    data: PublicationExecutionJobPayload,
    opts?: JobsOptions,
  ): Promise<unknown>;
  getJob(jobId: string): Promise<unknown | null>;
};

export type RunPublishingSchedulerTickOptions = {
  batchSize: number;
  claimTimeoutMs: number;
  now?: Date;
  pollIntervalMs: number;
  queue: PublicationSchedulerQueue;
  store: PublicationSchedulerStore;
  workerId: string;
};

export type RunPublishingSchedulerTickResult = {
  claimed: number;
  failed: number;
  permanentFailed: number;
  queued: number;
  recovered: number;
  retryableFailed: number;
  scanned: number;
  skipped: number;
  stuckClaims: number;
};

export async function runPublishingSchedulerTick({
  batchSize,
  claimTimeoutMs,
  now = new Date(),
  queue,
  pollIntervalMs,
  store,
  workerId,
}: RunPublishingSchedulerTickOptions): Promise<RunPublishingSchedulerTickResult> {
  const result: RunPublishingSchedulerTickResult = {
    claimed: 0,
    failed: 0,
    permanentFailed: 0,
    queued: 0,
    recovered: 0,
    retryableFailed: 0,
    scanned: 0,
    skipped: 0,
    stuckClaims: 0,
  };
  const runId = randomUUID();
  const startedAt = now.toISOString();
  let lastAttemptAt: string | null = startedAt;
  let lastErrorCode: string | null = null;
  let lastErrorMessage: string | null = null;
  let runStarted = false;

  try {
    await store.startSchedulerRun({
      batchSize,
      claimTimeoutMs,
      metadata: {
        batch_size: batchSize,
        claim_timeout_ms: claimTimeoutMs,
        run_id: runId,
        poll_interval_ms: pollIntervalMs,
        scheduler_worker_id: workerId,
      },
      pollIntervalMs,
      runId,
      startedAt,
      workerId,
    });
    runStarted = true;
  } catch (error) {
    console.error("[publishing-scheduler-worker] scheduler run start failed", {
      error: getSchedulerErrorMessage(error),
      runId,
      workerId,
    });
  }

  const staleRows = await store.listStaleClaimedPublications({
    batchSize,
    claimTimeoutMs,
    now,
  });
  result.scanned += staleRows.length;

  for (const row of staleRows) {
    try {
      const handled = await recoverStaleClaim({
        now,
        queue,
        runId,
        row,
        store,
        result,
      });

      if (handled === "recovered") {
        result.recovered += 1;
      } else if (handled === "retryable") {
        result.failed += 1;
        result.retryableFailed += 1;
        lastErrorCode = "stuck_claim";
        lastErrorMessage =
          "Scheduler claim expired before the publication queue could be confirmed.";
      } else if (handled === "permanent") {
        result.failed += 1;
        result.permanentFailed += 1;
        lastErrorCode = "stuck_claim";
        lastErrorMessage =
          "Scheduler claim expired before the publication queue could be confirmed.";
      } else {
        result.skipped += 1;
      }
      lastAttemptAt = new Date().toISOString();
    } catch (error) {
      console.error(
        "[publishing-scheduler-worker] stale claim recovery failed",
        {
          publicationId: row.id,
          error: getSchedulerErrorMessage(error),
          runId,
        },
      );
      result.failed += 1;
      result.retryableFailed += 1;
      lastAttemptAt = new Date().toISOString();
      lastErrorCode = "stale_claim_recovery_failed";
      lastErrorMessage = getSchedulerErrorMessage(error);
    }
  }

  const claimedRows = await store.claimDuePublications({
    batchSize,
    claimTimeoutMs,
    now,
    workerId,
  });
  result.scanned += claimedRows.length;

  for (const row of claimedRows) {
    try {
      const handled = await enqueuePublicationExecution({
        now,
        queue,
        runId,
        row,
        store,
      });

      if (handled === "queued") {
        result.claimed += 1;
        result.queued += 1;
      } else if (handled === "retryable") {
        result.claimed += 1;
        result.failed += 1;
        result.retryableFailed += 1;
        lastErrorCode = "queue_enqueue_failed";
        lastErrorMessage = "Publication queue enqueue failed.";
      } else if (handled === "permanent") {
        result.claimed += 1;
        result.failed += 1;
        result.permanentFailed += 1;
        lastErrorCode = "queue_enqueue_failed_permanent";
        lastErrorMessage = "Publication queue enqueue failed permanently.";
      } else {
        result.claimed += 1;
        result.skipped += 1;
      }
      lastAttemptAt = new Date().toISOString();
    } catch (error) {
      console.error(
        "[publishing-scheduler-worker] publication enqueue failed",
        {
          publicationId: row.id,
          error: getSchedulerErrorMessage(error),
          runId,
        },
      );
      result.failed += 1;
      result.permanentFailed += 1;
      lastAttemptAt = new Date().toISOString();
      lastErrorCode = "publication_enqueue_failed";
      lastErrorMessage = getSchedulerErrorMessage(error);
    }
  }

  if (runStarted) {
    const runStatus =
      result.failed > 0
        ? result.queued > 0 || result.recovered > 0
          ? "completed_with_warnings"
          : "failed"
        : "completed";

    try {
      await store.finalizeSchedulerRun({
        completedAt: new Date().toISOString(),
        dueClaimCount: claimedRows.length,
        lastAttemptAt,
        lastErrorCode,
        lastErrorMessage,
        metadata: {
          batch_size: batchSize,
          claim_timeout_ms: claimTimeoutMs,
          poll_interval_ms: pollIntervalMs,
          scheduler_worker_id: workerId,
          run_id: runId,
        },
        permanentFailedCount: result.permanentFailed,
        queuedCount: result.queued,
        recoveredCount: result.recovered,
        retryableFailedCount: result.retryableFailed,
        runId,
        runStatus,
        scannedCount: result.scanned,
        skippedCount: result.skipped,
        staleClaimCount: staleRows.length,
        stuckClaimCount: result.stuckClaims,
      });
    } catch (error) {
      console.error(
        "[publishing-scheduler-worker] scheduler run finalize failed",
        {
          error: getSchedulerErrorMessage(error),
          runId,
          workerId,
        },
      );
    }
  }

  return result;
}

type ExecutionOutcome =
  | "queued"
  | "retryable"
  | "permanent"
  | "recovered"
  | "skipped";

async function enqueuePublicationExecution({
  now,
  queue,
  runId,
  row,
  store,
}: {
  now: Date;
  queue: PublicationSchedulerQueue;
  runId: string;
  row: PublicationSchedulerExecutionRow;
  store: PublicationSchedulerStore;
}): Promise<ExecutionOutcome> {
  const queueJobId =
    row.schedule_execution_queue_job_id ?? getPublicationExecutionJobId(row.id);
  const payload: PublicationExecutionJobPayload = {
    content_publication_id: row.id,
    target_platform: row.target_platform,
    user_id: row.user_id,
  };

  try {
    await queue.add(PUBLICATION_EXECUTION_JOB_NAME, payload, {
      ...PUBLICATION_JOB_OPTIONS,
      jobId: queueJobId,
    });
  } catch (error) {
    const existingJob = await queue.getJob(queueJobId);

    if (existingJob) {
      await settleQueuedPublication({
        now,
        queueJobId,
        row,
        store,
      });
      await recordSchedulerAttemptSafely({
        attemptCount: row.schedule_execution_attempt_count,
        attemptKind: "due_claim",
        attemptStatus: "queued",
        claimedAt: row.schedule_execution_claimed_at,
        claimedBy: row.schedule_execution_claimed_by,
        contentPublicationId: row.id,
        errorCode: null,
        errorMessage: null,
        metadata: buildSchedulerAttemptMetadata(row, {
          queue_job_already_exists: true,
          queue_job_id: queueJobId,
        }),
        nextAttemptAt: null,
        queueJobId,
        retryable: false,
        runId,
        scheduledAtUtc: row.scheduled_at_utc,
        source: "publishing-scheduler-worker",
        stuckClaim: false,
        store,
        userId: row.user_id,
      });
      return "queued";
    }

    const retryable =
      row.schedule_execution_attempt_count < row.schedule_execution_max_retries;
    const failureStatus = retryable ? "failed_retryable" : "failed_permanent";
    const nextAttemptAt = retryable
      ? buildPublicationExecutionRetryAt(
          now,
          row.schedule_execution_attempt_count,
        )
      : null;
    const errorCode = retryable
      ? "queue_enqueue_failed"
      : "queue_enqueue_failed_permanent";
    const errorMessage =
      error instanceof Error ? error.message : "Unknown enqueue error.";

    await settleFailedPublication({
      errorMessage,
      nextAttemptAt,
      queueJobId,
      row,
      status: failureStatus,
      store,
    });
    await recordSchedulerAttemptSafely({
      attemptCount: row.schedule_execution_attempt_count,
      attemptKind: "due_claim",
      attemptStatus: retryable ? "retryable_failed" : "permanent_failed",
      claimedAt: row.schedule_execution_claimed_at,
      claimedBy: row.schedule_execution_claimed_by,
      contentPublicationId: row.id,
      errorCode,
      errorMessage,
      metadata: buildSchedulerAttemptMetadata(row, {
        queue_job_id: queueJobId,
        retryable,
        retry_count: row.schedule_execution_attempt_count,
      }),
      nextAttemptAt,
      queueJobId,
      retryable,
      runId,
      scheduledAtUtc: row.scheduled_at_utc,
      source: "publishing-scheduler-worker",
      stuckClaim: false,
      store,
      userId: row.user_id,
    });

    return retryable ? "retryable" : "permanent";
  }

  await settleQueuedPublication({
    now,
    queueJobId,
    row,
    store,
  });
  await recordSchedulerAttemptSafely({
    attemptCount: row.schedule_execution_attempt_count,
    attemptKind: "due_claim",
    attemptStatus: "queued",
    claimedAt: row.schedule_execution_claimed_at,
    claimedBy: row.schedule_execution_claimed_by,
    contentPublicationId: row.id,
    errorCode: null,
    errorMessage: null,
    metadata: buildSchedulerAttemptMetadata(row, {
      queue_job_id: queueJobId,
      queue_job_queued: true,
    }),
    nextAttemptAt: null,
    queueJobId,
    retryable: false,
    runId,
    scheduledAtUtc: row.scheduled_at_utc,
    source: "publishing-scheduler-worker",
    stuckClaim: false,
    store,
    userId: row.user_id,
  });

  return "queued";
}

async function recoverStaleClaim({
  now,
  queue,
  runId,
  row,
  store,
  result,
}: {
  now: Date;
  queue: PublicationSchedulerQueue;
  runId: string;
  row: PublicationSchedulerExecutionRow;
  store: PublicationSchedulerStore;
  result: RunPublishingSchedulerTickResult;
}): Promise<ExecutionOutcome> {
  const queueJobId =
    row.schedule_execution_queue_job_id ?? getPublicationExecutionJobId(row.id);
  const existingJob = await queue.getJob(queueJobId);

  if (existingJob) {
    await settleQueuedPublication({
      now,
      queueJobId,
      row,
      store,
    });
    await recordSchedulerAttemptSafely({
      attemptCount: row.schedule_execution_attempt_count,
      attemptKind: "stale_claim",
      attemptStatus: "recovered",
      claimedAt: row.schedule_execution_claimed_at,
      claimedBy: row.schedule_execution_claimed_by,
      contentPublicationId: row.id,
      errorCode: null,
      errorMessage: null,
      metadata: buildSchedulerAttemptMetadata(row, {
        queue_job_id: queueJobId,
        queue_job_recovered: true,
      }),
      nextAttemptAt: null,
      queueJobId,
      retryable: false,
      runId,
      scheduledAtUtc: row.scheduled_at_utc,
      source: "publishing-scheduler-worker",
      stuckClaim: false,
      store,
      userId: row.user_id,
    });
    return "recovered";
  }

  const retryable =
    row.schedule_execution_attempt_count < row.schedule_execution_max_retries;
  const failureStatus = retryable ? "failed_retryable" : "failed_permanent";
  const nextAttemptAt = retryable
    ? buildPublicationExecutionRetryAt(
        now,
        row.schedule_execution_attempt_count,
      )
    : null;
  const errorMessage =
    "Scheduler claim expired before the publication queue could be confirmed.";

  await settleFailedPublication({
    errorMessage,
    nextAttemptAt,
    queueJobId,
    row,
    status: failureStatus,
    store,
  });
  result.stuckClaims += 1;
  await recordSchedulerAttemptSafely({
    attemptCount: row.schedule_execution_attempt_count,
    attemptKind: "stale_claim",
    attemptStatus: "stuck_claim",
    claimedAt: row.schedule_execution_claimed_at,
    claimedBy: row.schedule_execution_claimed_by,
    contentPublicationId: row.id,
    errorCode: "stuck_claim",
    errorMessage,
    metadata: buildSchedulerAttemptMetadata(row, {
      queue_job_id: queueJobId,
      retry_count: row.schedule_execution_attempt_count,
      retryable,
      stuck_claim: true,
    }),
    nextAttemptAt,
    queueJobId,
    retryable,
    runId,
    scheduledAtUtc: row.scheduled_at_utc,
    source: "publishing-scheduler-worker",
    stuckClaim: true,
    store,
    userId: row.user_id,
  });

  return retryable ? "retryable" : "permanent";
}

async function settleQueuedPublication({
  now,
  queueJobId,
  row,
  store,
}: {
  now: Date;
  queueJobId: string;
  row: PublicationSchedulerExecutionRow;
  store: PublicationSchedulerStore;
}): Promise<void> {
  try {
    await store.patchPublicationById({
      payload: {
        publication_status: "queued",
        schedule_execution_claimed_at: row.schedule_execution_claimed_at,
        schedule_execution_claimed_by: row.schedule_execution_claimed_by,
        schedule_execution_completed_at: now.toISOString(),
        schedule_execution_error_code: null,
        schedule_execution_error_message: null,
        schedule_execution_last_attempt_at: now.toISOString(),
        schedule_execution_metadata: mergeSchedulerMetadata(row, {
          queue_job_id: queueJobId,
          queued_at: now.toISOString(),
          queued_by:
            row.schedule_execution_claimed_by ?? "publishing-scheduler-worker",
        }),
        schedule_execution_next_attempt_at: null,
        schedule_execution_queue_job_id: queueJobId,
        schedule_execution_status: "queued",
      },
      publicationId: row.id,
      userId: row.user_id,
    });

    await store.appendEvent({
      actorId: row.requested_by,
      eventType: "queued",
      metadata: {
        content_job_id: row.content_job_id,
        queue_job_id: queueJobId,
        schedule_execution_attempt_count: row.schedule_execution_attempt_count,
        schedule_execution_claimed_at: row.schedule_execution_claimed_at,
        schedule_execution_claimed_by: row.schedule_execution_claimed_by,
        schedule_execution_metadata: row.schedule_execution_metadata,
        scheduled_at_utc: row.scheduled_at_utc,
        target_platform: row.target_platform,
      },
      previousPublicationStatus: row.publication_status,
      publicationId: row.id,
      publicationStatus: "queued",
      source: "publishing-scheduler-worker",
      userId: row.user_id,
    });
  } catch (error) {
    console.error(
      "[publishing-scheduler-worker] failed to settle queued publication",
      {
        error: getSchedulerErrorMessage(error),
        publicationId: row.id,
        queueJobId,
      },
    );
  }
}

async function settleFailedPublication({
  errorMessage,
  nextAttemptAt,
  queueJobId,
  row,
  status,
  store,
}: {
  errorMessage: string;
  nextAttemptAt: string | null;
  queueJobId: string;
  row: PublicationSchedulerExecutionRow;
  status: "failed_retryable" | "failed_permanent";
  store: PublicationSchedulerStore;
}): Promise<void> {
  try {
    await store.patchPublicationById({
      payload: {
        publication_status: status,
        schedule_execution_completed_at: null,
        schedule_execution_error_code:
          status === "failed_retryable"
            ? "queue_enqueue_failed"
            : "queue_enqueue_failed_permanent",
        schedule_execution_error_message: errorMessage,
        schedule_execution_last_attempt_at: new Date().toISOString(),
        schedule_execution_metadata: mergeSchedulerMetadata(row, {
          error_message: errorMessage,
          next_attempt_at: nextAttemptAt,
          queue_job_id: queueJobId,
          retry_count: row.schedule_execution_attempt_count,
          retryable: status === "failed_retryable",
        }),
        schedule_execution_next_attempt_at: nextAttemptAt,
        schedule_execution_queue_job_id: queueJobId,
        schedule_execution_status: status,
      },
      publicationId: row.id,
      userId: row.user_id,
    });

    await store.appendEvent({
      actorId: row.requested_by,
      eventType: status,
      metadata: {
        content_job_id: row.content_job_id,
        error_message: errorMessage,
        next_attempt_at: nextAttemptAt,
        queue_job_id: queueJobId,
        retry_count: row.schedule_execution_attempt_count,
        retry_owner: "bullmq",
        retryable: status === "failed_retryable",
        scheduled_at_utc: row.scheduled_at_utc,
        target_platform: row.target_platform,
      },
      previousPublicationStatus: row.publication_status,
      publicationId: row.id,
      publicationStatus: status,
      source: "publishing-scheduler-worker",
      userId: row.user_id,
    });
  } catch (error) {
    console.error(
      "[publishing-scheduler-worker] failed to settle publication failure",
      {
        error: getSchedulerErrorMessage(error),
        publicationId: row.id,
        queueJobId,
        status,
      },
    );
  }
}

async function recordSchedulerAttemptSafely(input: {
  attemptCount?: number;
  attemptKind: PublicationSchedulerRunAttemptKind;
  attemptStatus: PublicationSchedulerRunAttemptStatus;
  claimedAt: string | null;
  claimedBy: string | null;
  contentPublicationId: string;
  errorCode: string | null;
  errorMessage: string | null;
  metadata: Record<string, unknown>;
  nextAttemptAt: string | null;
  queueJobId: string | null;
  retryable: boolean;
  runId: string;
  scheduledAtUtc: string | null;
  source?: string;
  stuckClaim: boolean;
  store: PublicationSchedulerStore;
  userId: string;
}): Promise<void> {
  try {
    await input.store.recordSchedulerRunAttempt({
      attemptCount: input.attemptCount ?? 0,
      attemptKind: input.attemptKind,
      attemptStatus: input.attemptStatus,
      claimedAt: input.claimedAt,
      claimedBy: input.claimedBy,
      contentPublicationId: input.contentPublicationId,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      metadata: input.metadata,
      nextAttemptAt: input.nextAttemptAt,
      queueJobId: input.queueJobId,
      retryable: input.retryable,
      runId: input.runId,
      scheduledAtUtc: input.scheduledAtUtc,
      source: input.source ?? "publishing-scheduler-worker",
      stuckClaim: input.stuckClaim,
      userId: input.userId,
    });
  } catch (error) {
    console.error(
      "[publishing-scheduler-worker] scheduler attempt record failed",
      {
        contentPublicationId: input.contentPublicationId,
        error: getSchedulerErrorMessage(error),
        runId: input.runId,
      },
    );
  }
}

function mergeSchedulerMetadata(
  row: PublicationSchedulerExecutionRow,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...row.schedule_execution_metadata,
    ...patch,
    schedule_execution_attempt_count: row.schedule_execution_attempt_count,
    schedule_execution_status: row.schedule_execution_status,
  };
}

function buildSchedulerAttemptMetadata(
  row: PublicationSchedulerExecutionRow,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...mergeSchedulerMetadata(row, patch),
    claimed_at: row.schedule_execution_claimed_at,
    claimed_by: row.schedule_execution_claimed_by,
    scheduled_at_utc: row.scheduled_at_utc,
    user_id: row.user_id,
  };
}

function getSchedulerErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return sanitizeSchedulerText(error.message);
  }

  return sanitizeSchedulerText(String(error));
}

function sanitizeSchedulerText(value: string): string {
  return value
    .replace(/rediss?:\/\/\S+/gi, "[redacted-redis-url]")
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/\bsk-[A-Za-z0-9_-]+\b/gi, "[redacted-openai-key]")
    .replace(/bearer\s+[A-Za-z0-9._-]+/gi, "bearer [redacted]")
    .replace(/\b(token|secret|password|apikey)\s*=\s*\S+/gi, "$1=[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4_000);
}
