import { Buffer } from "node:buffer";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../app.js";
import { decryptSecret, encryptSecret } from "../oauth/encryption.js";

const API_SECRET = "test-api-gateway-secret-123";
const APP_ENCRYPTION_KEY = `base64:${Buffer.alloc(32, 7).toString("base64")}`;
const SUPABASE_URL = "https://supabase.streamos.test";
const SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID_TWO = "22222222-2222-4222-8222-222222222222";
const USER_ID_THREE = "33333333-3333-4333-8333-333333333333";
const USER_ID_SYNC = "66666666-6666-4666-8666-666666666666";
const USER_ID_NO_CHANNEL = "77777777-7777-4777-8777-777777777777";
const USER_ID_OTHER_TENANT = "88888888-8888-4888-8888-888888888888";
const USER_ID_OTHER_TENANT_REQUEST = "99999999-9999-4999-8999-999999999999";
const USER_ID_REFRESH_ROTATION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CREATOR_ID = "44444444-4444-4444-8444-444444444444";
const CHANNEL_ID = "55555555-5555-4555-8555-555555555555";
const NOW = new Date("2026-06-22T10:15:00.000Z").getTime();

type FetchCall = {
  body: unknown;
  headers: Headers;
  method: string;
  url: URL;
};

type PlatformConnection = {
  access_token_ciphertext: string | null;
  channel_id: string | null;
  creator_id: string;
  expires_at: string | null;
  id: string;
  platform: "twitch" | "youtube" | "tiktok" | "kick";
  provider_account_id: string;
  provider_profile: unknown;
  refresh_token_ciphertext: string | null;
  scopes: string[] | null;
  status: string;
  user_id: string;
};

function createFetchHarness({
  connections = [],
  providerResponses = {},
}: {
  connections?: PlatformConnection[];
  providerResponses?: Record<string, Response>;
} = {}) {
  const calls: FetchCall[] = [];
  const upserts: Array<Record<string, unknown>> = [];
  const patches: Array<Record<string, unknown>> = [];

  const fetchImpl = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input.toString());
      const method = init?.method ?? "GET";
      const rawBody =
        typeof init?.body === "string" ? JSON.parse(init.body) : null;
      const headers = new Headers(init?.headers);

      calls.push({
        body: rawBody,
        headers,
        method,
        url,
      });

      if (
        url.origin === SUPABASE_URL &&
        url.pathname === "/rest/v1/platform_connections"
      ) {
        if (method === "PATCH") {
          patches.push(rawBody as Record<string, unknown>);
          return new Response(null, { status: 204 });
        }

        const platform = url.searchParams.get("platform")?.replace(/^eq\./, "");
        const userId = url.searchParams.get("user_id")?.replace(/^eq\./, "");

        return Response.json(
          connections.filter(
            (connection) =>
              connection.platform === platform && connection.user_id === userId,
          ),
        );
      }

      if (
        url.origin === SUPABASE_URL &&
        url.pathname === "/rest/v1/metrics_snapshots"
      ) {
        upserts.push(rawBody as Record<string, unknown>);
        return new Response(null, { status: 201 });
      }

      const providerResponse = providerResponses[getProviderResponseKey(url)];

      if (!providerResponse) {
        throw new Error(`Unexpected fetch: ${method} ${url.toString()}`);
      }

      return providerResponse;
    },
  ) as unknown as typeof fetch;

  return {
    calls,
    fetchImpl,
    patches,
    upserts,
  };
}

function getProviderResponseKey(url: URL) {
  if (
    url.hostname === "api.twitch.tv" &&
    url.pathname === "/helix/channels/followers"
  ) {
    return "twitch-followers";
  }

  if (url.hostname === "api.twitch.tv" && url.pathname === "/helix/streams") {
    return "twitch-streams";
  }

  if (url.hostname === "api.twitch.tv" && url.pathname === "/helix/users") {
    return "twitch-users";
  }

  if (url.hostname === "oauth2.googleapis.com" && url.pathname === "/token") {
    return "youtube-token";
  }

  if (
    url.hostname === "www.googleapis.com" &&
    url.pathname === "/youtube/v3/channels"
  ) {
    return "youtube-channel";
  }

  return `${url.hostname}${url.pathname}`;
}

function createConnection(
  overrides: Partial<PlatformConnection> = {},
): PlatformConnection {
  return {
    access_token_ciphertext: encryptSecret("mock-provider-access-token"),
    channel_id: CHANNEL_ID,
    creator_id: CREATOR_ID,
    expires_at: "2026-06-22T11:15:00.000Z",
    id: "connection-1",
    platform: "twitch",
    provider_account_id: "broadcaster-1",
    provider_profile: {},
    refresh_token_ciphertext: encryptSecret("mock-provider-refresh-token"),
    scopes: ["analytics:read"],
    status: "connected",
    user_id: USER_ID,
    ...overrides,
  };
}

function createMetricsApp(fetchImpl: typeof fetch) {
  return createApp({
    apiGatewaySecret: API_SECRET,
    allowedOrigins: ["https://app.streamos.test"],
    oauth: { fetchImpl },
    rateLimit: { enabled: false },
    webhookNow: () => NOW,
  });
}

async function postMetricsSync({
  apiSecret = API_SECRET,
  body = { providers: ["twitch"], user_id: USER_ID },
  fetchImpl,
}: {
  apiSecret?: string | null;
  body?: unknown;
  fetchImpl: typeof fetch;
}) {
  const chain = request(createMetricsApp(fetchImpl)).post("/api/metrics/sync");

  if (apiSecret) {
    chain.set("authorization", `Bearer ${apiSecret}`);
  }

  return chain.send(body);
}

describe("POST /api/metrics/sync", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      APP_ENCRYPTION_KEY,
      SUPABASE_SERVICE_ROLE_KEY,
      SUPABASE_URL,
      TWITCH_CLIENT_ID: "mock-twitch-client-id",
      TWITCH_CLIENT_SECRET: "mock-twitch-client-secret",
      YOUTUBE_CLIENT_ID: "mock-youtube-client-id",
      YOUTUBE_CLIENT_SECRET: "mock-youtube-client-secret",
    };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("rejects requests without the app-facing gateway secret before side effects", async () => {
    const harness = createFetchHarness();

    const response = await postMetricsSync({
      apiSecret: null,
      fetchImpl: harness.fetchImpl,
    });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: "invalid_api_gateway_secret",
      message: "API gateway secret is invalid.",
    });
    expect(harness.calls).toHaveLength(0);
  });

  it("rejects invalid payloads before Supabase or provider side effects", async () => {
    const harness = createFetchHarness();

    const response = await postMetricsSync({
      body: { providers: ["twitch"], user_id: "not-a-valid-uuid" },
      fetchImpl: harness.fetchImpl,
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("invalid_metrics_sync_payload");
    expect(harness.calls).toHaveLength(0);
  });

  it("returns a safe failure when the tenant has no platform connection", async () => {
    const harness = createFetchHarness();

    const response = await postMetricsSync({ fetchImpl: harness.fetchImpl });

    expect(response.status).toBe(207);
    expect(response.body).toEqual({
      failed: [
        {
          code: "CONNECTION_NOT_FOUND",
          provider: "twitch",
          reason: "No twitch connection found for this user.",
        },
      ],
      synced: [],
    });
    expect(harness.upserts).toHaveLength(0);
    expect(harness.calls[0]?.url.searchParams.get("user_id")).toBe(
      `eq.${USER_ID}`,
    );
  });

  it("does not sync with another tenant's platform connection", async () => {
    const harness = createFetchHarness({
      connections: [createConnection({ user_id: USER_ID_OTHER_TENANT })],
    });

    const response = await postMetricsSync({
      body: {
        providers: ["twitch"],
        user_id: USER_ID_OTHER_TENANT_REQUEST,
      },
      fetchImpl: harness.fetchImpl,
    });

    expect(response.status).toBe(207);
    expect(response.body).toEqual({
      failed: [
        {
          code: "CONNECTION_NOT_FOUND",
          provider: "twitch",
          reason: "No twitch connection found for this user.",
        },
      ],
      synced: [],
    });
    expect(harness.upserts).toHaveLength(0);
    expect(
      harness.calls.some((call) => call.url.hostname === "api.twitch.tv"),
    ).toBe(false);
    expect(harness.calls[0]?.url.searchParams.get("user_id")).toBe(
      `eq.${USER_ID_OTHER_TENANT_REQUEST}`,
    );
  });

  it("rejects incomplete channel linkage without provider fetches or writes", async () => {
    const harness = createFetchHarness({
      connections: [
        createConnection({
          channel_id: null,
          user_id: USER_ID_NO_CHANNEL,
        }),
      ],
    });

    const response = await postMetricsSync({
      body: { providers: ["twitch"], user_id: USER_ID_NO_CHANNEL },
      fetchImpl: harness.fetchImpl,
    });

    expect(response.status).toBe(207);
    expect(response.body).toEqual({
      failed: [
        {
          code: "CONNECTION_NOT_FOUND",
          provider: "twitch",
          reason: "Platform connection has no linked StreamOS channel.",
        },
      ],
      synced: [],
    });
    expect(harness.upserts).toHaveLength(0);
    expect(
      harness.calls.some((call) => call.url.hostname === "api.twitch.tv"),
    ).toBe(false);
  });

  it("writes successful Twitch metrics through the Supabase service-role REST path", async () => {
    const harness = createFetchHarness({
      connections: [createConnection({ user_id: USER_ID_SYNC })],
      providerResponses: {
        "twitch-followers": Response.json({ total: 1234 }),
        "twitch-streams": Response.json({
          data: [
            {
              id: "stream-1",
              started_at: "2026-06-22T10:00:00.000Z",
              title: "Live coding",
              viewer_count: 88,
            },
          ],
        }),
        "twitch-users": Response.json({
          data: [
            {
              display_name: "StreamOS",
              id: "broadcaster-1",
              login: "streamos",
              view_count: 9876,
            },
          ],
        }),
      },
    });

    const response = await postMetricsSync({
      body: { providers: ["twitch"], user_id: USER_ID_SYNC },
      fetchImpl: harness.fetchImpl,
    });

    expect(response.body).toEqual({
      failed: [],
      synced: ["twitch"],
    });
    expect(response.status).toBe(200);
    expect(harness.upserts).toHaveLength(1);
    expect(harness.upserts[0]).toMatchObject({
      captured_hour: expect.stringMatching(
        /^20\d\d-\d\d-\d\dT\d\d:00:00\.000Z$/,
      ),
      channel_id: CHANNEL_ID,
      creator_id: CREATOR_ID,
      follower_count: 1234,
      platform: "twitch",
      user_id: USER_ID_SYNC,
      viewer_count: 88,
    });

    const upsertCall = harness.calls.find(
      (call) =>
        call.method === "POST" &&
        call.url.pathname === "/rest/v1/metrics_snapshots",
    );

    expect(upsertCall?.url.searchParams.get("on_conflict")).toBe(
      "user_id,platform,captured_hour",
    );
    expect(upsertCall?.headers.get("authorization")).toMatch(/^Bearer /);
    expect(harness.patches).toHaveLength(0);
    expect(
      harness.calls.some(
        (call) =>
          call.url.hostname === "id.twitch.tv" &&
          call.url.pathname === "/oauth2/token",
      ),
    ).toBe(false);
  });

  it("refreshes expired provider tokens in the gateway and persists rotation", async () => {
    const rotatedAccessToken = "rotated-youtube-access-token";
    const rotatedRefreshToken = "rotated-youtube-refresh-token";
    const harness = createFetchHarness({
      connections: [
        createConnection({
          expires_at: "2026-06-22T09:00:00.000Z",
          id: "connection-youtube",
          platform: "youtube",
          provider_account_id: "youtube-channel-1",
          user_id: USER_ID_REFRESH_ROTATION,
        }),
      ],
      providerResponses: {
        "youtube-channel": Response.json({
          items: [
            {
              id: "youtube-channel-1",
              statistics: {
                subscriberCount: "456",
                videoCount: "7",
                viewCount: "12345",
              },
            },
          ],
        }),
        "youtube-token": Response.json({
          access_token: rotatedAccessToken,
          expires_in: 3600,
          refresh_token: rotatedRefreshToken,
          scope: "https://www.googleapis.com/auth/youtube.readonly",
        }),
      },
    });

    const response = await postMetricsSync({
      body: { providers: ["youtube"], user_id: USER_ID_REFRESH_ROTATION },
      fetchImpl: harness.fetchImpl,
    });
    const serialized = JSON.stringify(response.body);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      failed: [],
      synced: ["youtube"],
    });
    expect(harness.patches).toHaveLength(1);
    expect(harness.upserts).toHaveLength(1);
    expect(harness.patches[0]).toMatchObject({
      scopes: ["https://www.googleapis.com/auth/youtube.readonly"],
      status: "connected",
    });
    expect(
      harness.calls.some(
        (call) =>
          call.url.hostname === "oauth2.googleapis.com" &&
          call.url.pathname === "/token",
      ),
    ).toBe(true);
    expect(
      decryptSecret(String(harness.patches[0]?.access_token_ciphertext)),
    ).toBe(rotatedAccessToken);
    expect(
      decryptSecret(String(harness.patches[0]?.refresh_token_ciphertext)),
    ).toBe(rotatedRefreshToken);
    expect(serialized).not.toContain(rotatedAccessToken);
    expect(serialized).not.toContain(rotatedRefreshToken);
  });

  it("normalizes provider fetch failures without leaking token material", async () => {
    const harness = createFetchHarness({
      connections: [
        createConnection({
          user_id: USER_ID_TWO,
        }),
      ],
      providerResponses: {
        "twitch-followers": new Response("provider raw failure", {
          status: 500,
        }),
        "twitch-streams": Response.json({ data: [] }),
        "twitch-users": Response.json({ data: [] }),
      },
    });

    const response = await postMetricsSync({
      body: { providers: ["twitch"], user_id: USER_ID_TWO },
      fetchImpl: harness.fetchImpl,
    });
    const serialized = JSON.stringify(response.body);

    expect(response.status).toBe(207);
    expect(response.body.failed[0]).toEqual({
      code: "PROVIDER_FETCH_FAILED",
      provider: "twitch",
      reason: "Twitch metrics request failed with 500.",
    });
    expect(serialized).not.toContain("mock-provider-access-token");
    expect(serialized).not.toContain("mock-provider-refresh-token");
    expect(serialized).not.toContain("mock-twitch-client-secret");
    expect(harness.upserts).toHaveLength(0);
  });

  it("handles token refresh failures safely and avoids metrics upserts", async () => {
    const harness = createFetchHarness({
      connections: [
        createConnection({
          expires_at: "2026-06-22T09:00:00.000Z",
          id: "connection-youtube",
          platform: "youtube",
          provider_account_id: "youtube-channel-1",
          user_id: USER_ID_THREE,
        }),
      ],
      providerResponses: {
        "youtube-token": new Response("provider token failure", {
          status: 401,
        }),
      },
    });

    const response = await postMetricsSync({
      body: { providers: ["youtube"], user_id: USER_ID_THREE },
      fetchImpl: harness.fetchImpl,
    });
    const serialized = JSON.stringify(response.body);

    expect(response.status).toBe(207);
    expect(response.body).toEqual({
      failed: [
        {
          code: "TOKEN_REFRESH_FAILED",
          provider: "youtube",
          reason: "YouTube token refresh failed with 401.",
        },
      ],
      synced: [],
    });
    expect(serialized).not.toContain("mock-provider-refresh-token");
    expect(serialized).not.toContain("mock-youtube-client-secret");
    expect(harness.patches).toHaveLength(0);
    expect(harness.upserts).toHaveLength(0);
  });
});
