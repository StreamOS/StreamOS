import type { OAuthProviderProfile } from "@streamos/types";

export const KICK_AUTHORIZE_URL = "https://id.kick.com/oauth/authorize";
export const KICK_TOKEN_URL = "https://id.kick.com/oauth/token";
export const KICK_CHANNELS_URL = "https://api.kick.com/public/v1/channels";

const DEFAULT_KICK_SCOPES = ["user:read", "channel:read"];

export type KickOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
};

export type KickTokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
};

type KickChannelsResponse = {
  data?: KickChannel[] | KickChannel;
};

type KickChannel = {
  banner_picture?: string | null;
  broadcaster_user_id?: number | string;
  channel_id?: number | string;
  follower_count?: number;
  followers?: number;
  followers_count?: number;
  id?: number | string;
  name?: string;
  profile_picture?: string | null;
  slug?: string;
  user?: {
    id?: number | string;
    profile_picture?: string | null;
    username?: string;
  };
  user_id?: number | string;
  username?: string;
};

export function getKickOAuthConfig({
  env = process.env,
  origin,
}: {
  env?: NodeJS.ProcessEnv;
  origin: string;
}): KickOAuthConfig {
  const clientId = env.KICK_CLIENT_ID?.trim();
  const clientSecret = env.KICK_CLIENT_SECRET?.trim();
  const redirectUri =
    env.KICK_REDIRECT_URI?.trim() || `${origin}/api/auth/kick/callback`;
  const scopes = parseScopes(env.KICK_SCOPES) ?? DEFAULT_KICK_SCOPES;

  if (!clientId || !clientSecret) {
    throw new Error("Missing Kick OAuth environment variables.");
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    scopes,
  };
}

export function createKickAuthorizeUrl({
  codeChallenge,
  config,
  state,
}: {
  codeChallenge: string;
  config: KickOAuthConfig;
  state: string;
}): URL {
  const url = new URL(KICK_AUTHORIZE_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scopes.join(" "));
  url.searchParams.set("state", state);

  return url;
}

export async function exchangeKickCode({
  code,
  codeVerifier,
  config,
  fetchImpl = fetch,
}: {
  code: string;
  codeVerifier: string;
  config: KickOAuthConfig;
  fetchImpl?: typeof fetch;
}): Promise<KickTokenResponse> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    code_verifier: codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
  });

  const response = await fetchImpl(KICK_TOKEN_URL, {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Kick token exchange failed with status ${response.status}.`,
    );
  }

  return (await response.json()) as KickTokenResponse;
}

export async function fetchKickChannelProfile({
  accessToken,
  fetchImpl = fetch,
}: {
  accessToken: string;
  fetchImpl?: typeof fetch;
}): Promise<OAuthProviderProfile> {
  const response = await fetchImpl(KICK_CHANNELS_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Kick channel lookup failed with status ${response.status}.`,
    );
  }

  const payload = (await response.json()) as KickChannelsResponse;
  const channel = Array.isArray(payload.data) ? payload.data[0] : payload.data;

  if (!channel) {
    throw new Error("Kick channel lookup returned no channel.");
  }

  const providerAccountId = getFirstString(
    channel.broadcaster_user_id,
    channel.channel_id,
    channel.id,
    channel.user_id,
    channel.user?.id,
    channel.slug,
  );

  if (!providerAccountId) {
    throw new Error("Kick channel lookup returned no provider account id.");
  }

  const handle = getFirstString(
    channel.slug,
    channel.username,
    channel.user?.username,
  );
  const displayName =
    getFirstString(channel.name, channel.username, channel.user?.username) ??
    "Kick Channel";
  const followerCount = getFirstFiniteNumber(
    channel.followers_count,
    channel.follower_count,
    channel.followers,
  );

  return {
    avatarUrl:
      channel.profile_picture ??
      channel.user?.profile_picture ??
      channel.banner_picture ??
      null,
    displayName,
    followerCount,
    handle,
    provider: "kick",
    providerAccountId,
  };
}

export function normalizeKickScopes({
  config,
  token,
}: {
  config: KickOAuthConfig;
  token: KickTokenResponse;
}): string[] {
  return parseScopes(token.scope) ?? config.scopes;
}

function getFirstString(
  ...values: Array<number | string | null | undefined>
): string | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }

    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function getFirstFiniteNumber(
  ...values: Array<number | null | undefined>
): number {
  for (const value of values) {
    if (Number.isFinite(value)) {
      return Number(value);
    }
  }

  return 0;
}

function parseScopes(value: string | undefined): string[] | undefined {
  const items = value?.split(/\s+/).filter(Boolean) ?? [];

  return items.length > 0 ? items : undefined;
}
