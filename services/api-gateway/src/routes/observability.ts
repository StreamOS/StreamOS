import express from "express";
import type { Router } from "express";
import { z } from "zod";

import {
  createSupabaseRestClient,
  readSupabaseRows,
  type SupabaseRestClient,
} from "../lib/supabaseRest.js";

type SchedulerRunStatus =
  | "running"
  | "completed"
  | "completed_with_warnings"
  | "failed"
  | "canceled"
  | "unknown";

type SchedulerRunRow = {
  batch_size: number;
  claim_timeout_ms: number;
  completed_at: string | null;
  created_at: string;
  due_claim_count: number;
  id: string;
  last_attempt_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  metadata: Record<string, unknown>;
  permanent_failed_count: number;
  poll_interval_ms: number;
  queued_count: number;
  recovered_count: number;
  retryable_failed_count: number;
  run_status: SchedulerRunStatus;
  scanned_count: number;
  scheduler_name: string;
  skipped_count: number;
  started_at: string;
  stale_claim_count: number;
  stuck_claim_count: number;
  updated_at: string;
  worker_id: string;
};

type SchedulerRunAttemptRow = {
  attempt_count: number;
  attempt_kind: "stale_claim" | "due_claim";
  attempt_status:
    | "recovered"
    | "queued"
    | "retryable_failed"
    | "permanent_failed"
    | "skipped"
    | "stuck_claim";
  claimed_at: string | null;
  claimed_by: string | null;
  content_publication_id: string;
  created_at: string;
  error_code: string | null;
  error_message: string | null;
  id: string;
  metadata: Record<string, unknown>;
  next_attempt_at: string | null;
  queue_job_id: string | null;
  retryable: boolean;
  scheduled_at_utc: string | null;
  scheduler_run_id: string;
  source: string;
  stuck_claim: boolean;
  user_id: string;
};

const schedulerObservabilityQuerySchema = z.object({
  attempt_limit: z.coerce.number().int().min(1).max(50).default(20),
  run_limit: z.coerce.number().int().min(1).max(20).default(5),
  scheduler_name: z
    .string()
    .trim()
    .min(1)
    .max(220)
    .default("publishing-scheduler-worker"),
});

const SAFE_RUN_METADATA_KEYS = new Set([
  "batch_size",
  "claim_timeout_ms",
  "poll_interval_ms",
  "run_id",
  "scheduler_worker_id",
]);

const SAFE_ATTEMPT_METADATA_KEYS = new Set([
  "attempt_count",
  "claimed_at",
  "claimed_by",
  "queue_job_already_exists",
  "queue_job_id",
  "queue_job_queued",
  "queue_job_recovered",
  "retry_count",
  "retryable",
  "schedule_execution_attempt_count",
  "schedule_execution_status",
  "scheduled_at_utc",
  "stuck_claim",
  "user_id",
]);

export function createSchedulerObservabilityRouter({
  fetchImpl = fetch,
}: {
  fetchImpl?: typeof fetch;
} = {}): Router {
  const router = express.Router();

  router.get("/scheduler", async (request, response) => {
    const parsedQuery = schedulerObservabilityQuerySchema.safeParse(
      request.query,
    );

    if (!parsedQuery.success) {
      response.status(400).json({
        error: "invalid_scheduler_observability_query",
        issues: parsedQuery.error.issues,
      });
      return;
    }

    let supabase: SupabaseRestClient;

    try {
      supabase = createSupabaseRestClient({ fetchImpl });
    } catch (error) {
      response.status(503).json({
        error: "scheduler_observability_unavailable",
        message:
          error instanceof Error
            ? sanitizeSchedulerText(error.message)
            : "Scheduler observability is unavailable.",
      });
      return;
    }

    try {
      const query = parsedQuery.data;
      const recentRuns = await readSupabaseRows<SchedulerRunRow>({
        client: supabase,
        params: {
          limit: String(query.run_limit),
          order: "started_at.desc,id.desc",
          scheduler_name: `eq.${query.scheduler_name}`,
          select:
            "batch_size,claim_timeout_ms,completed_at,created_at,due_claim_count,id,last_attempt_at,last_error_code,last_error_message,metadata,permanent_failed_count,poll_interval_ms,queued_count,recovered_count,retryable_failed_count,run_status,scanned_count,scheduler_name,skipped_count,started_at,stale_claim_count,stuck_claim_count,updated_at,worker_id",
        },
        table: "content_publication_scheduler_runs",
      });
      const recentAttempts =
        recentRuns.length === 0
          ? []
          : await readSupabaseRows<SchedulerRunAttemptRow>({
              client: supabase,
              params: {
                limit: String(query.attempt_limit),
                order: "created_at.desc,id.desc",
                scheduler_run_id: `in.(${recentRuns
                  .map((run) => run.id)
                  .join(",")})`,
                select:
                  "attempt_count,attempt_kind,attempt_status,claimed_at,claimed_by,content_publication_id,created_at,error_code,error_message,id,metadata,next_attempt_at,queue_job_id,retryable,scheduled_at_utc,scheduler_run_id,source,stuck_claim,user_id",
              },
              table: "content_publication_scheduler_run_attempts",
            });

      response.status(200).json({
        attempt_limit: query.attempt_limit,
        latest_run: recentRuns[0] ? mapRun(recentRuns[0]) : null,
        recent_attempts: recentAttempts.map((attempt) => mapAttempt(attempt)),
        recent_runs: recentRuns.map((run) => mapRun(run)),
        run_limit: query.run_limit,
        scheduler_name: query.scheduler_name,
        status: "scheduler_observability_ready",
        summary: buildSummary(recentRuns, recentAttempts),
      });
    } catch (error) {
      response.status(502).json({
        error: "scheduler_observability_failed",
        message:
          error instanceof Error
            ? sanitizeSchedulerText(error.message)
            : "Scheduler observability snapshot could not be loaded.",
      });
    }
  });

  return router;
}

function buildSummary(
  runs: SchedulerRunRow[],
  attempts: SchedulerRunAttemptRow[],
): Record<string, unknown> {
  return {
    attempt_count: attempts.length,
    completed_run_count: runs.filter((run) => run.completed_at !== null).length,
    failed_run_count: runs.filter((run) => run.run_status === "failed").length,
    last_error_code: runs[0]
      ? sanitizeSchedulerText(runs[0].last_error_code)
      : null,
    last_error_message: runs[0]
      ? sanitizeSchedulerText(runs[0].last_error_message)
      : null,
    latest_run_status: runs[0]?.run_status ?? null,
    permanent_failed_count: sumRuns(runs, "permanent_failed_count"),
    queued_count: sumRuns(runs, "queued_count"),
    recovered_count: sumRuns(runs, "recovered_count"),
    retryable_failed_count: sumRuns(runs, "retryable_failed_count"),
    run_count: runs.length,
    scanned_count: sumRuns(runs, "scanned_count"),
    skipped_count: sumRuns(runs, "skipped_count"),
    stale_claim_count: sumRuns(runs, "stale_claim_count"),
    stuck_claim_count: sumRuns(runs, "stuck_claim_count"),
    stuck_attempt_count: attempts.filter((attempt) => attempt.stuck_claim)
      .length,
  };
}

function sumRuns(runs: SchedulerRunRow[], key: keyof SchedulerRunRow): number {
  return runs.reduce((total, run) => {
    const value = run[key];
    return typeof value === "number" ? total + value : total;
  }, 0);
}

function mapRun(run: SchedulerRunRow): Record<string, unknown> {
  return {
    batch_size: run.batch_size,
    claim_timeout_ms: run.claim_timeout_ms,
    completed_at: run.completed_at,
    created_at: run.created_at,
    due_claim_count: run.due_claim_count,
    id: run.id,
    last_attempt_at: run.last_attempt_at,
    last_error_code: sanitizeSchedulerText(run.last_error_code),
    last_error_message: sanitizeSchedulerText(run.last_error_message),
    metadata: pickSafeMetadata(run.metadata, SAFE_RUN_METADATA_KEYS),
    permanent_failed_count: run.permanent_failed_count,
    poll_interval_ms: run.poll_interval_ms,
    queued_count: run.queued_count,
    recovered_count: run.recovered_count,
    retryable_failed_count: run.retryable_failed_count,
    run_status: run.run_status,
    scanned_count: run.scanned_count,
    scheduler_name: run.scheduler_name,
    skipped_count: run.skipped_count,
    started_at: run.started_at,
    stale_claim_count: run.stale_claim_count,
    stuck_claim_count: run.stuck_claim_count,
    updated_at: run.updated_at,
    worker_id: sanitizeSchedulerText(run.worker_id),
  };
}

function mapAttempt(attempt: SchedulerRunAttemptRow): Record<string, unknown> {
  return {
    attempt_count: attempt.attempt_count,
    attempt_kind: attempt.attempt_kind,
    attempt_status: attempt.attempt_status,
    claimed_at: attempt.claimed_at,
    claimed_by: sanitizeSchedulerText(attempt.claimed_by),
    content_publication_id: attempt.content_publication_id,
    created_at: attempt.created_at,
    error_code: sanitizeSchedulerText(attempt.error_code),
    error_message: sanitizeSchedulerText(attempt.error_message),
    id: attempt.id,
    metadata: pickSafeMetadata(attempt.metadata, SAFE_ATTEMPT_METADATA_KEYS),
    next_attempt_at: attempt.next_attempt_at,
    queue_job_id: sanitizeSchedulerText(attempt.queue_job_id),
    retryable: attempt.retryable,
    scheduled_at_utc: attempt.scheduled_at_utc,
    scheduler_run_id: attempt.scheduler_run_id,
    source: sanitizeSchedulerText(attempt.source),
    stuck_claim: attempt.stuck_claim,
    user_id: attempt.user_id,
  };
}

function pickSafeMetadata(
  metadata: Record<string, unknown>,
  allowedKeys: Set<string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (!allowedKeys.has(key)) {
      continue;
    }

    if (typeof value === "string") {
      result[key] = sanitizeSchedulerText(value);
      continue;
    }

    if (
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      result[key] = value;
    }
  }

  return result;
}

function sanitizeSchedulerText(value: string | null): string | null {
  if (value === null) {
    return null;
  }

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
