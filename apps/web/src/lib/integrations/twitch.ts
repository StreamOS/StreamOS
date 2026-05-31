import type { Database, Inserts, Updates } from "@streamos/database";
import { encryptSecret } from "@/lib/security/encryption";
import type { createClient } from "@/lib/supabase/server";

export const TWITCH_OAUTH_STATE_COOKIE = "streamos_twitch_oauth_state";

const TWITCH_AUTHORIZE_URL = "https://id.twitch.tv/oauth2/authorize";
const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const TWITCH_USERS_URL = "https://api.twitch.tv/helix/users";
const DEFAULT_TWITCH_SCOPES = ["user:read:email"];

type TwitchOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
};

type TwitchTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string[];
  token_type: "bearer";
};

type TwitchUser = {
  id: string;
  login: string;
  display_name: string;
  view_count?: number;
};

type TwitchUsersResponse = {
  data: TwitchUser[];
};

type StreamOSSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export function getTwitchOAuthConfig(origin: string): TwitchOAuthConfig {
  const clientId = process.env.TWITCH_CLIENT_ID?.trim();
  const clientSecret = process.env.TWITCH_CLIENT_SECRET?.trim();
  const redirectUri =
    process.env.TWITCH_REDIRECT_URI?.trim() ||
    `${origin}/api/platforms/twitch/callback`;
  const scopes =
    process.env.TWITCH_SCOPES?.trim().split(/\s+/).filter(Boolean) ??
    DEFAULT_TWITCH_SCOPES;

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

export function createTwitchAuthorizeUrl(
  config: TwitchOAuthConfig,
  state: string,
): URL {
  const url = new URL(TWITCH_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", config.scopes.join(" "));
  url.searchParams.set("state", state);
  return url;
}

export async function exchangeTwitchCode(
  config: TwitchOAuthConfig,
  code: string,
): Promise<TwitchTokenResponse> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
  });

  const response = await fetch(TWITCH_TOKEN_URL, {
    method: "POST",
    body,
    cache: "no-store",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Twitch token exchange failed with status ${response.status}.`,
    );
  }

  return (await response.json()) as TwitchTokenResponse;
}

export async function fetchTwitchUser(
  config: TwitchOAuthConfig,
  accessToken: string,
): Promise<TwitchUser> {
  const response = await fetch(TWITCH_USERS_URL, {
    cache: "no-store",
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
  const user = payload.data[0];

  if (!user) {
    throw new Error("Twitch user lookup returned no user.");
  }

  return user;
}

export async function persistTwitchConnection({
  creatorId,
  supabase,
  token,
  twitchUser,
}: {
  creatorId: string;
  supabase: StreamOSSupabaseClient;
  token: TwitchTokenResponse;
  twitchUser: TwitchUser;
}) {
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + token.expires_in * 1000,
  ).toISOString();

  const existingChannel = await supabase
    .from("channels")
    .select("id")
    .eq("creator_id", creatorId)
    .eq("platform", "twitch")
    .eq("external_channel_id", twitchUser.id)
    .maybeSingle();

  if (existingChannel.error) {
    throw existingChannel.error;
  }

  const existingChannelData = existingChannel.data as Pick<
    Database["public"]["Tables"]["channels"]["Row"],
    "id"
  > | null;

  const channelPayload: Inserts<"channels"> | Updates<"channels"> = {
    connected_at: now.toISOString(),
    creator_id: creatorId,
    display_name: twitchUser.display_name || twitchUser.login,
    external_channel_id: twitchUser.id,
    follower_count: 0,
    platform: "twitch",
  };

  const channelResult = existingChannel.data
    ? await supabase
        .from("channels")
        .update(channelPayload as never)
        .eq("id", existingChannelData?.id ?? "")
        .select("id")
        .single()
    : await supabase
        .from("channels")
        .insert(channelPayload as never)
        .select("id")
        .single();

  if (channelResult.error) {
    throw channelResult.error;
  }

  const channelData = channelResult.data as Pick<
    Database["public"]["Tables"]["channels"]["Row"],
    "id"
  >;
  const existingConnection = await supabase
    .from("platform_connections")
    .select("id")
    .eq("creator_id", creatorId)
    .eq("platform", "twitch")
    .eq("provider_account_id", twitchUser.id)
    .maybeSingle();

  if (existingConnection.error) {
    throw existingConnection.error;
  }

  const existingConnectionData = existingConnection.data as Pick<
    Database["public"]["Tables"]["platform_connections"]["Row"],
    "id"
  > | null;

  const connectionPayload:
    | Inserts<"platform_connections">
    | Updates<"platform_connections"> = {
    access_token_ciphertext: encryptSecret(token.access_token),
    channel_id: channelData.id,
    connected_at: now.toISOString(),
    creator_id: creatorId,
    expires_at: expiresAt,
    platform: "twitch",
    provider_account_id: twitchUser.id,
    refresh_token_ciphertext: token.refresh_token
      ? encryptSecret(token.refresh_token)
      : null,
    scopes: token.scope ?? [],
    status: "connected",
  };

  const connectionResult = existingConnection.data
    ? await supabase
        .from("platform_connections")
        .update(connectionPayload as never)
        .eq("id", existingConnectionData?.id ?? "")
    : await supabase
        .from("platform_connections")
        .insert(connectionPayload as never);

  if (connectionResult.error) {
    throw connectionResult.error;
  }
}
