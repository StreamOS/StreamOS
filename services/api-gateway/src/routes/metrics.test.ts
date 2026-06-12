import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { encryptSecret } from "../oauth/encryption.js";
import { createApp } from "../app.js";

const API_SECRET = "test-api-gateway-secret-123";
const SUPABASE_URL = "https://supabase.streamos.test";
const SUPABASE_SERVICE_ROLE_KEY = "service-role-key-123";

describe("POST /api/metrics/sync", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-08T10:15:30.000Z"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv(
      "APP_ENCRYPTION_KEY",
      `base64:${randomBytes(32).toString("base64")}`,
    );
    vi.stubEnv("SUPABASE_URL", SUPABASE_URL);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_SERVICE_ROLE_KEY);
    vi.stubEnv("YOUTUBE_CLIENT_ID", "youtube-client-id");
    vi.stubEnv("YOUTUBE_CLIENT_SECRET", "youtube-client-secret");
    vi.stubEnv("TIKTOK_CLIENT_KEY", "tiktok-client-key");
    vi.stubEnv("TIKTOK_CLIENT_SECRET", "tiktok-client-secret");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    vi.unstubAllEnvs();
  });

  it("refreshes expired YouTube credentials and upserts the normalized snapshot", async () => {
    const requests: Array<{ body?: string; method: string; url: string }> = [];
    const oldAccessToken = encryptSecret("old-access-token");
    const oldRefreshToken = encryptSecret("old-refresh-token");

    const fetchImpl: typeof fetch = async (input, init) => {
      const url = input.toString();
      const method = init?.method ?? "GET";
      const body =
        typeof init?.body === "string" ? init.body : init?.body?.toString();
      requests.push({ body, method, url });
      const parsedUrl = new URL(url);

      if (
        parsedUrl.pathname === "/rest/v1/platform_connections" &&
        method === "GET"
      ) {
        return Response.json([
          {
            access_token_ciphertext: oldAccessToken,
            channel_id: "channel-1",
            creator_id: "creator-1",
            expires_at: "2026-06-08T10:14:00.000Z",
            id: "connection-1",
            metadata: {},
            platform: "youtube",
            provider_account_id: "UC123",
            provider_profile: { handle: "@streamos" },
            refresh_token_ciphertext: oldRefreshToken,
            scopes: ["https://www.googleapis.com/auth/youtube.readonly"],
            status: "connected",
            user_id: "user-1",
          },
        ]);
      }

      if (url === "https://oauth2.googleapis.com/token") {
        expect(body).toContain("client_id=youtube-client-id");
        expect(body).toContain("client_secret=youtube-client-secret");
        expect(body).toContain("grant_type=refresh_token");
        expect(body).toContain("refresh_token=old-refresh-token");

        return Response.json({
          access_token: "new-access-token",
          expires_in: 3600,
          refresh_token: "new-refresh-token",
          scope: "https://www.googleapis.com/auth/youtube.readonly",
          token_type: "Bearer",
        });
      }

      if (
        parsedUrl.pathname === "/www.googleapis.com/youtube/v3/channels" ||
        url.startsWith("https://www.googleapis.com/youtube/v3/channels")
      ) {
        const requestHeaders = new Headers(init?.headers as HeadersInit);
        expect(requestHeaders.get("authorization")).toBe(
          "Bearer new-access-token",
        );

        return Response.json({
          items: [
            {
              id: "UC123",
              statistics: {
                subscriberCount: "1234",
                viewCount: "9876",
              },
            },
          ],
        });
      }

      if (
        parsedUrl.pathname === "/rest/v1/platform_connections" &&
        method === "PATCH"
      ) {
        const payload = JSON.parse(body ?? "{}") as Record<string, unknown>;

        expect(payload.access_token_ciphertext).not.toBe("new-access-token");
        expect(payload.refresh_token_ciphertext).not.toBe("new-refresh-token");
        expect(payload.scopes).toEqual([
          "https://www.googleapis.com/auth/youtube.readonly",
        ]);

        return new Response(null, { status: 204 });
      }

      if (
        parsedUrl.pathname === "/rest/v1/metrics_snapshots" &&
        method === "POST"
      ) {
        const payload = JSON.parse(body ?? "{}") as Record<string, unknown>;

        expect(payload.user_id).toBe("user-1");
        expect(payload.creator_id).toBe("creator-1");
        expect(payload.platform).toBe("youtube");
        expect(payload.raw_payload).toMatchObject({
          channel: {
            id: "UC123",
          },
        });

        return Response.json([{ id: "snapshot-1" }], { status: 201 });
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    };

    const app = createApp({
      apiGatewaySecret: API_SECRET,
      metrics: { fetchImpl },
      rateLimit: { enabled: false },
    });
    const server = app.listen(0);

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected TCP server address.");
      }

      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/metrics/sync`,
        {
          body: JSON.stringify({
            creatorId: "creator-1",
            provider: "youtube",
            userId: "user-1",
          }),
          headers: {
            Authorization: `Bearer ${API_SECRET}`,
            "content-type": "application/json",
          },
          method: "POST",
        },
      );
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload).toEqual({
        provider: "youtube",
        snapshot: {
          channelId: "channel-1",
          creatorId: "creator-1",
          followers: null,
          peakViewers: null,
          provider: "youtube",
          rawPayload: {
            channel: {
              id: "UC123",
              statistics: {
                subscriberCount: "1234",
                viewCount: "9876",
              },
            },
          },
          snapshotAt: "2026-06-08T10:15:30.000Z",
          subscribers: 1234,
          userId: "user-1",
          views: 9876,
        },
        syncedAt: "2026-06-08T10:15:30.000Z",
      });
      expect(requests).toEqual([
        expect.objectContaining({
          method: "GET",
          url: expect.stringContaining("/rest/v1/platform_connections"),
        }),
        expect.objectContaining({
          method: "POST",
          url: "https://oauth2.googleapis.com/token",
        }),
        expect.objectContaining({
          method: "PATCH",
          url: expect.stringContaining("/rest/v1/platform_connections"),
        }),
        expect.objectContaining({
          method: "GET",
          url: expect.stringContaining("/youtube/v3/channels"),
        }),
        expect.objectContaining({
          method: "POST",
          url: expect.stringContaining("/rest/v1/metrics_snapshots"),
        }),
      ]);
    } finally {
      server.close();
    }
  });

  it("surfaces Kick closed-failure without calling provider APIs", async () => {
    const oldAccessToken = encryptSecret("old-access-token");
    const oldRefreshToken = encryptSecret("old-refresh-token");
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = input.toString();
      const method = init?.method ?? "GET";
      const parsedUrl = new URL(url);

      if (
        parsedUrl.pathname === "/rest/v1/platform_connections" &&
        method === "GET"
      ) {
        return Response.json([
          {
            access_token_ciphertext: oldAccessToken,
            channel_id: "channel-1",
            creator_id: "creator-1",
            expires_at: "2026-06-08T10:14:00.000Z",
            id: "connection-1",
            metadata: {},
            platform: "kick",
            provider_account_id: "kick-channel",
            provider_profile: { handle: "@kick-channel" },
            refresh_token_ciphertext: oldRefreshToken,
            scopes: ["channel:read"],
            status: "expired",
            user_id: "user-1",
          },
        ]);
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    };

    const app = createApp({
      apiGatewaySecret: API_SECRET,
      metrics: { fetchImpl },
      rateLimit: { enabled: false },
    });
    const server = app.listen(0);

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected TCP server address.");
      }

      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/metrics/sync`,
        {
          body: JSON.stringify({
            creatorId: "creator-1",
            provider: "kick",
            userId: "user-1",
          }),
          headers: {
            Authorization: `Bearer ${API_SECRET}`,
            "content-type": "application/json",
          },
          method: "POST",
        },
      );
      const payload = await response.json();

      expect(response.status).toBe(503);
      expect(payload).toEqual({
        error: {
          code: "KICK_REFRESH_UNAVAILABLE",
          message:
            "Kick does not expose a refresh endpoint. Re-authentication is required.",
          provider: "kick",
          retryable: false,
        },
      });
    } finally {
      server.close();
    }
  });

  it("rejects cross-tenant connection access", async () => {
    const oldAccessToken = encryptSecret("old-access-token");
    const oldRefreshToken = encryptSecret("old-refresh-token");
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = input.toString();
      const method = init?.method ?? "GET";
      const parsedUrl = new URL(url);

      if (
        parsedUrl.pathname === "/rest/v1/platform_connections" &&
        method === "GET" &&
        parsedUrl.searchParams.get("creator_id")
      ) {
        return Response.json([]);
      }

      if (
        parsedUrl.pathname === "/rest/v1/platform_connections" &&
        method === "GET"
      ) {
        return Response.json([
          {
            access_token_ciphertext: oldAccessToken,
            channel_id: "channel-1",
            creator_id: "creator-other",
            expires_at: "2026-06-08T10:14:00.000Z",
            id: "connection-1",
            metadata: {},
            platform: "youtube",
            provider_account_id: "UC123",
            provider_profile: { handle: "@streamos" },
            refresh_token_ciphertext: oldRefreshToken,
            scopes: ["https://www.googleapis.com/auth/youtube.readonly"],
            status: "connected",
            user_id: "user-1",
          },
        ]);
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    };

    const app = createApp({
      apiGatewaySecret: API_SECRET,
      metrics: { fetchImpl },
      rateLimit: { enabled: false },
    });
    const server = app.listen(0);

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected TCP server address.");
      }

      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/metrics/sync`,
        {
          body: JSON.stringify({
            creatorId: "creator-1",
            provider: "youtube",
            userId: "user-1",
          }),
          headers: {
            Authorization: `Bearer ${API_SECRET}`,
            "content-type": "application/json",
          },
          method: "POST",
        },
      );
      const payload = await response.json();

      expect(response.status).toBe(403);
      expect(payload).toEqual({
        error: {
          code: "CROSS_TENANT_ACCESS_DENIED",
          message:
            "The requested creator does not own the latest platform connection.",
          retryable: false,
          provider: "youtube",
        },
      });
    } finally {
      server.close();
    }
  });

  it("returns 401 when the gateway secret is missing or invalid", async () => {
    const app = createApp({
      apiGatewaySecret: API_SECRET,
      metrics: {
        fetchImpl: vi.fn(async () => {
          throw new Error("Should not be called.");
        }),
      },
      rateLimit: { enabled: false },
    });
    const server = app.listen(0);

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected TCP server address.");
      }

      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/metrics/sync`,
        {
          body: JSON.stringify({
            creatorId: "creator-1",
            provider: "youtube",
            userId: "user-1",
          }),
          headers: {
            "content-type": "application/json",
          },
          method: "POST",
        },
      );
      const payload = await response.json();

      expect(response.status).toBe(401);
      expect(payload).toEqual({
        error: "invalid_api_gateway_secret",
        message: "API gateway secret is invalid.",
      });
    } finally {
      server.close();
    }
  });

  it("returns 400 for malformed request bodies", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("Should not be called.");
    });
    const app = createApp({
      apiGatewaySecret: API_SECRET,
      metrics: { fetchImpl },
      rateLimit: { enabled: false },
    });
    const server = app.listen(0);

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected TCP server address.");
      }

      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/metrics/sync`,
        {
          body: JSON.stringify({ provider: "instagram" }),
          headers: {
            Authorization: `Bearer ${API_SECRET}`,
            "content-type": "application/json",
          },
          method: "POST",
        },
      );
      const payload = await response.json();

      expect(response.status).toBe(400);
      expect(payload).toEqual({
        error: {
          code: "INVALID_REQUEST_BODY",
          message: "Request body must include userId, creatorId, and provider.",
          retryable: false,
        },
      });
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      server.close();
    }
  });

  it("rate limits repeated metrics sync requests", async () => {
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = input.toString();
      const method = init?.method ?? "GET";
      const parsedUrl = new URL(url);

      if (
        parsedUrl.pathname === "/rest/v1/platform_connections" &&
        method === "GET"
      ) {
        return Response.json([
          {
            access_token_ciphertext: encryptSecret("old-access-token"),
            channel_id: "channel-1",
            creator_id: "creator-1",
            expires_at: "2026-06-08T11:14:00.000Z",
            id: "connection-1",
            metadata: {},
            platform: "youtube",
            provider_account_id: "UC123",
            provider_profile: { handle: "@streamos" },
            refresh_token_ciphertext: encryptSecret("old-refresh-token"),
            scopes: ["https://www.googleapis.com/auth/youtube.readonly"],
            status: "connected",
            user_id: "user-1",
          },
        ]);
      }

      if (
        parsedUrl.pathname === "/youtube/v3/channels" ||
        url.startsWith("https://www.googleapis.com/youtube/v3/channels")
      ) {
        return Response.json({
          items: [
            {
              id: "UC123",
              statistics: {
                subscriberCount: "1234",
                viewCount: "9876",
              },
            },
          ],
        });
      }

      if (url === "https://oauth2.googleapis.com/token") {
        return Response.json({
          access_token: "new-access-token",
          expires_in: 3600,
          token_type: "Bearer",
        });
      }

      if (
        parsedUrl.pathname === "/rest/v1/platform_connections" &&
        method === "PATCH"
      ) {
        return new Response(null, { status: 204 });
      }

      if (
        parsedUrl.pathname === "/rest/v1/metrics_snapshots" &&
        method === "POST"
      ) {
        return Response.json([{ id: "snapshot-1" }], { status: 201 });
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    };

    const app = createApp({
      apiGatewaySecret: API_SECRET,
      metrics: { fetchImpl },
      rateLimit: {
        enabled: true,
        maxRequests: 1,
        windowMs: 60_000,
      },
    });
    const server = app.listen(0);

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected TCP server address.");
      }

      const url = `http://127.0.0.1:${address.port}/api/metrics/sync`;
      const body = JSON.stringify({
        creatorId: "creator-1",
        provider: "youtube",
        userId: "user-1",
      });

      const firstResponse = await fetch(url, {
        body,
        headers: {
          Authorization: `Bearer ${API_SECRET}`,
          "content-type": "application/json",
        },
        method: "POST",
      });
      const secondResponse = await fetch(url, {
        body,
        headers: {
          Authorization: `Bearer ${API_SECRET}`,
          "content-type": "application/json",
        },
        method: "POST",
      });

      expect(firstResponse.status).toBe(200);
      expect(secondResponse.status).toBe(429);
      expect(secondResponse.headers.get("retry-after")).toBe("60");
    } finally {
      server.close();
    }
  });
});
