import { headers } from "next/headers";

const DEFAULT_LOCAL_APP_ORIGIN = "http://localhost:3000";
const PRODUCTION_APP_ORIGIN_ERROR =
  "APP_URL or NEXT_PUBLIC_APP_URL must be configured as an absolute URL in production.";

export function getSafeNextPath(value: string | null, fallback = "/dashboard") {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  return value;
}

function normalizeOrigin(value: string | null | undefined): string | null {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

export function getConfiguredAppOrigin() {
  return (
    normalizeOrigin(process.env.APP_URL) ??
    normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL)
  );
}

export function resolveAppOrigin({
  fallbackOrigin,
}: {
  fallbackOrigin?: string | null;
} = {}) {
  const configuredOrigin = getConfiguredAppOrigin();

  if (configuredOrigin) {
    return configuredOrigin;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(PRODUCTION_APP_ORIGIN_ERROR);
  }

  return normalizeOrigin(fallbackOrigin) ?? DEFAULT_LOCAL_APP_ORIGIN;
}

export async function getRequestOrigin() {
  const headerStore = await headers();

  return resolveAppOrigin({
    fallbackOrigin: headerStore.get("origin"),
  });
}
