const YOUTUBE_CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels";

export type YouTubeMetricsRaw = {
  channel: {
    id: string;
    statistics?: {
      hiddenSubscriberCount?: boolean;
      subscriberCount?: string;
      viewCount?: string;
      videoCount?: string;
    };
  };
};

type YouTubeChannelsResponse = {
  items?: YouTubeMetricsRaw["channel"][];
};

export async function getYouTubeChannelMetrics(
  accessToken: string,
  options: { signal?: AbortSignal } = {},
): Promise<YouTubeMetricsRaw> {
  const url = new URL(YOUTUBE_CHANNELS_URL);
  url.searchParams.set("mine", "true");
  url.searchParams.set("part", "statistics");

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(`YouTube metrics request failed with ${response.status}.`);
  }

  const payload = (await response.json()) as YouTubeChannelsResponse;
  const channel = payload.items?.[0];

  if (!channel) {
    throw new Error("YouTube metrics request returned no channel.");
  }

  return { channel };
}
