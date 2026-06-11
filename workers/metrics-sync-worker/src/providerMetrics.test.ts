import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { encryptToken, decryptToken } from "@streamos/utils/crypto";

import {
  processMetricsSyncJob,
  type MetricsSyncWorkerDependencies,
} from "./providerMetrics.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CREATOR_ID = "22222222-2222-4222-8222-222222222222";
const CHANNEL_ID = "33333333-3333-4333-8333-333333333333";

describe("metricsSyncWorker", () => {
  const originalEnv = { ...process.env };
  const appEncryptionKey = `base64:${randomBytes(32).toString("base64")}`;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.APP_ENCRYPTION_KEY = appEncryptionKey;
    process.env.KICK_CLIENT_ID = "kick-client-id";
    process.env.KICK_CLIENT_SECRET = "kick-client-secret";
    process.env.TWITCH_CLIENT_ID = "twitch-client-id";
    process.env.TWITCH_CLIENT_SECRET = "twitch-client-secret";
    process.env.YOUTUBE_CLIENT_ID = "youtube-client-id";
    process.env.YOUTUBE_CLIENT_SECRET = "youtube-client-secret";
    process.env.TIKTOK_CLIENT_KEY = "tiktok-client-key";
    process.env.TIKTOK_CLIENT_SECRET = "tiktok-client-secret";
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it("syncs Twitch and Kick into hourly snapshots", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = input.toString();

      if (url === "https://id.kick.com/oauth/token") {
        return Response.json({
          access_token: "kick-app-token",
          expires_in: 3600,
          token_type: "Bearer",
        });
      }

      if (url.startsWith("https://api.kick.com/public/v1/channels")) {
        return Response.json({
          data: [
            {
              active_subscribers_count: 88,
              broadcaster_user_id: "kick-channel-1",
              category: {
                id: "cat-1",
                name: "Programming",
                slug: "programming",
                thumbnail_url: "https://cdn.example.com/category.png",
              },
              slug: "streamos",
              stream: {
                category: {
                  id: "cat-1",
                  name: "Programming",
                  slug: "programming",
                  thumbnail_url: "https://cdn.example.com/category.png",
                },
                id: "stream-1",
                is_live: true,
                session_title: "Live coding on Kick",
                slug: "streamos",
                started_at: "2026-06-08T10:00:00.000Z",
                thumbnail_url: "https://cdn.example.com/thumbnail.jpg",
                viewer_count: 144,
              },
              stream_title: "Live coding on Kick",
            },
          ],
        });
      }

      if (url.startsWith("https://api.twitch.tv/helix/channels/followers")) {
        return Response.json({ total: 1234 });
      }

      if (url.startsWith("https://api.twitch.tv/helix/streams")) {
        return Response.json({
          data: [
            {
              id: "stream-1",
              started_at: "2026-06-08T10:00:00.000Z",
              title: "Live coding",
              viewer_count: 88,
            },
          ],
        });
      }

      if (url.startsWith("https://api.twitch.tv/helix/users")) {
        return Response.json({
          data: [
            {
              display_name: "StreamOS",
              id: "broadcaster-1",
              login: "streamos",
              view_count: 9876,
            },
          ],
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const dependencies: MetricsSyncWorkerDependencies = {
      env: {
        kickClientId: "kick-client-id",
        kickClientSecret: "kick-client-secret",
        tiktokClientKey: "tiktok-client-key",
        tiktokClientSecret: "tiktok-client-secret",
        twitchClientId: "twitch-client-id",
        twitchClientSecret: "twitch-client-secret",
        youtubeClientId: "youtube-client-id",
        youtubeClientSecret: "youtube-client-secret",
      },
      fetchImpl: fetchMock,
      supabase: createSupabaseMock({
        connections: [
          {
            access_token_ciphertext: encryptToken("twitch-access"),
            channel_id: CHANNEL_ID,
            connected_at: "2026-06-08T09:00:00.000Z",
            creator_id: CREATOR_ID,
            expires_at: "2026-12-08T11:00:00.000Z",
            id: "connection-twitch",
            platform: "twitch",
            provider_account_id: "broadcaster-1",
            provider_profile: {},
            refresh_token_ciphertext: encryptToken("twitch-refresh"),
            scopes: ["analytics:read"],
            status: "connected",
            user_id: USER_ID,
          },
          {
            access_token_ciphertext: null,
            channel_id: CHANNEL_ID,
            connected_at: "2026-06-08T09:00:00.000Z",
            creator_id: CREATOR_ID,
            expires_at: null,
            id: "connection-kick",
            platform: "kick",
            provider_account_id: "kick-account-1",
            provider_profile: {
              handle: "@streamos",
            },
            refresh_token_ciphertext: null,
            scopes: [],
            status: "connected",
            user_id: USER_ID,
          },
        ],
      }),
    };

    const result = await processMetricsSyncJob(
      {
        providers: ["kick", "twitch", "kick"],
        user_id: USER_ID,
      },
      dependencies,
    );

    expect(result).toEqual({
      failed: [],
      synced: ["twitch", "kick"],
    });

    const snapshots = dependencies.supabase.upserts;
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0].payload).toMatchObject({
      channel_id: CHANNEL_ID,
      creator_id: CREATOR_ID,
      follower_count: 1234,
      platform: "twitch",
      user_id: USER_ID,
      viewer_count: 88,
    });
    expect(snapshots[1].payload).toMatchObject({
      channel_id: CHANNEL_ID,
      creator_id: CREATOR_ID,
      follower_count: 88,
      platform: "kick",
      user_id: USER_ID,
      viewer_count: 144,
    });
  });

  it("refreshes expired YouTube tokens before syncing", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = input.toString();

      if (url === "https://oauth2.googleapis.com/token") {
        return Response.json({
          access_token: "new-youtube-access",
          expires_in: 3600,
          refresh_token: "new-youtube-refresh",
          scope: "youtube.readonly youtube.upload",
        });
      }

      if (url.startsWith("https://www.googleapis.com/youtube/v3/channels")) {
        return Response.json({
          items: [
            {
              id: "yt-channel-1",
              statistics: {
                hiddenSubscriberCount: false,
                subscriberCount: "1234",
                viewCount: "98765",
              },
            },
          ],
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const dependencies: MetricsSyncWorkerDependencies = {
      env: {
        kickClientId: "kick-client-id",
        kickClientSecret: "kick-client-secret",
        tiktokClientKey: "tiktok-client-key",
        tiktokClientSecret: "tiktok-client-secret",
        twitchClientId: "twitch-client-id",
        twitchClientSecret: "twitch-client-secret",
        youtubeClientId: "youtube-client-id",
        youtubeClientSecret: "youtube-client-secret",
      },
      fetchImpl: fetchMock,
      supabase: createSupabaseMock({
        connections: [
          {
            access_token_ciphertext: encryptToken("old-youtube-access"),
            channel_id: CHANNEL_ID,
            connected_at: "2026-06-08T09:00:00.000Z",
            creator_id: CREATOR_ID,
            expires_at: "2026-06-08T09:30:00.000Z",
            id: "connection-youtube",
            platform: "youtube",
            provider_account_id: "yt-account-1",
            provider_profile: {},
            refresh_token_ciphertext: encryptToken("old-youtube-refresh"),
            scopes: ["youtube.readonly"],
            status: "expired",
            user_id: USER_ID,
          },
        ],
      }),
    };

    const result = await processMetricsSyncJob(
      {
        providers: ["youtube"],
        user_id: USER_ID,
      },
      dependencies,
    );

    expect(result).toEqual({
      failed: [],
      synced: ["youtube"],
    });

    expect(dependencies.supabase.updates).toHaveLength(1);
    expect(
      decryptToken(
        dependencies.supabase.updates[0].payload.access_token_ciphertext,
      ),
    ).toBe("new-youtube-access");
    expect(
      decryptToken(
        dependencies.supabase.updates[0].payload.refresh_token_ciphertext,
      ),
    ).toBe("new-youtube-refresh");
    expect(dependencies.supabase.upserts[0].payload).toMatchObject({
      follower_count: 1234,
      platform: "youtube",
      user_id: USER_ID,
      viewer_count: 0,
    });
  });
});

function createSupabaseMock({
  connections,
}: {
  connections: Array<{
    access_token_ciphertext: string | null;
    channel_id: string | null;
    connected_at: string;
    creator_id: string;
    expires_at: string | null;
    id: string;
    platform: "twitch" | "youtube" | "tiktok" | "kick";
    provider_account_id: string;
    provider_profile: Record<string, unknown>;
    refresh_token_ciphertext: string | null;
    scopes: string[];
    status: "connected" | "expired" | "revoked" | "pending";
    user_id: string;
  }>;
}) {
  const updates: Array<{
    filters: Record<string, string>;
    payload: Record<string, unknown>;
  }> = [];
  const upserts: Array<{
    options: Record<string, unknown>;
    payload: Record<string, unknown>;
  }> = [];

  return {
    updates,
    upserts,
    from(table: string) {
      if (table === "platform_connections") {
        const state: Record<string, string> = {};
        const chain = {
          eq(column: string, value: string) {
            state[column] = value;
            return chain;
          },
          limit(_count?: number) {
            return chain;
          },
          maybeSingle: async () => {
            const match = connections.find(
              (connection) =>
                connection.user_id === state.user_id &&
                connection.platform === state.platform,
            );

            return { data: match ?? null, error: null };
          },
          order(_column?: string, _options?: { ascending?: boolean }) {
            return chain;
          },
          select(_columns?: string) {
            return chain;
          },
          update(payload: Record<string, unknown>) {
            const filters: Record<string, string> = {};
            const updateChain = {
              eq(column: string, value: string) {
                filters[column] = value;
                if (column === "id") {
                  const match = connections.find(
                    (connection) => connection.id === value,
                  );
                  if (match) {
                    Object.assign(match, payload);
                  }
                }

                return updateChain;
              },
              then(resolve: (value: { error: null }) => void) {
                updates.push({ filters, payload });
                resolve({ error: null });
              },
            };

            return updateChain;
          },
        };

        return chain;
      }

      if (table === "metrics_snapshots") {
        return {
          upsert(
            payload: Record<string, unknown>,
            options: Record<string, unknown>,
          ) {
            upserts.push({ options, payload });
            return Promise.resolve({ error: null });
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  } as never;
}
