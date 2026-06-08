import { decryptToken, encryptToken } from "@streamos/utils/crypto";
import { z } from "zod";

import type { ContentJobStore, YouTubeConnection } from "./contentJobStore.js";

export class VodNotReadyError extends Error {
  constructor(message = "Twitch VOD is not available yet.") {
    super(message);
    this.name = "VodNotReadyError";
  }
}

export type TokenCache = {
  get(key: string): Promise<string | null>;
  setex(key: string, seconds: number, value: string): Promise<unknown>;
};

export type TwitchClientConfig = {
  clientId?: string;
  clientSecret?: string;
  fetchFn?: typeof fetch;
  tokenCache: TokenCache;
};

export type YouTubeClientConfig = {
  clientId?: string;
  clientSecret?: string;
  fetchFn?: typeof fetch;
  store: ContentJobStore;
};

export type YouTubeVideoMetadata = {
  duration: string | null;
  likeCount: number | null;
  tags: string[];
  viewCount: number | null;
};

const twitchTokenSchema = z.object({
  access_token: z.string().trim().min(1),
  expires_in: z.number().int().positive(),
});

const twitchVideosSchema = z.object({
  data: z.array(
    z.object({
      url: z.string().url(),
    }),
  ),
});

const youtubeRefreshTokenSchema = z.object({
  access_token: z.string().trim().min(1),
  expires_in: z.number().int().positive().optional(),
  refresh_token: z.string().trim().min(1).optional(),
});

const youtubeVideosSchema = z.object({
  items: z.array(
    z.object({
      contentDetails: z
        .object({
          duration: z.string().trim().min(1).optional(),
        })
        .optional(),
      snippet: z
        .object({
          tags: z.array(z.string()).optional(),
        })
        .optional(),
      statistics: z
        .object({
          likeCount: z.string().optional(),
          viewCount: z.string().optional(),
        })
        .optional(),
    }),
  ),
});

function requireConfig(value: string | undefined, name: string): string {
  if (!value?.trim()) {
    throw new Error(`${name} is required for media job processing.`);
  }

  return value.trim();
}

function parseCounter(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) ? parsed : null;
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) {
    return false;
  }

  const expiresAtMs = Date.parse(expiresAt);

  if (!Number.isFinite(expiresAtMs)) {
    return true;
  }

  return expiresAtMs <= Date.now() + 60_000;
}

export function createTwitchClient({
  clientId,
  clientSecret,
  fetchFn = fetch,
  tokenCache,
}: TwitchClientConfig) {
  return {
    async resolveLatestVodUrl(channelId: string): Promise<string> {
      const appToken = await getTwitchAppToken({
        clientId,
        clientSecret,
        fetchFn,
        tokenCache,
      });
      const endpoint = new URL("https://api.twitch.tv/helix/videos");
      endpoint.searchParams.set("user_id", channelId);
      endpoint.searchParams.set("type", "archive");
      endpoint.searchParams.set("first", "1");

      const response = await fetchFn(endpoint, {
        headers: {
          Authorization: `Bearer ${appToken}`,
          "Client-Id": requireConfig(clientId, "TWITCH_CLIENT_ID"),
        },
        method: "GET",
      });

      if (!response.ok) {
        throw new Error(
          `Twitch VOD lookup failed with ${response.status}: ${await response.text()}`,
        );
      }

      const payload = twitchVideosSchema.parse(await response.json());
      const vodUrl = payload.data[0]?.url;

      if (!vodUrl) {
        throw new VodNotReadyError();
      }

      return vodUrl;
    },
  };
}

async function getTwitchAppToken({
  clientId,
  clientSecret,
  fetchFn,
  tokenCache,
}: {
  clientId?: string;
  clientSecret?: string;
  fetchFn: typeof fetch;
  tokenCache: TokenCache;
}): Promise<string> {
  const cachedToken = await tokenCache.get("twitch:app_token");

  if (cachedToken) {
    return cachedToken;
  }

  const endpoint = new URL("https://id.twitch.tv/oauth2/token");
  endpoint.searchParams.set(
    "client_id",
    requireConfig(clientId, "TWITCH_CLIENT_ID"),
  );
  endpoint.searchParams.set(
    "client_secret",
    requireConfig(clientSecret, "TWITCH_CLIENT_SECRET"),
  );
  endpoint.searchParams.set("grant_type", "client_credentials");

  const response = await fetchFn(endpoint, { method: "POST" });

  if (!response.ok) {
    throw new Error(
      `Twitch app token request failed with ${response.status}: ${await response.text()}`,
    );
  }

  const token = twitchTokenSchema.parse(await response.json());
  const ttl = Math.max(token.expires_in - 60, 60);

  await tokenCache.setex("twitch:app_token", ttl, token.access_token);

  return token.access_token;
}

export function createYouTubeClient({
  clientId,
  clientSecret,
  fetchFn = fetch,
  store,
}: YouTubeClientConfig) {
  return {
    async fetchVideoMetadata({
      channelId,
      userId,
      videoId,
    }: {
      channelId: string;
      userId: string;
      videoId: string;
    }): Promise<YouTubeVideoMetadata> {
      const connection = await store.findYouTubeConnection({
        channelId,
        userId,
      });
      const accessToken = await getValidYouTubeAccessToken({
        clientId,
        clientSecret,
        connection,
        fetchFn,
        store,
      });
      const endpoint = new URL("https://www.googleapis.com/youtube/v3/videos");
      endpoint.searchParams.set("id", videoId);
      endpoint.searchParams.set("part", "contentDetails,statistics,snippet");

      const response = await fetchFn(endpoint, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        method: "GET",
      });

      if (!response.ok) {
        throw new Error(
          `YouTube video metadata lookup failed with ${response.status}: ${await response.text()}`,
        );
      }

      const payload = youtubeVideosSchema.parse(await response.json());
      const video = payload.items[0];

      if (!video) {
        throw new Error(`YouTube video ${videoId} was not found.`);
      }

      return {
        duration: video.contentDetails?.duration ?? null,
        likeCount: parseCounter(video.statistics?.likeCount),
        tags: video.snippet?.tags ?? [],
        viewCount: parseCounter(video.statistics?.viewCount),
      };
    },
  };
}

async function getValidYouTubeAccessToken({
  clientId,
  clientSecret,
  connection,
  fetchFn,
  store,
}: {
  clientId?: string;
  clientSecret?: string;
  connection: YouTubeConnection;
  fetchFn: typeof fetch;
  store: ContentJobStore;
}): Promise<string> {
  if (!isExpired(connection.expires_at)) {
    return decryptToken(connection.access_token_ciphertext);
  }

  if (!connection.refresh_token_ciphertext) {
    throw new Error("YouTube connection is expired and has no refresh token.");
  }

  const body = new URLSearchParams({
    client_id: requireConfig(clientId, "YOUTUBE_CLIENT_ID"),
    client_secret: requireConfig(clientSecret, "YOUTUBE_CLIENT_SECRET"),
    grant_type: "refresh_token",
    refresh_token: decryptToken(connection.refresh_token_ciphertext),
  });
  const response = await fetchFn("https://oauth2.googleapis.com/token", {
    body,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(
      `YouTube token refresh failed with ${response.status}: ${await response.text()}`,
    );
  }

  const token = youtubeRefreshTokenSchema.parse(await response.json());
  const expiresAt = token.expires_in
    ? new Date(Date.now() + token.expires_in * 1000).toISOString()
    : null;

  await store.updateYouTubeConnection({
    accessTokenCiphertext: encryptToken(token.access_token),
    connectionId: connection.id,
    expiresAt,
    refreshTokenCiphertext: token.refresh_token
      ? encryptToken(token.refresh_token)
      : undefined,
  });

  return token.access_token;
}
