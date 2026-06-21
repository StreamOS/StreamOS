import { z } from "zod";

import type { ContentPublicationStatus } from "@streamos/types";

export type PublicationSchedulerExecutionStatus =
  | "idle"
  | "claimed"
  | "queued"
  | "failed_retryable"
  | "failed_permanent"
  | "canceled"
  | "expired"
  | "unknown";

const publicationRowSchema = z.object({
  content_job_id: z.string().uuid(),
  id: z.string().uuid(),
  publication_status: z.enum([
    "requested",
    "validated",
    "queued",
    "publishing",
    "published",
    "failed_retryable",
    "failed_permanent",
    "canceled",
    "rejected",
  ]),
  requested_by: z.string().uuid(),
  review_status_at_request: z.enum([
    "needs_review",
    "approved",
    "rejected",
    "needs_changes",
  ]),
  schedule_canceled_at: z.string().trim().min(1).nullable(),
  schedule_expired_at: z.string().trim().min(1).nullable(),
  schedule_execution_attempt_count: z.number().int().nonnegative(),
  schedule_execution_claimed_at: z.string().trim().min(1).nullable(),
  schedule_execution_claimed_by: z.string().trim().min(1).nullable(),
  schedule_execution_completed_at: z.string().trim().min(1).nullable(),
  schedule_execution_error_code: z.string().trim().min(1).nullable(),
  schedule_execution_error_message: z.string().trim().min(1).nullable(),
  schedule_execution_last_attempt_at: z.string().trim().min(1).nullable(),
  schedule_execution_max_retries: z.number().int().nonnegative(),
  schedule_execution_metadata: z.record(z.unknown()),
  schedule_execution_next_attempt_at: z.string().trim().min(1).nullable(),
  schedule_execution_queue_job_id: z.string().trim().min(1).nullable(),
  schedule_execution_status: z.enum([
    "idle",
    "claimed",
    "queued",
    "failed_retryable",
    "failed_permanent",
    "canceled",
    "expired",
    "unknown",
  ]),
  schedule_replaced_at: z.string().trim().min(1).nullable(),
  schedule_status: z.enum([
    "not_scheduled",
    "scheduled",
    "schedule_blocked",
    "schedule_expired",
    "schedule_canceled",
    "schedule_replaced",
    "schedule_ready",
    "schedule_unknown",
  ]),
  scheduled_at_utc: z.string().trim().min(1).nullable(),
  target_platform: z.enum(["youtube", "tiktok"]),
  user_id: z.string().uuid(),
});

export type PublicationSchedulerExecutionRow = z.infer<
  typeof publicationRowSchema
>;

export type PublicationSchedulerStore = {
  appendEvent(input: {
    actorId: string;
    eventType: "failed_permanent" | "failed_retryable" | "queued";
    metadata: Record<string, unknown>;
    previousPublicationStatus: ContentPublicationStatus | null;
    publicationId: string;
    publicationStatus: ContentPublicationStatus;
    source: string;
    userId: string;
  }): Promise<void>;
  claimDuePublications(input: {
    batchSize: number;
    claimTimeoutMs: number;
    now: Date;
    workerId: string;
  }): Promise<PublicationSchedulerExecutionRow[]>;
  listStaleClaimedPublications(input: {
    batchSize: number;
    claimTimeoutMs: number;
    now: Date;
  }): Promise<PublicationSchedulerExecutionRow[]>;
  patchPublicationById(input: {
    payload: Record<string, unknown>;
    publicationId: string;
    userId: string;
  }): Promise<void>;
};

export type SupabasePublishingSchedulerStoreOptions = {
  fetchFn?: typeof fetch;
  serviceRoleKey: string;
  supabaseUrl: string;
};

export function createSupabasePublishingSchedulerStore({
  fetchFn = fetch,
  serviceRoleKey,
  supabaseUrl,
}: SupabasePublishingSchedulerStoreOptions): PublicationSchedulerStore {
  const baseUrl = supabaseUrl.replace(/\/+$/, "");
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
  const minimalHeaders = {
    ...headers,
    Prefer: "return=minimal",
  };

  return {
    async appendEvent(input) {
      await writeJson(
        fetchFn,
        new URL("/rest/v1/content_publication_events", baseUrl),
        {
          body: JSON.stringify({
            actor_id: input.actorId,
            content_publication_id: input.publicationId,
            event_type: input.eventType,
            metadata: input.metadata,
            previous_publication_status: input.previousPublicationStatus,
            publication_status: input.publicationStatus,
            source: input.source,
            user_id: input.userId,
          }),
          headers: minimalHeaders,
          method: "POST",
        },
      );
    },
    async claimDuePublications({ batchSize, claimTimeoutMs, workerId }) {
      const endpoint = new URL(
        "/rest/v1/rpc/claim_due_content_publication_executions",
        baseUrl,
      );

      const rows = await writeRpc(
        fetchFn,
        endpoint,
        {
          p_claim_timeout_ms: claimTimeoutMs,
          p_limit: batchSize,
          p_worker_id: workerId,
        },
        headers,
      );

      const parsedRows = z.array(publicationRowSchema).safeParse(rows);
      if (!parsedRows.success) {
        throw new Error(
          `Supabase publication execution claim RPC returned invalid rows: ${parsedRows.error.message}`,
        );
      }

      return parsedRows.data;
    },
    async listStaleClaimedPublications({ batchSize, claimTimeoutMs, now }) {
      const threshold = new Date(now.getTime() - claimTimeoutMs).toISOString();
      const rows = await readRows(
        fetchFn,
        new URL("/rest/v1/content_publications", baseUrl),
        {
          id: "not.is.null",
          order: "schedule_execution_claimed_at.asc,id.asc",
          limit: String(batchSize),
          publication_status: "in.(validated,failed_retryable)",
          schedule_canceled_at: "is.null",
          schedule_expired_at: "is.null",
          schedule_execution_claimed_at: `lt.${threshold}`,
          schedule_execution_status: "eq.claimed",
          schedule_replaced_at: "is.null",
          schedule_status: "in.(scheduled,schedule_ready)",
          select:
            "content_job_id,id,publication_status,requested_by,review_status_at_request,schedule_canceled_at,schedule_expired_at,schedule_execution_attempt_count,schedule_execution_claimed_at,schedule_execution_claimed_by,schedule_execution_completed_at,schedule_execution_error_code,schedule_execution_error_message,schedule_execution_last_attempt_at,schedule_execution_max_retries,schedule_execution_metadata,schedule_execution_next_attempt_at,schedule_execution_queue_job_id,schedule_execution_status,schedule_replaced_at,schedule_status,scheduled_at_utc,target_platform,user_id",
        },
        headers,
      );

      const parsedRows = z.array(publicationRowSchema).safeParse(rows);
      if (!parsedRows.success) {
        throw new Error(
          `Supabase publication execution stale lookup returned invalid rows: ${parsedRows.error.message}`,
        );
      }

      return parsedRows.data;
    },
    async patchPublicationById({ payload, publicationId, userId }) {
      await patchRows(
        fetchFn,
        new URL("/rest/v1/content_publications", baseUrl),
        {
          id: `eq.${publicationId}`,
          user_id: `eq.${userId}`,
        },
        {
          ...payload,
          updated_at: new Date().toISOString(),
        },
        minimalHeaders,
      );
    },
  };
}

export function buildPublicationExecutionQueueJobId(
  publicationId: string,
): string {
  return `publication-execution-${publicationId}`;
}

export function buildPublicationExecutionQueuePayload(
  row: PublicationSchedulerExecutionRow,
) {
  return {
    content_publication_id: row.id,
    target_platform: row.target_platform,
    user_id: row.user_id,
  };
}

export function buildPublicationExecutionRetryAt(
  now: Date,
  attemptCount: number,
): string {
  const backoffMs = Math.min(
    900_000,
    30_000 * 2 ** Math.max(attemptCount - 1, 0),
  );

  return new Date(now.getTime() + backoffMs).toISOString();
}

async function readRows(
  fetchFn: typeof fetch,
  endpoint: URL,
  params: Record<string, string>,
  headers: Record<string, string>,
): Promise<unknown[]> {
  for (const [key, value] of Object.entries(params)) {
    endpoint.searchParams.set(key, value);
  }

  const response = await fetchFn(endpoint, {
    headers,
    method: "GET",
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Supabase ${endpoint.pathname} lookup failed with ${response.status}: ${errorBody}`,
    );
  }

  return (await response.json()) as unknown[];
}

async function patchRows(
  fetchFn: typeof fetch,
  endpoint: URL,
  params: Record<string, string>,
  payload: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<void> {
  for (const [key, value] of Object.entries(params)) {
    endpoint.searchParams.set(key, value);
  }

  const response = await fetchFn(endpoint, {
    body: JSON.stringify(payload),
    headers,
    method: "PATCH",
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Supabase ${endpoint.pathname} update failed with ${response.status}: ${errorBody}`,
    );
  }
}

async function writeJson(
  fetchFn: typeof fetch,
  endpoint: URL,
  init: RequestInit,
): Promise<void> {
  const response = await fetchFn(endpoint, init);

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Supabase ${endpoint.pathname} write failed with ${response.status}: ${errorBody}`,
    );
  }
}

async function writeRpc(
  fetchFn: typeof fetch,
  endpoint: URL,
  payload: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<unknown[]> {
  const response = await fetchFn(endpoint, {
    body: JSON.stringify(payload),
    headers,
    method: "POST",
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Supabase ${endpoint.pathname} rpc failed with ${response.status}: ${errorBody}`,
    );
  }

  return (await response.json()) as unknown[];
}
