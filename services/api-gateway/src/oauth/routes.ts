import type { Request, Response, Router } from "express";
import express from "express";
import { rateLimit } from "express-rate-limit";
import type {
  OAuthErrorCode,
  OAuthProvider,
  OAuthProviderProfile,
} from "@streamos/types";
import { subscribe } from "@streamos/youtube-websub";

import { assertEncryptionConfigured, encryptSecret } from "./encryption.js";
import { createRateLimitKey } from "../lib/rate-limit-keys.js";
import { verifyOAuthHandoffToken } from "./handoff.js";
import {
  createOAuthState,
  createPkceChallenge,
  createPkceVerifier,
} from "./pkce.js";
import {
  createSupabaseOAuthConnectionRepository,
  type OAuthConnectionRepository,
  type PersistOAuthConnectionInput,
} from "./repository.js";
import {
  resolveOAuthErrorRedirect,
  resolveOAuthRedirectTarget,
} from "./redirects.js";
import {
  createDefaultOAuthStateStore,
  hasMatchingState,
  type OAuthStateStore,
} from "./stateStore.js";
import {
  createKickAuthorizeUrl,
  exchangeKickCode,
  fetchKickChannelProfile,
  getKickOAuthConfig,
  normalizeKickScopes,
} from "./providers/kick.js";
import {
  createTikTokAuthorizeUrl,
  createTikTokPkceChallenge,
  exchangeTikTokCode,
  fetchTikTokUserProfile,
  getTikTokOAuthConfig,
  normalizeTikTokScopes,
} from "./providers/tiktok.js";
import {
  createTwitchAuthorizeUrl,
  exchangeTwitchCode,
  fetchTwitchUserProfile,
  getTwitchOAuthConfig,
  normalizeTwitchScopes,
} from "./providers/twitch.js";
import {
  createYouTubeAuthorizeUrl,
  exchangeYouTubeCode,
  fetchYouTubeChannelProfile,
  getYouTubeOAuthConfig,
  normalizeYouTubeScopes,
} from "./providers/youtube.js";

export const SUPPORTED_OAUTH_PROVIDERS = [
  "twitch",
  "youtube",
  "tiktok",
  "kick",
] as const;
const OAUTH_STATE_TTL_MS = 5 * 60 * 1000;
const OAUTH_CONNECT_RATE_LIMIT_WINDOW_MS = 60_000;
const OAUTH_CONNECT_RATE_LIMIT_MAX_REQUESTS = 30;
const OAUTH_CALLBACK_RATE_LIMIT_WINDOW_MS = 60_000;
const OAUTH_CALLBACK_RATE_LIMIT_MAX_REQUESTS = 60;

export type CreateOAuthRouterOptions = {
  allowedOrigins?: string[];
  apiGatewaySecret: string | undefined;
  fetchImpl?: typeof fetch;
  now?: () => number;
  repository?: OAuthConnectionRepository;
  routeRateLimit?: {
    callbackMaxRequests?: number;
    connectMaxRequests?: number;
    enabled?: boolean;
    windowMs?: number;
  };
  stateStore?: OAuthStateStore;
  connectSuccessRedirect?: string;
  youtubeConnectSuccessRedirect?: string;
};

type SupportedOAuthProvider = (typeof SUPPORTED_OAUTH_PROVIDERS)[number];

type NormalizedOAuthToken = {
  accessToken: string;
  expiresIn?: number;
  profile: OAuthProviderProfile;
  refreshToken?: string;
  scopes: string[];
};

type OAuthProviderRuntime = {
  createAuthorizeUrl(input: { codeChallenge: string; state: string }): URL;
  createCodeChallenge?(codeVerifier: string): string;
  exchangeCode(input: {
    code: string;
    codeVerifier: string;
    fetchImpl: typeof fetch;
  }): Promise<NormalizedOAuthToken>;
};

function isSupportedOAuthProvider(
  provider: string,
): provider is SupportedOAuthProvider {
  return SUPPORTED_OAUTH_PROVIDERS.includes(provider as SupportedOAuthProvider);
}

function getOrigin(request: Request): string {
  return `${request.protocol}://${request.get("host")}`;
}

function getRouteParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "unknown") : (value ?? "unknown");
}

function sendOAuthError({
  code,
  message,
  response,
  status,
}: {
  code: OAuthErrorCode;
  message: string;
  response: Response;
  status: number;
}) {
  response.status(status).json({
    error: {
      code,
      message,
    },
    success: false,
  });
}

function getRepository({
  fetchImpl,
  repository,
}: {
  fetchImpl: typeof fetch;
  repository: OAuthConnectionRepository | undefined;
}): OAuthConnectionRepository {
  return repository ?? createSupabaseOAuthConnectionRepository({ fetchImpl });
}

function getProviderRuntime({
  origin,
  provider,
}: {
  origin: string;
  provider: SupportedOAuthProvider;
}): OAuthProviderRuntime {
  if (provider === "twitch") {
    const config = getTwitchOAuthConfig({ origin });

    return {
      createAuthorizeUrl({ codeChallenge, state }) {
        return createTwitchAuthorizeUrl({ codeChallenge, config, state });
      },
      async exchangeCode({ code, codeVerifier, fetchImpl }) {
        const token = await exchangeTwitchCode({
          code,
          codeVerifier,
          config,
          fetchImpl,
        });
        const profile = await fetchTwitchUserProfile({
          accessToken: token.access_token,
          config,
          fetchImpl,
        });

        return {
          accessToken: token.access_token,
          expiresIn: token.expires_in,
          profile,
          refreshToken: token.refresh_token,
          scopes: normalizeTwitchScopes({ config, token }),
        };
      },
    };
  }

  if (provider === "youtube") {
    const config = getYouTubeOAuthConfig({ origin });

    return {
      createAuthorizeUrl({ codeChallenge, state }) {
        return createYouTubeAuthorizeUrl({ codeChallenge, config, state });
      },
      async exchangeCode({ code, codeVerifier, fetchImpl }) {
        const token = await exchangeYouTubeCode({
          code,
          codeVerifier,
          config,
          fetchImpl,
        });
        const profile = await fetchYouTubeChannelProfile({
          accessToken: token.access_token,
          fetchImpl,
        });

        return {
          accessToken: token.access_token,
          expiresIn: token.expires_in,
          profile,
          refreshToken: token.refresh_token,
          scopes: normalizeYouTubeScopes({ config, token }),
        };
      },
    };
  }

  if (provider === "tiktok") {
    const config = getTikTokOAuthConfig({ origin });

    return {
      createAuthorizeUrl({ codeChallenge, state }) {
        return createTikTokAuthorizeUrl({ codeChallenge, config, state });
      },
      createCodeChallenge: createTikTokPkceChallenge,
      async exchangeCode({ code, codeVerifier, fetchImpl }) {
        const token = await exchangeTikTokCode({
          code,
          codeVerifier,
          config,
          fetchImpl,
        });
        const profile = await fetchTikTokUserProfile({
          accessToken: token.access_token,
          config,
          fetchImpl,
        });

        return {
          accessToken: token.access_token,
          expiresIn: token.expires_in,
          profile,
          refreshToken: token.refresh_token,
          scopes: normalizeTikTokScopes({ config, token }),
        };
      },
    };
  }

  const config = getKickOAuthConfig({ origin });

  return {
    createAuthorizeUrl({ codeChallenge, state }) {
      return createKickAuthorizeUrl({ codeChallenge, config, state });
    },
    async exchangeCode({ code, codeVerifier, fetchImpl }) {
      const token = await exchangeKickCode({
        code,
        codeVerifier,
        config,
        fetchImpl,
      });
      const profile = await fetchKickChannelProfile({
        accessToken: token.access_token,
        fetchImpl,
      });

      return {
        accessToken: token.access_token,
        expiresIn: token.expires_in,
        profile,
        refreshToken: token.refresh_token,
        scopes: normalizeKickScopes({ config, token }),
      };
    },
  };
}

export function createOAuthRouter({
  allowedOrigins = [],
  apiGatewaySecret,
  fetchImpl = fetch,
  now = Date.now,
  repository,
  routeRateLimit,
  stateStore,
  connectSuccessRedirect = process.env.CONNECT_SUCCESS_REDIRECT,
  youtubeConnectSuccessRedirect = process.env.YOUTUBE_CONNECT_SUCCESS_REDIRECT,
}: CreateOAuthRouterOptions): Router {
  const router = express.Router();
  const oauthStateStore = stateStore ?? createDefaultOAuthStateStore(now);
  const oauthConnectRateLimiter = rateLimit({
    keyGenerator: (request) =>
      createRateLimitKey(
        request,
        "oauth",
        "connect",
        getRouteParam(request.params.provider),
      ),
    legacyHeaders: false,
    limit:
      routeRateLimit?.connectMaxRequests ??
      OAUTH_CONNECT_RATE_LIMIT_MAX_REQUESTS,
    message: {
      error: "rate_limit_exceeded",
      message: "Too many OAuth connect requests.",
    },
    skip: () => routeRateLimit?.enabled === false,
    standardHeaders: "draft-7",
    windowMs: routeRateLimit?.windowMs ?? OAUTH_CONNECT_RATE_LIMIT_WINDOW_MS,
  });
  const oauthCallbackRateLimiter = rateLimit({
    keyGenerator: (request) =>
      createRateLimitKey(
        request,
        "oauth",
        "callback",
        getRouteParam(request.params.provider),
      ),
    legacyHeaders: false,
    limit:
      routeRateLimit?.callbackMaxRequests ??
      OAUTH_CALLBACK_RATE_LIMIT_MAX_REQUESTS,
    message: {
      error: "rate_limit_exceeded",
      message: "Too many OAuth callback requests.",
    },
    skip: () => routeRateLimit?.enabled === false,
    standardHeaders: "draft-7",
    windowMs: routeRateLimit?.windowMs ?? OAUTH_CALLBACK_RATE_LIMIT_WINDOW_MS,
  });

  router.get(
    "/:provider/connect",
    oauthConnectRateLimiter,
    async (request, response) => {
      const provider = getRouteParam(request.params.provider);

      if (!isSupportedOAuthProvider(provider)) {
        sendOAuthError({
          code: "provider_not_supported",
          message: "OAuth provider is not supported by this gateway.",
          response,
          status: 404,
        });
        return;
      }

      let handoff: ReturnType<typeof verifyOAuthHandoffToken>;
      let providerRuntime: OAuthProviderRuntime;

      try {
        assertEncryptionConfigured();
        handoff = verifyOAuthHandoffToken({
          now,
          secret: apiGatewaySecret,
          token: getQueryValue(request, "handoff"),
        });
        providerRuntime = getProviderRuntime({
          origin: getOrigin(request),
          provider,
        });
      } catch (error) {
        const code =
          error instanceof Error && error.message.includes("handoff")
            ? "user_handoff_invalid"
            : "oauth_setup_missing";
        sendOAuthError({
          code,
          message:
            code === "user_handoff_invalid"
              ? "OAuth user handoff is missing, expired, or invalid."
              : "OAuth provider or encryption configuration is incomplete.",
          response,
          status: code === "user_handoff_invalid" ? 401 : 500,
        });
        return;
      }

      const state = createOAuthState();
      const codeVerifier = createPkceVerifier();
      const codeChallenge =
        providerRuntime.createCodeChallenge?.(codeVerifier) ??
        createPkceChallenge(codeVerifier);

      await oauthStateStore.save({
        codeVerifier,
        creatorId: handoff.creator_id,
        expiresAt: now() + OAUTH_STATE_TTL_MS,
        provider,
        returnTo: handoff.return_to,
        state,
        userId: handoff.user_id,
      });

      const authorizeUrl = providerRuntime.createAuthorizeUrl({
        codeChallenge,
        state,
      });

      response.redirect(302, authorizeUrl.toString());
    },
  );

  router.get(
    "/:provider/callback",
    oauthCallbackRateLimiter,
    async (request, response) => {
      const provider = getRouteParam(request.params.provider);

      if (!isSupportedOAuthProvider(provider)) {
        sendOAuthError({
          code: "provider_not_supported",
          message: "OAuth provider is not supported by this gateway.",
          response,
          status: 404,
        });
        return;
      }

      const returnedState = getQueryValue(request, "state");
      const storedState = returnedState
        ? await oauthStateStore.consume(returnedState)
        : null;

      if (
        !returnedState ||
        !storedState ||
        storedState.provider !== (provider as OAuthProvider) ||
        !hasMatchingState(returnedState, storedState.state)
      ) {
        redirectToOAuthError({
          allowedOrigins,
          connectSuccessRedirect,
          provider,
          response,
          youtubeConnectSuccessRedirect,
        });
        return;
      }

      const providerError = getQueryValue(request, "error");
      const code = getQueryValue(request, "code");

      if (providerError || !code) {
        redirectToOAuthError({
          allowedOrigins,
          connectSuccessRedirect,
          provider,
          response,
          youtubeConnectSuccessRedirect,
        });
        return;
      }

      let tokenResult: PersistOAuthConnectionInput;

      try {
        const providerRuntime = getProviderRuntime({
          origin: getOrigin(request),
          provider,
        });
        const token = await providerRuntime.exchangeCode({
          code,
          codeVerifier: storedState.codeVerifier,
          fetchImpl,
        });
        const expiresAt = token.expiresIn
          ? new Date(now() + token.expiresIn * 1000).toISOString()
          : null;

        tokenResult = {
          accessTokenCiphertext: encryptSecret(token.accessToken),
          creatorId: storedState.creatorId,
          expiresAt,
          profile: token.profile,
          provider,
          refreshTokenCiphertext: token.refreshToken
            ? encryptSecret(token.refreshToken)
            : null,
          scopes: token.scopes,
          userId: storedState.userId,
        };
      } catch {
        redirectToOAuthError({
          allowedOrigins,
          connectSuccessRedirect,
          provider,
          response,
          youtubeConnectSuccessRedirect,
        });
        return;
      }

      let result;

      try {
        result = await getRepository({
          fetchImpl,
          repository,
        }).persistConnection(tokenResult);
      } catch {
        redirectToOAuthError({
          allowedOrigins,
          connectSuccessRedirect,
          provider,
          response,
          youtubeConnectSuccessRedirect,
        });
        return;
      }

      if (provider === "youtube") {
        await registerInitialYouTubeWebSub({
          channelId: tokenResult.profile.providerAccountId,
          connectionId: result.connectionId,
          fetchImpl,
          repository: getRepository({ fetchImpl, repository }),
          userId: storedState.userId,
        });
      }

      response.redirect(
        302,
        resolveOAuthRedirectTarget({
          allowedOrigins,
          fallbackPath: getConnectSuccessRedirect({
            connectSuccessRedirect,
            provider,
            youtubeConnectSuccessRedirect,
          }),
          returnTo: storedState.returnTo,
        }),
      );
    },
  );

  return router;
}

function getConnectSuccessRedirect({
  connectSuccessRedirect,
  provider,
  youtubeConnectSuccessRedirect,
}: {
  connectSuccessRedirect: string | undefined;
  provider: SupportedOAuthProvider;
  youtubeConnectSuccessRedirect: string | undefined;
}): string | undefined {
  if (provider === "youtube") {
    return youtubeConnectSuccessRedirect ?? connectSuccessRedirect;
  }

  return connectSuccessRedirect ?? youtubeConnectSuccessRedirect;
}

function redirectToOAuthError({
  allowedOrigins,
  connectSuccessRedirect,
  provider,
  response,
  youtubeConnectSuccessRedirect,
}: {
  allowedOrigins: readonly string[];
  connectSuccessRedirect: string | undefined;
  provider: SupportedOAuthProvider;
  response: Response;
  youtubeConnectSuccessRedirect: string | undefined;
}) {
  response.redirect(
    302,
    resolveOAuthErrorRedirect({
      allowedOrigins,
      fallbackPath: getConnectSuccessRedirect({
        connectSuccessRedirect,
        provider,
        youtubeConnectSuccessRedirect,
      }),
      provider,
    }),
  );
}

async function registerInitialYouTubeWebSub({
  channelId,
  connectionId,
  fetchImpl,
  repository,
  userId,
}: {
  channelId: string;
  connectionId: string;
  fetchImpl: typeof fetch;
  repository: OAuthConnectionRepository;
  userId: string;
}): Promise<void> {
  if (!repository.recordYouTubeWebSubSubscription) {
    return;
  }

  try {
    const subscription = await subscribe(channelId, { fetchImpl });
    await repository.recordYouTubeWebSubSubscription({
      connectionId,
      subscription,
      userId,
      youtubeChannelId: channelId,
    });
  } catch (error) {
    console.error("YouTube WebSub registration failed after OAuth connect.", {
      channelId,
      error,
      userId,
    });
  }
}

function getQueryValue(request: Request, key: string): string | undefined {
  const value = request.query[key];
  const firstValue = Array.isArray(value) ? value[0] : value;

  return typeof firstValue === "string" ? firstValue : undefined;
}
