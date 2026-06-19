import { createHash, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { OAuthConnectionResult } from "@streamos/types";

import { createApp } from "../app.js";
import { createOAuthHandoffToken } from "./handoff.js";
import type {
  OAuthConnectionRepository,
  PersistOAuthConnectionInput,
} from "./repository.js";
import type { OAuthStateStore, StoredOAuthState } from "./stateStore.js";
import { TIKTOK_TOKEN_URL, TIKTOK_USER_INFO_URL } from "./providers/tiktok.js";

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
      channelId: "tiktok-channel-row-1",
      connectionId: "tiktok-connection-row-1",
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

    if (url === TIKTOK_TOKEN_URL) {
      tokenExchangeBodies.push(
        new URLSearchParams(init?.body?.toString() ?? ""),
      );

      return Response.json({
        access_token: "tiktok-access-token",
        expires_in: 86_400,
        refresh_token: "tiktok-refresh-token",
        scope: "user.info.basic,user.info.profile,user.info.stats",
        token_type: "Bearer",
      });
    }

    if (url.startsWith(TIKTOK_USER_INFO_URL)) {
      return Response.json({
        data: {
          user: {
            avatar_url: "https://tiktok.example/avatar.jpg",
            display_name: "StreamOS TikTok",
            follower_count: 54321,
            open_id: "tiktok-open-id",
            username: "streamos",
          },
        },
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
      `/api/auth/tiktok/connect?handoff=${encodeURIComponent(createHandoffToken())}`,
    ),
    { redirect: "manual" },
  );

  return { response, server };
}

describe("TikTok OAuth gateway routes", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.REDIS_URL;
    process.env.APP_ENCRYPTION_KEY = `base64:${randomBytes(32).toString("base64")}`;
    process.env.TIKTOK_CLIENT_KEY = "tiktok-client-key";
    process.env.TIKTOK_CLIENT_SECRET = "tiktok-client-secret";
    process.env.TIKTOK_REDIRECT_URI =
      "http://127.0.0.1:4000/api/auth/tiktok/callback";
    process.env.TIKTOK_SCOPES =
      "user.info.basic user.info.profile user.info.stats";
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
        provider: "tiktok",
        returnTo: "/dashboard/platforms",
        userId: USER_ID,
      });

      const authorizeUrl = new URL(location ?? "");
      expect(authorizeUrl.origin).toBe("https://www.tiktok.com");
      expect(authorizeUrl.pathname).toBe("/v2/auth/authorize/");
      expect(authorizeUrl.searchParams.get("client_key")).toBe(
        "tiktok-client-key",
      );
      expect(authorizeUrl.searchParams.get("state")).toHaveLength(43);
      expect(authorizeUrl.searchParams.get("code_challenge")).toBe(
        createHash("sha256")
          .update(stateStore.saved[0]?.codeVerifier ?? "")
          .digest("base64url"),
      );
      expect(authorizeUrl.searchParams.get("code_challenge")).toHaveLength(43);
      expect(authorizeUrl.searchParams.get("code_challenge_method")).toBe(
        "S256",
      );
      expect(authorizeUrl.searchParams.get("scope")).toBe(
        "user.info.basic,user.info.profile,user.info.stats,video.publish",
      );
    } finally {
      server.close();
    }
  });

  it("exchanges a valid callback, persists encrypted TikTok tokens, and redirects to return_to", async () => {
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
        server.url(`/api/auth/tiktok/callback?code=auth-code&state=${state}`),
        { redirect: "manual" },
      );
      const replayResponse = await fetch(
        server.url(`/api/auth/tiktok/callback?code=auth-code&state=${state}`),
        { redirect: "manual" },
      );

      expect(callbackResponse.status).toBe(302);
      expect(callbackResponse.headers.get("location")).toBe(
        "/dashboard/platforms",
      );
      expect(replayResponse.status).toBe(302);
      expect(replayResponse.headers.get("location")).toBe(
        "/dashboard/integrations?error=tiktok_oauth_failed",
      );
      expect(tokenExchangeBodies).toHaveLength(1);
      expect(tokenExchangeBodies[0]?.get("code_verifier")).toBe(
        stateStore.saved[0]?.codeVerifier,
      );
      expect(repository.persisted).toHaveLength(1);
      expect(repository.persisted[0]?.accessTokenCiphertext).not.toBe(
        "tiktok-access-token",
      );
      expect(repository.persisted[0]?.refreshTokenCiphertext).not.toBe(
        "tiktok-refresh-token",
      );
      expect(repository.persisted[0]).toMatchObject({
        creatorId: CREATOR_ID,
        provider: "tiktok",
        profile: {
          avatarUrl: "https://tiktok.example/avatar.jpg",
          displayName: "StreamOS TikTok",
          followerCount: 54321,
          handle: "@streamos",
          provider: "tiktok",
          providerAccountId: "tiktok-open-id",
        },
        scopes: ["user.info.basic", "user.info.profile", "user.info.stats"],
        userId: USER_ID,
      });
    } finally {
      server.close();
    }
  });

  it("redirects callbacks with missing or invalid state to the TikTok error target", async () => {
    const app = createApp({
      apiGatewaySecret: API_SECRET,
      oauth: { repository: new RecordingOAuthRepository() },
      rateLimit: { enabled: false },
      webhookNow: () => NOW,
    });
    const server = createServer(app);

    try {
      const missingStateResponse = await fetch(
        server.url("/api/auth/tiktok/callback?code=auth-code"),
        { redirect: "manual" },
      );
      const invalidStateResponse = await fetch(
        server.url("/api/auth/tiktok/callback?code=auth-code&state=wrong"),
        { redirect: "manual" },
      );

      expect(missingStateResponse.status).toBe(302);
      expect(invalidStateResponse.status).toBe(302);
      expect(missingStateResponse.headers.get("location")).toBe(
        "/dashboard/integrations?error=tiktok_oauth_failed",
      );
      expect(invalidStateResponse.headers.get("location")).toBe(
        "/dashboard/integrations?error=tiktok_oauth_failed",
      );
    } finally {
      server.close();
    }
  });

  it("redirects to the TikTok error target when token exchange fails", async () => {
    const repository = new RecordingOAuthRepository();
    const stateStore = new RecordingOAuthStateStore();
    const { fetchImpl } = createSuccessfulProviderFetch();
    const { response, server } = await connect({
      fetchImpl,
      repository,
      stateStore,
    });
    const failingFetch: typeof fetch = async (input) => {
      if (input.toString() === TIKTOK_TOKEN_URL) {
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
          `/api/auth/tiktok/callback?code=auth-code&state=${state}`,
        ),
        { redirect: "manual" },
      );

      expect(callbackResponse.status).toBe(302);
      expect(callbackResponse.headers.get("location")).toBe(
        "/dashboard/integrations?error=tiktok_oauth_failed",
      );
      expect(repository.persisted).toHaveLength(0);
    } finally {
      callbackServer.close();
    }
  });

  it("redirects to the TikTok error target when TikTok returns no user", async () => {
    const repository = new RecordingOAuthRepository();
    const stateStore = new RecordingOAuthStateStore();
    const fetchImpl: typeof fetch = async (input) => {
      const url = input.toString();

      if (url === TIKTOK_TOKEN_URL) {
        return Response.json({
          access_token: "tiktok-access-token",
          token_type: "Bearer",
        });
      }

      if (url.startsWith(TIKTOK_USER_INFO_URL)) {
        return Response.json({ data: {} });
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
        server.url(`/api/auth/tiktok/callback?code=auth-code&state=${state}`),
        { redirect: "manual" },
      );

      expect(callbackResponse.status).toBe(302);
      expect(callbackResponse.headers.get("location")).toBe(
        "/dashboard/integrations?error=tiktok_oauth_failed",
      );
      expect(repository.persisted).toHaveLength(0);
    } finally {
      server.close();
    }
  });
});
