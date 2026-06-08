export const KICK_CHANNEL_METRICS_URL =
  "https://api.kick.com/public/v1/channels";
export const KICK_TOKEN_URL = "https://id.kick.com/oauth/token";

const TOKEN_EXPIRY_BUFFER_SECONDS = 60;

export type KickCategory = {
  id: string | null;
  name: string | null;
  slug: string | null;
  thumbnailUrl: string | null;
};

export type KickMetricsRaw = {
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

type KickChannelsResponse = {
  data?: KickChannelPayload[];
  message?: string;
};

type KickTokenResponse = {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
};

interface KickTokenCache {
  accessToken: string;
  expiresAt: number;
}

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

type KickMetricsOptions = {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
};

// Next.js route handlers run single-threaded per warm function isolate.
let tokenCache: KickTokenCache | null = null;

export async function getKickAccessToken(): Promise<string> {
  const now = Date.now();

  if (tokenCache && tokenCache.expiresAt > now) {
    logKickTokenCacheEvent("HIT");
    return tokenCache.accessToken;
  }

  logKickTokenCacheEvent("MISS");

  const clientId = process.env.KICK_CLIENT_ID?.trim();
  const clientSecret = process.env.KICK_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new Error("Kick OAuth client credentials are not configured.");
  }

  const response = await fetch(KICK_TOKEN_URL, {
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
    cache: "no-store",
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

  const payload = (await response.json()) as KickTokenResponse;
  const accessToken = payload.access_token?.trim();

  if (!accessToken) {
    throw new Error("Kick token response did not include an access token.");
  }

  tokenCache = {
    accessToken,
    expiresAt:
      now +
      Math.max((payload.expires_in ?? 0) - TOKEN_EXPIRY_BUFFER_SECONDS, 0) *
        1000,
  };

  return accessToken;
}

export async function getKickChannelMetricsWithCachedToken(
  channelSlug: string,
  options: KickMetricsOptions = {},
): Promise<KickMetricsRaw> {
  const normalizedSlug = normalizeKickChannelSlug(channelSlug);
  const response = await fetchKickChannelMetricsResponse(
    await getKickAccessToken(),
    normalizedSlug,
    options,
  );

  if (response.status !== 401) {
    return parseKickChannelMetricsResponse(response, normalizedSlug);
  }

  evictKickAccessTokenCache();

  const retryResponse = await fetchKickChannelMetricsResponse(
    await getKickAccessToken(),
    normalizedSlug,
    options,
  );

  if (retryResponse.status === 401) {
    throw new Error("Kick API: unauthorized after token refresh");
  }

  return parseKickChannelMetricsResponse(retryResponse, normalizedSlug);
}

export function clearKickAccessTokenCacheForTest(): void {
  tokenCache = null;
}

export async function getKickChannelMetrics(
  accessToken: string,
  channelSlug: string,
  options: KickMetricsOptions = {},
): Promise<KickMetricsRaw> {
  const normalizedSlug = normalizeKickChannelSlug(channelSlug);
  const token = accessToken.trim();

  if (!token) {
    throw new Error("Kick access token is required for metrics sync.");
  }

  return parseKickChannelMetricsResponse(
    await fetchKickChannelMetricsResponse(token, normalizedSlug, options),
    normalizedSlug,
  );
}

function evictKickAccessTokenCache(): void {
  tokenCache = null;
}

function logKickTokenCacheEvent(result: "HIT" | "MISS"): void {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  console.log(
    JSON.stringify({
      event: "kick_access_token_cache",
      level: "debug",
      result,
      service: "web",
    }),
  );
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
  options: KickMetricsOptions,
): Promise<Response> {
  const url = new URL(KICK_CHANNEL_METRICS_URL);
  url.searchParams.append("slug", normalizedSlug);

  const headers: HeadersInit = {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
  };

  return (options.fetchImpl ?? fetch)(url, {
    cache: "no-store",
    headers,
    signal: options.signal,
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

  const payload = (await response.json()) as KickChannelsResponse;

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
  payload: KickChannelPayload,
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
