import { NextResponse, type NextRequest } from "next/server";
import {
  clearSupabaseAuthCookies,
  getSupabaseAuthCookieNames,
  updateSession,
} from "@/lib/supabase/middleware";

const DASHBOARD_PATH = "/dashboard";

const AUTH_REDIRECT_PATHS = new Set<string>([
  "/auth/login",
  "/auth/reset-password",
  "/auth/signup",
]);

type RoutePolicy = "auth-redirect" | "protected-dashboard" | "public";

export async function proxy(request: NextRequest) {
  const authCookieNames = getSupabaseAuthCookieNames(request);
  const { response, sessionError, user } = await updateSession(request);
  const routePolicy = getRoutePolicy(request.nextUrl.pathname);

  if (!user) {
    return (
      createUnauthenticatedResponse({
        authCookieNames,
        request,
        routePolicy,
        sessionError,
      }) ?? response
    );
  }

  if (routePolicy === "auth-redirect") {
    const redirectResponse = NextResponse.redirect(
      new URL("/dashboard", request.url),
    );
    redirectResponse.headers.set("Cache-Control", "private, no-store");

    return redirectResponse;
  }

  return response;
}

function getRoutePolicy(pathname: string): RoutePolicy {
  if (isProtectedDashboardPath(pathname)) {
    return "protected-dashboard";
  }

  if (AUTH_REDIRECT_PATHS.has(pathname)) {
    return "auth-redirect";
  }

  return "public";
}

function isProtectedDashboardPath(pathname: string): boolean {
  return (
    pathname === DASHBOARD_PATH || pathname.startsWith(`${DASHBOARD_PATH}/`)
  );
}

function createUnauthenticatedResponse({
  authCookieNames,
  request,
  routePolicy,
  sessionError,
}: {
  authCookieNames: string[];
  request: NextRequest;
  routePolicy: RoutePolicy;
  sessionError: boolean;
}): NextResponse | null {
  if (routePolicy !== "protected-dashboard") {
    return null;
  }

  const loginUrl = new URL("/auth/login", request.url);
  const nextPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;

  loginUrl.searchParams.set(
    "error",
    sessionError ? "session_expired" : "unauthorized",
  );
  loginUrl.searchParams.set("next", nextPath);

  const redirectResponse = NextResponse.redirect(loginUrl);
  redirectResponse.headers.set("Cache-Control", "private, no-store");
  clearSupabaseAuthCookies(request, redirectResponse, authCookieNames);

  return redirectResponse;
}

export const config = {
  matcher: [
    "/((?!_next/|api/auth/|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml|json|woff|woff2|ttf)$).*)",
  ],
};
