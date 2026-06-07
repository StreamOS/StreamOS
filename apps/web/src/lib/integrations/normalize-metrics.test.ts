import { describe, expect, it } from "vitest";

import {
  normalizeKick,
  normalizeTikTok,
  normalizeTwitch,
  normalizeYouTube,
} from "./normalize-metrics";

const context = {
  channelId: "channel-id",
  snapshotAt: "2026-06-06T12:34:56.000Z",
  userId: "user-id",
};

describe("normalize metrics", () => {
  it("normalizes Twitch metrics with live viewer and follower data", () => {
    const snapshot = normalizeTwitch(
      {
        broadcasterId: "broadcaster-id",
        followers: {
          total: 1200,
        },
        stream: {
          id: "stream-id",
          started_at: "2026-06-06T12:00:00Z",
          title: "Live coding",
          viewer_count: 42,
        },
        user: {
          display_name: "Streamer",
          id: "broadcaster-id",
          login: "streamer",
          view_count: 10_000,
        },
      },
      context,
    );

    expect(snapshot).toMatchObject({
      channel_id: "channel-id",
      followers: 1200,
      peak_viewers: 42,
      provider: "twitch",
      snapshot_at: "2026-06-06T12:34:56.000Z",
      subscribers: null,
      user_id: "user-id",
      views: 10_000,
    });
  });

  it("normalizes YouTube metrics and handles hidden subscribers", () => {
    const snapshot = normalizeYouTube(
      {
        channel: {
          id: "youtube-channel-id",
          statistics: {
            hiddenSubscriberCount: true,
            subscriberCount: "5000",
            viewCount: "250000",
          },
        },
      },
      context,
    );

    expect(snapshot).toMatchObject({
      followers: null,
      peak_viewers: null,
      provider: "youtube",
      subscribers: null,
      views: 250_000,
    });
  });

  it("normalizes TikTok metrics with nullable account views", () => {
    const snapshot = normalizeTikTok(
      {
        user: {
          display_name: "TikTok Creator",
          follower_count: 3400,
          open_id: "open-id",
          username: "creator",
          video_count: 25,
        },
      },
      context,
    );

    expect(snapshot).toMatchObject({
      followers: 3400,
      peak_viewers: null,
      provider: "tiktok",
      subscribers: null,
      views: null,
    });
  });

  it("normalizes Kick stub metrics with null fields", () => {
    const snapshot = normalizeKick(
      {
        _stub: true,
        channelSlug: "creator",
        followers: null,
        livestream: null,
      },
      context,
    );

    expect(snapshot).toMatchObject({
      followers: null,
      peak_viewers: null,
      provider: "kick",
      subscribers: null,
      views: null,
    });
  });
});
