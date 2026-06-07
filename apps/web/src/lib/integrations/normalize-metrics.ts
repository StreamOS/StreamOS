import type { MetricsSnapshot, SupportedProvider } from "@streamos/types";

import type { KickMetricsRaw } from "./kick-metrics";
import type { TikTokMetricsRaw } from "./tiktok-metrics";
import type { TwitchMetricsRaw } from "./twitch-metrics";
import type { YouTubeMetricsRaw } from "./youtube-metrics";

type NormalizeContext = {
  channelId: string;
  snapshotAt?: string;
  userId: string;
};

export type { MetricsSnapshot };

export function normalizeTwitch(
  raw: TwitchMetricsRaw,
  context: NormalizeContext,
): MetricsSnapshot {
  return createSnapshot({
    context,
    data: raw,
    followers: raw.followers.total,
    peakViewers: raw.stream?.viewer_count ?? null,
    provider: "twitch",
    subscribers: null,
    views: raw.user?.view_count ?? null,
  });
}

export function normalizeYouTube(
  raw: YouTubeMetricsRaw,
  context: NormalizeContext,
): MetricsSnapshot {
  const subscribers = raw.channel.statistics?.hiddenSubscriberCount
    ? null
    : parseMetric(raw.channel.statistics?.subscriberCount);

  return createSnapshot({
    context,
    data: raw,
    followers: null,
    peakViewers: null,
    provider: "youtube",
    subscribers,
    views: parseMetric(raw.channel.statistics?.viewCount),
  });
}

export function normalizeTikTok(
  raw: TikTokMetricsRaw,
  context: NormalizeContext,
): MetricsSnapshot {
  return createSnapshot({
    context,
    data: raw,
    followers: raw.user.follower_count ?? null,
    peakViewers: null,
    provider: "tiktok",
    subscribers: null,
    views: raw.user.video_views ?? null,
  });
}

export function normalizeKick(
  raw: KickMetricsRaw,
  context: NormalizeContext,
): MetricsSnapshot {
  return createSnapshot({
    context,
    data: raw,
    followers: raw.followers ?? null,
    peakViewers: raw.livestream?.viewer_count ?? null,
    provider: "kick",
    subscribers: null,
    views: null,
  });
}

function createSnapshot({
  context,
  data,
  followers,
  peakViewers,
  provider,
  subscribers,
  views,
}: {
  context: NormalizeContext;
  data: Record<string, unknown>;
  followers: number | null;
  peakViewers: number | null;
  provider: SupportedProvider;
  subscribers: number | null;
  views: number | null;
}): MetricsSnapshot {
  return {
    channel_id: context.channelId,
    data,
    followers,
    peak_viewers: peakViewers,
    provider,
    snapshot_at: context.snapshotAt ?? new Date().toISOString(),
    subscribers,
    user_id: context.userId,
    views,
  };
}

function parseMetric(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) ? parsed : null;
}
