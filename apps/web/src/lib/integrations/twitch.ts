import type {
  Database,
  Inserts,
  Json,
  Tables,
  Updates,
} from "@streamos/database";
import { decryptSecret, encryptSecret } from "@/lib/security/encryption";
import type { createClient } from "@/lib/supabase/server";

export const TWITCH_OAUTH_STATE_COOKIE = "streamos_twitch_oauth_state";

const TWITCH_AUTHORIZE_URL = "https://id.twitch.tv/oauth2/authorize";
const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const TWITCH_USERS_URL = "https://api.twitch.tv/helix/users";
const TWITCH_CHANNELS_URL = "https://api.twitch.tv/helix/channels";
const TWITCH_STREAMS_URL = "https://api.twitch.tv/helix/streams";
const TWITCH_CHANNEL_FOLLOWERS_URL =
  "https://api.twitch.tv/helix/channels/followers";
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

type TwitchChannelInfo = {
  broadcaster_id: string;
  broadcaster_login: string;
  broadcaster_name: string;
  broadcaster_language: string;
  game_id: string;
  game_name: string;
  title: string;
  tags: string[];
};

type TwitchChannelInfoResponse = {
  data: TwitchChannelInfo[];
};

type TwitchStream = {
  id: string;
  user_id: string;
  user_login: string;
  user_name: string;
  game_id: string;
  game_name: string;
  title: string;
  viewer_count: number;
  started_at: string;
  language: string;
  thumbnail_url: string;
  tag_ids?: string[];
  tags?: string[];
  is_mature: boolean;
};

type TwitchStreamsResponse = {
  data: TwitchStream[];
};

type TwitchChannelFollowersResponse = {
  total: number;
  data?: unknown[];
  pagination?: {
    cursor?: string;
  };
};

type TwitchAnalyticsSnapshot = {
  broadcasterId: string;
  channel: TwitchChannelInfo | null;
  followerCount: number;
  isLive: boolean;
  rawPayload: Record<string, Json>;
  stream: TwitchStream | null;
  viewerCount: number;
};

type StreamOSSupabaseClient = Awaited<ReturnType<typeof createClient>>;

class TwitchTokenRefreshError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "TwitchTokenRefreshError";
  }
}

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

export async function refreshTwitchToken(
  config: TwitchOAuthConfig,
  refreshToken: string,
): Promise<TwitchTokenResponse> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
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
    throw new TwitchTokenRefreshError(
      `Twitch token refresh failed with status ${response.status}.`,
      response.status,
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

export async function fetchTwitchAnalyticsSnapshot(
  config: TwitchOAuthConfig,
  accessToken: string,
  broadcasterId: string,
): Promise<TwitchAnalyticsSnapshot> {
  const [channelResponse, streamResponse, followersResponse] =
    await Promise.all([
      fetchTwitchApi<TwitchChannelInfoResponse>(
        config,
        accessToken,
        TWITCH_CHANNELS_URL,
        [["broadcaster_id", broadcasterId]],
      ),
      fetchTwitchApi<TwitchStreamsResponse>(
        config,
        accessToken,
        TWITCH_STREAMS_URL,
        [["user_id", broadcasterId]],
      ),
      fetchTwitchApi<TwitchChannelFollowersResponse>(
        config,
        accessToken,
        TWITCH_CHANNEL_FOLLOWERS_URL,
        [["broadcaster_id", broadcasterId]],
      ),
    ]);

  const channel = channelResponse.data[0] ?? null;
  const stream = streamResponse.data[0] ?? null;
  const followerCount = followersResponse.total ?? 0;

  return {
    broadcasterId,
    channel,
    followerCount,
    isLive: Boolean(stream),
    rawPayload: {
      channel: channel as unknown as Json,
      followers: {
        total: followerCount,
      },
      stream: stream as unknown as Json,
    },
    stream,
    viewerCount: stream?.viewer_count ?? 0,
  };
}

export async function persistTwitchConnection({
  creatorId,
  supabase,
  token,
  twitchUser,
  userId,
}: {
  creatorId: string;
  supabase: StreamOSSupabaseClient;
  token: TwitchTokenResponse;
  twitchUser: TwitchUser;
  userId: string;
}) {
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + token.expires_in * 1000,
  ).toISOString();

  const existingChannel = await supabase
    .from("channels")
    .select("id")
    .eq("user_id", userId)
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
    user_id: userId,
  };

  const channelResult = existingChannel.data
    ? await supabase
        .from("channels")
        .update(channelPayload as never)
        .eq("user_id", userId)
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
    .eq("user_id", userId)
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
    user_id: userId,
  };

  const connectionResult = existingConnection.data
    ? await supabase
        .from("platform_connections")
        .update(connectionPayload as never)
        .eq("user_id", userId)
        .eq("id", existingConnectionData?.id ?? "")
    : await supabase
        .from("platform_connections")
        .insert(connectionPayload as never);

  if (connectionResult.error) {
    throw connectionResult.error;
  }
}

export async function refreshTwitchConnection({
  config,
  creatorId,
  supabase,
  userId,
}: {
  config: TwitchOAuthConfig;
  creatorId: string;
  supabase: StreamOSSupabaseClient;
  userId: string;
}) {
  const connectionResult = await supabase
    .from("platform_connections")
    .select("id, refresh_token_ciphertext, scopes")
    .eq("user_id", userId)
    .eq("creator_id", creatorId)
    .eq("platform", "twitch")
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (connectionResult.error) {
    throw connectionResult.error;
  }

  const connection = connectionResult.data as Pick<
    Tables<"platform_connections">,
    "id" | "refresh_token_ciphertext" | "scopes"
  > | null;

  if (!connection?.refresh_token_ciphertext) {
    throw new Error("Twitch connection has no refresh token.");
  }

  let token: TwitchTokenResponse;

  try {
    token = await refreshTwitchToken(
      config,
      decryptSecret(connection.refresh_token_ciphertext),
    );
  } catch (error) {
    if (
      error instanceof TwitchTokenRefreshError &&
      [400, 401].includes(error.status)
    ) {
      await supabase
        .from("platform_connections")
        .update({ status: "expired" } as never)
        .eq("user_id", userId)
        .eq("id", connection.id);
    }

    throw error;
  }

  const expiresAt = new Date(Date.now() + token.expires_in * 1000);
  const connectionPayload: Updates<"platform_connections"> = {
    access_token_ciphertext: encryptSecret(token.access_token),
    expires_at: expiresAt.toISOString(),
    refresh_token_ciphertext: token.refresh_token
      ? encryptSecret(token.refresh_token)
      : connection.refresh_token_ciphertext,
    scopes: token.scope ?? connection.scopes ?? [],
    status: "connected",
  };

  const updateResult = await supabase
    .from("platform_connections")
    .update(connectionPayload as never)
    .eq("user_id", userId)
    .eq("id", connection.id);

  if (updateResult.error) {
    throw updateResult.error;
  }

  return {
    expiresAt: expiresAt.toISOString(),
    scopes: connectionPayload.scopes ?? [],
  };
}

export async function syncTwitchAnalytics({
  config,
  creatorId,
  supabase,
  userId,
}: {
  config: TwitchOAuthConfig;
  creatorId: string;
  supabase: StreamOSSupabaseClient;
  userId: string;
}) {
  const { accessToken, connection } = await getUsableTwitchConnection({
    config,
    creatorId,
    supabase,
    userId,
  });

  if (!connection.channel_id) {
    throw new Error("Twitch connection has no linked StreamOS channel.");
  }

  const capturedAt = new Date().toISOString();
  const snapshot = await fetchTwitchAnalyticsSnapshot(
    config,
    accessToken,
    connection.provider_account_id,
  );

  const channelUpdate: Updates<"channels"> = {
    follower_count: snapshot.followerCount,
  };

  if (snapshot.channel?.broadcaster_name) {
    channelUpdate.display_name = snapshot.channel.broadcaster_name;
  }

  const channelResult = await supabase
    .from("channels")
    .update(channelUpdate as never)
    .eq("user_id", userId)
    .eq("id", connection.channel_id);

  if (channelResult.error) {
    throw channelResult.error;
  }

  const metricsPayload: Inserts<"metrics_snapshots"> = {
    captured_at: capturedAt,
    channel_id: connection.channel_id,
    creator_id: creatorId,
    follower_count: snapshot.followerCount,
    platform: "twitch",
    raw_payload: {
      ...snapshot.rawPayload,
      synced_at: capturedAt,
    },
    user_id: userId,
    viewer_count: snapshot.viewerCount,
    watch_time_minutes: 0,
    revenue_cents: 0,
  };

  const metricsResult = await supabase
    .from("metrics_snapshots")
    .insert(metricsPayload as never);

  if (metricsResult.error) {
    throw metricsResult.error;
  }

  return {
    capturedAt,
    followerCount: snapshot.followerCount,
    isLive: snapshot.isLive,
    viewerCount: snapshot.viewerCount,
  };
}

async function getUsableTwitchConnection({
  config,
  creatorId,
  supabase,
  userId,
}: {
  config: TwitchOAuthConfig;
  creatorId: string;
  supabase: StreamOSSupabaseClient;
  userId: string;
}) {
  let connection = await getLatestTwitchConnection({
    creatorId,
    supabase,
    userId,
  });

  if (!connection) {
    throw new Error("No Twitch connection found.");
  }

  const expiresAt = connection.expires_at
    ? new Date(connection.expires_at).getTime()
    : 0;
  const isExpired =
    connection.status === "expired" || expiresAt <= Date.now() + 60_000;

  if (isExpired) {
    await refreshTwitchConnection({ config, creatorId, supabase, userId });
    connection = await getLatestTwitchConnection({
      creatorId,
      supabase,
      userId,
    });
  }

  if (!connection?.access_token_ciphertext) {
    throw new Error("Twitch connection has no access token.");
  }

  return {
    accessToken: decryptSecret(connection.access_token_ciphertext),
    connection,
  };
}

async function getLatestTwitchConnection({
  creatorId,
  supabase,
  userId,
}: {
  creatorId: string;
  supabase: StreamOSSupabaseClient;
  userId: string;
}) {
  const connectionResult = await supabase
    .from("platform_connections")
    .select(
      "id, channel_id, provider_account_id, access_token_ciphertext, refresh_token_ciphertext, expires_at, status",
    )
    .eq("user_id", userId)
    .eq("creator_id", creatorId)
    .eq("platform", "twitch")
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (connectionResult.error) {
    throw connectionResult.error;
  }

  return connectionResult.data as Pick<
    Tables<"platform_connections">,
    | "access_token_ciphertext"
    | "channel_id"
    | "expires_at"
    | "id"
    | "provider_account_id"
    | "refresh_token_ciphertext"
    | "status"
  > | null;
}

async function fetchTwitchApi<TPayload>(
  config: TwitchOAuthConfig,
  accessToken: string,
  endpoint: string,
  params: Array<[string, string]>,
): Promise<TPayload> {
  const url = new URL(endpoint);
  params.forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Client-Id": config.clientId,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Twitch API request failed with status ${response.status}.`,
    );
  }

  return (await response.json()) as TPayload;
}
