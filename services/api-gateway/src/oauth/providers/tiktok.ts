import { createHash } from "node:crypto";
import type { OAuthProviderProfile } from "@streamos/types";

export const TIKTOK_AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";
export const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
export const TIKTOK_USER_INFO_URL = "https://open.tiktokapis.com/v2/user/info/";

const DEFAULT_TIKTOK_SCOPES = ["user.info.basic"];
const DEFAULT_TIKTOK_USER_FIELDS = ["open_id", "display_name", "avatar_url"];

export type TikTokOAuthConfig = {
  clientKey: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  userFields: string[];
};

export type TikTokTokenResponse = {
  access_token: string;
  expires_in?: number;
  open_id?: string;
  refresh_token?: string;
  scope?: string;
  token_type: string;
};

type TikTokUserInfoResponse = {
  data?: {
    user?: TikTokUser;
  };
};

type TikTokUser = {
  avatar_large_url?: string;
  avatar_url?: string;
  avatar_url_100?: string;
  display_name?: string;
  follower_count?: number;
  open_id?: string;
  profile_deep_link?: string;
  union_id?: string;
  username?: string;
};

export function getTikTokOAuthConfig({
  env = process.env,
  origin,
}: {
  env?: NodeJS.ProcessEnv;
  origin: string;
}): TikTokOAuthConfig {
  const clientKey = env.TIKTOK_CLIENT_KEY?.trim();
  const clientSecret = env.TIKTOK_CLIENT_SECRET?.trim();
  const redirectUri =
    env.TIKTOK_REDIRECT_URI?.trim() || `${origin}/api/auth/tiktok/callback`;
  const scopes = parseDelimitedEnv(env.TIKTOK_SCOPES) ?? DEFAULT_TIKTOK_SCOPES;
  const userFields =
    parseDelimitedEnv(env.TIKTOK_USER_FIELDS) ??
    getDefaultTikTokUserFields(scopes);

  if (!clientKey || !clientSecret) {
    throw new Error("Missing TikTok OAuth environment variables.");
  }

  return {
    clientKey,
    clientSecret,
    redirectUri,
    scopes,
    userFields,
  };
}

export function createTikTokAuthorizeUrl({
  codeChallenge,
  config,
  state,
}: {
  codeChallenge: string;
  config: TikTokOAuthConfig;
  state: string;
}): URL {
  const url = new URL(TIKTOK_AUTHORIZE_URL);
  url.searchParams.set("client_key", config.clientKey);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scopes.join(","));
  url.searchParams.set("state", state);

  return url;
}

export async function exchangeTikTokCode({
  code,
  codeVerifier,
  config,
  fetchImpl = fetch,
}: {
  code: string;
  codeVerifier: string;
  config: TikTokOAuthConfig;
  fetchImpl?: typeof fetch;
}): Promise<TikTokTokenResponse> {
  const body = new URLSearchParams({
    client_key: config.clientKey,
    client_secret: config.clientSecret,
    code,
    code_verifier: codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
  });

  const response = await fetchImpl(TIKTOK_TOKEN_URL, {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  if (!response.ok) {
    throw new Error(
      `TikTok token exchange failed with status ${response.status}.`,
    );
  }

  return (await response.json()) as TikTokTokenResponse;
}

export async function fetchTikTokUserProfile({
  accessToken,
  config,
  fetchImpl = fetch,
}: {
  accessToken: string;
  config: TikTokOAuthConfig;
  fetchImpl?: typeof fetch;
}): Promise<OAuthProviderProfile> {
  const url = new URL(TIKTOK_USER_INFO_URL);
  url.searchParams.set("fields", config.userFields.join(","));

  const response = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `TikTok user lookup failed with status ${response.status}.`,
    );
  }

  const payload = (await response.json()) as TikTokUserInfoResponse;
  const user = payload.data?.user;

  if (!user?.open_id) {
    throw new Error("TikTok user lookup returned no user.");
  }

  return {
    avatarUrl:
      user.avatar_large_url ?? user.avatar_url_100 ?? user.avatar_url ?? null,
    displayName: user.display_name?.trim() || "TikTok Creator",
    followerCount: Number.isFinite(user.follower_count)
      ? Number(user.follower_count)
      : 0,
    handle: user.username ? `@${user.username}` : null,
    provider: "tiktok",
    providerAccountId: user.open_id,
  };
}

export function normalizeTikTokScopes({
  config,
  token,
}: {
  config: TikTokOAuthConfig;
  token: TikTokTokenResponse;
}): string[] {
  return parseDelimitedEnv(token.scope) ?? config.scopes;
}

export function createTikTokPkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function getDefaultTikTokUserFields(scopes: string[]): string[] {
  const fields = [...DEFAULT_TIKTOK_USER_FIELDS];

  if (scopes.includes("user.info.profile")) {
    fields.push("username");
  }

  if (scopes.includes("user.info.stats")) {
    fields.push("follower_count");
  }

  return fields;
}

function parseDelimitedEnv(value: string | undefined): string[] | undefined {
  const items = value?.split(/[,\s]+/).filter(Boolean) ?? [];

  return items.length > 0 ? items : undefined;
}
