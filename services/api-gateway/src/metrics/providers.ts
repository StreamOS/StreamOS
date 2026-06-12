import type { ChannelSnapshot, MetricsSyncProvider } from "@streamos/types";

import { decryptSecret } from "../oauth/encryption.js";
import { GatewayError } from "../lib/gateway-error.js";
import type { PlatformConnectionRecord } from "./supabase.js";

const YOUTUBE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const YOUTUBE_CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels";
const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const TIKTOK_USER_INFO_URL = "https://open.tiktokapis.com/v2/user/info/";
const KICK_CHANNELS_URL = "https://api.kick.com/public/v1/channels";

const TOKEN_REFRESH_LEEWAY_MS = 60_000;

type TokenRefreshResult = {
  accessToken: string;
  expiresAt: string | null;
  refreshToken: string | null;
  scopes: string[] | null;
};

export async function refreshProviderCredentials({
  connection,
  fetchImpl = fetch,
  provider,
}: {
  connection: PlatformConnectionRecord;
  fetchImpl?: typeof fetch;
  provider: MetricsSyncProvider;
}): Promise<TokenRefreshResult> {
  if (provider === "kick") {
    throw new GatewayError({
      code: "KICK_REFRESH_UNAVAILABLE",
      message:
        "Kick does not expose a refresh endpoint. Re-authentication is required.",
      provider,
      retryable: false,
      statusCode: 503,
    });
  }

  if (!connection.refresh_token_ciphertext) {
    throw new GatewayError({
      code: "TOKEN_DECRYPT_FAILED",
      message: "The platform connection has no encrypted refresh token.",
      provider,
      retryable: false,
      statusCode: 500,
    });
  }

  const refreshToken = decryptToken(
    connection.refresh_token_ciphertext,
    provider,
  );

  return provider === "youtube"
    ? refreshYouTubeToken(refreshToken, fetchImpl)
    : refreshTikTokToken(refreshToken, fetchImpl);
}

export async function fetchProviderSnapshot({
  connection,
  fetchImpl = fetch,
  provider,
  userId,
  accessToken,
}: {
  accessToken: string;
  connection: PlatformConnectionRecord;
  fetchImpl?: typeof fetch;
  provider: MetricsSyncProvider;
  userId: string;
}): Promise<ChannelSnapshot> {
  const snapshotAt = new Date().toISOString();

  try {
    if (provider === "youtube") {
      return normalizeYouTubeSnapshot(
        await fetchYouTubeMetrics(accessToken, fetchImpl),
        {
          channelId: connection.channel_id ?? connection.provider_account_id,
          creatorId: connection.creator_id,
          snapshotAt,
          userId,
        },
      );
    }

    if (provider === "tiktok") {
      return normalizeTikTokSnapshot(
        await fetchTikTokMetrics(accessToken, fetchImpl),
        {
          channelId: connection.channel_id ?? connection.provider_account_id,
          creatorId: connection.creator_id,
          snapshotAt,
          userId,
        },
      );
    }

    return normalizeKickSnapshot(
      await fetchKickMetrics(accessToken, connection, fetchImpl),
      {
        channelId: connection.channel_id ?? connection.provider_account_id,
        creatorId: connection.creator_id,
        snapshotAt,
        userId,
      },
    );
  } catch (error) {
    if (error instanceof GatewayError) {
      throw error;
    }

    throw new GatewayError({
      code: "PROVIDER_API_ERROR",
      message:
        error instanceof Error
          ? error.message
          : "Provider metrics fetch failed.",
      provider,
      retryable: true,
      statusCode: 502,
    });
  }
}

export function shouldRefreshConnection(
  connection: PlatformConnectionRecord,
  now = Date.now(),
): boolean {
  if (connection.status === "expired") {
    return true;
  }

  if (!connection.expires_at) {
    return false;
  }

  const expiresAt = Date.parse(connection.expires_at);

  if (!Number.isFinite(expiresAt)) {
    return true;
  }

  return expiresAt <= now + TOKEN_REFRESH_LEEWAY_MS;
}

function decryptToken(value: string, provider: MetricsSyncProvider): string {
  try {
    return decryptSecret(value);
  } catch (error) {
    throw new GatewayError({
      code: "TOKEN_DECRYPT_FAILED",
      message:
        error instanceof Error
          ? error.message
          : "Could not decrypt token payload.",
      provider,
      retryable: false,
      statusCode: 500,
    });
  }
}

async function refreshYouTubeToken(
  refreshToken: string,
  fetchImpl: typeof fetch,
): Promise<TokenRefreshResult> {
  const clientId = process.env.YOUTUBE_CLIENT_ID?.trim();
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new GatewayError({
      code: "INTERNAL_ERROR",
      message: "YouTube OAuth environment variables are missing.",
      provider: "youtube",
      retryable: false,
      statusCode: 500,
    });
  }

  return refreshOAuthToken({
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    fetchImpl,
    parseScopes: (payload) =>
      typeof payload.scope === "string"
        ? payload.scope.trim().split(/\s+/).filter(Boolean)
        : null,
    provider: "youtube",
    tokenUrl: YOUTUBE_TOKEN_URL,
  });
}

async function refreshTikTokToken(
  refreshToken: string,
  fetchImpl: typeof fetch,
): Promise<TokenRefreshResult> {
  const clientKey = process.env.TIKTOK_CLIENT_KEY?.trim();
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET?.trim();

  if (!clientKey || !clientSecret) {
    throw new GatewayError({
      code: "INTERNAL_ERROR",
      message: "TikTok OAuth environment variables are missing.",
      provider: "tiktok",
      retryable: false,
      statusCode: 500,
    });
  }

  return refreshOAuthToken({
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    fetchImpl,
    parseScopes: (payload) =>
      typeof payload.scope === "string"
        ? payload.scope.split(/[,\s]+/).filter(Boolean)
        : null,
    provider: "tiktok",
    tokenUrl: TIKTOK_TOKEN_URL,
  });
}

async function refreshOAuthToken({
  body,
  fetchImpl,
  parseScopes,
  provider,
  tokenUrl,
}: {
  body: URLSearchParams;
  fetchImpl: typeof fetch;
  parseScopes: (payload: Record<string, unknown>) => string[] | null;
  provider: MetricsSyncProvider;
  tokenUrl: string;
}): Promise<TokenRefreshResult> {
  const response = await fetchImpl(tokenUrl, {
    body,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new GatewayError({
      code: "PROVIDER_API_ERROR",
      message: `${provider} token refresh failed with status ${response.status}.`,
      provider,
      retryable: true,
      statusCode: 502,
    });
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const accessToken = readString(payload.access_token);

  if (!accessToken) {
    throw new GatewayError({
      code: "PROVIDER_API_ERROR",
      message: `${provider} token refresh response did not include an access token.`,
      provider,
      retryable: true,
      statusCode: 502,
    });
  }

  return {
    accessToken,
    expiresAt: secondsFromNowToIso(readNumber(payload, "expires_in")),
    refreshToken: readString(payload.refresh_token),
    scopes: parseScopes(payload),
  };
}

async function fetchYouTubeMetrics(
  accessToken: string,
  fetchImpl: typeof fetch,
): Promise<YouTubeMetricsRaw> {
  const url = new URL(YOUTUBE_CHANNELS_URL);
  url.searchParams.set("mine", "true");
  url.searchParams.set("part", "statistics");

  const response = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new GatewayError({
      code: "PROVIDER_API_ERROR",
      message: `YouTube metrics request failed with status ${response.status}.`,
      provider: "youtube",
      retryable: true,
      statusCode: 502,
    });
  }

  const payload = (await response.json()) as YouTubeChannelsResponse;
  const channel = payload.items?.[0];

  if (!channel) {
    throw new GatewayError({
      code: "PROVIDER_API_ERROR",
      message: "YouTube metrics request returned no channel.",
      provider: "youtube",
      retryable: true,
      statusCode: 502,
    });
  }

  return { channel };
}

async function fetchTikTokMetrics(
  accessToken: string,
  fetchImpl: typeof fetch,
): Promise<TikTokMetricsRaw> {
  const url = new URL(TIKTOK_USER_INFO_URL);
  url.searchParams.set(
    "fields",
    "open_id,display_name,username,follower_count,likes_count,video_count,video_views",
  );

  const response = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new GatewayError({
      code: "PROVIDER_API_ERROR",
      message: `TikTok metrics request failed with status ${response.status}.`,
      provider: "tiktok",
      retryable: true,
      statusCode: 502,
    });
  }

  const payload = (await response.json()) as TikTokUserInfoResponse;
  const user = payload.data?.user;

  if (!user?.open_id) {
    throw new GatewayError({
      code: "PROVIDER_API_ERROR",
      message: "TikTok metrics request returned no user.",
      provider: "tiktok",
      retryable: true,
      statusCode: 502,
    });
  }

  return { user };
}

async function fetchKickMetrics(
  accessToken: string,
  connection: PlatformConnectionRecord,
  fetchImpl: typeof fetch,
): Promise<KickMetricsRaw> {
  const slug = getKickChannelSlug(connection);
  const url = new URL(KICK_CHANNELS_URL);
  url.searchParams.set("slug", slug);

  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new GatewayError({
      code: "PROVIDER_API_ERROR",
      message: `Kick metrics request failed with status ${response.status}.`,
      provider: "kick",
      retryable: true,
      statusCode: 502,
    });
  }

  const payload = (await response.json()) as KickChannelsResponse;
  if (!Array.isArray(payload.data)) {
    throw new GatewayError({
      code: "PROVIDER_API_ERROR",
      message: "Kick metrics request returned an invalid channels payload.",
      provider: "kick",
      retryable: true,
      statusCode: 502,
    });
  }

  const channel =
    payload.data.find(
      (item) => item.slug?.toLowerCase() === slug.toLowerCase(),
    ) ?? payload.data[0];

  if (!channel) {
    throw new GatewayError({
      code: "PROVIDER_API_ERROR",
      message: `Kick channel "${slug}" was not found.`,
      provider: "kick",
      retryable: true,
      statusCode: 502,
    });
  }

  return normalizeKickChannelPayload(channel, slug);
}

function normalizeYouTubeSnapshot(
  raw: YouTubeMetricsRaw,
  context: SnapshotContext,
): ChannelSnapshot {
  const statistics = raw.channel.statistics;
  const subscribers = statistics?.hiddenSubscriberCount
    ? null
    : parseMetric(statistics?.subscriberCount);

  return createSnapshot({
    context,
    followers: null,
    peakViewers: null,
    provider: "youtube",
    rawPayload: raw,
    subscribers,
    views: parseMetric(statistics?.viewCount),
  });
}

function normalizeTikTokSnapshot(
  raw: TikTokMetricsRaw,
  context: SnapshotContext,
): ChannelSnapshot {
  return createSnapshot({
    context,
    followers: raw.user.follower_count ?? null,
    peakViewers: null,
    provider: "tiktok",
    rawPayload: raw,
    subscribers: null,
    views: raw.user.video_views ?? null,
  });
}

function normalizeKickSnapshot(
  raw: KickMetricsRaw,
  context: SnapshotContext,
): ChannelSnapshot {
  return createSnapshot({
    context,
    followers: null,
    peakViewers: raw.livestream?.viewer_count ?? null,
    provider: "kick",
    rawPayload: raw,
    subscribers: raw.activeSubscribers ?? null,
    views: null,
  });
}

function createSnapshot({
  context,
  followers,
  peakViewers,
  provider,
  rawPayload,
  subscribers,
  views,
}: {
  context: SnapshotContext;
  followers: number | null;
  peakViewers: number | null;
  provider: MetricsSyncProvider;
  rawPayload: Record<string, unknown>;
  subscribers: number | null;
  views: number | null;
}): ChannelSnapshot {
  return {
    channelId: context.channelId,
    creatorId: context.creatorId,
    followers,
    peakViewers,
    provider,
    rawPayload,
    snapshotAt: context.snapshotAt,
    subscribers,
    userId: context.userId,
    views,
  };
}

function normalizeKickChannelPayload(
  payload: KickChannelPayload,
  channelSlug: string,
): KickMetricsRaw {
  const livestreamRecord = readRecord(payload, "livestream");
  const streamRecord = readRecord(payload, "stream");
  const streamTitle = readFirstString(payload, "stream_title");
  const livestream = livestreamRecord
    ? normalizeLivestream(livestreamRecord)
    : streamRecord
      ? normalizeLivestream(streamRecord, streamTitle)
      : null;

  return {
    activeSubscribers: readNumber(payload, "active_subscribers_count"),
    category: livestream?.category ?? readCategory(payload, "category"),
    channelId: readFirstString(payload, "broadcaster_user_id"),
    channelSlug: readFirstString(payload, "slug") ?? channelSlug,
    displayName: readFirstString(payload, "slug") ?? channelSlug,
    isLive: livestream?.is_live ?? false,
    livestream,
    title: streamTitle,
    username: readFirstString(payload, "slug") ?? channelSlug,
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
    session_title:
      readFirstString(livestream, "session_title") ?? fallbackTitle,
    slug: readFirstString(livestream, "slug"),
    started_at:
      readFirstString(livestream, "start_time") ??
      readFirstString(livestream, "started_at") ??
      readFirstString(livestream, "created_at"),
    thumbnail_url:
      readFirstString(livestream, "thumbnail") ??
      readFirstString(livestream, "thumbnail_url") ??
      readFirstString(readRecord(livestream, "thumbnail"), "url"),
    viewer_count: viewerCount,
  };
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
    readFirstString(category, "name") ??
    readFirstString(nestedCategory, "name");
  const slug =
    readFirstString(category, "slug") ??
    readFirstString(nestedCategory, "slug");
  const thumbnailUrl =
    readFirstString(category, "thumbnail") ??
    readFirstString(category, "thumbnail_url") ??
    readFirstString(nestedCategory, "thumbnail") ??
    readFirstString(nestedCategory, "thumbnail_url");

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

function getKickChannelSlug(connection: PlatformConnectionRecord): string {
  const profile = connection.provider_profile;

  if (isRecord(profile) && typeof profile.handle === "string") {
    const slug = profile.handle.replace(/^@/, "").trim();

    if (slug) {
      return slug;
    }
  }

  return connection.provider_account_id;
}

function parseMetric(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) ? parsed : null;
}

function secondsFromNowToIso(
  expiresIn: number | null | undefined,
): string | null {
  if (
    typeof expiresIn !== "number" ||
    !Number.isFinite(expiresIn) ||
    expiresIn <= 0
  ) {
    return null;
  }

  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

function readString(value: unknown): string | null {
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
    const value = readString(source?.[key]);

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type SnapshotContext = {
  channelId: string;
  creatorId: string;
  snapshotAt: string;
  userId: string;
};

type YouTubeMetricsRaw = {
  channel: {
    id: string;
    statistics?: {
      hiddenSubscriberCount?: boolean;
      subscriberCount?: string;
      viewCount?: string;
    };
  };
};

type YouTubeChannelsResponse = {
  items?: YouTubeMetricsRaw["channel"][];
};

type TikTokMetricsRaw = {
  user: {
    follower_count?: number;
    open_id: string;
    video_views?: number;
  };
};

type TikTokUserInfoResponse = {
  data?: {
    user?: TikTokMetricsRaw["user"];
  };
};

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

type KickChannelPayload = {
  active_subscribers_count?: number | string | null;
  banner_picture?: string | null;
  broadcaster_user_id?: number | string | null;
  category?: Record<string, unknown> | null;
  channel_description?: string | null;
  slug?: string | null;
  stream?: Record<string, unknown> | null;
  stream_title?: string | null;
};

type KickChannelsResponse = {
  data?: KickChannelPayload[];
};
