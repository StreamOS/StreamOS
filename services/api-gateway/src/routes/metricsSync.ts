import express from "express";
import type { Request, Response as ExpressResponse, Router } from "express";
import { z } from "zod";
import type {
  MetricsSnapshot,
  MetricsSyncErrorCode,
  MetricsSyncFailure,
  MetricsSyncResponse,
  SupportedProvider,
} from "@streamos/types";

import { decryptSecret, encryptSecret } from "../oauth/encryption.js";
import {
  createSupabaseRestClient,
  patchSupabaseRows,
  readSupabaseRows,
  upsertSupabaseRow,
  type SupabaseRestClient,
} from "../lib/supabaseRest.js";

const REQUEST_TIMEOUT_MS = 25_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const TOKEN_REFRESH_LEEWAY_MS = 60_000;
const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const TWITCH_USERS_URL = "https://api.twitch.tv/helix/users";
const TWITCH_STREAMS_URL = "https://api.twitch.tv/helix/streams";
const TWITCH_CHANNEL_FOLLOWERS_URL =
  "https://api.twitch.tv/helix/channels/followers";
const YOUTUBE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const YOUTUBE_CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels";
const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const TIKTOK_USER_INFO_URL = "https://open.tiktokapis.com/v2/user/info/";
const TIKTOK_USER_FIELDS = [
  "open_id",
  "display_name",
  "username",
  "follower_count",
  "likes_count",
  "video_count",
].join(",");
const KICK_CHANNEL_METRICS_URL = "https://api.kick.com/public/v1/channels";
const KICK_TOKEN_URL = "https://id.kick.com/oauth/token";
const KICK_TOKEN_EXPIRY_BUFFER_SECONDS = 60;

const requestSchema = z.object({
  providers: z.array(z.enum(["twitch", "youtube", "tiktok", "kick"])).min(1),
  user_id: z.string().uuid(),
});

type MetricsSyncGatewayRequest = z.infer<typeof requestSchema>;

type PlatformConnection = {
  access_token_ciphertext: string | null;
  channel_id: string | null;
  creator_id: string;
  expires_at: string | null;
  id: string;
  platform: SupportedProvider;
  provider_account_id: string;
  provider_profile: unknown;
  refresh_token_ciphertext: string | null;
  scopes: string[] | null;
  status: string;
  user_id: string;
};

type TokenRefreshResult = {
  accessToken: string;
  expiresAt: string | null;
  refreshToken: string | null;
  scopes: string[] | null;
};

type KickTokenCache = {
  accessToken: string;
  expiresAt: number;
};

let kickTokenCache: KickTokenCache | null = null;
const rateLimitStore = new Map<string, number>();

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

export function createMetricsSyncRouter({
  fetchImpl = fetch,
  now = Date.now,
}: {
  fetchImpl?: typeof fetch;
  now?: () => number;
} = {}): Router {
  const router = express.Router();

  router.post("/sync", async (request: Request, response: ExpressResponse) => {
    const parsedPayload = requestSchema.safeParse(request.body);

    if (!parsedPayload.success) {
      response.status(400).json({
        error: "invalid_metrics_sync_payload",
        issues: parsedPayload.error.issues,
      });
      return;
    }

    const abortController = new AbortController();
    const timeout = setTimeout(
      () => abortController.abort(),
      REQUEST_TIMEOUT_MS,
    );

    let supabase: SupabaseRestClient;

    try {
      supabase = createSupabaseRestClient({ fetchImpl });
    } catch (error) {
      response.status(503).json({
        error: "supabase_not_configured",
        message: error instanceof Error ? error.message : String(error),
      });
      clearTimeout(timeout);
      return;
    }

    try {
      const payload = parsedPayload.data;
      const providers = [...new Set(payload.providers)];
      const results = await Promise.allSettled(
        providers.map((provider) =>
          syncProvider({
            fetchImpl,
            now,
            payload,
            provider,
            signal: abortController.signal,
            supabase,
          }),
        ),
      );
      const syncResponse = buildSyncResponse(providers, results);

      logMetricsSyncAudit({
        providers,
        response: syncResponse,
        userId: payload.user_id,
      });

      response
        .status(syncResponse.failed.length > 0 ? 207 : 200)
        .json(syncResponse);
    } catch (error) {
      logMetricsSyncError(error);

      response.status(500).json({
        error: "metrics_sync_failed",
        message: "Metrics sync could not be initialized.",
      });
    } finally {
      clearTimeout(timeout);
    }
  });

  return router;
}

async function syncProvider({
  fetchImpl,
  now,
  payload,
  provider,
  signal,
  supabase,
}: {
  fetchImpl: typeof fetch;
  now: () => number;
  payload: MetricsSyncGatewayRequest;
  provider: SupportedProvider;
  signal: AbortSignal;
  supabase: SupabaseRestClient;
}): Promise<SupportedProvider> {
  enforceRateLimit(payload.user_id, provider, now());

  const connection = await getLatestConnection({
    provider,
    supabase,
    userId: payload.user_id,
  });

  assertConnectionSyncable(connection, provider);

  const accessToken =
    provider === "kick"
      ? ""
      : await getUsableAccessToken({
          connection,
          fetchImpl,
          now,
          provider,
          signal,
          supabase,
          userId: payload.user_id,
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
    fetchImpl,
    provider,
    signal,
    userId: payload.user_id,
  });

  await upsertSupabaseRow({
    client: supabase,
    onConflict: "user_id,platform,captured_hour",
    payload: toMetricsSnapshotInsert(connection, snapshot),
    table: "metrics_snapshots",
  });

  return provider;
}

async function getLatestConnection({
  provider,
  supabase,
  userId,
}: {
  provider: SupportedProvider;
  supabase: SupabaseRestClient;
  userId: string;
}): Promise<PlatformConnection> {
  const rows = await readSupabaseRows<PlatformConnection>({
    client: supabase,
    params: {
      limit: "1",
      order: "connected_at.desc",
      platform: `eq.${provider}`,
      select:
        "id,user_id,creator_id,channel_id,platform,provider_account_id,provider_profile,access_token_ciphertext,refresh_token_ciphertext,scopes,expires_at,status",
      user_id: `eq.${userId}`,
    },
    table: "platform_connections",
  });
  const connection = rows[0];

  if (!connection) {
    throw new ProviderSyncError(
      provider,
      "CONNECTION_NOT_FOUND",
      `No ${provider} connection found for this user.`,
    );
  }

  return connection;
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
  fetchImpl,
  now,
  provider,
  signal,
  supabase,
  userId,
}: {
  connection: PlatformConnection;
  fetchImpl: typeof fetch;
  now: () => number;
  provider: SupportedProvider;
  signal: AbortSignal;
  supabase: SupabaseRestClient;
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
    expiresAt <= now() + TOKEN_REFRESH_LEEWAY_MS;

  if (shouldRefresh) {
    return refreshConnectionToken({
      connection,
      fetchImpl,
      provider,
      signal,
      supabase,
      userId,
    });
  }

  try {
    return decryptSecret(connection.access_token_ciphertext);
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
  fetchImpl,
  provider,
  signal,
  supabase,
  userId,
}: {
  connection: PlatformConnection;
  fetchImpl: typeof fetch;
  provider: SupportedProvider;
  signal: AbortSignal;
  supabase: SupabaseRestClient;
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
    refreshToken = decryptSecret(connection.refresh_token_ciphertext);
  } catch {
    throw new ProviderSyncError(
      provider,
      "TOKEN_DECRYPT_FAILED",
      "Could not decrypt platform refresh token.",
    );
  }

  const refreshed = await refreshProviderToken({
    fetchImpl,
    provider,
    refreshToken,
    signal,
  });

  await patchSupabaseRows({
    client: supabase,
    params: {
      id: `eq.${connection.id}`,
      user_id: `eq.${userId}`,
    },
    payload: {
      access_token_ciphertext: encryptSecret(refreshed.accessToken),
      expires_at: refreshed.expiresAt,
      refresh_token_ciphertext: refreshed.refreshToken
        ? encryptSecret(refreshed.refreshToken)
        : connection.refresh_token_ciphertext,
      scopes: refreshed.scopes ?? connection.scopes,
      status: "connected",
    },
    table: "platform_connections",
  });

  return refreshed.accessToken;
}

async function refreshProviderToken({
  fetchImpl,
  provider,
  refreshToken,
  signal,
}: {
  fetchImpl: typeof fetch;
  provider: SupportedProvider;
  refreshToken: string;
  signal: AbortSignal;
}): Promise<TokenRefreshResult> {
  if (provider === "twitch") {
    return refreshTwitchAccessToken({ fetchImpl, refreshToken, signal });
  }

  if (provider === "youtube") {
    return refreshYouTubeAccessToken({ fetchImpl, refreshToken, signal });
  }

  if (provider === "tiktok") {
    return refreshTikTokAccessToken({ fetchImpl, refreshToken, signal });
  }

  throw new ProviderSyncError(
    "kick",
    "TOKEN_REFRESH_FAILED",
    "Kick token refresh is not implemented for metrics sync.",
  );
}

async function refreshTwitchAccessToken({
  fetchImpl,
  refreshToken,
  signal,
}: {
  fetchImpl: typeof fetch;
  refreshToken: string;
  signal: AbortSignal;
}): Promise<TokenRefreshResult> {
  const clientId = process.env.TWITCH_CLIENT_ID?.trim();
  const clientSecret = process.env.TWITCH_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new ProviderSyncError(
      "twitch",
      "TOKEN_REFRESH_FAILED",
      "Missing Twitch OAuth environment variables.",
    );
  }

  const response = await fetchImpl(TWITCH_TOKEN_URL, {
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
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
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    scope?: string[];
  };

  return {
    accessToken: parseRefreshedAccessToken("twitch", payload.access_token),
    expiresAt: secondsFromNowToIso(payload.expires_in),
    refreshToken: payload.refresh_token ?? null,
    scopes: payload.scope ?? null,
  };
}

async function refreshYouTubeAccessToken({
  fetchImpl,
  refreshToken,
  signal,
}: {
  fetchImpl: typeof fetch;
  refreshToken: string;
  signal: AbortSignal;
}): Promise<TokenRefreshResult> {
  const clientId = process.env.YOUTUBE_CLIENT_ID?.trim();
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new ProviderSyncError(
      "youtube",
      "TOKEN_REFRESH_FAILED",
      "Missing YouTube OAuth environment variables.",
    );
  }

  const response = await fetchImpl(YOUTUBE_TOKEN_URL, {
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
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
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    scope?: string;
  };

  return {
    accessToken: parseRefreshedAccessToken("youtube", payload.access_token),
    expiresAt: secondsFromNowToIso(payload.expires_in),
    refreshToken: payload.refresh_token ?? null,
    scopes: payload.scope?.trim().split(/\s+/).filter(Boolean) ?? null,
  };
}

async function refreshTikTokAccessToken({
  fetchImpl,
  refreshToken,
  signal,
}: {
  fetchImpl: typeof fetch;
  refreshToken: string;
  signal: AbortSignal;
}): Promise<TokenRefreshResult> {
  const clientKey = process.env.TIKTOK_CLIENT_KEY?.trim();
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET?.trim();

  if (!clientKey || !clientSecret) {
    throw new ProviderSyncError(
      "tiktok",
      "TOKEN_REFRESH_FAILED",
      "Missing TikTok OAuth environment variables.",
    );
  }

  const response = await fetchImpl(TIKTOK_TOKEN_URL, {
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
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
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    scope?: string;
  };

  return {
    accessToken: parseRefreshedAccessToken("tiktok", payload.access_token),
    expiresAt: secondsFromNowToIso(payload.expires_in),
    refreshToken: payload.refresh_token ?? null,
    scopes: payload.scope?.trim().split(/\s+/).filter(Boolean) ?? null,
  };
}

async function fetchAndNormalizeMetrics({
  accessToken,
  connection,
  fetchImpl,
  provider,
  signal,
  userId,
}: {
  accessToken: string;
  connection: PlatformConnection;
  fetchImpl: typeof fetch;
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
      return normalizeTwitch(
        await getTwitchChannelMetrics({
          accessToken,
          broadcasterId: connection.provider_account_id,
          fetchImpl,
          signal,
        }),
        context,
      );
    }

    if (provider === "youtube") {
      return normalizeYouTube(
        await getYouTubeChannelMetrics({ accessToken, fetchImpl, signal }),
        context,
      );
    }

    if (provider === "tiktok") {
      return normalizeTikTok(
        await getTikTokChannelMetrics({ accessToken, fetchImpl, signal }),
        context,
      );
    }

    return normalizeKick(
      await getKickChannelMetricsWithCachedToken({
        channelSlug: getKickChannelSlug(connection),
        fetchImpl,
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

type TwitchMetricsRaw = {
  broadcasterId: string;
  followers: {
    total: number;
  };
  stream: {
    id: string;
    started_at: string;
    title: string;
    viewer_count: number;
  } | null;
  user: {
    display_name: string;
    id: string;
    login: string;
    view_count?: number;
  } | null;
};

async function getTwitchChannelMetrics({
  accessToken,
  broadcasterId,
  fetchImpl,
  signal,
}: {
  accessToken: string;
  broadcasterId: string;
  fetchImpl: typeof fetch;
  signal: AbortSignal;
}): Promise<TwitchMetricsRaw> {
  const clientId = process.env.TWITCH_CLIENT_ID?.trim();

  if (!clientId) {
    throw new Error("TWITCH_CLIENT_ID is required for Twitch metrics sync.");
  }

  const [followers, streams, users] = await Promise.all([
    fetchTwitch<{
      total?: number;
    }>({
      accessToken,
      clientId,
      endpoint: TWITCH_CHANNEL_FOLLOWERS_URL,
      fetchImpl,
      params: [["broadcaster_id", broadcasterId]],
      signal,
    }),
    fetchTwitch<{
      data?: Array<{
        id: string;
        started_at: string;
        title: string;
        viewer_count: number;
      }>;
    }>({
      accessToken,
      clientId,
      endpoint: TWITCH_STREAMS_URL,
      fetchImpl,
      params: [["user_id", broadcasterId]],
      signal,
    }),
    fetchTwitch<{
      data?: Array<{
        display_name: string;
        id: string;
        login: string;
        view_count?: number;
      }>;
    }>({
      accessToken,
      clientId,
      endpoint: TWITCH_USERS_URL,
      fetchImpl,
      params: [["id", broadcasterId]],
      signal,
    }),
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

async function fetchTwitch<TPayload>({
  accessToken,
  clientId,
  endpoint,
  fetchImpl,
  params,
  signal,
}: {
  accessToken: string;
  clientId: string;
  endpoint: string;
  fetchImpl: typeof fetch;
  params: Array<[string, string]>;
  signal: AbortSignal;
}): Promise<TPayload> {
  const url = new URL(endpoint);

  params.forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const response = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Client-Id": clientId,
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Twitch metrics request failed with ${response.status}.`);
  }

  return (await response.json()) as TPayload;
}

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

async function getYouTubeChannelMetrics({
  accessToken,
  fetchImpl,
  signal,
}: {
  accessToken: string;
  fetchImpl: typeof fetch;
  signal: AbortSignal;
}): Promise<YouTubeMetricsRaw> {
  const url = new URL(YOUTUBE_CHANNELS_URL);
  url.searchParams.set("mine", "true");
  url.searchParams.set("part", "statistics");

  const response = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    signal,
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

type TikTokMetricsRaw = {
  user: {
    display_name?: string;
    follower_count?: number;
    likes_count?: number;
    open_id: string;
    username?: string;
    video_count?: number;
    video_views?: number;
  };
};

async function getTikTokChannelMetrics({
  accessToken,
  fetchImpl,
  signal,
}: {
  accessToken: string;
  fetchImpl: typeof fetch;
  signal: AbortSignal;
}): Promise<TikTokMetricsRaw> {
  const url = new URL(TIKTOK_USER_INFO_URL);
  url.searchParams.set("fields", TIKTOK_USER_FIELDS);

  const response = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`TikTok metrics request failed with ${response.status}.`);
  }

  const payload = (await response.json()) as {
    data?: {
      user?: TikTokMetricsRaw["user"];
    };
    error?: {
      code?: string;
      message?: string;
    };
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

async function getKickChannelMetricsWithCachedToken({
  channelSlug,
  fetchImpl,
  signal,
}: {
  channelSlug: string;
  fetchImpl: typeof fetch;
  signal: AbortSignal;
}): Promise<KickMetricsRaw> {
  const normalizedSlug = normalizeKickChannelSlug(channelSlug);
  const response = await fetchKickChannelMetricsResponse({
    accessToken: await getKickAccessToken({ fetchImpl }),
    fetchImpl,
    normalizedSlug,
    signal,
  });

  if (response.status !== 401) {
    return parseKickChannelMetricsResponse(response, normalizedSlug);
  }

  kickTokenCache = null;

  const retryResponse = await fetchKickChannelMetricsResponse({
    accessToken: await getKickAccessToken({ fetchImpl }),
    fetchImpl,
    normalizedSlug,
    signal,
  });

  if (retryResponse.status === 401) {
    throw new Error("Kick API: unauthorized after token refresh");
  }

  return parseKickChannelMetricsResponse(retryResponse, normalizedSlug);
}

async function getKickAccessToken({
  fetchImpl,
}: {
  fetchImpl: typeof fetch;
}): Promise<string> {
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
    expiresAt:
      now +
      Math.max(
        (payload.expires_in ?? 0) - KICK_TOKEN_EXPIRY_BUFFER_SECONDS,
        0,
      ) *
        1000,
  };

  return accessToken;
}

async function fetchKickChannelMetricsResponse({
  accessToken,
  fetchImpl,
  normalizedSlug,
  signal,
}: {
  accessToken: string;
  fetchImpl: typeof fetch;
  normalizedSlug: string;
  signal: AbortSignal;
}): Promise<Response> {
  const url = new URL(KICK_CHANNEL_METRICS_URL);
  url.searchParams.append("slug", normalizedSlug);

  return fetchImpl(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    signal,
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
    data?: Array<Record<string, unknown>>;
  };

  if (!Array.isArray(payload.data)) {
    throw new Error(
      "Kick metrics request returned an invalid channels payload.",
    );
  }

  const channel =
    payload.data.find(
      (item) =>
        readString(item, "slug")?.toLowerCase() ===
        normalizedSlug.toLowerCase(),
    ) ?? payload.data[0];

  if (!channel) {
    throw new Error(`Kick channel "${normalizedSlug}" was not found.`);
  }

  return normalizeKickChannelPayload(channel, normalizedSlug);
}

function normalizeKickChannelPayload(
  payload: Record<string, unknown>,
  channelSlug: string,
): KickMetricsRaw {
  const livestreamRecord = readRecord(payload, "livestream");
  const streamRecord = readRecord(payload, "stream");
  const streamTitle = readString(payload, "stream_title");
  const livestream = livestreamRecord
    ? normalizeLivestream(livestreamRecord)
    : streamRecord
      ? normalizeLivestream(streamRecord, streamTitle)
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

function normalizeLivestream(
  livestream: Record<string, unknown>,
  fallbackTitle: string | null = null,
): NonNullable<KickMetricsRaw["livestream"]> {
  const viewerCount = readNumber(livestream, "viewer_count");
  const isLive = readBoolean(livestream, "is_live") ?? viewerCount !== null;

  return {
    category: readFirstCategory(livestream),
    id: readFirstString(livestream, "id", "livestream_id"),
    is_live: isLive,
    session_title: readString(livestream, "session_title") ?? fallbackTitle,
    slug: readString(livestream, "slug"),
    started_at:
      readString(livestream, "start_time") ??
      readString(livestream, "started_at") ??
      readString(livestream, "created_at"),
    thumbnail_url:
      readString(livestream, "thumbnail") ??
      readString(livestream, "thumbnail_url") ??
      readString(readRecord(livestream, "thumbnail"), "url"),
    viewer_count: viewerCount,
  };
}

function normalizeTwitch(
  raw: TwitchMetricsRaw,
  context: NormalizeContext,
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
  context: NormalizeContext,
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
  context: NormalizeContext,
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
  context: NormalizeContext,
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

type NormalizeContext = {
  channelId: string;
  snapshotAt?: string;
  userId: string;
};

function createSnapshot({
  context,
  data,
  followers,
  peakViewers,
  provider,
  subscribers,
  views,
}: {
  context: NormalizeContext;
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
    snapshot_at: context.snapshotAt ?? new Date().toISOString(),
    subscribers,
    user_id: context.userId,
    views,
  };
}

function toMetricsSnapshotInsert(
  connection: PlatformConnection,
  snapshot: MetricsSnapshot,
): Record<string, unknown> {
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
    },
    revenue_cents: 0,
    user_id: snapshot.user_id,
    viewer_count: snapshot.peak_viewers ?? 0,
    watch_time_minutes: 0,
  };
}

function enforceRateLimit(
  userId: string,
  provider: SupportedProvider,
  now: number,
) {
  const key = `sync:${userId}:${provider}`;

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

function parseMetric(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeKickChannelSlug(channelSlug: string): string {
  const normalizedSlug = channelSlug.trim().replace(/^@/, "");

  if (!normalizedSlug) {
    throw new Error("Kick channel slug is required for metrics sync.");
  }

  return normalizedSlug;
}

function readFirstCategory(
  source: Record<string, unknown>,
): KickCategory | null {
  const categories = source.categories;

  if (Array.isArray(categories)) {
    for (const category of categories) {
      if (isRecord(category)) {
        return normalizeCategory(category);
      }
    }
  }

  return readCategory(source, "category");
}

function readCategory(
  source: Record<string, unknown> | null,
  key: string,
): KickCategory | null {
  return normalizeCategory(readRecord(source, key));
}

function normalizeCategory(
  category: Record<string, unknown> | null,
): KickCategory | null {
  if (!category) {
    return null;
  }

  const nestedCategory = readRecord(category, "category");
  const id =
    readFirstString(category, "id", "category_id") ??
    readFirstString(nestedCategory, "id");
  const name =
    readString(category, "name") ?? readString(nestedCategory, "name");
  const slug =
    readString(category, "slug") ?? readString(nestedCategory, "slug");
  const thumbnailUrl =
    readString(category, "thumbnail") ??
    readString(category, "thumbnail_url") ??
    readString(nestedCategory, "thumbnail") ??
    readString(nestedCategory, "thumbnail_url");

  if (!id && !name && !slug && !thumbnailUrl) {
    return null;
  }

  return {
    id,
    name,
    slug,
    thumbnailUrl,
  };
}

function readRecord(
  source: Record<string, unknown> | null,
  key: string,
): Record<string, unknown> | null {
  if (!source) {
    return null;
  }

  const value = source[key];

  return isRecord(value) ? value : null;
}

function readString(
  source: Record<string, unknown> | null,
  key: string,
): string | null {
  if (!source) {
    return null;
  }

  const value = source[key];

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function readFirstString(
  source: Record<string, unknown> | null,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const value = readString(source, key);

    if (value) {
      return value;
    }
  }

  return null;
}

function readNumber(
  source: Record<string, unknown> | null,
  key: string,
): number | null {
  if (!source) {
    return null;
  }

  const value = source[key];

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function readBoolean(
  source: Record<string, unknown> | null,
  key: string,
): boolean | null {
  if (!source) {
    return null;
  }

  const value = source[key];

  return typeof value === "boolean" ? value : null;
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
      service: "api-gateway",
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
      service: "api-gateway",
      synced: response.synced,
      user_id: userId,
    }),
  );
}
