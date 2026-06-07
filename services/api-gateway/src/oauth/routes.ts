import type { Request, Response, Router } from "express";
import express from "express";
import type { OAuthErrorCode, OAuthProvider } from "@streamos/types";

import { assertEncryptionConfigured, encryptSecret } from "./encryption.js";
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
  hasMatchingState,
  MemoryOAuthStateStore,
  type OAuthStateStore,
} from "./stateStore.js";
import {
  createYouTubeAuthorizeUrl,
  exchangeYouTubeCode,
  fetchYouTubeChannelProfile,
  getYouTubeOAuthConfig,
  normalizeYouTubeScopes,
} from "./providers/youtube.js";

const SUPPORTED_OAUTH_PROVIDERS = ["youtube"] as const;
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export type CreateOAuthRouterOptions = {
  apiGatewaySecret: string | undefined;
  fetchImpl?: typeof fetch;
  now?: () => number;
  repository?: OAuthConnectionRepository;
  stateStore?: OAuthStateStore;
};

type SupportedOAuthProvider = (typeof SUPPORTED_OAUTH_PROVIDERS)[number];

function isSupportedOAuthProvider(
  provider: string,
): provider is SupportedOAuthProvider {
  return SUPPORTED_OAUTH_PROVIDERS.includes(provider as SupportedOAuthProvider);
}

function getOrigin(request: Request): string {
  return `${request.protocol}://${request.get("host")}`;
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

export function createOAuthRouter({
  apiGatewaySecret,
  fetchImpl = fetch,
  now = Date.now,
  repository,
  stateStore,
}: CreateOAuthRouterOptions): Router {
  const router = express.Router();
  const oauthStateStore = stateStore ?? new MemoryOAuthStateStore(now);

  router.get("/:provider/connect", async (request, response) => {
    const provider = request.params.provider;

    if (!isSupportedOAuthProvider(provider)) {
      sendOAuthError({
        code: "provider_not_supported",
        message: "OAuth provider is not supported by this gateway.",
        response,
        status: 404,
      });
      return;
    }

    let config: ReturnType<typeof getYouTubeOAuthConfig>;
    let handoff: ReturnType<typeof verifyOAuthHandoffToken>;

    try {
      assertEncryptionConfigured();
      handoff = verifyOAuthHandoffToken({
        now,
        secret: apiGatewaySecret,
        token: getQueryValue(request, "handoff"),
      });
      config = getYouTubeOAuthConfig({ origin: getOrigin(request) });
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
    const codeChallenge = createPkceChallenge(codeVerifier);

    await oauthStateStore.save({
      codeVerifier,
      creatorId: handoff.creator_id,
      expiresAt: now() + OAUTH_STATE_TTL_MS,
      provider,
      returnTo: handoff.return_to,
      state,
      userId: handoff.user_id,
    });

    const authorizeUrl = createYouTubeAuthorizeUrl({
      codeChallenge,
      config,
      state,
    });

    response.redirect(302, authorizeUrl.toString());
  });

  router.get("/:provider/callback", async (request, response) => {
    const provider = request.params.provider;

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
      sendOAuthError({
        code: "invalid_state",
        message: "OAuth state is missing, expired, or invalid.",
        response,
        status: 400,
      });
      return;
    }

    const providerError = getQueryValue(request, "error");
    const code = getQueryValue(request, "code");

    if (providerError || !code) {
      sendOAuthError({
        code: "oauth_exchange_failed",
        message: "OAuth provider did not return an authorization code.",
        response,
        status: 400,
      });
      return;
    }

    let tokenResult: PersistOAuthConnectionInput;

    try {
      const config = getYouTubeOAuthConfig({ origin: getOrigin(request) });
      const token = await exchangeYouTubeCode({
        code,
        codeVerifier: storedState.codeVerifier,
        config,
        fetchImpl,
      });
      const profile = await fetchYouTubeChannelProfile({
        accessToken: token.access_token,
        fetchImpl,
      });
      const expiresAt = token.expires_in
        ? new Date(now() + token.expires_in * 1000).toISOString()
        : null;

      tokenResult = {
        accessTokenCiphertext: encryptSecret(token.access_token),
        creatorId: storedState.creatorId,
        expiresAt,
        profile,
        provider,
        refreshTokenCiphertext: token.refresh_token
          ? encryptSecret(token.refresh_token)
          : null,
        scopes: normalizeYouTubeScopes({ config, token }),
        userId: storedState.userId,
      };
    } catch {
      sendOAuthError({
        code: "oauth_exchange_failed",
        message: "YouTube OAuth exchange or profile lookup failed.",
        response,
        status: 502,
      });
      return;
    }

    let result;

    try {
      result = await getRepository({ fetchImpl, repository }).persistConnection(
        tokenResult,
      );
    } catch {
      sendOAuthError({
        code: "token_persistence_failed",
        message: "OAuth tokens could not be persisted securely.",
        response,
        status: 500,
      });
      return;
    }

    response.status(200).json({
      data: {
        channel_id: result.channelId,
        connection_id: result.connectionId,
        expires_at: result.expiresAt,
        profile: result.profile,
        provider,
        scopes: result.scopes,
      },
      success: true,
    });
  });

  return router;
}

function getQueryValue(request: Request, key: string): string | undefined {
  const value = request.query[key];
  const firstValue = Array.isArray(value) ? value[0] : value;

  return typeof firstValue === "string" ? firstValue : undefined;
}
