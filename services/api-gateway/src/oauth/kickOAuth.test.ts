import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { OAuthConnectionResult } from "@streamos/types";

import { createApp } from "../app.js";
import { createOAuthHandoffToken } from "./handoff.js";
import type {
  OAuthConnectionRepository,
  PersistOAuthConnectionInput,
} from "./repository.js";
import type { OAuthStateStore, StoredOAuthState } from "./stateStore.js";
import { KICK_CHANNELS_URL, KICK_TOKEN_URL } from "./providers/kick.js";

const API_SECRET = "test-api-gateway-secret-123";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const CREATOR_ID = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-06-06T10:00:00.000Z").getTime();

class RecordingOAuthRepository implements OAuthConnectionRepository {
  readonly persisted: PersistOAuthConnectionInput[] = [];

  async findLatestConnection() {
    return null;
  }

  async patchConnection(): Promise<void> {
    return;
  }

  async persistConnection(
    input: PersistOAuthConnectionInput,
  ): Promise<OAuthConnectionResult> {
    this.persisted.push(input);

    return {
      channelId: "kick-channel-row-1",
      connectionId: "kick-connection-row-1",
      expiresAt: input.expiresAt,
      profile: input.profile,
      scopes: input.scopes,
    };
  }
}

class RecordingOAuthStateStore implements OAuthStateStore {
  readonly saved: StoredOAuthState[] = [];

  private readonly states = new Map<string, StoredOAuthState>();

  async save(state: StoredOAuthState): Promise<void> {
    this.saved.push(state);
    this.states.set(state.state, state);
  }

  async consume(state: string): Promise<StoredOAuthState | null> {
    const storedState = this.states.get(state) ?? null;
    this.states.delete(state);

    return storedState;
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
      return_to: "/dashboard/platforms",
      user_id: USER_ID,
    },
    API_SECRET,
  );
}

function createSuccessfulProviderFetch() {
  const tokenExchangeBodies: URLSearchParams[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = input.toString();

    if (url === KICK_TOKEN_URL) {
      tokenExchangeBodies.push(
        new URLSearchParams(init?.body?.toString() ?? ""),
      );

      return Response.json({
        access_token: "kick-access-token",
        expires_in: 3600,
        refresh_token: "kick-refresh-token",
        scope:
          "user:read channel:read events:subscribe channel:follow channel:subscription",
        token_type: "Bearer",
      });
    }

    if (url === KICK_CHANNELS_URL) {
      return Response.json({
        data: [
          {
            broadcaster_user_id: 98765,
            followers_count: 4321,
            name: "StreamOS Kick",
            profile_picture: "https://kick.example/avatar.jpg",
            slug: "streamos",
            user: {
              username: "streamos",
            },
          },
        ],
      });
    }

    return new Response("Unexpected provider URL", { status: 500 });
  };

  return { fetchImpl, tokenExchangeBodies };
}

async function connect({
  fetchImpl,
  repository,
  stateStore,
}: {
  fetchImpl: typeof fetch;
  repository: RecordingOAuthRepository;
  stateStore: RecordingOAuthStateStore;
}) {
  const app = createApp({
    apiGatewaySecret: API_SECRET,
    oauth: { fetchImpl, repository, stateStore },
    rateLimit: { enabled: false },
    webhookNow: () => NOW,
  });
  const server = createServer(app);
  const response = await fetch(
    server.url(
      `/api/auth/kick/connect?handoff=${encodeURIComponent(createHandoffToken())}`,
    ),
    { redirect: "manual" },
  );

  return { response, server };
}

describe("Kick OAuth gateway routes", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.REDIS_URL;
    process.env.APP_ENCRYPTION_KEY = `base64:${randomBytes(32).toString("base64")}`;
    process.env.KICK_CLIENT_ID = "kick-client-id";
    process.env.KICK_CLIENT_SECRET = "kick-client-secret";
    process.env.KICK_REDIRECT_URI =
      "http://127.0.0.1:4000/api/auth/kick/callback";
    process.env.KICK_SCOPES =
      "user:read channel:read events:subscribe channel:follow channel:subscription";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("redirects connect requests and stores one-time state with PKCE", async () => {
    const repository = new RecordingOAuthRepository();
    const stateStore = new RecordingOAuthStateStore();
    const { fetchImpl } = createSuccessfulProviderFetch();
    const { response, server } = await connect({
      fetchImpl,
      repository,
      stateStore,
    });

    try {
      const location = response.headers.get("location");

      expect(response.status).toBe(302);
      expect(location).toBeTruthy();
      expect(stateStore.saved).toHaveLength(1);
      expect(stateStore.saved[0]).toMatchObject({
        creatorId: CREATOR_ID,
        expiresAt: NOW + 300_000,
        provider: "kick",
        returnTo: "/dashboard/platforms",
        userId: USER_ID,
      });

      const authorizeUrl = new URL(location ?? "");
      expect(authorizeUrl.origin).toBe("https://id.kick.com");
      expect(authorizeUrl.pathname).toBe("/oauth/authorize");
      expect(authorizeUrl.searchParams.get("client_id")).toBe("kick-client-id");
      expect(authorizeUrl.searchParams.get("state")).toHaveLength(43);
      expect(authorizeUrl.searchParams.get("code_challenge")).toHaveLength(43);
      expect(authorizeUrl.searchParams.get("code_challenge_method")).toBe(
        "S256",
      );
      expect(authorizeUrl.searchParams.get("scope")).toBe(
        "user:read channel:read events:subscribe channel:follow channel:subscription",
      );
    } finally {
      server.close();
    }
  });

  it("rejects connect requests with missing or expired handoff tokens", async () => {
    const app = createApp({
      apiGatewaySecret: API_SECRET,
      oauth: { repository: new RecordingOAuthRepository() },
      rateLimit: { enabled: false },
      webhookNow: () => NOW,
    });
    const server = createServer(app);
    const expiredHandoffToken = createOAuthHandoffToken(
      {
        creator_id: CREATOR_ID,
        exp: NOW - 1,
        return_to: "/dashboard/platforms",
        user_id: USER_ID,
      },
      API_SECRET,
    );

    try {
      const missingHandoffResponse = await fetch(
        server.url("/api/auth/kick/connect"),
        { redirect: "manual" },
      );
      const expiredHandoffResponse = await fetch(
        server.url(
          `/api/auth/kick/connect?handoff=${encodeURIComponent(expiredHandoffToken)}`,
        ),
        { redirect: "manual" },
      );

      expect(missingHandoffResponse.status).toBe(401);
      await expect(missingHandoffResponse.json()).resolves.toMatchObject({
        error: {
          code: "user_handoff_invalid",
        },
        success: false,
      });
      expect(expiredHandoffResponse.status).toBe(401);
      await expect(expiredHandoffResponse.json()).resolves.toMatchObject({
        error: {
          code: "user_handoff_invalid",
        },
        success: false,
      });
    } finally {
      server.close();
    }
  });

  it("exchanges a valid callback, persists encrypted Kick tokens, and redirects to return_to", async () => {
    const repository = new RecordingOAuthRepository();
    const stateStore = new RecordingOAuthStateStore();
    const { fetchImpl, tokenExchangeBodies } = createSuccessfulProviderFetch();
    const { response, server } = await connect({
      fetchImpl,
      repository,
      stateStore,
    });

    try {
      const authorizeUrl = new URL(response.headers.get("location") ?? "");
      const state = authorizeUrl.searchParams.get("state");
      const callbackResponse = await fetch(
        server.url(`/api/auth/kick/callback?code=auth-code&state=${state}`),
        { redirect: "manual" },
      );
      const replayResponse = await fetch(
        server.url(`/api/auth/kick/callback?code=auth-code&state=${state}`),
        { redirect: "manual" },
      );

      expect(callbackResponse.status).toBe(302);
      expect(callbackResponse.headers.get("location")).toBe(
        "/dashboard/platforms",
      );
      expect(replayResponse.status).toBe(302);
      expect(replayResponse.headers.get("location")).toBe(
        "/dashboard/integrations?error=kick_oauth_failed",
      );
      expect(tokenExchangeBodies).toHaveLength(1);
      expect(tokenExchangeBodies[0]?.get("code_verifier")).toBe(
        stateStore.saved[0]?.codeVerifier,
      );
      expect(repository.persisted).toHaveLength(1);
      expect(repository.persisted[0]?.accessTokenCiphertext).not.toBe(
        "kick-access-token",
      );
      expect(repository.persisted[0]?.refreshTokenCiphertext).not.toBe(
        "kick-refresh-token",
      );
      expect(repository.persisted[0]).toMatchObject({
        creatorId: CREATOR_ID,
        provider: "kick",
        profile: {
          avatarUrl: "https://kick.example/avatar.jpg",
          displayName: "StreamOS Kick",
          followerCount: 4321,
          handle: "streamos",
          provider: "kick",
          providerAccountId: "98765",
        },
        scopes: [
          "user:read",
          "channel:read",
          "events:subscribe",
          "channel:follow",
          "channel:subscription",
        ],
        userId: USER_ID,
      });
    } finally {
      server.close();
    }
  });

  it("redirects callbacks with missing or invalid state to the Kick error target", async () => {
    const app = createApp({
      apiGatewaySecret: API_SECRET,
      oauth: { repository: new RecordingOAuthRepository() },
      rateLimit: { enabled: false },
      webhookNow: () => NOW,
    });
    const server = createServer(app);

    try {
      const missingStateResponse = await fetch(
        server.url("/api/auth/kick/callback?code=auth-code"),
        { redirect: "manual" },
      );
      const invalidStateResponse = await fetch(
        server.url("/api/auth/kick/callback?code=auth-code&state=wrong"),
        { redirect: "manual" },
      );

      expect(missingStateResponse.status).toBe(302);
      expect(invalidStateResponse.status).toBe(302);
      expect(missingStateResponse.headers.get("location")).toBe(
        "/dashboard/integrations?error=kick_oauth_failed",
      );
      expect(invalidStateResponse.headers.get("location")).toBe(
        "/dashboard/integrations?error=kick_oauth_failed",
      );
    } finally {
      server.close();
    }
  });

  it("redirects to the Kick error target when token exchange fails", async () => {
    const repository = new RecordingOAuthRepository();
    const stateStore = new RecordingOAuthStateStore();
    const { fetchImpl } = createSuccessfulProviderFetch();
    const { response, server } = await connect({
      fetchImpl,
      repository,
      stateStore,
    });
    const failingFetch: typeof fetch = async (input) => {
      if (input.toString() === KICK_TOKEN_URL) {
        return Response.json({ error: "invalid_grant" }, { status: 400 });
      }

      return new Response("Unexpected provider URL", { status: 500 });
    };

    server.close();

    const app = createApp({
      apiGatewaySecret: API_SECRET,
      oauth: { fetchImpl: failingFetch, repository, stateStore },
      rateLimit: { enabled: false },
      webhookNow: () => NOW,
    });
    const callbackServer = createServer(app);

    try {
      const state = new URL(
        response.headers.get("location") ?? "",
      ).searchParams.get("state");
      const callbackResponse = await fetch(
        callbackServer.url(
          `/api/auth/kick/callback?code=auth-code&state=${state}`,
        ),
        { redirect: "manual" },
      );

      expect(callbackResponse.status).toBe(302);
      expect(callbackResponse.headers.get("location")).toBe(
        "/dashboard/integrations?error=kick_oauth_failed",
      );
      expect(repository.persisted).toHaveLength(0);
    } finally {
      callbackServer.close();
    }
  });

  it("redirects to the Kick error target when Kick returns no channel", async () => {
    const repository = new RecordingOAuthRepository();
    const stateStore = new RecordingOAuthStateStore();
    const fetchImpl: typeof fetch = async (input) => {
      const url = input.toString();

      if (url === KICK_TOKEN_URL) {
        return Response.json({
          access_token: "kick-access-token",
          token_type: "Bearer",
        });
      }

      if (url === KICK_CHANNELS_URL) {
        return Response.json({ data: [] });
      }

      return new Response("Unexpected provider URL", { status: 500 });
    };
    const { response, server } = await connect({
      fetchImpl,
      repository,
      stateStore,
    });

    try {
      const state = new URL(
        response.headers.get("location") ?? "",
      ).searchParams.get("state");
      const callbackResponse = await fetch(
        server.url(`/api/auth/kick/callback?code=auth-code&state=${state}`),
        { redirect: "manual" },
      );

      expect(callbackResponse.status).toBe(302);
      expect(callbackResponse.headers.get("location")).toBe(
        "/dashboard/integrations?error=kick_oauth_failed",
      );
      expect(repository.persisted).toHaveLength(0);
    } finally {
      server.close();
    }
  });
});
