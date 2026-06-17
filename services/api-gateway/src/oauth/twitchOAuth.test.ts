import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { OAuthConnectionResult } from "@streamos/types";

import { createApp } from "../app.js";
import { createOAuthHandoffToken } from "./handoff.js";
import type {
  OAuthConnectionRepository,
  PersistOAuthConnectionInput,
} from "./repository.js";
import { TWITCH_TOKEN_URL, TWITCH_USERS_URL } from "./providers/twitch.js";

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

    if (url === TWITCH_TOKEN_URL) {
      tokenExchangeBodies.push(
        new URLSearchParams(init?.body?.toString() ?? ""),
      );

      return Response.json({
        access_token: "twitch-access-token",
        expires_in: 3600,
        refresh_token: "twitch-refresh-token",
        scope: ["user:read:email", "moderator:read:followers"],
        token_type: "bearer",
      });
    }

    if (url === TWITCH_USERS_URL) {
      return Response.json({
        data: [
          {
            display_name: "StreamOS",
            id: "123456",
            login: "streamos",
            profile_image_url: "https://static-cdn.jtvnw.net/avatar.jpg",
            view_count: 9876,
          },
        ],
      });
    }

    return new Response("Unexpected provider URL", { status: 500 });
  };

  return { fetchImpl, tokenExchangeBodies };
}

describe("Twitch OAuth gateway routes", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.REDIS_URL;
    process.env.APP_ENCRYPTION_KEY = `base64:${randomBytes(32).toString("base64")}`;
    process.env.TWITCH_CLIENT_ID = "twitch-client-id";
    process.env.TWITCH_CLIENT_SECRET = "twitch-client-secret";
    process.env.TWITCH_REDIRECT_URI =
      "http://127.0.0.1:4000/api/auth/twitch/callback";
    process.env.TWITCH_SCOPES = "user:read:email moderator:read:followers";
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
          `/api/auth/twitch/connect?handoff=${encodeURIComponent(createHandoffToken())}`,
        ),
        { redirect: "manual" },
      );
      const location = response.headers.get("location");

      expect(response.status).toBe(302);
      expect(location).toBeTruthy();

      const authorizeUrl = new URL(location ?? "");
      expect(authorizeUrl.hostname).toBe("id.twitch.tv");
      expect(authorizeUrl.searchParams.get("client_id")).toBe(
        "twitch-client-id",
      );
      expect(authorizeUrl.searchParams.get("state")).toHaveLength(43);
      expect(authorizeUrl.searchParams.get("code_challenge")).toHaveLength(43);
      expect(authorizeUrl.searchParams.get("code_challenge_method")).toBe(
        "S256",
      );
      expect(authorizeUrl.searchParams.get("scope")).toBe(
        "user:read:email moderator:read:followers",
      );
    } finally {
      server.close();
    }
  });

  it("exchanges a valid callback and persists encrypted Twitch tokens", async () => {
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
          `/api/auth/twitch/connect?handoff=${encodeURIComponent(
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
        server.url(`/api/auth/twitch/callback?code=auth-code&state=${state}`),
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
        "twitch-access-token",
      );
      expect(repository.persisted[0]?.refreshTokenCiphertext).not.toBe(
        "twitch-refresh-token",
      );
      expect(repository.persisted[0]).toMatchObject({
        creatorId: CREATOR_ID,
        profile: {
          avatarUrl: "https://static-cdn.jtvnw.net/avatar.jpg",
          displayName: "StreamOS",
          followerCount: 0,
          handle: "@streamos",
          provider: "twitch",
          providerAccountId: "123456",
        },
        provider: "twitch",
        scopes: ["user:read:email", "moderator:read:followers"],
        userId: USER_ID,
      });
    } finally {
      server.close();
    }
  });

  it("resolves relative callback return_to paths against the configured success redirect", async () => {
    process.env.CONNECT_SUCCESS_REDIRECT =
      "https://app.streamos.test/dashboard/platforms";

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
          `/api/auth/twitch/connect?handoff=${encodeURIComponent(
            createHandoffToken("/dashboard/platforms"),
          )}`,
        ),
        { redirect: "manual" },
      );
      const authorizeUrl = new URL(
        connectResponse.headers.get("location") ?? "",
      );
      const state = authorizeUrl.searchParams.get("state");

      const callbackResponse = await fetch(
        server.url(`/api/auth/twitch/callback?code=auth-code&state=${state}`),
        { redirect: "manual" },
      );

      expect(callbackResponse.status).toBe(302);
      expect(callbackResponse.headers.get("location")).toBe(
        "https://app.streamos.test/dashboard/platforms",
      );
    } finally {
      server.close();
    }
  });
});
