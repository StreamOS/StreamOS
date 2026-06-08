const DEFAULT_OAUTH_SUCCESS_REDIRECT = "/dashboard/integrations";
const YOUTUBE_CONNECT_ERROR = "youtube_connect_failed";

type OAuthRedirectProvider = "youtube" | "tiktok" | "kick";

type ResolveRedirectTargetInput = {
  allowedOrigins: readonly string[];
  fallbackPath?: string;
  returnTo: string | undefined;
};

type ResolveErrorRedirectInput = {
  allowedOrigins: readonly string[];
  fallbackPath?: string;
  provider: OAuthRedirectProvider;
};

type ResolveYouTubeErrorRedirectInput = Omit<
  ResolveErrorRedirectInput,
  "provider"
>;

export function resolveOAuthRedirectTarget({
  allowedOrigins,
  fallbackPath,
  returnTo,
}: ResolveRedirectTargetInput): string {
  const fallback = resolveFallbackRedirect({ allowedOrigins, fallbackPath });
  const target = returnTo?.trim();

  if (!target) {
    return fallback;
  }

  return resolveSafeRedirect({
    allowedOrigins,
    fallback,
    target,
  });
}

export function resolveOAuthErrorRedirect({
  allowedOrigins,
  fallbackPath,
  provider,
}: ResolveErrorRedirectInput): string {
  const fallback = resolveFallbackRedirect({ allowedOrigins, fallbackPath });
  const url = new URL(fallback, "http://streamos.local");

  url.searchParams.set("error", getOAuthErrorCode(provider));

  if (isRelativePath(fallback)) {
    return `${url.pathname}${url.search}${url.hash}`;
  }

  return url.toString();
}

export function resolveYouTubeOAuthErrorRedirect(
  input: ResolveYouTubeErrorRedirectInput,
): string {
  return resolveOAuthErrorRedirect({
    ...input,
    provider: "youtube",
  });
}

function resolveFallbackRedirect({
  allowedOrigins,
  fallbackPath,
}: {
  allowedOrigins: readonly string[];
  fallbackPath: string | undefined;
}): string {
  const configuredFallback = fallbackPath?.trim();

  if (!configuredFallback) {
    return DEFAULT_OAUTH_SUCCESS_REDIRECT;
  }

  return resolveSafeRedirect({
    allowedOrigins,
    fallback: DEFAULT_OAUTH_SUCCESS_REDIRECT,
    target: configuredFallback,
  });
}

function resolveSafeRedirect({
  allowedOrigins,
  fallback,
  target,
}: {
  allowedOrigins: readonly string[];
  fallback: string;
  target: string;
}): string {
  if (isRelativePath(target)) {
    return target;
  }

  const allowedOriginSet = new Set(
    allowedOrigins
      .map((origin) => normalizeOrigin(origin))
      .filter((origin): origin is string => Boolean(origin)),
  );

  try {
    const url = new URL(target);

    if (
      (url.protocol === "https:" || url.protocol === "http:") &&
      allowedOriginSet.has(url.origin)
    ) {
      return url.toString();
    }
  } catch {
    return fallback;
  }

  return fallback;
}

function isRelativePath(value: string): boolean {
  return (
    value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")
  );
}

function getOAuthErrorCode(provider: OAuthRedirectProvider): string {
  if (provider === "youtube") {
    return YOUTUBE_CONNECT_ERROR;
  }

  return `${provider}_oauth_failed`;
}

function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value);

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}
