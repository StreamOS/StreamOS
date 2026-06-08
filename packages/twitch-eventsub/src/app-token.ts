const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const TOKEN_REFRESH_SKEW_MS = 60_000;

type TwitchAppAccessTokenResponse = {
  access_token: string;
  expires_in: number;
  token_type: "bearer";
};

export type TwitchAppAccessTokenConfig = {
  clientId: string;
  clientSecret: string;
};

export type GetTwitchAppAccessTokenOptions = {
  config: TwitchAppAccessTokenConfig;
  fetchImpl?: typeof fetch;
  now?: () => number;
};

type CachedAppToken = {
  accessToken: string;
  cacheKey: string;
  expiresAtMs: number;
};

let cachedAppToken: CachedAppToken | null = null;

export async function getTwitchAppAccessToken({
  config,
  fetchImpl = fetch,
  now = Date.now,
}: GetTwitchAppAccessTokenOptions): Promise<string> {
  const cacheKey = config.clientId;
  const currentTime = now();

  if (
    cachedAppToken?.cacheKey === cacheKey &&
    cachedAppToken.expiresAtMs - TOKEN_REFRESH_SKEW_MS > currentTime
  ) {
    return cachedAppToken.accessToken;
  }

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "client_credentials",
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
      `Twitch app access token request failed with status ${response.status}.`,
    );
  }

  const payload = (await response.json()) as TwitchAppAccessTokenResponse;

  cachedAppToken = {
    accessToken: payload.access_token,
    cacheKey,
    expiresAtMs: currentTime + payload.expires_in * 1000,
  };

  return payload.access_token;
}

export function clearTwitchAppAccessTokenCache(): void {
  cachedAppToken = null;
}
