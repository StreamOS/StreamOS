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

function createHandoffToken(returnTo?: string) {
  return createOAuthHandoffToken(
    {
      creator_id: CREATOR_ID,
      exp: NOW + 60_000,
      return_to: returnTo,
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
    delete process.env.REDIS_URL;
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

  it("exchanges a valid callback, persists encrypted YouTube tokens, and redirects to return_to", async () => {
    const repository = new RecordingOAuthRepository();
    const { fetchImpl, tokenExchangeBodies } = createSuccessfulProviderFetch();
    const app = createApp({
      allowedOrigins: ["https://app.streamos.test"],
      apiGatewaySecret: API_SECRET,
      oauth: { fetchImpl, repository },
      rateLimit: { enabled: false },
      webhookNow: () => NOW,
    });
    const server = createServer(app);

    try {
      const connectResponse = await fetch(
        server.url(
          `/api/auth/youtube/connect?handoff=${encodeURIComponent(
            createHandoffToken("https://app.streamos.test/dashboard/platforms"),
          )}`,
        ),
        { redirect: "manual" },
      );
      const authorizeUrl = new URL(
        connectResponse.headers.get("location") ?? "",
      );
      const state = authorizeUrl.searchParams.get("state");

      const callbackResponse = await fetch(
        server.url(`/api/auth/youtube/callback?code=auth-code&state=${state}`),
        { redirect: "manual" },
      );

      expect(callbackResponse.status).toBe(302);
      expect(callbackResponse.headers.get("location")).toBe(
        "https://app.streamos.test/dashboard/platforms",
      );

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
        profile: {
          avatarUrl: "https://yt.example/avatar.jpg",
          displayName: "StreamOS Channel",
          followerCount: 12345,
          handle: "@streamos",
          provider: "youtube",
          providerAccountId: "UCstreamos",
        },
        provider: "youtube",
        scopes: ["https://www.googleapis.com/auth/youtube.readonly"],
        userId: USER_ID,
      });
    } finally {
      server.close();
    }
  });

  it("redirects to the default success target when return_to is missing", async () => {
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
        { redirect: "manual" },
      );

      expect(callbackResponse.status).toBe(302);
      expect(callbackResponse.headers.get("location")).toBe(
        "/dashboard/integrations",
      );
    } finally {
      server.close();
    }
  });

  it("blocks unsafe return_to targets and redirects to the default success target", async () => {
    const repository = new RecordingOAuthRepository();
    const { fetchImpl } = createSuccessfulProviderFetch();
    const app = createApp({
      allowedOrigins: ["https://app.streamos.test"],
      apiGatewaySecret: API_SECRET,
      oauth: { fetchImpl, repository },
      rateLimit: { enabled: false },
      webhookNow: () => NOW,
    });
    const server = createServer(app);

    try {
      const connectResponse = await fetch(
        server.url(
          `/api/auth/youtube/connect?handoff=${encodeURIComponent(
            createHandoffToken("https://evil.example/phishing"),
          )}`,
        ),
        { redirect: "manual" },
      );
      const authorizeUrl = new URL(
        connectResponse.headers.get("location") ?? "",
      );
      const state = authorizeUrl.searchParams.get("state");

      const callbackResponse = await fetch(
        server.url(`/api/auth/youtube/callback?code=auth-code&state=${state}`),
        { redirect: "manual" },
      );

      expect(callbackResponse.status).toBe(302);
      expect(callbackResponse.headers.get("location")).toBe(
        "/dashboard/integrations",
      );
    } finally {
      server.close();
    }
  });

  it("redirects callbacks with missing or invalid state to the YouTube error target", async () => {
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
        { redirect: "manual" },
      );
      const invalidStateResponse = await fetch(
        server.url("/api/auth/youtube/callback?code=auth-code&state=wrong"),
        { redirect: "manual" },
      );

      expect(missingStateResponse.status).toBe(302);
      expect(invalidStateResponse.status).toBe(302);
      expect(missingStateResponse.headers.get("location")).toBe(
        "/dashboard/integrations?error=youtube_connect_failed",
      );
      expect(invalidStateResponse.headers.get("location")).toBe(
        "/dashboard/integrations?error=youtube_connect_failed",
      );
    } finally {
      server.close();
    }
  });

  it("redirects to the YouTube error target when the provider callback contains an error", async () => {
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
        { redirect: "manual" },
      );

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(
        "/dashboard/integrations?error=youtube_connect_failed",
      );
    } finally {
      server.close();
    }
  });
});
