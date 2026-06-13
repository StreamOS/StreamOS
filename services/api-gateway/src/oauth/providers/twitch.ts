import type { OAuthProviderProfile } from "@streamos/types";

export const TWITCH_AUTHORIZE_URL = "https://id.twitch.tv/oauth2/authorize";
export const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
export const TWITCH_USERS_URL = "https://api.twitch.tv/helix/users";

const DEFAULT_TWITCH_SCOPES = ["user:read:email", "moderator:read:followers"];

export type TwitchOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
};

export type TwitchTokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string[];
  token_type: string;
};

type TwitchUsersResponse = {
  data?: TwitchUser[];
};

type TwitchUser = {
  display_name?: string;
  id: string;
  login?: string;
  profile_image_url?: string;
  view_count?: number;
};

export function getTwitchOAuthConfig({
  env = process.env,
  origin,
}: {
  env?: NodeJS.ProcessEnv;
  origin: string;
}): TwitchOAuthConfig {
  const clientId = env.TWITCH_CLIENT_ID?.trim();
  const clientSecret = env.TWITCH_CLIENT_SECRET?.trim();
  const redirectUri =
    env.TWITCH_REDIRECT_URI?.trim() || `${origin}/api/auth/twitch/callback`;
  const scopes = parseScopes(env.TWITCH_SCOPES) ?? DEFAULT_TWITCH_SCOPES;

  if (!clientId || !clientSecret) {
    throw new Error("Missing Twitch OAuth environment variables.");
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    scopes,
  };
}

export function createTwitchAuthorizeUrl({
  codeChallenge,
  config,
  state,
}: {
  codeChallenge: string;
  config: TwitchOAuthConfig;
  state: string;
}): URL {
  const url = new URL(TWITCH_AUTHORIZE_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scopes.join(" "));
  url.searchParams.set("state", state);

  return url;
}

export async function exchangeTwitchCode({
  code,
  codeVerifier,
  config,
  fetchImpl = fetch,
}: {
  code: string;
  codeVerifier: string;
  config: TwitchOAuthConfig;
  fetchImpl?: typeof fetch;
}): Promise<TwitchTokenResponse> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    code_verifier: codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
  });

  const response = await fetchImpl(TWITCH_TOKEN_URL, {
    body,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(
      `Twitch token exchange failed with status ${response.status}.`,
    );
  }

  return (await response.json()) as TwitchTokenResponse;
}

export async function fetchTwitchUserProfile({
  accessToken,
  config,
  fetchImpl = fetch,
}: {
  accessToken: string;
  config: TwitchOAuthConfig;
  fetchImpl?: typeof fetch;
}): Promise<OAuthProviderProfile> {
  const response = await fetchImpl(TWITCH_USERS_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Client-Id": config.clientId,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Twitch user lookup failed with status ${response.status}.`,
    );
  }

  const payload = (await response.json()) as TwitchUsersResponse;
  const user = payload.data?.[0];

  if (!user?.id) {
    throw new Error("Twitch user lookup returned no user.");
  }

  const login = user.login?.trim();
  const displayName =
    user.display_name?.trim() || login || "Twitch Broadcaster";

  return {
    avatarUrl: user.profile_image_url ?? null,
    displayName,
    followerCount: 0,
    handle: login ? `@${login}` : null,
    provider: "twitch",
    providerAccountId: user.id,
  };
}

export function normalizeTwitchScopes({
  config,
  token,
}: {
  config: TwitchOAuthConfig;
  token: TwitchTokenResponse;
}): string[] {
  return token.scope ?? config.scopes;
}

function parseScopes(value: string | undefined): string[] | undefined {
  const items = value?.split(/\s+/).filter(Boolean) ?? [];

  return items.length > 0 ? items : undefined;
}
