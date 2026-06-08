import { NextResponse, type NextRequest } from "next/server";
import type {
  MetricsSnapshot,
  MetricsSyncErrorCode,
  MetricsSyncFailure,
  MetricsSyncRequest,
  MetricsSyncResponse,
  SupportedProvider,
} from "@streamos/types";
import { SUPPORTED_PROVIDERS } from "@streamos/types";
import type { Inserts, Json, Tables, Updates } from "@streamos/database";

import { decryptToken, encryptToken } from "@/lib/crypto";
import { getKickChannelMetrics } from "@/lib/integrations/kick-metrics";
import {
  normalizeKick,
  normalizeTikTok,
  normalizeTwitch,
  normalizeYouTube,
} from "@/lib/integrations/normalize-metrics";
import { getTikTokChannelMetrics } from "@/lib/integrations/tiktok-metrics";
import { getTwitchChannelMetrics } from "@/lib/integrations/twitch-metrics";
import { getYouTubeChannelMetrics } from "@/lib/integrations/youtube-metrics";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const REQUEST_TIMEOUT_MS = 25_000;
const MAX_REQUEST_BODY_BYTES = 4_096;
const RATE_LIMIT_WINDOW_MS = 60_000;
const TOKEN_REFRESH_LEEWAY_MS = 60_000;
const YOUTUBE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";

const rateLimitStore = new Map<string, number>();
const supportedProviderSet = new Set<string>(SUPPORTED_PROVIDERS);

type PlatformConnection = Pick<
  Tables<"platform_connections">,
  | "access_token_ciphertext"
  | "channel_id"
  | "creator_id"
  | "expires_at"
  | "id"
  | "platform"
  | "provider_account_id"
  | "provider_profile"
  | "refresh_token_ciphertext"
  | "scopes"
  | "status"
  | "user_id"
>;

type TokenRefreshResult = {
  accessToken: string;
  expiresAt: string | null;
  refreshToken: string | null;
  scopes: string[] | null;
};

class ProviderSyncError extends Error {
  constructor(
    public readonly provider: SupportedProvider,
    public readonly code: MetricsSyncErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProviderSyncError";
  }
}

export async function POST(request: NextRequest) {
  if (hasOversizedBody(request)) {
    return NextResponse.json(
      {
        error: "Request body exceeds the metrics sync size limit.",
        code: "REQUEST_TOO_LARGE",
      },
      { status: 413 },
    );
  }

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), REQUEST_TIMEOUT_MS);

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      return NextResponse.json(
        {
          error: "An authenticated Supabase session is required.",
          code: "UNAUTHORIZED",
        },
        { status: 401 },
      );
    }

    const parsedBody = await readRequestBody(request);

    if (!parsedBody.ok) {
      const isTooLarge = parsedBody.code === "REQUEST_TOO_LARGE";

      return NextResponse.json(
        {
          error: isTooLarge
            ? "Request body exceeds the metrics sync size limit."
            : "Request body must be { providers: SupportedProvider[] }.",
          code: parsedBody.code,
        },
        { status: isTooLarge ? 413 : 400 },
      );
    }

    const providers = [...new Set(parsedBody.value.providers)];
    const serviceSupabase = createServiceRoleClient();
    const results = await Promise.allSettled(
      providers.map((provider) =>
        syncProvider({
          provider,
          requestUrl: request.nextUrl,
          serviceSupabase,
          signal: abortController.signal,
          userId: data.user.id,
        }),
      ),
    );

    const response = buildSyncResponse(providers, results);
    const hasFailures = response.failed.length > 0;

    logMetricsSyncAudit({
      providers,
      response,
      userId: data.user.id,
    });

    return NextResponse.json(response, { status: hasFailures ? 207 : 200 });
  } catch (error) {
    logMetricsSyncError(error);

    return NextResponse.json(
      {
        error: "Metrics sync could not be initialized.",
        code: "METRICS_SYNC_FAILED",
      },
      { status: 500 },
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function syncProvider({
  provider,
  requestUrl,
  serviceSupabase,
  signal,
  userId,
}: {
  provider: SupportedProvider;
  requestUrl: URL;
  serviceSupabase: ReturnType<typeof createServiceRoleClient>;
  signal: AbortSignal;
  userId: string;
}): Promise<SupportedProvider> {
  enforceRateLimit(userId, provider);

  const connection = await getLatestConnection({
    provider,
    serviceSupabase,
    userId,
  });

  assertConnectionSyncable(connection, provider);

  const accessToken = await getUsableAccessToken({
    connection,
    provider,
    requestUrl,
    serviceSupabase,
    signal,
    userId,
  });

  if (!connection.channel_id) {
    throw new ProviderSyncError(
      provider,
      "CONNECTION_NOT_FOUND",
      "Platform connection has no linked StreamOS channel.",
    );
  }

  const snapshot = await fetchAndNormalizeMetrics({
    accessToken,
    connection,
    provider,
    signal,
    userId,
  });

  const payload = toMetricsSnapshotInsert(connection, snapshot);
  const result = await serviceSupabase
    .from("metrics_snapshots")
    .upsert(payload as never, {
      onConflict: "user_id,platform,captured_hour",
    });

  if (result.error) {
    throw new ProviderSyncError(
      provider,
      "DB_WRITE_FAILED",
      result.error.message,
    );
  }

  return provider;
}

async function getLatestConnection({
  provider,
  serviceSupabase,
  userId,
}: {
  provider: SupportedProvider;
  serviceSupabase: ReturnType<typeof createServiceRoleClient>;
  userId: string;
}): Promise<PlatformConnection> {
  const result = await serviceSupabase
    .from("platform_connections")
    .select(
      "id, user_id, creator_id, channel_id, platform, provider_account_id, provider_profile, access_token_ciphertext, refresh_token_ciphertext, scopes, expires_at, status",
    )
    .eq("user_id", userId)
    .eq("platform", provider)
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error) {
    throw new ProviderSyncError(
      provider,
      "PROVIDER_FETCH_FAILED",
      result.error.message,
    );
  }

  if (!result.data) {
    throw new ProviderSyncError(
      provider,
      "CONNECTION_NOT_FOUND",
      `No ${provider} connection found for this user.`,
    );
  }

  return result.data as PlatformConnection;
}

function assertConnectionSyncable(
  connection: PlatformConnection,
  provider: SupportedProvider,
) {
  if (connection.status === "connected" || connection.status === "expired") {
    return;
  }

  throw new ProviderSyncError(
    provider,
    "CONNECTION_NOT_FOUND",
    `The latest ${provider} connection is not syncable.`,
  );
}

async function getUsableAccessToken({
  connection,
  provider,
  requestUrl,
  serviceSupabase,
  signal,
  userId,
}: {
  connection: PlatformConnection;
  provider: SupportedProvider;
  requestUrl: URL;
  serviceSupabase: ReturnType<typeof createServiceRoleClient>;
  signal: AbortSignal;
  userId: string;
}): Promise<string> {
  if (!connection.access_token_ciphertext) {
    throw new ProviderSyncError(
      provider,
      "TOKEN_DECRYPT_FAILED",
      "Platform connection has no encrypted access token.",
    );
  }

  const expiresAt = parseExpiresAtMs(connection.expires_at);
  const shouldRefresh =
    connection.status === "expired" ||
    expiresAt <= Date.now() + TOKEN_REFRESH_LEEWAY_MS;

  if (shouldRefresh) {
    return refreshConnectionToken({
      connection,
      provider,
      requestUrl,
      serviceSupabase,
      signal,
      userId,
    });
  }

  try {
    return decryptToken(connection.access_token_ciphertext);
  } catch {
    throw new ProviderSyncError(
      provider,
      "TOKEN_DECRYPT_FAILED",
      "Could not decrypt platform access token.",
    );
  }
}

async function refreshConnectionToken({
  connection,
  provider,
  requestUrl,
  serviceSupabase,
  signal,
  userId,
}: {
  connection: PlatformConnection;
  provider: SupportedProvider;
  requestUrl: URL;
  serviceSupabase: ReturnType<typeof createServiceRoleClient>;
  signal: AbortSignal;
  userId: string;
}): Promise<string> {
  if (!connection.refresh_token_ciphertext) {
    throw new ProviderSyncError(
      provider,
      "TOKEN_REFRESH_FAILED",
      "Platform connection has no refresh token.",
    );
  }

  let refreshToken: string;

  try {
    refreshToken = decryptToken(connection.refresh_token_ciphertext);
  } catch {
    throw new ProviderSyncError(
      provider,
      "TOKEN_DECRYPT_FAILED",
      "Could not decrypt platform refresh token.",
    );
  }

  const refreshed = await refreshProviderToken({
    provider,
    refreshToken,
    requestUrl,
    signal,
  });
  const updatePayload: Updates<"platform_connections"> = {
    access_token_ciphertext: encryptToken(refreshed.accessToken),
    expires_at: refreshed.expiresAt,
    refresh_token_ciphertext: refreshed.refreshToken
      ? encryptToken(refreshed.refreshToken)
      : connection.refresh_token_ciphertext,
    scopes: refreshed.scopes ?? connection.scopes,
    status: "connected",
  };
  const updateResult = await serviceSupabase
    .from("platform_connections")
    .update(updatePayload as never)
    .eq("user_id", userId)
    .eq("id", connection.id);

  if (updateResult.error) {
    throw new ProviderSyncError(
      provider,
      "TOKEN_REFRESH_FAILED",
      updateResult.error.message,
    );
  }

  return refreshed.accessToken;
}

async function refreshProviderToken({
  provider,
  refreshToken,
  requestUrl,
  signal,
}: {
  provider: SupportedProvider;
  refreshToken: string;
  requestUrl: URL;
  signal: AbortSignal;
}): Promise<TokenRefreshResult> {
  if (provider === "twitch") {
    return refreshTwitchAccessToken(refreshToken, signal);
  }

  if (provider === "youtube") {
    return refreshYouTubeAccessToken(refreshToken, signal);
  }

  if (provider === "tiktok") {
    return refreshTikTokAccessToken(refreshToken, signal);
  }

  throw new ProviderSyncError(
    "kick",
    "TOKEN_REFRESH_FAILED",
    `Kick token refresh is not implemented for ${requestUrl.origin}.`,
  );
}

async function refreshTwitchAccessToken(
  refreshToken: string,
  signal: AbortSignal,
): Promise<TokenRefreshResult> {
  const clientId = process.env.TWITCH_CLIENT_ID?.trim();
  const clientSecret = process.env.TWITCH_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new ProviderSyncError(
      "twitch",
      "TOKEN_REFRESH_FAILED",
      "Missing Twitch OAuth environment variables.",
    );
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const response = await fetch(TWITCH_TOKEN_URL, {
    body,
    cache: "no-store",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    method: "POST",
    signal,
  });

  if (!response.ok) {
    throw new ProviderSyncError(
      "twitch",
      "TOKEN_REFRESH_FAILED",
      `Twitch token refresh failed with ${response.status}.`,
    );
  }

  const payload = (await response.json()) as {
    access_token: string;
    expires_in?: number;
    refresh_token?: string;
    scope?: string[];
  };
  const accessToken = parseRefreshedAccessToken("twitch", payload.access_token);

  return {
    accessToken,
    expiresAt: secondsFromNowToIso(payload.expires_in),
    refreshToken: payload.refresh_token ?? null,
    scopes: payload.scope ?? null,
  };
}

async function refreshYouTubeAccessToken(
  refreshToken: string,
  signal: AbortSignal,
): Promise<TokenRefreshResult> {
  const clientId = process.env.YOUTUBE_CLIENT_ID?.trim();
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new ProviderSyncError(
      "youtube",
      "TOKEN_REFRESH_FAILED",
      "Missing YouTube OAuth environment variables.",
    );
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const response = await fetch(YOUTUBE_TOKEN_URL, {
    body,
    cache: "no-store",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    method: "POST",
    signal,
  });

  if (!response.ok) {
    throw new ProviderSyncError(
      "youtube",
      "TOKEN_REFRESH_FAILED",
      `YouTube token refresh failed with ${response.status}.`,
    );
  }

  const payload = (await response.json()) as {
    access_token: string;
    expires_in?: number;
    refresh_token?: string;
    scope?: string;
  };
  const accessToken = parseRefreshedAccessToken(
    "youtube",
    payload.access_token,
  );

  return {
    accessToken,
    expiresAt: secondsFromNowToIso(payload.expires_in),
    refreshToken: payload.refresh_token ?? null,
    scopes: payload.scope?.trim().split(/\s+/).filter(Boolean) ?? null,
  };
}

async function refreshTikTokAccessToken(
  refreshToken: string,
  signal: AbortSignal,
): Promise<TokenRefreshResult> {
  const clientKey = process.env.TIKTOK_CLIENT_KEY?.trim();
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET?.trim();

  if (!clientKey || !clientSecret) {
    throw new ProviderSyncError(
      "tiktok",
      "TOKEN_REFRESH_FAILED",
      "Missing TikTok OAuth environment variables.",
    );
  }

  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const response = await fetch(TIKTOK_TOKEN_URL, {
    body,
    cache: "no-store",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    method: "POST",
    signal,
  });

  if (!response.ok) {
    throw new ProviderSyncError(
      "tiktok",
      "TOKEN_REFRESH_FAILED",
      `TikTok token refresh failed with ${response.status}.`,
    );
  }

  const payload = (await response.json()) as {
    access_token: string;
    expires_in?: number;
    refresh_token?: string;
    scope?: string;
  };
  const accessToken = parseRefreshedAccessToken("tiktok", payload.access_token);

  return {
    accessToken,
    expiresAt: secondsFromNowToIso(payload.expires_in),
    refreshToken: payload.refresh_token ?? null,
    scopes: payload.scope?.trim().split(/\s+/).filter(Boolean) ?? null,
  };
}

async function fetchAndNormalizeMetrics({
  accessToken,
  connection,
  provider,
  signal,
  userId,
}: {
  accessToken: string;
  connection: PlatformConnection;
  provider: SupportedProvider;
  signal: AbortSignal;
  userId: string;
}): Promise<MetricsSnapshot> {
  const context = {
    channelId: connection.channel_id ?? "",
    userId,
  };

  try {
    if (provider === "twitch") {
      const raw = await getTwitchChannelMetrics(
        accessToken,
        connection.provider_account_id,
        { signal },
      );

      return normalizeTwitch(raw, context);
    }

    if (provider === "youtube") {
      return normalizeYouTube(
        await getYouTubeChannelMetrics(accessToken, { signal }),
        context,
      );
    }

    if (provider === "tiktok") {
      return normalizeTikTok(
        await getTikTokChannelMetrics(accessToken, { signal }),
        context,
      );
    }

    return normalizeKick(
      await getKickChannelMetrics(accessToken, getKickChannelSlug(connection), {
        signal,
      }),
      context,
    );
  } catch (error) {
    if (error instanceof ProviderSyncError) {
      throw error;
    }

    throw new ProviderSyncError(
      provider,
      "PROVIDER_FETCH_FAILED",
      error instanceof Error ? error.message : "Provider metrics fetch failed.",
    );
  }
}

function toMetricsSnapshotInsert(
  connection: PlatformConnection,
  snapshot: MetricsSnapshot,
): Inserts<"metrics_snapshots"> {
  return {
    captured_at: snapshot.snapshot_at,
    captured_hour: getCapturedHourIso(snapshot.snapshot_at),
    channel_id: snapshot.channel_id,
    creator_id: connection.creator_id,
    follower_count: snapshot.followers ?? snapshot.subscribers ?? 0,
    platform: snapshot.provider,
    raw_payload: {
      ...snapshot.data,
      normalized: {
        followers: snapshot.followers,
        peak_viewers: snapshot.peak_viewers,
        subscribers: snapshot.subscribers,
        views: snapshot.views,
      },
      synced_at: new Date().toISOString(),
    } as Json,
    revenue_cents: 0,
    user_id: snapshot.user_id,
    viewer_count: snapshot.peak_viewers ?? 0,
    watch_time_minutes: 0,
  };
}

function enforceRateLimit(userId: string, provider: SupportedProvider) {
  const key = `sync:${userId}:${provider}`;
  const now = Date.now();

  pruneRateLimitStore(now);

  const lastSyncAt = rateLimitStore.get(key);

  if (lastSyncAt && now - lastSyncAt < RATE_LIMIT_WINDOW_MS) {
    throw new ProviderSyncError(
      provider,
      "RATE_LIMITED",
      "Only one metrics sync per provider per minute is allowed.",
    );
  }

  rateLimitStore.set(key, now);
}

function pruneRateLimitStore(now: number) {
  for (const [key, syncedAt] of rateLimitStore.entries()) {
    if (now - syncedAt >= RATE_LIMIT_WINDOW_MS) {
      rateLimitStore.delete(key);
    }
  }
}

function buildSyncResponse(
  providers: SupportedProvider[],
  results: Array<PromiseSettledResult<SupportedProvider>>,
): MetricsSyncResponse {
  return results.reduce<MetricsSyncResponse>(
    (response, result, index) => {
      if (result.status === "fulfilled") {
        response.synced.push(result.value);
        return response;
      }

      response.failed.push(
        toSyncFailure(providers[index] ?? "twitch", result.reason),
      );
      return response;
    },
    {
      failed: [],
      synced: [],
    },
  );
}

function toSyncFailure(
  provider: SupportedProvider,
  reason: unknown,
): MetricsSyncFailure {
  if (reason instanceof ProviderSyncError) {
    return {
      code: reason.code,
      provider: reason.provider,
      reason: reason.message,
    };
  }

  return {
    code: "PROVIDER_FETCH_FAILED",
    provider,
    reason: reason instanceof Error ? reason.message : "Provider sync failed.",
  };
}

async function readRequestBody(
  request: NextRequest,
): Promise<
  | { ok: true; value: MetricsSyncRequest }
  | { code: "INVALID_REQUEST" | "REQUEST_TOO_LARGE"; ok: false; value: null }
> {
  const rawBody = await readRequestText(request);

  if (!rawBody.ok) {
    return rawBody;
  }

  let body: unknown;

  try {
    body = JSON.parse(rawBody.value) as unknown;
  } catch {
    body = null;
  }

  if (!isMetricsSyncRequest(body)) {
    return { code: "INVALID_REQUEST", ok: false, value: null };
  }

  return { ok: true, value: body };
}

async function readRequestText(
  request: NextRequest,
): Promise<
  | { ok: true; value: string }
  | { code: "INVALID_REQUEST" | "REQUEST_TOO_LARGE"; ok: false; value: null }
> {
  const reader = request.body?.getReader();

  if (!reader) {
    return { code: "INVALID_REQUEST", ok: false, value: null };
  }

  const decoder = new TextDecoder();
  let bytesRead = 0;
  let rawBody = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    bytesRead += value.byteLength;

    if (bytesRead > MAX_REQUEST_BODY_BYTES) {
      await reader.cancel();

      return { code: "REQUEST_TOO_LARGE", ok: false, value: null };
    }

    rawBody += decoder.decode(value, { stream: true });
  }

  rawBody += decoder.decode();

  return { ok: true, value: rawBody };
}

function isMetricsSyncRequest(value: unknown): value is MetricsSyncRequest {
  if (!isRecord(value) || !Array.isArray(value.providers)) {
    return false;
  }

  return (
    value.providers.length > 0 &&
    value.providers.every(
      (provider) =>
        typeof provider === "string" && supportedProviderSet.has(provider),
    )
  );
}

function getKickChannelSlug(connection: PlatformConnection): string {
  const profile = connection.provider_profile;

  if (isRecord(profile) && typeof profile.handle === "string") {
    return profile.handle.replace(/^@/, "");
  }

  return connection.provider_account_id;
}

function getCapturedHourIso(value: string): string {
  const date = new Date(value);
  date.setUTCMinutes(0, 0, 0);
  return date.toISOString();
}

function parseExpiresAtMs(value: string | null): number {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }

  const parsed = new Date(value).getTime();

  return Number.isFinite(parsed) ? parsed : 0;
}

function parseRefreshedAccessToken(
  provider: SupportedProvider,
  value: string | undefined,
): string {
  const accessToken = value?.trim();

  if (!accessToken) {
    throw new ProviderSyncError(
      provider,
      "TOKEN_REFRESH_FAILED",
      `${provider} token refresh response did not include an access token.`,
    );
  }

  return accessToken;
}

function secondsFromNowToIso(expiresIn: number | undefined): string | null {
  if (
    typeof expiresIn !== "number" ||
    !Number.isFinite(expiresIn) ||
    expiresIn <= 0
  ) {
    return null;
  }

  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

function hasOversizedBody(request: NextRequest): boolean {
  const contentLength = request.headers.get("content-length");

  if (!contentLength) {
    return false;
  }

  const parsed = Number.parseInt(contentLength, 10);

  return Number.isFinite(parsed) && parsed > MAX_REQUEST_BODY_BYTES;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function logMetricsSyncError(error: unknown) {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  console.error(
    JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error",
      event: "metrics_sync_failed",
      service: "web",
    }),
  );
}

function logMetricsSyncAudit({
  providers,
  response,
  userId,
}: {
  providers: SupportedProvider[];
  response: MetricsSyncResponse;
  userId: string;
}) {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  console.info(
    JSON.stringify({
      event: "metrics_sync_completed",
      failed: response.failed.map((failure) => ({
        code: failure.code,
        provider: failure.provider,
      })),
      providers,
      service: "web",
      synced: response.synced,
      user_id: userId,
    }),
  );
}
