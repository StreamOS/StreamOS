import type { ChannelSnapshot, MetricsSyncProvider } from "@streamos/types";

import { GatewayError } from "../lib/gateway-error.js";

type SupabaseConfig = {
  serviceRoleKey: string;
  url: string;
};

export type PlatformConnectionRecord = {
  access_token_ciphertext: string | null;
  channel_id: string | null;
  creator_id: string;
  expires_at: string | null;
  id: string;
  metadata: Record<string, unknown> | null;
  platform: MetricsSyncProvider;
  provider_account_id: string;
  provider_profile: Record<string, unknown> | null;
  refresh_token_ciphertext: string | null;
  scopes: string[];
  status: string;
  user_id: string;
};

type LookupResult =
  | { kind: "found"; connection: PlatformConnectionRecord }
  | { kind: "missing" }
  | { kind: "cross_tenant"; connection: PlatformConnectionRecord };

export type MetricsSnapshotInsert = {
  captured_at: string;
  captured_hour: string;
  channel_id: string;
  creator_id: string;
  follower_count: number;
  platform: MetricsSyncProvider;
  raw_payload: Record<string, unknown>;
  revenue_cents: number;
  user_id: string;
  viewer_count: number;
  watch_time_minutes: number;
};

export function getSupabaseConfig(): SupabaseConfig {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceRoleKey) {
    throw new GatewayError({
      code: "INTERNAL_ERROR",
      message: "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.",
      retryable: false,
      statusCode: 500,
    });
  }

  return { serviceRoleKey, url };
}

export async function loadPlatformConnection({
  creatorId,
  fetchImpl = fetch,
  provider,
  userId,
}: {
  creatorId: string;
  fetchImpl?: typeof fetch;
  provider: MetricsSyncProvider;
  userId: string;
}): Promise<PlatformConnectionRecord> {
  const exactMatch = await queryPlatformConnections({
    creatorId,
    fetchImpl,
    provider,
    userId,
  });

  if (exactMatch.kind === "found") {
    return exactMatch.connection;
  }

  if (exactMatch.kind === "cross_tenant") {
    throw new GatewayError({
      code: "CROSS_TENANT_ACCESS_DENIED",
      message:
        "The requested creator does not own the latest platform connection.",
      provider,
      retryable: false,
      statusCode: 403,
    });
  }

  const userConnection = await queryPlatformConnections({
    creatorId: undefined,
    fetchImpl,
    provider,
    userId,
  });

  if (userConnection.kind === "cross_tenant") {
    throw new GatewayError({
      code: "CROSS_TENANT_ACCESS_DENIED",
      message:
        "The requested creator does not own the latest platform connection.",
      provider,
      retryable: false,
      statusCode: 403,
    });
  }

  if (userConnection.kind === "missing") {
    throw new GatewayError({
      code: "PLATFORM_CONNECTION_NOT_FOUND",
      message: `No ${provider} connection found for this user.`,
      provider,
      retryable: false,
      statusCode: 404,
    });
  }

  const connection = userConnection.connection;

  if (connection.creator_id !== creatorId) {
    throw new GatewayError({
      code: "CROSS_TENANT_ACCESS_DENIED",
      message:
        "The requested creator does not own the latest platform connection.",
      provider,
      retryable: false,
      statusCode: 403,
    });
  }

  return connection;
}

export async function updatePlatformConnectionCredentials({
  connectionId,
  fetchImpl = fetch,
  payload,
}: {
  connectionId: string;
  fetchImpl?: typeof fetch;
  payload: {
    accessTokenCiphertext: string;
    expiresAt: string | null;
    refreshTokenCiphertext: string | null;
    scopes: string[];
  };
}): Promise<void> {
  const config = getSupabaseConfig();
  const response = await fetchImpl(
    new URL(`/rest/v1/platform_connections?id=eq.${connectionId}`, config.url),
    {
      body: JSON.stringify({
        access_token_ciphertext: payload.accessTokenCiphertext,
        expires_at: payload.expiresAt,
        refresh_token_ciphertext: payload.refreshTokenCiphertext,
        scopes: payload.scopes,
      }),
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      method: "PATCH",
    },
  );

  if (!response.ok) {
    throw new GatewayError({
      code: "INTERNAL_ERROR",
      message: `Supabase platform connection update failed with status ${response.status}.`,
      retryable: false,
      statusCode: 500,
    });
  }
}

export async function upsertMetricsSnapshot({
  fetchImpl = fetch,
  snapshot,
}: {
  fetchImpl?: typeof fetch;
  snapshot: ChannelSnapshot;
}): Promise<void> {
  const config = getSupabaseConfig();
  const insert = toMetricsSnapshotInsert(snapshot);
  const response = await fetchImpl(
    new URL(
      "/rest/v1/metrics_snapshots?on_conflict=user_id,platform,captured_hour&select=id",
      config.url,
    ),
    {
      body: JSON.stringify(insert),
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      method: "POST",
    },
  );

  if (!response.ok) {
    throw new GatewayError({
      code: "METRICS_UPSERT_FAILED",
      message: `Supabase metrics snapshot upsert failed with status ${response.status}.`,
      retryable: false,
      statusCode: 500,
    });
  }
}

function toMetricsSnapshotInsert(
  snapshot: ChannelSnapshot,
): MetricsSnapshotInsert {
  return {
    captured_at: snapshot.snapshotAt,
    captured_hour: getCapturedHourIso(snapshot.snapshotAt),
    channel_id: snapshot.channelId,
    creator_id: snapshot.creatorId,
    follower_count: snapshot.followers ?? snapshot.subscribers ?? 0,
    platform: snapshot.provider,
    raw_payload: {
      ...snapshot.rawPayload,
      normalized: {
        followers: snapshot.followers,
        peak_viewers: snapshot.peakViewers,
        subscribers: snapshot.subscribers,
        views: snapshot.views,
      },
      synced_at: snapshot.snapshotAt,
    },
    revenue_cents: 0,
    user_id: snapshot.userId,
    viewer_count: snapshot.peakViewers ?? 0,
    watch_time_minutes: 0,
  };
}

async function queryPlatformConnections({
  creatorId,
  fetchImpl,
  provider,
  userId,
}: {
  creatorId: string | undefined;
  fetchImpl: typeof fetch;
  provider: MetricsSyncProvider;
  userId: string;
}): Promise<LookupResult> {
  const config = getSupabaseConfig();
  const query = new URL("/rest/v1/platform_connections", config.url);
  query.searchParams.set(
    "select",
    "access_token_ciphertext,channel_id,creator_id,expires_at,id,metadata,platform,provider_account_id,provider_profile,refresh_token_ciphertext,scopes,status,user_id",
  );
  query.searchParams.set("limit", "1");
  query.searchParams.set("order", "connected_at.desc");
  query.searchParams.set("user_id", `eq.${userId}`);
  query.searchParams.set("platform", `eq.${provider}`);

  if (creatorId) {
    query.searchParams.set("creator_id", `eq.${creatorId}`);
  }

  const response = await fetchImpl(query, {
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
    },
  });

  if (!response.ok) {
    throw new GatewayError({
      code: "INTERNAL_ERROR",
      message: `Supabase platform connection lookup failed with status ${response.status}.`,
      retryable: false,
      statusCode: 500,
    });
  }

  const rows = (await response.json()) as PlatformConnectionRecord[];
  const connection = rows[0];

  if (!connection) {
    return { kind: "missing" };
  }

  if (creatorId && connection.creator_id !== creatorId) {
    return {
      kind: "cross_tenant",
      connection,
    };
  }

  return { connection, kind: "found" };
}

function getCapturedHourIso(value: string): string {
  const date = new Date(value);
  date.setUTCMinutes(0, 0, 0);
  return date.toISOString();
}
