import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  OAuthConnectionResult,
  OAuthProviderProfile,
} from "@streamos/types";

import { createApp } from "../app.js";
import { createOAuthHandoffToken } from "./handoff.js";
import type {
  OAuthConnectionRecord,
  OAuthConnectionRepository,
  PersistOAuthConnectionInput,
} from "./repository.js";
import type { OAuthStateStore, StoredOAuthState } from "./stateStore.js";
import { KICK_CHANNELS_URL, KICK_TOKEN_URL } from "./providers/kick.js";
import { TIKTOK_TOKEN_URL, TIKTOK_USER_INFO_URL } from "./providers/tiktok.js";
import { TWITCH_TOKEN_URL, TWITCH_USERS_URL } from "./providers/twitch.js";
import {
  YOUTUBE_CHANNELS_URL,
  YOUTUBE_TOKEN_URL,
} from "./providers/youtube.js";

const API_SECRET = "test-api-gateway-secret-123";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const CREATOR_ID = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-06-25T10:00:00.000Z").getTime();
const EXPIRED_STATE_NOW = NOW + 301_000;
const DEFAULT_SUCCESS_REDIRECT = "/dashboard/integrations";

const providers = ["twitch", "youtube", "tiktok", "kick"] as const;

type RegressionProvider = (typeof providers)[number];

class RecordingOAuthRepository implements OAuthConnectionRepository {
  readonly persisted: PersistOAuthConnectionInput[] = [];

  constructor(private readonly options: { failPersist?: boolean } = {}) {}

  async findLatestConnection(): Promise<OAuthConnectionRecord | null> {
    return null;
  }

  async patchConnection(): Promise<void> {
    return;
  }

  async persistConnection(
    input: PersistOAuthConnectionInput,
  ): Promise<OAuthConnectionResult> {
    this.persisted.push(input);

    if (this.options.failPersist) {
      throw new Error("simulated encrypted persistence failure");
    }

    return {
      channelId: `${input.provider}-channel-row-1`,
      connectionId: `${input.provider}-connection-row-1`,
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

function createHandoffToken(returnTo = "/dashboard/platforms") {
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

function createOAuthApp({
  fetchImpl,
  now = () => NOW,
  repository = new RecordingOAuthRepository(),
  stateStore,
}: {
  fetchImpl?: typeof fetch;
  now?: () => number;
  repository?: OAuthConnectionRepository;
  stateStore?: OAuthStateStore;
}) {
  return createApp({
    allowedOrigins: ["https://app.streamos.test"],
    apiGatewaySecret: API_SECRET,
    oauth: {
      fetchImpl,
      repository,
      stateStore,
    },
    rateLimit: { enabled: false },
    webhookNow: now,
  });
}

async function connect({
  fetchImpl,
  provider,
  repository,
  returnTo,
  stateStore,
}: {
  fetchImpl?: typeof fetch;
  provider: RegressionProvider;
  repository?: OAuthConnectionRepository;
  returnTo?: string;
  stateStore?: OAuthStateStore;
}) {
  const app = createOAuthApp({
    fetchImpl,
    repository,
    stateStore,
  });
  const server = createServer(app);
  const response = await fetch(
    server.url(
      `/api/auth/${provider}/connect?handoff=${encodeURIComponent(
        createHandoffToken(returnTo),
      )}`,
    ),
    { redirect: "manual" },
  );
  const authorizeUrl = new URL(response.headers.get("location") ?? "");
  const state = authorizeUrl.searchParams.get("state");

  if (!state) {
    server.close();
    throw new Error(`Expected OAuth state for ${provider}.`);
  }

  return { response, server, state };
}

function getErrorRedirect(provider: RegressionProvider): string {
  const error =
    provider === "youtube"
      ? "youtube_connect_failed"
      : `${provider}_oauth_failed`;

  return `${DEFAULT_SUCCESS_REDIRECT}?error=${error}`;
}

function createSuccessfulProviderFetch(
  provider: RegressionProvider,
): typeof fetch {
  return async (input, init) => {
    const url = input.toString();

    if (isTokenUrl(provider, url)) {
      return Response.json(getTokenResponse(provider));
    }

    if (isProfileUrl(provider, url)) {
      return Response.json(getProfileResponse(provider));
    }

    return new Response(`Unexpected ${provider} provider URL`, { status: 500 });
  };
}

function createProfileFailureFetch(provider: RegressionProvider): typeof fetch {
  return async (input) => {
    const url = input.toString();

    if (isTokenUrl(provider, url)) {
      return Response.json(getTokenResponse(provider));
    }

    if (isProfileUrl(provider, url)) {
      return new Response("provider profile failure", { status: 503 });
    }

    return new Response(`Unexpected ${provider} provider URL`, { status: 500 });
  };
}

function createFailingProviderFetch(): typeof fetch {
  return async (input) => {
    throw new Error(`Unexpected provider fetch: ${input.toString()}`);
  };
}

function isTokenUrl(provider: RegressionProvider, url: string): boolean {
  return (
    (provider === "twitch" && url === TWITCH_TOKEN_URL) ||
    (provider === "youtube" && url === YOUTUBE_TOKEN_URL) ||
    (provider === "tiktok" && url === TIKTOK_TOKEN_URL) ||
    (provider === "kick" && url === KICK_TOKEN_URL)
  );
}

function isProfileUrl(provider: RegressionProvider, url: string): boolean {
  return (
    (provider === "twitch" && url === TWITCH_USERS_URL) ||
    (provider === "youtube" && url.startsWith(YOUTUBE_CHANNELS_URL)) ||
    (provider === "tiktok" && url.startsWith(TIKTOK_USER_INFO_URL)) ||
    (provider === "kick" && url === KICK_CHANNELS_URL)
  );
}

function getTokenResponse(
  provider: RegressionProvider,
): Record<string, unknown> {
  if (provider === "twitch") {
    return {
      access_token: "twitch-access-token",
      expires_in: 3600,
      refresh_token: "twitch-refresh-token",
      scope: ["user:read:email", "moderator:read:followers"],
      token_type: "bearer",
    };
  }

  if (provider === "youtube") {
    return {
      access_token: "youtube-access-token",
      expires_in: 3600,
      refresh_token: "youtube-refresh-token",
      scope: "https://www.googleapis.com/auth/youtube.readonly",
      token_type: "Bearer",
    };
  }

  if (provider === "tiktok") {
    return {
      access_token: "tiktok-access-token",
      expires_in: 86_400,
      refresh_token: "tiktok-refresh-token",
      scope: "user.info.basic,user.info.profile,user.info.stats,video.publish",
      token_type: "Bearer",
    };
  }

  return {
    access_token: "kick-access-token",
    expires_in: 3600,
    refresh_token: "kick-refresh-token",
    scope:
      "user:read channel:read events:subscribe channel:follow channel:subscription",
    token_type: "Bearer",
  };
}

function getProfileResponse(
  provider: RegressionProvider,
): Record<string, unknown> {
  if (provider === "twitch") {
    return {
      data: [
        {
          display_name: "StreamOS Twitch",
          id: "twitch-account-id",
          login: "streamos",
          profile_image_url: "https://static-cdn.jtvnw.net/avatar.jpg",
        },
      ],
    };
  }

  if (provider === "youtube") {
    return {
      items: [
        {
          id: "UCstreamos",
          snippet: {
            customUrl: "@streamos",
            thumbnails: {
              high: { url: "https://yt.example/avatar.jpg" },
            },
            title: "StreamOS Channel",
          },
          statistics: { subscriberCount: "12345" },
        },
      ],
    };
  }

  if (provider === "tiktok") {
    return {
      data: {
        user: {
          avatar_url: "https://tiktok.example/avatar.jpg",
          display_name: "StreamOS TikTok",
          follower_count: 54321,
          open_id: "tiktok-open-id",
          username: "streamos",
        },
      },
    };
  }

  return {
    data: [
      {
        broadcaster_user_id: 98765,
        followers_count: 4321,
        name: "StreamOS Kick",
        profile_picture: "https://kick.example/avatar.jpg",
        slug: "streamos",
      },
    ],
  };
}

function getExpectedProfile(
  provider: RegressionProvider,
): Partial<OAuthProviderProfile> {
  if (provider === "twitch") {
    return {
      provider,
      providerAccountId: "twitch-account-id",
    };
  }

  if (provider === "youtube") {
    return {
      provider,
      providerAccountId: "UCstreamos",
    };
  }

  if (provider === "tiktok") {
    return {
      provider,
      providerAccountId: "tiktok-open-id",
    };
  }

  return {
    provider,
    providerAccountId: "98765",
  };
}

function assertSecretSafeRedirect(
  response: Response,
  provider: RegressionProvider,
) {
  const location = response.headers.get("location") ?? "";

  expect(location).toBe(getErrorRedirect(provider));
  expect(location).not.toContain("auth-code");
  expect(location).not.toContain("access-token");
  expect(location).not.toContain("refresh-token");
  expect(location).not.toContain(API_SECRET);
}

describe("OAuth gateway negative regression pack", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.REDIS_URL;
    process.env.APP_ENCRYPTION_KEY = `base64:${randomBytes(32).toString("base64")}`;
    process.env.TWITCH_CLIENT_ID = "twitch-client-id";
    process.env.TWITCH_CLIENT_SECRET = "twitch-client-secret";
    process.env.TWITCH_REDIRECT_URI =
      "http://127.0.0.1:4000/api/auth/twitch/callback";
    process.env.TWITCH_SCOPES = "user:read:email moderator:read:followers";
    process.env.YOUTUBE_CLIENT_ID = "youtube-client-id";
    process.env.YOUTUBE_CLIENT_SECRET = "youtube-client-secret";
    process.env.YOUTUBE_REDIRECT_URI =
      "http://127.0.0.1:4000/api/auth/youtube/callback";
    process.env.YOUTUBE_SCOPES =
      "https://www.googleapis.com/auth/youtube.readonly";
    process.env.TIKTOK_CLIENT_KEY = "tiktok-client-key";
    process.env.TIKTOK_CLIENT_SECRET = "tiktok-client-secret";
    process.env.TIKTOK_REDIRECT_URI =
      "http://127.0.0.1:4000/api/auth/tiktok/callback";
    process.env.TIKTOK_SCOPES =
      "user.info.basic user.info.profile user.info.stats";
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

  it.each(providers)(
    "redirects %s callbacks with expired one-time state without provider calls",
    async (provider) => {
      const repository = new RecordingOAuthRepository();
      let now = NOW;
      const app = createOAuthApp({
        fetchImpl: createFailingProviderFetch(),
        now: () => now,
        repository,
      });
      const server = createServer(app);

      try {
        const connectResponse = await fetch(
          server.url(
            `/api/auth/${provider}/connect?handoff=${encodeURIComponent(
              createHandoffToken(),
            )}`,
          ),
          { redirect: "manual" },
        );
        const state = new URL(
          connectResponse.headers.get("location") ?? "",
        ).searchParams.get("state");

        now = EXPIRED_STATE_NOW;
        const callbackResponse = await fetch(
          server.url(
            `/api/auth/${provider}/callback?code=auth-code&state=${state}`,
          ),
          { redirect: "manual" },
        );

        expect(callbackResponse.status).toBe(302);
        assertSecretSafeRedirect(callbackResponse, provider);
        expect(repository.persisted).toHaveLength(0);
      } finally {
        server.close();
      }
    },
  );

  it.each(providers)(
    "redirects %s callbacks with missing code before token exchange",
    async (provider) => {
      const repository = new RecordingOAuthRepository();
      const { server, state } = await connect({
        fetchImpl: createFailingProviderFetch(),
        provider,
        repository,
      });

      try {
        const callbackResponse = await fetch(
          server.url(`/api/auth/${provider}/callback?state=${state}`),
          { redirect: "manual" },
        );

        expect(callbackResponse.status).toBe(302);
        assertSecretSafeRedirect(callbackResponse, provider);
        expect(repository.persisted).toHaveLength(0);
      } finally {
        server.close();
      }
    },
  );

  it.each(providers)(
    "redirects %s callbacks when provider profile fetch fails",
    async (provider) => {
      const repository = new RecordingOAuthRepository();
      const { server, state } = await connect({
        fetchImpl: createProfileFailureFetch(provider),
        provider,
        repository,
      });

      try {
        const callbackResponse = await fetch(
          server.url(
            `/api/auth/${provider}/callback?code=auth-code&state=${state}`,
          ),
          { redirect: "manual" },
        );

        expect(callbackResponse.status).toBe(302);
        assertSecretSafeRedirect(callbackResponse, provider);
        expect(repository.persisted).toHaveLength(0);
      } finally {
        server.close();
      }
    },
  );

  it.each(providers)(
    "redirects %s callbacks when encrypted persistence fails",
    async (provider) => {
      const repository = new RecordingOAuthRepository({ failPersist: true });
      const { server, state } = await connect({
        fetchImpl: createSuccessfulProviderFetch(provider),
        provider,
        repository,
      });

      try {
        const callbackResponse = await fetch(
          server.url(
            `/api/auth/${provider}/callback?code=auth-code&state=${state}`,
          ),
          { redirect: "manual" },
        );

        expect(callbackResponse.status).toBe(302);
        assertSecretSafeRedirect(callbackResponse, provider);
        expect(repository.persisted).toHaveLength(1);
        expect(repository.persisted[0]?.accessTokenCiphertext).not.toBe(
          `${provider}-access-token`,
        );
        expect(repository.persisted[0]?.refreshTokenCiphertext).not.toBe(
          `${provider}-refresh-token`,
        );
        expect(repository.persisted[0]?.profile).toMatchObject(
          getExpectedProfile(provider),
        );
      } finally {
        server.close();
      }
    },
  );

  it.each(providers)(
    "falls back for unsafe %s return_to targets after successful callback",
    async (provider) => {
      const repository = new RecordingOAuthRepository();
      const { server, state } = await connect({
        fetchImpl: createSuccessfulProviderFetch(provider),
        provider,
        repository,
        returnTo: "https://evil.example/phishing?code=auth-code",
      });

      try {
        const callbackResponse = await fetch(
          server.url(
            `/api/auth/${provider}/callback?code=auth-code&state=${state}`,
          ),
          { redirect: "manual" },
        );

        expect(callbackResponse.status).toBe(302);
        expect(callbackResponse.headers.get("location")).toBe(
          DEFAULT_SUCCESS_REDIRECT,
        );
        expect(callbackResponse.headers.get("location")).not.toContain(
          "evil.example",
        );
        expect(repository.persisted).toHaveLength(1);
      } finally {
        server.close();
      }
    },
  );

  it("rejects cross-provider state confusion without token exchange or persistence", async () => {
    const repository = new RecordingOAuthRepository();
    const { server, state } = await connect({
      fetchImpl: createFailingProviderFetch(),
      provider: "youtube",
      repository,
    });

    try {
      const callbackResponse = await fetch(
        server.url(`/api/auth/twitch/callback?code=auth-code&state=${state}`),
        { redirect: "manual" },
      );

      expect(callbackResponse.status).toBe(302);
      assertSecretSafeRedirect(callbackResponse, "twitch");
      expect(repository.persisted).toHaveLength(0);
    } finally {
      server.close();
    }
  });
});
