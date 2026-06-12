import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
  ensureCreatorForUser: vi.fn(),
  getTwitchOAuthConfig: vi.fn(),
  syncTwitchAnalytics: vi.fn(),
}));

/**
 * BOUNDARY NOTE:
 * These tests cover the current web boundary where /api/metrics/sync proxies
 * YouTube, TikTok, and Kick sync requests to the API gateway.
 *
 * Provider-specific refresh, token rotation, and snapshot logic is validated
 * in the gateway service tests. If that ownership moves again, update these
 * assertions to match the new boundary.
 */
vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}));

vi.mock("@/lib/supabase/creator", () => ({
  ensureCreatorForUser: mocks.ensureCreatorForUser,
}));

vi.mock("@/lib/integrations/twitch", () => ({
  getTwitchOAuthConfig: mocks.getTwitchOAuthConfig,
  syncTwitchAnalytics: mocks.syncTwitchAnalytics,
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(() => new Headers({ origin: "http://localhost:3000" })),
}));

describe("POST /api/metrics/sync", () => {
  const API_GATEWAY_URL = "https://gateway.streamos.test";
  const API_GATEWAY_SECRET = "gateway-secret-123";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("API_GATEWAY_URL", API_GATEWAY_URL);
    vi.stubEnv("API_GATEWAY_SECRET", API_GATEWAY_SECRET);
    vi.stubGlobal("fetch", vi.fn());
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
          error: null,
        }),
      },
    });
    mocks.ensureCreatorForUser.mockResolvedValue({
      id: "creator-1",
      userId: "user-1",
    });
    mocks.getTwitchOAuthConfig.mockReturnValue({
      clientId: "twitch-client-id",
      clientSecret: "twitch-client-secret",
      redirectUri: "http://localhost:3000/api/platforms/twitch/callback",
      scopes: ["user:read:email"],
    });
    mocks.syncTwitchAnalytics.mockResolvedValue({
      capturedAt: "2026-06-08T10:15:30.000Z",
      followerCount: 1234,
      isLive: true,
      viewerCount: 88,
    });
    mocks.createServiceRoleClient.mockReturnValue(
      createMockServiceRoleClient({
        channelId: "channel-1",
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each([
    [
      "youtube",
      {
        provider: "youtube",
        snapshot: {
          channelId: "channel-1",
          creatorId: "creator-1",
          followers: null,
          peakViewers: null,
          provider: "youtube",
          rawPayload: { subscribers: 1234 },
          snapshotAt: "2026-06-08T10:15:30.000Z",
          subscribers: 1234,
          userId: "user-1",
          views: 9876,
        },
        syncedAt: "2026-06-08T10:15:30.000Z",
      },
    ],
    [
      "tiktok",
      {
        provider: "tiktok",
        snapshot: {
          channelId: "channel-1",
          creatorId: "creator-1",
          followers: 4321,
          peakViewers: null,
          provider: "tiktok",
          rawPayload: { followerCount: 4321 },
          snapshotAt: "2026-06-08T10:15:30.000Z",
          subscribers: null,
          userId: "user-1",
          views: null,
        },
        syncedAt: "2026-06-08T10:15:30.000Z",
      },
    ],
    [
      "kick",
      {
        provider: "kick",
        snapshot: {
          channelId: "channel-1",
          creatorId: "creator-1",
          followers: 500,
          peakViewers: 88,
          provider: "kick",
          rawPayload: {
            category: "Just Chatting",
            followersCount: 500,
            title: "Live now",
          },
          snapshotAt: "2026-06-08T10:15:30.000Z",
          subscribers: null,
          userId: "user-1",
          views: null,
        },
        syncedAt: "2026-06-08T10:15:30.000Z",
      },
    ],
  ])(
    "delegates %s sync requests to the API gateway",
    async (_provider, gatewayResult) => {
      const fetchMock = vi.mocked(globalThis.fetch);
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify(gatewayResult), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      );

      const { POST } = await import("./route");
      const response = await POST(
        createRequest({ provider: gatewayResult.provider }),
      );
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload).toEqual(gatewayResult);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [requestUrl, requestInit] = fetchMock.mock.calls[0] ?? [];
      expect(String(requestUrl)).toBe(
        "https://gateway.streamos.test/api/metrics/sync",
      );
      expect(requestInit).toMatchObject({
        headers: {
          Authorization: `Bearer ${API_GATEWAY_SECRET}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      const requestBody = JSON.parse(String(requestInit?.body ?? "{}"));
      expect(requestBody).toEqual({
        creatorId: "creator-1",
        provider: gatewayResult.provider,
        userId: "user-1",
      });
      expect(mocks.syncTwitchAnalytics).not.toHaveBeenCalled();
    },
  );

  it("surfaces gateway non-JSON Kick responses without leaking raw text", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValue(
      new Response("<html><body>temporary outage</body></html>", {
        headers: { "content-type": "text/html" },
        status: 503,
      }),
    );

    const { POST } = await import("./route");
    const response = await POST(createRequest({ provider: "kick" }));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toEqual({
      code: "PROVIDER_API_ERROR",
      error: "<html><body>temporary outage</body></html>",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces Kick re-auth prompts from the gateway", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "KICK_REFRESH_UNAVAILABLE",
            message: "Kick account must be reconnected.",
            retryable: false,
          },
        }),
        {
          headers: { "content-type": "application/json" },
          status: 503,
        },
      ),
    );

    const { POST } = await import("./route");
    const response = await POST(createRequest({ provider: "kick" }));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toEqual({
      error: {
        code: "KICK_REFRESH_UNAVAILABLE",
        message: "Kick account must be reconnected.",
        retryable: false,
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps Twitch sync local to Next.js server actions", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);

    const { POST } = await import("./route");
    const response = await POST(createRequest({ provider: "twitch" }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      provider: "twitch",
      snapshot: {
        channelId: "channel-1",
        creatorId: "creator-1",
        followers: 1234,
        peakViewers: 88,
        provider: "twitch",
        rawPayload: {
          followerCount: 1234,
          isLive: true,
          viewerCount: 88,
        },
        snapshotAt: "2026-06-08T10:15:30.000Z",
        subscribers: null,
        userId: "user-1",
        views: null,
      },
      syncedAt: "2026-06-08T10:15:30.000Z",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.syncTwitchAnalytics).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed requests without touching the gateway", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    const { POST } = await import("./route");
    const response = await POST(createRequest({}));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      code: "INVALID_REQUEST_BODY",
      error:
        "Request body must be { provider: 'twitch' | 'youtube' | 'tiktok' | 'kick' }.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not import non-Twitch provider SDKs or token columns", () => {
    const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

    expect(source).not.toContain("youtube-metrics");
    expect(source).not.toContain("tiktok-metrics");
    expect(source).not.toContain("kick-metrics");
    expect(source).not.toContain("decryptToken");
    expect(source).not.toContain("access_token_ciphertext");
    expect(source).not.toContain("refresh_token_ciphertext");
  });
});

function createRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/metrics/sync", {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });
}

function createMockServiceRoleClient({ channelId }: { channelId: string }) {
  const builder = {
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({
      data: {
        channel_id: channelId,
      },
      error: null,
    })),
    order: vi.fn(() => builder),
    select: vi.fn(() => builder),
  };

  return {
    from: vi.fn((table: string) => {
      if (table !== "platform_connections") {
        throw new Error(`Unexpected table: ${table}`);
      }

      return builder;
    }),
  };
}
