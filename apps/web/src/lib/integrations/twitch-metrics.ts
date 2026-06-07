const TWITCH_USERS_URL = "https://api.twitch.tv/helix/users";
const TWITCH_STREAMS_URL = "https://api.twitch.tv/helix/streams";
const TWITCH_CHANNEL_FOLLOWERS_URL =
  "https://api.twitch.tv/helix/channels/followers";

export type TwitchMetricsRaw = {
  broadcasterId: string;
  followers: {
    total: number;
  };
  stream: {
    id: string;
    title: string;
    viewer_count: number;
    started_at: string;
  } | null;
  user: {
    id: string;
    login: string;
    display_name: string;
    view_count?: number;
  } | null;
};

type TwitchFollowersResponse = {
  total?: number;
};

type TwitchStreamsResponse = {
  data?: Array<{
    id: string;
    title: string;
    viewer_count: number;
    started_at: string;
  }>;
};

type TwitchUsersResponse = {
  data?: Array<{
    id: string;
    login: string;
    display_name: string;
    view_count?: number;
  }>;
};

export async function getTwitchChannelMetrics(
  accessToken: string,
  broadcasterId: string,
  options: { signal?: AbortSignal } = {},
): Promise<TwitchMetricsRaw> {
  const clientId = process.env.TWITCH_CLIENT_ID?.trim();

  if (!clientId) {
    throw new Error("TWITCH_CLIENT_ID is required for Twitch metrics sync.");
  }

  const [followers, streams, users] = await Promise.all([
    fetchTwitch<TwitchFollowersResponse>(
      TWITCH_CHANNEL_FOLLOWERS_URL,
      accessToken,
      clientId,
      [["broadcaster_id", broadcasterId]],
      options.signal,
    ),
    fetchTwitch<TwitchStreamsResponse>(
      TWITCH_STREAMS_URL,
      accessToken,
      clientId,
      [["user_id", broadcasterId]],
      options.signal,
    ),
    fetchTwitch<TwitchUsersResponse>(
      TWITCH_USERS_URL,
      accessToken,
      clientId,
      [["id", broadcasterId]],
      options.signal,
    ),
  ]);

  return {
    broadcasterId,
    followers: {
      total: followers.total ?? 0,
    },
    stream: streams.data?.[0] ?? null,
    user: users.data?.[0] ?? null,
  };
}

async function fetchTwitch<TPayload>(
  endpoint: string,
  accessToken: string,
  clientId: string,
  params: Array<[string, string]>,
  signal?: AbortSignal,
): Promise<TPayload> {
  const url = new URL(endpoint);
  params.forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Client-Id": clientId,
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Twitch metrics request failed with ${response.status}.`);
  }

  return (await response.json()) as TPayload;
}
