import { describe, expect, it, vi } from "vitest";

import {
  getKickChannelMetrics,
  KICK_CHANNEL_METRICS_URL,
} from "./kick-metrics";

describe("getKickChannelMetrics", () => {
  it("fetches Kick channel metrics and maps live stream fields", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        data: [
          {
            active_subscribers_count: 150,
            broadcaster_user_id: 668,
            category: {
              id: 15,
              name: "Just Chatting",
              thumbnail: "https://kick.com/categories/just-chatting.jpg",
            },
            slug: "streamos",
            stream: {
              is_live: true,
              start_time: "2026-06-06T12:00:00Z",
              thumbnail: "https://stream.kick.com/thumb.jpg",
              viewer_count: 88,
            },
            stream_title: "Live coding on Kick",
          },
        ],
        message: "OK",
      }),
    );
    const metrics = await getKickChannelMetrics(
      "kick-access-token",
      "@streamos",
      {
        fetchImpl,
      },
    );

    const expectedUrl = new URL(KICK_CHANNEL_METRICS_URL);
    expectedUrl.searchParams.append("slug", "streamos");

    expect(fetchImpl).toHaveBeenCalledWith(expectedUrl, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        Authorization: "Bearer kick-access-token",
      },
      signal: undefined,
    });
    expect(metrics).toEqual({
      activeSubscribers: 150,
      category: {
        id: "15",
        name: "Just Chatting",
        slug: null,
        thumbnailUrl: "https://kick.com/categories/just-chatting.jpg",
      },
      channelId: "668",
      channelSlug: "streamos",
      displayName: "streamos",
      isLive: true,
      livestream: {
        category: null,
        id: null,
        is_live: true,
        session_title: "Live coding on Kick",
        slug: null,
        started_at: "2026-06-06T12:00:00Z",
        thumbnail_url: "https://stream.kick.com/thumb.jpg",
        viewer_count: 88,
      },
      title: "Live coding on Kick",
      username: "streamos",
    });
  });

  it("requires an access token for official Kick API reads", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        data: [
          {
            slug: "creator",
          },
        ],
      }),
    );

    await expect(
      getKickChannelMetrics("", "creator", { fetchImpl }),
    ).rejects.toThrow("Kick access token is required for metrics sync.");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("throws a descriptive error when the Kick channel is not found", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        data: [],
      }),
    );

    await expect(
      getKickChannelMetrics("kick-access-token", "missing", { fetchImpl }),
    ).rejects.toThrow('Kick channel "missing" was not found.');
  });

  it("throws a descriptive error when Kick rate limits metrics reads", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("Rate limited", { status: 429 }),
    );

    await expect(
      getKickChannelMetrics("kick-access-token", "creator", { fetchImpl }),
    ).rejects.toThrow("Kick metrics request was rate limited with status 429.");
  });
});
