const TIKTOK_USER_INFO_URL = "https://open.tiktokapis.com/v2/user/info/";
const TIKTOK_USER_FIELDS = [
  "open_id",
  "display_name",
  "username",
  "follower_count",
  "likes_count",
  "video_count",
].join(",");

export type TikTokMetricsRaw = {
  user: {
    open_id: string;
    display_name?: string;
    username?: string;
    follower_count?: number;
    likes_count?: number;
    video_count?: number;
    video_views?: number;
  };
};

type TikTokUserInfoResponse = {
  data?: {
    user?: TikTokMetricsRaw["user"];
  };
  error?: {
    code?: string;
    message?: string;
  };
};

export async function getTikTokChannelMetrics(
  accessToken: string,
  options: { signal?: AbortSignal } = {},
): Promise<TikTokMetricsRaw> {
  const url = new URL(TIKTOK_USER_INFO_URL);
  url.searchParams.set("fields", TIKTOK_USER_FIELDS);

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(`TikTok metrics request failed with ${response.status}.`);
  }

  const payload = (await response.json()) as TikTokUserInfoResponse;

  if (payload.error?.code && payload.error.code !== "ok") {
    throw new Error(
      payload.error.message || `TikTok metrics error: ${payload.error.code}.`,
    );
  }

  const user = payload.data?.user;

  if (!user?.open_id) {
    throw new Error("TikTok metrics request returned no user.");
  }

  return { user };
}
