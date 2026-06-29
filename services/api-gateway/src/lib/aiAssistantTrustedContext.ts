import { z } from "zod";
import type { OAuthProvider } from "@streamos/types";

import { readSupabaseRows, type SupabaseRestClient } from "./supabaseRest.js";

const TRUSTED_CONTEXT_SOURCE_VALUES = [
  "channel_platform_status",
  "content_job_summary",
] as const;

const TRUSTED_CONNECTION_STATE_VALUES = [
  "connected",
  "disconnected",
  "reconnect_required",
] as const;

const TRUSTED_PLATFORM_STATUS_REASON_VALUES = [
  "status_connected",
  "status_disconnected",
  "connection_degraded",
  "connection_pending",
  "token_expired",
] as const;

const TRUSTED_CONTENT_JOB_ERROR_CATEGORY_VALUES = [
  "provider_rate_limit",
  "request_timeout",
  "unsafe_input",
  "validation_failed",
  "upstream_unavailable",
  "unknown_failure",
] as const;

const MAX_TRUSTED_CONTENT_JOB_SUMMARY_ROWS = 12;
const MAX_TRUSTED_PLATFORM_SUMMARY_ROWS = 8;

type TrustedContextSource = (typeof TRUSTED_CONTEXT_SOURCE_VALUES)[number];
type TrustedConnectionState = (typeof TRUSTED_CONNECTION_STATE_VALUES)[number];
type TrustedPlatformStatusReason =
  (typeof TRUSTED_PLATFORM_STATUS_REASON_VALUES)[number];
type TrustedContentJobErrorCategory =
  (typeof TRUSTED_CONTENT_JOB_ERROR_CATEGORY_VALUES)[number];

type PlatformConnectionSummaryRow = {
  id: string;
  metadata: unknown;
  platform: OAuthProvider;
  status: string;
  updated_at: string;
  user_id: string;
};

type ContentJobSummaryRow = {
  created_at: string;
  error_message: string | null;
  id: string;
  job_type: string;
  retry_count: number;
  status: string;
  updated_at: string;
  user_id: string;
};

export const trustedAiAssistantContextSourceSchema = z.enum(
  TRUSTED_CONTEXT_SOURCE_VALUES,
);

export const trustedAiAssistantContextReadRequestSchema = z
  .object({
    sources: z
      .array(trustedAiAssistantContextSourceSchema)
      .min(1)
      .max(TRUSTED_CONTEXT_SOURCE_VALUES.length),
    tenant_id: z.string().trim().min(1).max(200),
    user_id: z.string().uuid(),
  })
  .superRefine((value, refinementContext) => {
    if (new Set(value.sources).size !== value.sources.length) {
      refinementContext.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Duplicate trusted context sources are not allowed.",
        path: ["sources"],
      });
    }
  });

export type TrustedAiAssistantContextReadRequest = z.infer<
  typeof trustedAiAssistantContextReadRequestSchema
>;

export type TrustedChannelPlatformStatusRecord = {
  connection_state: TrustedConnectionState;
  last_sync_at: string | null;
  provider: OAuthProvider;
  status_reason: TrustedPlatformStatusReason;
};

export type TrustedContentJobSummaryRecord = {
  created_at: string;
  error_category: TrustedContentJobErrorCategory | null;
  job_type: string;
  retry_count: number;
  status: string;
  updated_at: string;
};

export type TrustedAiAssistantContextSourceResult =
  | {
      records: TrustedChannelPlatformStatusRecord[];
      source: "channel_platform_status";
    }
  | {
      records: TrustedContentJobSummaryRecord[];
      source: "content_job_summary";
    };

export type TrustedAiAssistantContextReadResponse = {
  sources: TrustedAiAssistantContextSourceResult[];
  tenant_id: string;
  user_id: string;
};

export async function readTrustedAiAssistantContext(params: {
  input: TrustedAiAssistantContextReadRequest;
  supabase: SupabaseRestClient;
}): Promise<TrustedAiAssistantContextReadResponse> {
  const normalizedTenantId = params.input.tenant_id.trim();
  const normalizedUserId = params.input.user_id.trim();

  if (!normalizedTenantId || !normalizedUserId) {
    throw new Error("trusted_context_identity_required");
  }

  const sources: TrustedAiAssistantContextSourceResult[] = [];

  for (const source of params.input.sources) {
    if (source === "channel_platform_status") {
      sources.push({
        records: await loadTrustedChannelPlatformStatus({
          supabase: params.supabase,
          userId: normalizedUserId,
        }),
        source,
      });
      continue;
    }

    sources.push({
      records: await loadTrustedContentJobSummary({
        supabase: params.supabase,
        userId: normalizedUserId,
      }),
      source,
    });
  }

  return {
    sources,
    tenant_id: normalizedTenantId,
    user_id: normalizedUserId,
  };
}

async function loadTrustedChannelPlatformStatus(params: {
  supabase: SupabaseRestClient;
  userId: string;
}): Promise<TrustedChannelPlatformStatusRecord[]> {
  const rows = await readSupabaseRows<PlatformConnectionSummaryRow>({
    client: params.supabase,
    params: {
      limit: String(MAX_TRUSTED_PLATFORM_SUMMARY_ROWS),
      order: "updated_at.desc",
      select: "id,metadata,platform,status,updated_at,user_id",
      user_id: `eq.${params.userId}`,
    },
    table: "platform_connections",
  });

  const seenProviders = new Set<OAuthProvider>();
  const sanitizedRows: TrustedChannelPlatformStatusRecord[] = [];

  for (const row of rows) {
    if (row.user_id !== params.userId || seenProviders.has(row.platform)) {
      continue;
    }

    seenProviders.add(row.platform);
    sanitizedRows.push({
      connection_state: toTrustedConnectionState(row.status),
      last_sync_at: inferTrustedLastSyncAt(row),
      provider: row.platform,
      status_reason: toTrustedPlatformStatusReason(row.status),
    });
  }

  return sanitizedRows;
}

async function loadTrustedContentJobSummary(params: {
  supabase: SupabaseRestClient;
  userId: string;
}): Promise<TrustedContentJobSummaryRecord[]> {
  const rows = await readSupabaseRows<ContentJobSummaryRow>({
    client: params.supabase,
    params: {
      limit: String(MAX_TRUSTED_CONTENT_JOB_SUMMARY_ROWS),
      order: "created_at.desc",
      select:
        "created_at,error_message,id,job_type,retry_count,status,updated_at,user_id",
      user_id: `eq.${params.userId}`,
    },
    table: "content_jobs",
  });

  return rows
    .filter((row) => row.user_id === params.userId)
    .map((row) => ({
      created_at: row.created_at,
      error_category: classifyTrustedContentJobError(row.error_message),
      job_type: row.job_type,
      retry_count: row.retry_count,
      status: row.status,
      updated_at: row.updated_at,
    }));
}

function toTrustedConnectionState(status: string): TrustedConnectionState {
  switch (status) {
    case "connected":
      return "connected";
    case "expired":
    case "degraded":
      return "reconnect_required";
    default:
      return "disconnected";
  }
}

function toTrustedPlatformStatusReason(
  status: string,
): TrustedPlatformStatusReason {
  switch (status) {
    case "connected":
      return "status_connected";
    case "expired":
      return "token_expired";
    case "degraded":
      return "connection_degraded";
    case "pending":
      return "connection_pending";
    default:
      return "status_disconnected";
  }
}

function inferTrustedLastSyncAt(
  row: PlatformConnectionSummaryRow,
): string | null {
  const metadata = toRecord(row.metadata);
  const streamStatus = toRecord(metadata.streamStatus);
  const websub = toRecord(metadata.websub);

  return (
    asIsoTimestamp(streamStatus.updatedAt) ??
    asIsoTimestamp(websub.lastRenewedAt) ??
    asIsoTimestamp(row.updated_at)
  );
}

function classifyTrustedContentJobError(
  errorMessage: string | null,
): TrustedContentJobErrorCategory | null {
  if (!errorMessage) {
    return null;
  }

  const normalized = errorMessage.toLowerCase();

  if (normalized.includes("rate limit")) {
    return "provider_rate_limit";
  }

  if (normalized.includes("timeout")) {
    return "request_timeout";
  }

  if (
    normalized.includes("unsafe") ||
    normalized.includes("not allowed") ||
    normalized.includes("non-public ip")
  ) {
    return "unsafe_input";
  }

  if (
    normalized.includes("invalid") ||
    normalized.includes("malformed") ||
    normalized.includes("validation")
  ) {
    return "validation_failed";
  }

  if (
    normalized.includes("unavailable") ||
    normalized.includes("service credentials") ||
    normalized.includes("supabase") ||
    normalized.includes("upstream")
  ) {
    return "upstream_unavailable";
  }

  return "unknown_failure";
}

function asIsoTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  return Number.isNaN(Date.parse(value)) ? null : value;
}

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
