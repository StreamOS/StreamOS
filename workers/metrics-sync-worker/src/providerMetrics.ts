import type {
  Database,
  Inserts,
  Json,
  Tables,
  Updates,
} from "@streamos/database";
import type {
  MetricsSyncFailure,
  MetricsSyncJobData,
  MetricsSnapshot,
  SupportedProvider,
} from "@streamos/types";
import { normalizeMetricsSyncProviders } from "@streamos/queue";
import { decryptToken, encryptToken } from "@streamos/utils/crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const REQUEST_TIMEOUT_MS = 25_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const TOKEN_REFRESH_LEEWAY_MS = 60_000;
const YOUTUBE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const KICK_TOKEN_URL = "https://id.kick.com/oauth/token";
const KICK_CHANNEL_METRICS_URL = "https://api.kick.com/public/v1/channels";

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

type MetricsSyncWorkerEnv = {
  kickClientId?: string;
  kickClientSecret?: string;
  tiktokClientKey?: string;
  tiktokClientSecret?: string;
  twitchClientId?: string;
  twitchClientSecret?: string;
  youtubeClientId?: string;
  youtubeClientSecret?: string;
};

export type MetricsSyncWorkerDependencies = {
  env: MetricsSyncWorkerEnv;
  fetchImpl?: typeof fetch;
  supabase: SupabaseClient<Database, "public">;
};

export type MetricsSyncJobResult = {
  failed: MetricsSyncFailure[];
  synced: SupportedProvider[];
};

class ProviderSyncError extends Error {
  constructor(
    public readonly provider: SupportedProvider,
    public readonly code: MetricsSyncFailure["code"],
    message: string,
  ) {
    super(message);
    this.name = "ProviderSyncError";
  }
}

type KickCategory = {
  id: string | null;
  name: string | null;
  slug: string | null;
  thumbnailUrl: string | null;
};

type KickMetricsRaw = {
  activeSubscribers: number | null;
  category: KickCategory | null;
  channelId: string | null;
  channelSlug: string;
  displayName: string | null;
  isLive: boolean;
  livestream: {
    category: KickCategory | null;
    id: string | null;
    is_live: boolean;
    session_title: string | null;
    slug: string | null;
    started_at: string | null;
    thumbnail_url: string | null;
    viewer_count: number | null;
  } | null;
  title: string | null;
  username: string | null;
};

type TwitchMetricsRaw = {
  broadcasterId: string;
  followers: {
    total: number;
  };
  stream: {
    id: string;
    title: string;
    viewer_count: number;
    started_at: string;
  } | null;
  user: {
    id: string;
    login: string;
    display_name: string;
    view_count?: number;
  } | null;
};

type YouTubeMetricsRaw = {
  channel: {
    id: string;
    statistics?: {
      hiddenSubscriberCount?: boolean;
      subscriberCount?: string;
      viewCount?: string;
      videoCount?: string;
    };
  };
};

type TikTokMetricsRaw = {
  user: {
    open_id: string;
    display_name?: string;
    username?: string;
    follower_count?: number;
    likes_count?: number;
    video_count?: number;
    video_views?: number;
  };
};

const rateLimitStore = new Map<string, number>();
let kickTokenCache: { accessToken: string; expiresAt: number } | null = null;

export async function processMetricsSyncJob(
  payload: MetricsSyncJobData,
  dependencies: MetricsSyncWorkerDependencies,
): Promise<MetricsSyncJobResult> {
  const providers = normalizeMetricsSyncProviders(payload.providers);

  if (providers.length === 0) {
    throw new Error("metrics sync requires at least one supported provider.");
  }

  const result: MetricsSyncJobResult = {
    failed: [],
    synced: [],
  };

  for (const provider of providers) {
    try {
      await syncProvider(provider, payload.user_id, dependencies);
      result.synced.push(provider);
    } catch (error) {
      result.failed.push(toSyncFailure(provider, error));
      logMetricsSyncFailure(provider, error, payload.user_id);
    }
  }

  logMetricsSyncSummary(payload.user_id, result);

  return result;
}

async function syncProvider(
  provider: SupportedProvider,
  userId: string,
  dependencies: MetricsSyncWorkerDependencies,
): Promise<void> {
  enforceRateLimit(userId, provider);

  const connection = await getLatestConnection({
    provider,
    supabase: dependencies.supabase,
    userId,
  });

  assertConnectionSyncable(connection, provider);

  if (!connection.channel_id) {
    throw new ProviderSyncError(
      provider,
      "CONNECTION_NOT_FOUND",
      "Platform connection has no linked StreamOS channel.",
    );
  }

  const accessToken =
    provider === "kick"
      ? ""
      : await getUsableAccessToken({
          connection,
          dependencies,
          provider,
          userId,
        });

  const snapshot = await fetchAndNormalizeMetrics({
    accessToken,
    connection,
    dependencies,
    provider,
    userId,
  });

  const payload = toMetricsSnapshotInsert(connection, snapshot);
  const result = await dependencies.supabase
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
}

async function getLatestConnection({
  provider,
  supabase,
  userId,
}: {
  provider: SupportedProvider;
  supabase: MetricsSyncWorkerDependencies["supabase"];
  userId: string;
}): Promise<PlatformConnection> {
  const result = await supabase
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
  dependencies,
  provider,
  userId,
}: {
  connection: PlatformConnection;
  dependencies: MetricsSyncWorkerDependencies;
  provider: SupportedProvider;
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
      dependencies,
      provider,
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
  dependencies,
  provider,
  userId,
}: {
  connection: PlatformConnection;
  dependencies: MetricsSyncWorkerDependencies;
  provider: SupportedProvider;
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
    dependencies,
    provider,
    refreshToken,
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
  const updateResult = await dependencies.supabase
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
  dependencies,
  provider,
  refreshToken,
}: {
  dependencies: MetricsSyncWorkerDependencies;
  provider: SupportedProvider;
  refreshToken: string;
}): Promise<TokenRefreshResult> {
  if (provider === "twitch") {
    return refreshTwitchAccessToken(
      dependencies.env.twitchClientId,
      dependencies.env.twitchClientSecret,
      refreshToken,
      dependencies.fetchImpl ?? fetch,
    );
  }

  if (provider === "youtube") {
    return refreshYouTubeAccessToken(
      dependencies.env.youtubeClientId,
      dependencies.env.youtubeClientSecret,
      refreshToken,
      dependencies.fetchImpl ?? fetch,
    );
  }

  if (provider === "tiktok") {
    return refreshTikTokAccessToken(
      dependencies.env.tiktokClientKey,
      dependencies.env.tiktokClientSecret,
      refreshToken,
      dependencies.fetchImpl ?? fetch,
    );
  }

  throw new ProviderSyncError(
    "kick",
    "TOKEN_REFRESH_FAILED",
    "Kick token refresh is not implemented.",
  );
}

async function refreshTwitchAccessToken(
  clientId: string | undefined,
  clientSecret: string | undefined,
  refreshToken: string,
  fetchImpl: typeof fetch,
): Promise<TokenRefreshResult> {
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
  const response = await fetchImpl(TWITCH_TOKEN_URL, {
    body,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    method: "POST",
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
  clientId: string | undefined,
  clientSecret: string | undefined,
  refreshToken: string,
  fetchImpl: typeof fetch,
): Promise<TokenRefreshResult> {
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
  const response = await fetchImpl(YOUTUBE_TOKEN_URL, {
    body,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    method: "POST",
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
  clientKey: string | undefined,
  clientSecret: string | undefined,
  refreshToken: string,
  fetchImpl: typeof fetch,
): Promise<TokenRefreshResult> {
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
  const response = await fetchImpl(TIKTOK_TOKEN_URL, {
    body,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    method: "POST",
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
  dependencies,
  provider,
  userId,
}: {
  accessToken: string;
  connection: PlatformConnection;
  dependencies: MetricsSyncWorkerDependencies;
  provider: SupportedProvider;
  userId: string;
}): Promise<MetricsSnapshot> {
  const context = {
    channelId: connection.channel_id ?? "",
    userId,
  };
  const fetchImpl = dependencies.fetchImpl ?? fetch;

  try {
    if (provider === "twitch") {
      const raw = await getTwitchChannelMetrics(
        accessToken,
        connection.provider_account_id,
        dependencies.env.twitchClientId,
        fetchImpl,
      );

      return normalizeTwitch(raw, context);
    }

    if (provider === "youtube") {
      return normalizeYouTube(
        await getYouTubeChannelMetrics(accessToken, fetchImpl),
        context,
      );
    }

    if (provider === "tiktok") {
      return normalizeTikTok(
        await getTikTokChannelMetrics(accessToken, fetchImpl),
        context,
      );
    }

    return normalizeKick(
      await getKickChannelMetricsWithCachedToken(
        getKickChannelSlug(connection),
        fetchImpl,
      ),
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

function normalizeTwitch(
  raw: TwitchMetricsRaw,
  context: { channelId: string; userId: string },
): MetricsSnapshot {
  return createSnapshot({
    context,
    data: raw,
    followers: raw.followers.total,
    peakViewers: raw.stream?.viewer_count ?? null,
    provider: "twitch",
    subscribers: null,
    views: raw.user?.view_count ?? null,
  });
}

function normalizeYouTube(
  raw: YouTubeMetricsRaw,
  context: { channelId: string; userId: string },
): MetricsSnapshot {
  const subscribers = raw.channel.statistics?.hiddenSubscriberCount
    ? null
    : parseMetric(raw.channel.statistics?.subscriberCount);

  return createSnapshot({
    context,
    data: raw,
    followers: null,
    peakViewers: null,
    provider: "youtube",
    subscribers,
    views: parseMetric(raw.channel.statistics?.viewCount),
  });
}

function normalizeTikTok(
  raw: TikTokMetricsRaw,
  context: { channelId: string; userId: string },
): MetricsSnapshot {
  return createSnapshot({
    context,
    data: raw,
    followers: raw.user.follower_count ?? null,
    peakViewers: null,
    provider: "tiktok",
    subscribers: null,
    views: raw.user.video_views ?? null,
  });
}

function normalizeKick(
  raw: KickMetricsRaw,
  context: { channelId: string; userId: string },
): MetricsSnapshot {
  return createSnapshot({
    context,
    data: raw,
    followers: null,
    peakViewers: raw.livestream?.viewer_count ?? null,
    provider: "kick",
    subscribers: raw.activeSubscribers ?? null,
    views: null,
  });
}

function createSnapshot({
  context,
  data,
  followers,
  peakViewers,
  provider,
  subscribers,
  views,
}: {
  context: { channelId: string; userId: string };
  data: Record<string, unknown>;
  followers: number | null;
  peakViewers: number | null;
  provider: SupportedProvider;
  subscribers: number | null;
  views: number | null;
}): MetricsSnapshot {
  return {
    channel_id: context.channelId,
    data,
    followers,
    peak_viewers: peakViewers,
    provider,
    snapshot_at: new Date().toISOString(),
    subscribers,
    user_id: context.userId,
    views,
  };
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

async function getTwitchChannelMetrics(
  accessToken: string,
  broadcasterId: string,
  clientId: string | undefined,
  fetchImpl: typeof fetch,
): Promise<TwitchMetricsRaw> {
  if (!clientId) {
    throw new ProviderSyncError(
      "twitch",
      "TOKEN_REFRESH_FAILED",
      "TWITCH_CLIENT_ID is required for Twitch metrics sync.",
    );
  }

  const [followers, streams, users] = await Promise.all([
    fetchTwitch<TwitchFollowersResponse>(
      "https://api.twitch.tv/helix/channels/followers",
      accessToken,
      clientId,
      [["broadcaster_id", broadcasterId]],
      fetchImpl,
    ),
    fetchTwitch<TwitchStreamsResponse>(
      "https://api.twitch.tv/helix/streams",
      accessToken,
      clientId,
      [["user_id", broadcasterId]],
      fetchImpl,
    ),
    fetchTwitch<TwitchUsersResponse>(
      "https://api.twitch.tv/helix/users",
      accessToken,
      clientId,
      [["id", broadcasterId]],
      fetchImpl,
    ),
  ]);

  return {
    broadcasterId,
    followers: {
      total: followers.total ?? 0,
    },
    stream: streams.data?.[0] ?? null,
    user: users.data?.[0] ?? null,
  };
}

type TwitchFollowersResponse = {
  total?: number;
};

type TwitchStreamsResponse = {
  data?: Array<{
    id: string;
    title: string;
    viewer_count: number;
    started_at: string;
  }>;
};

type TwitchUsersResponse = {
  data?: Array<{
    id: string;
    login: string;
    display_name: string;
    view_count?: number;
  }>;
};

async function fetchTwitch<TPayload>(
  endpoint: string,
  accessToken: string,
  clientId: string,
  params: Array<[string, string]>,
  fetchImpl: typeof fetch,
): Promise<TPayload> {
  const url = new URL(endpoint);
  params.forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const response = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Client-Id": clientId,
    },
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(`Twitch metrics request failed with ${response.status}.`);
  }

  return (await response.json()) as TPayload;
}

async function getYouTubeChannelMetrics(
  accessToken: string,
  fetchImpl: typeof fetch,
): Promise<YouTubeMetricsRaw> {
  const url = new URL("https://www.googleapis.com/youtube/v3/channels");
  url.searchParams.set("mine", "true");
  url.searchParams.set("part", "statistics");

  const response = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(`YouTube metrics request failed with ${response.status}.`);
  }

  const payload = (await response.json()) as {
    items?: YouTubeMetricsRaw["channel"][];
  };
  const channel = payload.items?.[0];

  if (!channel) {
    throw new Error("YouTube metrics request returned no channel.");
  }

  return { channel };
}

async function getTikTokChannelMetrics(
  accessToken: string,
  fetchImpl: typeof fetch,
): Promise<TikTokMetricsRaw> {
  const url = new URL("https://open.tiktokapis.com/v2/user/info/");
  url.searchParams.set(
    "fields",
    [
      "open_id",
      "display_name",
      "username",
      "follower_count",
      "likes_count",
      "video_count",
    ].join(","),
  );

  const response = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(`TikTok metrics request failed with ${response.status}.`);
  }

  const payload = (await response.json()) as {
    data?: { user?: TikTokMetricsRaw["user"] };
    error?: { code?: string; message?: string };
  };

  if (payload.error?.code && payload.error.code !== "ok") {
    throw new Error(
      payload.error.message || `TikTok metrics error: ${payload.error.code}.`,
    );
  }

  const user = payload.data?.user;

  if (!user?.open_id) {
    throw new Error("TikTok metrics request returned no user.");
  }

  return { user };
}

async function getKickChannelMetricsWithCachedToken(
  channelSlug: string,
  fetchImpl: typeof fetch,
): Promise<KickMetricsRaw> {
  const normalizedSlug = normalizeKickChannelSlug(channelSlug);
  const response = await fetchKickChannelMetricsResponse(
    await getKickAccessToken(fetchImpl),
    normalizedSlug,
    fetchImpl,
  );

  if (response.status !== 401) {
    return parseKickChannelMetricsResponse(response, normalizedSlug);
  }

  kickTokenCache = null;

  const retryResponse = await fetchKickChannelMetricsResponse(
    await getKickAccessToken(fetchImpl),
    normalizedSlug,
    fetchImpl,
  );

  if (retryResponse.status === 401) {
    throw new Error("Kick API: unauthorized after token refresh");
  }

  return parseKickChannelMetricsResponse(retryResponse, normalizedSlug);
}

async function getKickAccessToken(fetchImpl: typeof fetch): Promise<string> {
  const now = Date.now();

  if (kickTokenCache && kickTokenCache.expiresAt > now) {
    return kickTokenCache.accessToken;
  }

  const clientId = process.env.KICK_CLIENT_ID?.trim();
  const clientSecret = process.env.KICK_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new Error("Kick OAuth client credentials are not configured.");
  }

  const response = await fetchImpl(KICK_TOKEN_URL, {
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(
      `Kick token request failed with status ${response.status}.`,
    );
  }

  const payload = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  const accessToken = payload.access_token?.trim();

  if (!accessToken) {
    throw new Error("Kick token response did not include an access token.");
  }

  kickTokenCache = {
    accessToken,
    expiresAt: now + Math.max((payload.expires_in ?? 0) - 60, 0) * 1000,
  };

  return accessToken;
}

function normalizeKickChannelSlug(channelSlug: string): string {
  const normalizedSlug = channelSlug.trim().replace(/^@/, "");

  if (!normalizedSlug) {
    throw new Error("Kick channel slug is required for metrics sync.");
  }

  return normalizedSlug;
}

async function fetchKickChannelMetricsResponse(
  accessToken: string,
  normalizedSlug: string,
  fetchImpl: typeof fetch,
): Promise<Response> {
  const url = new URL(KICK_CHANNEL_METRICS_URL);
  url.searchParams.append("slug", normalizedSlug);

  return fetchImpl(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

async function parseKickChannelMetricsResponse(
  response: Response,
  normalizedSlug: string,
): Promise<KickMetricsRaw> {
  if (response.status === 400) {
    throw new Error("Kick metrics request rejected the channel slug.");
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error(
      `Kick metrics request was not authorized with status ${response.status}.`,
    );
  }

  if (response.status === 429) {
    throw new Error("Kick metrics request was rate limited with status 429.");
  }

  if (!response.ok) {
    throw new Error(
      `Kick metrics request failed with status ${response.status}.`,
    );
  }

  const payload = (await response.json()) as {
    data?: Array<{
      active_subscribers_count?: number | string | null;
      broadcaster_user_id?: number | string | null;
      category?: Record<string, unknown> | null;
      stream?: Record<string, unknown> | null;
      slug?: string | null;
      stream_title?: string | null;
    }>;
  };

  if (!Array.isArray(payload.data)) {
    throw new Error(
      "Kick metrics request returned an invalid channels payload.",
    );
  }

  const channel =
    payload.data.find(
      (item) => item.slug?.toLowerCase() === normalizedSlug.toLowerCase(),
    ) ?? payload.data[0];

  if (!channel) {
    throw new Error(`Kick channel "${normalizedSlug}" was not found.`);
  }

  return normalizeKickChannelPayload(channel, normalizedSlug);
}

function normalizeKickChannelPayload(
  payload: {
    active_subscribers_count?: number | string | null;
    broadcaster_user_id?: number | string | null;
    category?: Record<string, unknown> | null;
    stream?: Record<string, unknown> | null;
    slug?: string | null;
    stream_title?: string | null;
  },
  channelSlug: string,
): KickMetricsRaw {
  const livestreamRecord = readRecord(payload, "stream");
  const streamTitle = readString(payload, "stream_title");
  const livestream = livestreamRecord
    ? normalizeLivestream(livestreamRecord, streamTitle)
    : null;

  return {
    activeSubscribers: readNumber(payload, "active_subscribers_count"),
    category: livestream?.category ?? readCategory(payload, "category"),
    channelId: readFirstString(payload, "broadcaster_user_id"),
    channelSlug: readString(payload, "slug") ?? channelSlug,
    displayName: readString(payload, "slug") ?? channelSlug,
    isLive: livestream?.is_live ?? false,
    livestream,
    title: streamTitle,
    username: readString(payload, "slug") ?? channelSlug,
  };
}

function getKickChannelSlug(connection: PlatformConnection): string {
  const profile = connection.provider_profile;

  if (isRecord(profile) && typeof profile.handle === "string") {
    return profile.handle.replace(/^@/, "");
  }

  return connection.provider_account_id;
}

function normalizeLivestream(
  livestream: Record<string, unknown>,
  fallbackTitle: string | null = null,
): NonNullable<KickMetricsRaw["livestream"]> {
  const viewerCount = readNumber(livestream, "viewer_count");
  const isLive = readBoolean(livestream, "is_live") ?? viewerCount !== null;

  return {
    category: readCategory(livestream, "category"),
    id: readFirstString(livestream, "id"),
    is_live: isLive,
    session_title: readString(livestream, "session_title") ?? fallbackTitle,
    slug: readString(livestream, "slug"),
    started_at: readString(livestream, "started_at"),
    thumbnail_url: readString(livestream, "thumbnail_url"),
    viewer_count: viewerCount,
  };
}

function readRecord(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null {
  const candidate = value[key];

  return isRecord(candidate) ? candidate : null;
}

function readString(
  value: Record<string, unknown>,
  key: string,
): string | null {
  const candidate = value[key];

  return typeof candidate === "string" && candidate.trim()
    ? candidate.trim()
    : null;
}

function readFirstString(
  value: Record<string, unknown>,
  key: string,
): string | null {
  const candidate = value[key];

  if (typeof candidate === "string" && candidate.trim()) {
    return candidate.trim();
  }

  if (typeof candidate === "number" && Number.isFinite(candidate)) {
    return String(candidate);
  }

  return null;
}

function readNumber(
  value: Record<string, unknown>,
  key: string,
): number | null {
  const candidate = value[key];

  if (typeof candidate === "number" && Number.isFinite(candidate)) {
    return candidate;
  }

  if (typeof candidate === "string") {
    const parsed = Number.parseInt(candidate, 10);

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function readBoolean(
  value: Record<string, unknown>,
  key: string,
): boolean | null {
  const candidate = value[key];

  return typeof candidate === "boolean" ? candidate : null;
}

function readCategory(
  value: Record<string, unknown>,
  key: string,
): KickCategory | null {
  const candidate = readRecord(value, key);

  if (!candidate) {
    return null;
  }

  return {
    id: readString(candidate, "id"),
    name: readString(candidate, "name"),
    slug: readString(candidate, "slug"),
    thumbnailUrl: readString(candidate, "thumbnail_url"),
  };
}

function parseMetric(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) ? parsed : null;
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

function logMetricsSyncFailure(
  provider: SupportedProvider,
  error: unknown,
  userId: string,
) {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  console.warn(
    JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error",
      event: "metrics_sync_provider_failed",
      provider,
      service: "metrics-sync-worker",
      user_id: userId,
    }),
  );
}

function logMetricsSyncSummary(userId: string, result: MetricsSyncJobResult) {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  console.info(
    JSON.stringify({
      event: "metrics_sync_completed",
      failed: result.failed.map((failure) => ({
        code: failure.code,
        provider: failure.provider,
      })),
      service: "metrics-sync-worker",
      synced: result.synced,
      user_id: userId,
    }),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
