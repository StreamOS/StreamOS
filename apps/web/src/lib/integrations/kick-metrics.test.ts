import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearKickAccessTokenCacheForTest,
  getKickAccessToken,
  getKickChannelMetrics,
  getKickChannelMetricsWithCachedToken,
  KICK_CHANNEL_METRICS_URL,
  KICK_TOKEN_URL,
} from "./kick-metrics";

describe("getKickChannelMetrics", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    clearKickAccessTokenCacheForTest();
    process.env.KICK_CLIENT_ID = "kick-client-id";
    process.env.KICK_CLIENT_SECRET = "kick-client-secret";
  });

  afterEach(() => {
    clearKickAccessTokenCacheForTest();
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

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

  it("fetches and caches a Kick app access token on the first cache miss", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      expect(input.toString()).toBe(KICK_TOKEN_URL);

      return createTokenResponse("app-token-1");
    });
    vi.stubGlobal("fetch", fetchImpl);

    await expect(getKickAccessToken()).resolves.toBe("app-token-1");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(KICK_TOKEN_URL, {
      body: new URLSearchParams({
        client_id: "kick-client-id",
        client_secret: "kick-client-secret",
        grant_type: "client_credentials",
      }),
      cache: "no-store",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      method: "POST",
    });
  });

  it("reuses the cached Kick app access token while it is valid", async () => {
    const fetchImpl = vi.fn(async () => createTokenResponse("app-token-1"));
    vi.stubGlobal("fetch", fetchImpl);

    await expect(getKickAccessToken()).resolves.toBe("app-token-1");
    await expect(getKickAccessToken()).resolves.toBe("app-token-1");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("treats an expired cached Kick app access token as a cache miss", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-08T10:00:00.000Z"));

    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(createTokenResponse("app-token-1", 61))
      .mockResolvedValueOnce(createTokenResponse("app-token-2", 3600));
    vi.stubGlobal("fetch", fetchImpl);

    await expect(getKickAccessToken()).resolves.toBe("app-token-1");
    vi.setSystemTime(new Date("2026-06-08T10:00:02.000Z"));
    await expect(getKickAccessToken()).resolves.toBe("app-token-2");

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("evicts a cached Kick token on 401, fetches a fresh token, and retries once", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === KICK_TOKEN_URL) {
        return createTokenResponse(
          fetchImpl.mock.calls.filter(
            ([callInput]) => callInput.toString() === KICK_TOKEN_URL,
          ).length === 1
            ? "app-token-1"
            : "app-token-2",
        );
      }

      if (url.startsWith(KICK_CHANNEL_METRICS_URL)) {
        const authorization = getAuthorizationHeader(fetchImpl);

        return authorization === "Bearer app-token-1"
          ? new Response("Unauthorized", { status: 401 })
          : createChannelResponse("streamos");
      }

      return new Response("Unexpected URL", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchImpl);

    const metrics = await getKickChannelMetricsWithCachedToken("streamos");

    expect(metrics.channelSlug).toBe("streamos");
    expect(countFetchCalls(fetchImpl, KICK_TOKEN_URL)).toBe(2);
    expect(countFetchCalls(fetchImpl, KICK_CHANNEL_METRICS_URL)).toBe(2);
  });

  it("throws when a Kick retry is still unauthorized after token refresh", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === KICK_TOKEN_URL) {
        return createTokenResponse("app-token");
      }

      if (url.startsWith(KICK_CHANNEL_METRICS_URL)) {
        return new Response("Unauthorized", { status: 401 });
      }

      return new Response("Unexpected URL", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchImpl);

    await expect(
      getKickChannelMetricsWithCachedToken("streamos"),
    ).rejects.toThrow("Kick API: unauthorized after token refresh");
    expect(countFetchCalls(fetchImpl, KICK_TOKEN_URL)).toBe(2);
    expect(countFetchCalls(fetchImpl, KICK_CHANNEL_METRICS_URL)).toBe(2);
  });

  it("does not evict or retry the cached Kick token for non-401 failures", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === KICK_TOKEN_URL) {
        return createTokenResponse("app-token");
      }

      if (url.startsWith(KICK_CHANNEL_METRICS_URL)) {
        return new Response("Rate limited", { status: 429 });
      }

      return new Response("Unexpected URL", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchImpl);

    await expect(
      getKickChannelMetricsWithCachedToken("streamos"),
    ).rejects.toThrow("Kick metrics request was rate limited with status 429.");
    expect(countFetchCalls(fetchImpl, KICK_TOKEN_URL)).toBe(1);
    expect(countFetchCalls(fetchImpl, KICK_CHANNEL_METRICS_URL)).toBe(1);
  });
});

function createTokenResponse(accessToken: string, expiresIn = 3600): Response {
  return Response.json({
    access_token: accessToken,
    expires_in: expiresIn,
    token_type: "Bearer",
  });
}

function createChannelResponse(slug: string): Response {
  return Response.json({
    data: [
      {
        active_subscribers_count: 150,
        broadcaster_user_id: 668,
        slug,
      },
    ],
    message: "OK",
  });
}

function countFetchCalls(
  fetchImpl: ReturnType<typeof vi.fn>,
  urlPrefix: string,
): number {
  return fetchImpl.mock.calls.filter(([input]) =>
    input.toString().startsWith(urlPrefix),
  ).length;
}

function getAuthorizationHeader(fetchImpl: ReturnType<typeof vi.fn>): string {
  const init = fetchImpl.mock.calls.at(-1)?.[1] as
    | { headers?: HeadersInit }
    | undefined;
  const headers = init?.headers;

  return isHeaderRecord(headers) ? (headers.Authorization ?? "") : "";
}

function isHeaderRecord(
  headers: HeadersInit | undefined,
): headers is Record<string, string> {
  return (
    Boolean(headers) && !Array.isArray(headers) && !(headers instanceof Headers)
  );
}
