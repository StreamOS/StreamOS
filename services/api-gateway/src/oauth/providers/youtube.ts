import type { OAuthProviderProfile } from "@streamos/types";

export const YOUTUBE_AUTHORIZE_URL =
  "https://accounts.google.com/o/oauth2/v2/auth";
export const YOUTUBE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const YOUTUBE_CHANNELS_URL =
  "https://www.googleapis.com/youtube/v3/channels";

const DEFAULT_YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
];

export type YouTubeOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
};

export type YouTubeTokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
};

type YouTubeChannelResponse = {
  items?: YouTubeChannelItem[];
};

type YouTubeChannelItem = {
  id: string;
  snippet?: {
    customUrl?: string;
    thumbnails?: Record<string, { url?: string }>;
    title?: string;
  };
  statistics?: {
    hiddenSubscriberCount?: boolean;
    subscriberCount?: string;
  };
};

export function getYouTubeOAuthConfig({
  env = process.env,
  origin,
}: {
  env?: NodeJS.ProcessEnv;
  origin: string;
}): YouTubeOAuthConfig {
  const clientId = env.YOUTUBE_CLIENT_ID?.trim();
  const clientSecret = env.YOUTUBE_CLIENT_SECRET?.trim();
  const redirectUri =
    env.YOUTUBE_REDIRECT_URI?.trim() || `${origin}/api/auth/youtube/callback`;
  const scopes =
    env.YOUTUBE_SCOPES?.trim().split(/\s+/).filter(Boolean) ??
    DEFAULT_YOUTUBE_SCOPES;

  if (!clientId || !clientSecret) {
    throw new Error("Missing YouTube OAuth environment variables.");
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    scopes,
  };
}

export function createYouTubeAuthorizeUrl({
  codeChallenge,
  config,
  state,
}: {
  codeChallenge: string;
  config: YouTubeOAuthConfig;
  state: string;
}): URL {
  const url = new URL(YOUTUBE_AUTHORIZE_URL);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scopes.join(" "));
  url.searchParams.set("state", state);

  return url;
}

export async function exchangeYouTubeCode({
  code,
  codeVerifier,
  config,
  fetchImpl = fetch,
}: {
  code: string;
  codeVerifier: string;
  config: YouTubeOAuthConfig;
  fetchImpl?: typeof fetch;
}): Promise<YouTubeTokenResponse> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    code_verifier: codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
  });

  const response = await fetchImpl(YOUTUBE_TOKEN_URL, {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  if (!response.ok) {
    throw new Error(
      `YouTube token exchange failed with status ${response.status}.`,
    );
  }

  return (await response.json()) as YouTubeTokenResponse;
}

export async function fetchYouTubeChannelProfile({
  accessToken,
  fetchImpl = fetch,
}: {
  accessToken: string;
  fetchImpl?: typeof fetch;
}): Promise<OAuthProviderProfile> {
  const url = new URL(YOUTUBE_CHANNELS_URL);
  url.searchParams.set("mine", "true");
  url.searchParams.set("part", "snippet,statistics");

  const response = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `YouTube channel lookup failed with status ${response.status}.`,
    );
  }

  const payload = (await response.json()) as YouTubeChannelResponse;
  const channel = payload.items?.[0];

  if (!channel) {
    throw new Error("YouTube channel lookup returned no channel.");
  }

  return {
    avatarUrl:
      channel.snippet?.thumbnails?.high?.url ??
      channel.snippet?.thumbnails?.medium?.url ??
      channel.snippet?.thumbnails?.default?.url ??
      null,
    displayName: channel.snippet?.title?.trim() || "YouTube Channel",
    followerCount:
      Number.parseInt(channel.statistics?.subscriberCount ?? "0", 10) || 0,
    handle: channel.snippet?.customUrl ?? null,
    provider: "youtube",
    providerAccountId: channel.id,
  };
}

export function normalizeYouTubeScopes({
  config,
  token,
}: {
  config: YouTubeOAuthConfig;
  token: YouTubeTokenResponse;
}): string[] {
  return token.scope?.trim().split(/\s+/).filter(Boolean) ?? config.scopes;
}
