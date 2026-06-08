import { afterEach, describe, expect, it, vi } from "vitest";
import { encryptSecret } from "@/lib/security/encryption";
import {
  fetchTwitchAnalyticsSnapshot,
  refreshTwitchToken,
  syncTwitchAnalytics,
} from "./twitch";

describe("twitch token refresh", () => {
  const originalEncryptionKey = process.env.APP_ENCRYPTION_KEY;

  afterEach(() => {
    process.env.APP_ENCRYPTION_KEY = originalEncryptionKey;
    vi.unstubAllGlobals();
  });

  it("requests a new access token with the stored refresh token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "new-access-token",
        expires_in: 14_400,
        refresh_token: "new-refresh-token",
        scope: ["user:read:email"],
        token_type: "bearer",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const token = await refreshTwitchToken(
      {
        clientId: "client-id",
        clientSecret: "client-secret",
        redirectUri: "http://localhost:3000/api/platforms/twitch/callback",
        scopes: ["user:read:email"],
      },
      "stored-refresh-token",
    );

    const requestBody = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;

    expect(fetchMock).toHaveBeenCalledWith(
      "https://id.twitch.tv/oauth2/token",
      expect.objectContaining({
        cache: "no-store",
        method: "POST",
      }),
    );
    expect(requestBody.get("client_id")).toBe("client-id");
    expect(requestBody.get("client_secret")).toBe("client-secret");
    expect(requestBody.get("grant_type")).toBe("refresh_token");
    expect(requestBody.get("refresh_token")).toBe("stored-refresh-token");
    expect(token.access_token).toBe("new-access-token");
    expect(token.refresh_token).toBe("new-refresh-token");
  });

  it("fetches the first Twitch analytics snapshot from Helix", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              broadcaster_id: "123",
              broadcaster_language: "de",
              broadcaster_login: "bbizare",
              broadcaster_name: "bbizare",
              game_id: "509658",
              game_name: "Just Chatting",
              tags: ["Deutsch"],
              title: "Live now",
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              game_id: "509658",
              game_name: "Just Chatting",
              id: "stream-id",
              is_mature: false,
              language: "de",
              started_at: "2026-06-01T18:00:00Z",
              tags: ["Deutsch"],
              thumbnail_url: "https://example.com/thumb.jpg",
              title: "Live now",
              user_id: "123",
              user_login: "bbizare",
              user_name: "bbizare",
              viewer_count: 42,
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [],
          total: 1200,
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await fetchTwitchAnalyticsSnapshot(
      {
        clientId: "client-id",
        clientSecret: "client-secret",
        redirectUri: "http://localhost:3000/api/platforms/twitch/callback",
        scopes: ["user:read:email"],
      },
      "access-token",
      "123",
    );

    const requestedUrls = fetchMock.mock.calls.map(([url]) => url.toString());

    expect(requestedUrls).toEqual([
      "https://api.twitch.tv/helix/channels?broadcaster_id=123",
      "https://api.twitch.tv/helix/streams?user_id=123",
      "https://api.twitch.tv/helix/channels/followers?broadcaster_id=123",
    ]);
    expect(snapshot.followerCount).toBe(1200);
    expect(snapshot.isLive).toBe(true);
    expect(snapshot.viewerCount).toBe(42);
  });

  it("writes a Twitch analytics snapshot into metrics_snapshots", async () => {
    process.env.APP_ENCRYPTION_KEY =
      "base64:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
    const insertedRows: unknown[] = [];
    const updatedRows: unknown[] = [];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              broadcaster_id: "123",
              broadcaster_language: "de",
              broadcaster_login: "bbizare",
              broadcaster_name: "bbizare",
              game_id: "509658",
              game_name: "Just Chatting",
              tags: ["Deutsch"],
              title: "Live now",
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              game_id: "509658",
              game_name: "Just Chatting",
              id: "stream-id",
              is_mature: false,
              language: "de",
              started_at: "2026-06-01T18:00:00Z",
              tags: ["Deutsch"],
              thumbnail_url: "https://example.com/thumb.jpg",
              title: "Live now",
              user_id: "123",
              user_login: "bbizare",
              user_name: "bbizare",
              viewer_count: 42,
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [],
          total: 1200,
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const supabase = createSupabaseMock({ insertedRows, updatedRows });
    const result = await syncTwitchAnalytics({
      config: {
        clientId: "client-id",
        clientSecret: "client-secret",
        redirectUri: "http://localhost:3000/api/platforms/twitch/callback",
        scopes: ["user:read:email"],
      },
      creatorId: "creator-id",
      supabase: supabase as never,
      userId: "user-id",
    });

    expect(result).toEqual(
      expect.objectContaining({
        followerCount: 1200,
        isLive: true,
        viewerCount: 42,
      }),
    );
    expect(updatedRows).toContainEqual(
      expect.objectContaining({
        follower_count: 1200,
        display_name: "bbizare",
      }),
    );
    expect(insertedRows).toContainEqual(
      expect.objectContaining({
        channel_id: "channel-id",
        creator_id: "creator-id",
        follower_count: 1200,
        platform: "twitch",
        user_id: "user-id",
        viewer_count: 42,
      }),
    );
  });
});

function createSupabaseMock({
  insertedRows,
  updatedRows,
}: {
  insertedRows: unknown[];
  updatedRows: unknown[];
}) {
  const connection = {
    access_token_ciphertext: encryptSecret("access-token"),
    channel_id: "channel-id",
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    id: "connection-id",
    provider_account_id: "123",
    refresh_token_ciphertext: encryptSecret("refresh-token"),
    status: "connected",
  };

  return {
    from(table: string) {
      if (table === "platform_connections") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: async () => ({
                        data: connection,
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        };
      }

      if (table === "channels") {
        return {
          update: (payload: unknown) => {
            updatedRows.push(payload);
            return {
              eq: () => ({
                eq: async () => ({
                  error: null,
                }),
              }),
            };
          },
        };
      }

      if (table === "metrics_snapshots") {
        return {
          insert: async (payload: unknown) => {
            insertedRows.push(payload);
            return {
              error: null,
            };
          },
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };
}
