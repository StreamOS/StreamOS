import { createHash } from "node:crypto";
import { z } from "zod";

import type {
  ContentPublicationEventType,
  ContentPublicationStatus,
  StreamPlatform,
} from "@streamos/types";

const publicationRowSchema = z.object({
  capability_snapshot: z.record(z.unknown()),
  capability_version: z.string().trim().min(1),
  content_job_id: z.string().uuid(),
  desired_visibility: z.string().trim().min(1),
  effective_visibility: z.string().trim().min(1).nullable(),
  external_post_id: z.string().trim().min(1).nullable(),
  external_url: z.string().trim().min(1).nullable(),
  id: z.string().uuid(),
  last_reconciled_at: z.string().trim().min(1).nullable(),
  max_retries: z.number().int().nonnegative(),
  published_at: z.string().trim().min(1).nullable(),
  next_retry_at: z.string().trim().min(1).nullable(),
  platform_connection_id: z.string().uuid(),
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
  provider_failure_code: z
    .enum([
      "missing_remote_post_id",
      "remote_post_missing",
      "remote_post_rejected",
      "provider_fetch_failed",
      "provider_rate_limited",
      "provider_unauthorized",
      "provider_unavailable",
      "remote_state_unavailable",
    ])
    .nullable(),
  provider_failure_metadata: z.record(z.unknown()),
  provider_failure_reason: z.string().trim().min(1).nullable(),
  provider_overrides: z.record(z.record(z.unknown())),
  reconciliation_status: z.enum([
    "idle",
    "queued",
    "reconciling",
    "reconciled",
    "failed_retryable",
    "failed_permanent",
    "skipped",
  ]),
  reconcile_max_retries: z.number().int().nonnegative(),
  reconcile_next_retry_at: z.string().trim().min(1).nullable(),
  reconcile_retry_count: z.number().int().nonnegative(),
  remote_processing_status: z.string().trim().min(1).nullable(),
  remote_state: z.record(z.unknown()),
  remote_status: z.enum([
    "missing",
    "processing",
    "published",
    "rejected",
    "unknown",
  ]),
  remote_upload_status: z.string().trim().min(1).nullable(),
  request_intent_hash: z.string().trim().min(1),
  requested_at: z.string().trim().min(1),
  requested_by: z.string().uuid(),
  retry_count: z.number().int().nonnegative(),
  review_status_at_request: z.enum([
    "needs_review",
    "approved",
    "rejected",
    "needs_changes",
  ]),
  snapshot: z.record(z.unknown()),
  snapshot_hash: z.string().trim().min(1),
  target_platform: z.enum(["youtube", "tiktok"]),
  user_id: z.string().uuid(),
  validated_at: z.string().trim().min(1).nullable(),
  validation_code: z.string().trim().min(1).nullable(),
  validation_message: z.string().trim().min(1).nullable(),
  validation_metadata: z.record(z.unknown()),
});

const contentJobRowSchema = z.object({
  id: z.string().uuid(),
  job_type: z.literal("repurposing"),
  queue_job_id: z.string().trim().min(1),
  result: z.record(z.unknown()).nullable(),
  review_status: z.enum([
    "needs_review",
    "approved",
    "rejected",
    "needs_changes",
  ]),
  status: z.enum([
    "pending",
    "running",
    "processing",
    "done",
    "completed",
    "failed",
    "cancelled",
  ]),
  stream_id: z.string().uuid().nullable(),
  type: z.literal("repurposing"),
  user_id: z.string().uuid(),
});

const platformConnectionRowSchema = z.object({
  access_token_ciphertext: z.string().trim().min(1).nullable(),
  expires_at: z.string().trim().min(1).nullable(),
  id: z.string().uuid(),
  metadata: z.record(z.unknown()).nullable(),
  platform: z.enum(["youtube", "tiktok"]),
  provider_profile: z.record(z.unknown()).nullable(),
  refresh_token_ciphertext: z.string().trim().min(1).nullable(),
  scopes: z.array(z.string()),
  status: z.string().trim().min(1),
  user_id: z.string().uuid(),
});

const vodAssetRowSchema = z.object({
  id: z.string().uuid(),
  source_url: z.string().url(),
  status: z.string().trim().min(1).optional(),
});

export type PublicationRow = z.infer<typeof publicationRowSchema>;
export type PublicationContentJobRow = z.infer<typeof contentJobRowSchema>;
export type PublicationConnectionRow = z.infer<
  typeof platformConnectionRowSchema
>;
export type PublicationVodAssetRow = z.infer<typeof vodAssetRowSchema>;

export type PublicationStore = {
  appendEvent(input: {
    actorId: string;
    eventType: ContentPublicationEventType;
    metadata: Record<string, unknown>;
    previousPublicationStatus: ContentPublicationStatus | null;
    publicationId: string;
    publicationStatus: ContentPublicationStatus;
    source: string;
    userId: string;
  }): Promise<void>;
  loadContentJobById(input: {
    contentJobId: string;
    userId: string;
  }): Promise<PublicationContentJobRow | null>;
  loadPlatformConnectionById(input: {
    connectionId: string;
    userId: string;
  }): Promise<PublicationConnectionRow | null>;
  loadPublicationById(input: {
    publicationId: string;
    userId: string;
  }): Promise<PublicationRow | null>;
  loadVodAssetByStreamId(input: {
    streamId: string | null;
    userId: string;
  }): Promise<PublicationVodAssetRow | null>;
  patchPlatformConnection(input: {
    connectionId: string;
    payload: Record<string, unknown>;
    userId: string;
  }): Promise<void>;
  patchPublicationById(input: {
    payload: Record<string, unknown>;
    publicationId: string;
    userId: string;
  }): Promise<void>;
};

export type SupabasePublicationStoreOptions = {
  fetchFn?: typeof fetch;
  serviceRoleKey: string;
  supabaseUrl: string;
};

export function createSupabasePublicationStore({
  fetchFn = fetch,
  serviceRoleKey,
  supabaseUrl,
}: SupabasePublicationStoreOptions): PublicationStore {
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
    async loadContentJobById({ contentJobId, userId }) {
      const rows = await readRows(
        fetchFn,
        new URL("/rest/v1/content_jobs", baseUrl),
        {
          id: `eq.${contentJobId}`,
          job_type: "eq.repurposing",
          select:
            "id,job_type,queue_job_id,result,review_status,status,type,user_id,stream_id",
          type: "eq.repurposing",
          user_id: `eq.${userId}`,
        },
        headers,
      );

      const parsedRows = z.array(contentJobRowSchema).safeParse(rows);
      if (!parsedRows.success) {
        throw new Error(
          `Supabase content_jobs lookup returned invalid rows: ${parsedRows.error.message}`,
        );
      }

      return parsedRows.data[0] ?? null;
    },
    async loadPlatformConnectionById({ connectionId, userId }) {
      const rows = await readRows(
        fetchFn,
        new URL("/rest/v1/platform_connections", baseUrl),
        {
          id: `eq.${connectionId}`,
          select:
            "access_token_ciphertext,creator_id,expires_at,id,metadata,platform,provider_profile,refresh_token_ciphertext,scopes,status,user_id",
          user_id: `eq.${userId}`,
        },
        headers,
      );

      const parsedRows = z.array(platformConnectionRowSchema).safeParse(rows);
      if (!parsedRows.success) {
        throw new Error(
          `Supabase platform_connections lookup returned invalid rows: ${parsedRows.error.message}`,
        );
      }

      return parsedRows.data[0] ?? null;
    },
    async loadPublicationById({ publicationId, userId }) {
      const rows = await readRows(
        fetchFn,
        new URL("/rest/v1/content_publications", baseUrl),
        {
          id: `eq.${publicationId}`,
          select:
            "capability_snapshot,capability_version,content_job_id,desired_visibility,effective_visibility,external_post_id,external_url,id,last_reconciled_at,max_retries,next_retry_at,platform_connection_id,publication_status,provider_failure_code,provider_failure_metadata,provider_failure_reason,provider_overrides,published_at,reconciliation_status,reconcile_max_retries,reconcile_next_retry_at,reconcile_retry_count,remote_processing_status,remote_state,remote_status,remote_upload_status,request_intent_hash,requested_at,requested_by,retry_count,review_status_at_request,snapshot,snapshot_hash,target_platform,user_id,validated_at,validation_code,validation_message",
          user_id: `eq.${userId}`,
        },
        headers,
      );

      const parsedRows = z.array(publicationRowSchema).safeParse(rows);
      if (!parsedRows.success) {
        throw new Error(
          `Supabase content_publications lookup returned invalid rows: ${parsedRows.error.message}`,
        );
      }

      return parsedRows.data[0] ?? null;
    },
    async loadVodAssetByStreamId({ streamId, userId }) {
      if (!streamId) {
        return null;
      }

      const rows = await readRows(
        fetchFn,
        new URL("/rest/v1/vod_assets", baseUrl),
        {
          limit: "1",
          order: "updated_at.desc",
          select: "id,source_url,status,stream_id,user_id,metadata",
          stream_id: `eq.${streamId}`,
          user_id: `eq.${userId}`,
        },
        headers,
      );

      const parsedRows = z.array(vodAssetRowSchema).safeParse(rows);
      if (!parsedRows.success) {
        throw new Error(
          `Supabase vod_assets lookup returned invalid rows: ${parsedRows.error.message}`,
        );
      }

      return parsedRows.data[0] ?? null;
    },
    async patchPlatformConnection({ connectionId, payload, userId }) {
      await patchRows(
        fetchFn,
        new URL("/rest/v1/platform_connections", baseUrl),
        {
          id: `eq.${connectionId}`,
          user_id: `eq.${userId}`,
        },
        payload,
        minimalHeaders,
      );
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

export function buildPublicationRequestHash({
  contentPublicationId,
  targetPlatform,
  userId,
}: {
  contentPublicationId: string;
  targetPlatform: StreamPlatform;
  userId: string;
}): string {
  return createHash("sha256")
    .update([contentPublicationId, targetPlatform, userId].join("|"), "utf8")
    .digest("hex");
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
