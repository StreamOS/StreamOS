import assert from "node:assert/strict";
import test from "node:test";

import { buildPublicationExecutionQueueJobId } from "./publicationSchedulerStore.js";
import { runPublishingSchedulerTick } from "./scheduler.js";

void test("publishing-scheduler-worker tick queues due publications and records queued execution state", async () => {
  const publicationId = "11111111-1111-1111-1111-111111111111";
  const queueJobId = buildPublicationExecutionQueueJobId(publicationId);
  const now = new Date("2026-06-21T12:00:00.000Z");
  const row = {
    content_job_id: "22222222-2222-2222-2222-222222222222",
    id: publicationId,
    publication_status: "validated" as const,
    requested_by: "33333333-3333-3333-3333-333333333333",
    review_status_at_request: "approved" as const,
    schedule_canceled_at: null,
    schedule_expired_at: null,
    schedule_execution_attempt_count: 0,
    schedule_execution_claimed_at: null,
    schedule_execution_claimed_by: null,
    schedule_execution_completed_at: null,
    schedule_execution_error_code: null,
    schedule_execution_error_message: null,
    schedule_execution_last_attempt_at: null,
    schedule_execution_max_retries: 3,
    schedule_execution_metadata: {},
    schedule_execution_next_attempt_at: null,
    schedule_execution_queue_job_id: queueJobId,
    schedule_execution_status: "claimed" as const,
    schedule_replaced_at: null,
    schedule_status: "scheduled" as const,
    scheduled_at_utc: now.toISOString(),
    target_platform: "youtube" as const,
    user_id: "44444444-4444-4444-4444-444444444444",
  };

  const queuedJobs: Array<{ id: string; name: string }> = [];
  const appendEvents: Array<Record<string, unknown>> = [];
  const patchPayloads: Array<Record<string, unknown>> = [];
  const schedulerRuns: Array<Record<string, unknown>> = [];
  const schedulerAttempts: Array<Record<string, unknown>> = [];
  const finalizedRuns: Array<Record<string, unknown>> = [];
  const store = {
    async appendEvent(input: Record<string, unknown>) {
      appendEvents.push(input);
    },
    async claimDuePublications() {
      return [row];
    },
    async listStaleClaimedPublications() {
      return [];
    },
    async patchPublicationById({
      payload,
    }: {
      payload: Record<string, unknown>;
    }) {
      patchPayloads.push(payload);
    },
    async startSchedulerRun(input: Record<string, unknown>) {
      schedulerRuns.push(input);
    },
    async recordSchedulerRunAttempt(input: Record<string, unknown>) {
      schedulerAttempts.push(input);
    },
    async finalizeSchedulerRun(input: Record<string, unknown>) {
      finalizedRuns.push(input);
    },
  };
  const queue = {
    async add(
      name: string,
      data: Record<string, unknown>,
      opts?: { jobId?: string },
    ) {
      queuedJobs.push({ id: opts?.jobId ?? "", name });
      return { id: opts?.jobId ?? "" };
    },
    async getJob() {
      return null;
    },
  };

  const result = await runPublishingSchedulerTick({
    batchSize: 25,
    claimTimeoutMs: 300000,
    now,
    queue,
    pollIntervalMs: 30000,
    store,
    workerId: "publishing-scheduler-worker",
  });

  assert.equal(result.queued, 1);
  assert.equal(result.failed, 0);
  assert.equal(result.recovered, 0);
  assert.equal(queuedJobs.length, 1);
  assert.equal(queuedJobs[0]?.id, queueJobId);
  assert.match(
    JSON.stringify(patchPayloads[0]),
    /"publication_status":"queued"/,
  );
  assert.equal(appendEvents[0]?.eventType, "queued");
  const schedulerRun = schedulerRuns[0] as
    | { metadata?: Record<string, unknown>; runId?: unknown }
    | undefined;
  const schedulerAttempt = schedulerAttempts[0] as
    | {
        attemptKind?: unknown;
        attemptStatus?: unknown;
        retryable?: unknown;
        stuckClaim?: unknown;
      }
    | undefined;
  const finalizedRun = finalizedRuns[0] as
    | { queuedCount?: unknown; stuckClaimCount?: unknown }
    | undefined;

  assert.equal(schedulerRuns.length, 1);
  assert.equal(schedulerAttempts.length, 1);
  assert.equal(finalizedRuns.length, 1);
  assert.equal(schedulerRun?.runId, schedulerRun?.metadata?.run_id);
  assert.equal(schedulerRun?.metadata?.poll_interval_ms, 30000);
  assert.equal(schedulerAttempt?.attemptKind, "due_claim");
  assert.equal(schedulerAttempt?.attemptStatus, "queued");
  assert.equal(schedulerAttempt?.retryable, false);
  assert.equal(schedulerAttempt?.stuckClaim, false);
  assert.equal(finalizedRun?.queuedCount, 1);
  assert.equal(finalizedRun?.stuckClaimCount, 0);
});

void test("publishing-scheduler-worker tick marks stale claimed publications retryable when the queue job is missing", async () => {
  const publicationId = "55555555-5555-5555-5555-555555555555";
  const now = new Date("2026-06-21T12:00:00.000Z");
  const row = {
    content_job_id: "66666666-6666-6666-6666-666666666666",
    id: publicationId,
    publication_status: "validated" as const,
    requested_by: "77777777-7777-7777-7777-777777777777",
    review_status_at_request: "approved" as const,
    schedule_canceled_at: null,
    schedule_expired_at: null,
    schedule_execution_attempt_count: 1,
    schedule_execution_claimed_at: "2026-06-21T11:00:00.000Z",
    schedule_execution_claimed_by: "publishing-scheduler-worker",
    schedule_execution_completed_at: null,
    schedule_execution_error_code: null,
    schedule_execution_error_message: null,
    schedule_execution_last_attempt_at: "2026-06-21T11:00:00.000Z",
    schedule_execution_max_retries: 3,
    schedule_execution_metadata: {},
    schedule_execution_next_attempt_at: null,
    schedule_execution_queue_job_id:
      buildPublicationExecutionQueueJobId(publicationId),
    schedule_execution_status: "claimed" as const,
    schedule_replaced_at: null,
    schedule_status: "scheduled" as const,
    scheduled_at_utc: now.toISOString(),
    target_platform: "tiktok" as const,
    user_id: "88888888-8888-8888-8888-888888888888",
  };

  const appendEvents: Array<Record<string, unknown>> = [];
  const patchPayloads: Array<Record<string, unknown>> = [];
  const schedulerRuns: Array<Record<string, unknown>> = [];
  const schedulerAttempts: Array<Record<string, unknown>> = [];
  const finalizedRuns: Array<Record<string, unknown>> = [];
  const store = {
    async appendEvent(input: Record<string, unknown>) {
      appendEvents.push(input);
    },
    async claimDuePublications() {
      return [];
    },
    async listStaleClaimedPublications() {
      return [row];
    },
    async patchPublicationById({
      payload,
    }: {
      payload: Record<string, unknown>;
    }) {
      patchPayloads.push(payload);
    },
    async startSchedulerRun(input: Record<string, unknown>) {
      schedulerRuns.push(input);
    },
    async recordSchedulerRunAttempt(input: Record<string, unknown>) {
      schedulerAttempts.push(input);
    },
    async finalizeSchedulerRun(input: Record<string, unknown>) {
      finalizedRuns.push(input);
    },
  };
  const queue = {
    async add() {
      throw new Error("queue add should not be called for stale recovery");
    },
    async getJob() {
      return null;
    },
  };

  const result = await runPublishingSchedulerTick({
    batchSize: 25,
    claimTimeoutMs: 300000,
    now,
    queue,
    pollIntervalMs: 30000,
    store,
    workerId: "publishing-scheduler-worker",
  });

  assert.equal(result.recovered, 0);
  assert.equal(result.failed, 1);
  assert.equal(result.queued, 0);
  assert.match(
    JSON.stringify(patchPayloads[0]),
    /"publication_status":"failed_retryable"/,
  );
  assert.equal(appendEvents[0]?.eventType, "failed_retryable");
  const staleAttempt = schedulerAttempts[0] as
    | {
        attemptKind?: unknown;
        attemptStatus?: unknown;
        retryable?: unknown;
        stuckClaim?: unknown;
      }
    | undefined;
  const finalizedRun = finalizedRuns[0] as
    | { runStatus?: unknown; stuckClaimCount?: unknown }
    | undefined;
  assert.equal(schedulerRuns.length, 1);
  assert.equal(schedulerAttempts.length, 1);
  assert.equal(finalizedRuns.length, 1);
  assert.equal(staleAttempt?.attemptKind, "stale_claim");
  assert.equal(staleAttempt?.attemptStatus, "stuck_claim");
  assert.equal(staleAttempt?.retryable, true);
  assert.equal(staleAttempt?.stuckClaim, true);
  assert.equal(finalizedRun?.runStatus, "failed");
  assert.equal(finalizedRun?.stuckClaimCount, 1);
});
