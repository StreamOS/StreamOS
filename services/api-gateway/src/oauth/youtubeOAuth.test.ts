import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { OAuthConnectionResult } from "@streamos/types";

import { createApp } from "../app.js";
import { createOAuthHandoffToken } from "./handoff.js";
import type {
  OAuthConnectionRepository,
  PersistOAuthConnectionInput,
} from "./repository.js";
import { YOUTUBE_TOKEN_URL } from "./providers/youtube.js";

const API_SECRET = "test-api-gateway-secret-123";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const CREATOR_ID = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-06-06T10:00:00.000Z").getTime();

class RecordingOAuthRepository implements OAuthConnectionRepository {
  readonly persisted: PersistOAuthConnectionInput[] = [];

  async persistConnection(
    input: PersistOAuthConnectionInput,
  ): Promise<OAuthConnectionResult> {
    this.persisted.push(input);

    return {
      channelId: "channel-row-1",
      connectionId: "connection-row-1",
      expiresAt: input.expiresAt,
      profile: input.profile,
      scopes: input.scopes,
    };
  }
}

function createServer(app: ReturnType<typeof createApp>) {
  const server = app.listen(0);
  const address = server.address();

  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Expected TCP server address.");
  }

  return {
    close: () => server.close(),
    url: (path: string) => `http://127.0.0.1:${address.port}${path}`,
  };
}

function createHandoffToken() {
  return createOAuthHandoffToken(
    {
      creator_id: CREATOR_ID,
      exp: NOW + 60_000,
      user_id: USER_ID,
    },
    API_SECRET,
  );
}

function createSuccessfulProviderFetch() {
  const tokenExchangeBodies: URLSearchParams[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = input.toString();

    if (url === YOUTUBE_TOKEN_URL) {
      tokenExchangeBodies.push(
        new URLSearchParams(init?.body?.toString() ?? ""),
      );

      return Response.json({
        access_token: "youtube-access-token",
        expires_in: 3600,
        refresh_token: "youtube-refresh-token",
        scope: "https://www.googleapis.com/auth/youtube.readonly",
        token_type: "Bearer",
      });
    }

    if (url.startsWith("https://www.googleapis.com/youtube/v3/channels")) {
      return Response.json({
        items: [
          {
            id: "UCstreamos",
            snippet: {
              customUrl: "@streamos",
              thumbnails: {
                high: {
                  url: "https://yt.example/avatar.jpg",
                },
              },
              title: "StreamOS Channel",
            },
            statistics: {
              subscriberCount: "12345",
            },
          },
        ],
      });
    }

    return new Response("Unexpected provider URL", { status: 500 });
  };

  return { fetchImpl, tokenExchangeBodies };
}

describe("YouTube OAuth gateway routes", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.APP_ENCRYPTION_KEY = `base64:${randomBytes(32).toString("base64")}`;
    process.env.YOUTUBE_CLIENT_ID = "youtube-client-id";
    process.env.YOUTUBE_CLIENT_SECRET = "youtube-client-secret";
    process.env.YOUTUBE_REDIRECT_URI =
      "http://127.0.0.1:4000/api/auth/youtube/callback";
    process.env.YOUTUBE_SCOPES =
      "https://www.googleapis.com/auth/youtube.readonly";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("redirects connect requests with state and PKCE parameters", async () => {
    const repository = new RecordingOAuthRepository();
    const { fetchImpl } = createSuccessfulProviderFetch();
    const app = createApp({
      apiGatewaySecret: API_SECRET,
      oauth: { fetchImpl, repository },
      rateLimit: { enabled: false },
      webhookNow: () => NOW,
    });
    const server = createServer(app);

    try {
      const response = await fetch(
        server.url(
          `/api/auth/youtube/connect?handoff=${encodeURIComponent(createHandoffToken())}`,
        ),
        { redirect: "manual" },
      );
      const location = response.headers.get("location");

      expect(response.status).toBe(302);
      expect(location).toBeTruthy();

      const authorizeUrl = new URL(location ?? "");
      expect(authorizeUrl.hostname).toBe("accounts.google.com");
      expect(authorizeUrl.searchParams.get("client_id")).toBe(
        "youtube-client-id",
      );
      expect(authorizeUrl.searchParams.get("state")).toHaveLength(43);
      expect(authorizeUrl.searchParams.get("code_challenge")).toHaveLength(43);
      expect(authorizeUrl.searchParams.get("code_challenge_method")).toBe(
        "S256",
      );
      expect(authorizeUrl.searchParams.get("scope")).toBe(
        "https://www.googleapis.com/auth/youtube.readonly",
      );
    } finally {
      server.close();
    }
  });

  it("exchanges a valid callback and persists encrypted YouTube tokens", async () => {
    const repository = new RecordingOAuthRepository();
    const { fetchImpl, tokenExchangeBodies } = createSuccessfulProviderFetch();
    const app = createApp({
      apiGatewaySecret: API_SECRET,
      oauth: { fetchImpl, repository },
      rateLimit: { enabled: false },
      webhookNow: () => NOW,
    });
    const server = createServer(app);

    try {
      const connectResponse = await fetch(
        server.url(
          `/api/auth/youtube/connect?handoff=${encodeURIComponent(createHandoffToken())}`,
        ),
        { redirect: "manual" },
      );
      const authorizeUrl = new URL(
        connectResponse.headers.get("location") ?? "",
      );
      const state = authorizeUrl.searchParams.get("state");

      const callbackResponse = await fetch(
        server.url(`/api/auth/youtube/callback?code=auth-code&state=${state}`),
      );
      const body = await callbackResponse.json();

      expect(callbackResponse.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toMatchObject({
        channel_id: "channel-row-1",
        connection_id: "connection-row-1",
        provider: "youtube",
        profile: {
          avatarUrl: "https://yt.example/avatar.jpg",
          displayName: "StreamOS Channel",
          followerCount: 12345,
          handle: "@streamos",
          provider: "youtube",
          providerAccountId: "UCstreamos",
        },
      });

      expect(tokenExchangeBodies).toHaveLength(1);
      expect(tokenExchangeBodies[0]?.get("code_verifier")).toBeTruthy();
      expect(repository.persisted).toHaveLength(1);
      expect(repository.persisted[0]?.accessTokenCiphertext).not.toBe(
        "youtube-access-token",
      );
      expect(repository.persisted[0]?.refreshTokenCiphertext).not.toBe(
        "youtube-refresh-token",
      );
      expect(repository.persisted[0]).toMatchObject({
        creatorId: CREATOR_ID,
        provider: "youtube",
        scopes: ["https://www.googleapis.com/auth/youtube.readonly"],
        userId: USER_ID,
      });
    } finally {
      server.close();
    }
  });

  it("rejects callbacks with missing or invalid state", async () => {
    const app = createApp({
      apiGatewaySecret: API_SECRET,
      oauth: { repository: new RecordingOAuthRepository() },
      rateLimit: { enabled: false },
      webhookNow: () => NOW,
    });
    const server = createServer(app);

    try {
      const missingStateResponse = await fetch(
        server.url("/api/auth/youtube/callback?code=auth-code"),
      );
      const invalidStateResponse = await fetch(
        server.url("/api/auth/youtube/callback?code=auth-code&state=wrong"),
      );
      const missingBody = await missingStateResponse.json();
      const invalidBody = await invalidStateResponse.json();

      expect(missingStateResponse.status).toBe(400);
      expect(invalidStateResponse.status).toBe(400);
      expect(missingBody.error.code).toBe("invalid_state");
      expect(invalidBody.error.code).toBe("invalid_state");
    } finally {
      server.close();
    }
  });

  it("returns oauth_exchange_failed when the provider callback contains an error", async () => {
    const app = createApp({
      apiGatewaySecret: API_SECRET,
      oauth: { repository: new RecordingOAuthRepository() },
      rateLimit: { enabled: false },
      webhookNow: () => NOW,
    });
    const server = createServer(app);

    try {
      const connectResponse = await fetch(
        server.url(
          `/api/auth/youtube/connect?handoff=${encodeURIComponent(createHandoffToken())}`,
        ),
        { redirect: "manual" },
      );
      const authorizeUrl = new URL(
        connectResponse.headers.get("location") ?? "",
      );
      const state = authorizeUrl.searchParams.get("state");

      const response = await fetch(
        server.url(
          `/api/auth/youtube/callback?error=access_denied&state=${state}`,
        ),
      );
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("oauth_exchange_failed");
    } finally {
      server.close();
    }
  });
});
