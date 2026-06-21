import type { JobsOptions } from "bullmq";
import {
  getPublicationExecutionJobId,
  PUBLICATION_EXECUTION_JOB_NAME,
  PUBLICATION_JOB_OPTIONS,
} from "@streamos/queue";
import type { PublicationExecutionJobPayload } from "@streamos/types/jobs";

import {
  buildPublicationExecutionRetryAt,
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
  queue: PublicationSchedulerQueue;
  store: PublicationSchedulerStore;
  workerId: string;
};

export type RunPublishingSchedulerTickResult = {
  claimed: number;
  failed: number;
  queued: number;
  recovered: number;
  scanned: number;
  skipped: number;
};

export async function runPublishingSchedulerTick({
  batchSize,
  claimTimeoutMs,
  now = new Date(),
  queue,
  store,
  workerId,
}: RunPublishingSchedulerTickOptions): Promise<RunPublishingSchedulerTickResult> {
  const result: RunPublishingSchedulerTickResult = {
    claimed: 0,
    failed: 0,
    queued: 0,
    recovered: 0,
    scanned: 0,
    skipped: 0,
  };

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
        row,
        store,
      });

      if (handled === "recovered") {
        result.recovered += 1;
      } else if (handled === "retryable") {
        result.failed += 1;
      } else {
        result.skipped += 1;
      }
    } catch (error) {
      console.error(
        "[publishing-scheduler-worker] stale claim recovery failed",
        {
          publicationId: row.id,
          error,
        },
      );
      result.failed += 1;
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
        row,
        store,
      });

      if (handled === "queued") {
        result.queued += 1;
      } else if (handled === "retryable") {
        result.failed += 1;
      } else {
        result.skipped += 1;
      }
    } catch (error) {
      console.error(
        "[publishing-scheduler-worker] publication enqueue failed",
        {
          publicationId: row.id,
          error,
        },
      );
      result.failed += 1;
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
  row,
  store,
}: {
  now: Date;
  queue: PublicationSchedulerQueue;
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

    await settleFailedPublication({
      errorMessage:
        error instanceof Error ? error.message : "Unknown enqueue error.",
      nextAttemptAt,
      queueJobId,
      row,
      status: failureStatus,
      store,
    });

    return retryable ? "retryable" : "permanent";
  }

  await settleQueuedPublication({
    now,
    queueJobId,
    row,
    store,
  });

  return "queued";
}

async function recoverStaleClaim({
  now,
  queue,
  row,
  store,
}: {
  now: Date;
  queue: PublicationSchedulerQueue;
  row: PublicationSchedulerExecutionRow;
  store: PublicationSchedulerStore;
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

  await settleFailedPublication({
    errorMessage:
      "Scheduler claim expired before the publication queue could be confirmed.",
    nextAttemptAt,
    queueJobId,
    row,
    status: failureStatus,
    store,
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
        error,
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
        error,
        publicationId: row.id,
        queueJobId,
        status,
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
