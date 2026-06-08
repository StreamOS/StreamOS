import { NextResponse, type NextRequest } from "next/server";
import {
  clearSupabaseAuthCookies,
  getSupabaseAuthCookieNames,
  updateSession,
} from "@/lib/supabase/middleware";

const AUTH_PATHS = new Set<string>([
  "/auth/login",
  "/auth/reset-password",
  "/auth/signup",
  "/auth/update-password",
  "/auth/verify-email",
]);

const SESSION_COMPLETION_PATHS = new Set<string>([
  "/auth/update-password",
  "/auth/verify-email",
]);

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isDashboardRoute =
    pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  const isAuthPage = AUTH_PATHS.has(pathname);
  const isSessionCompletionPage = SESSION_COMPLETION_PATHS.has(pathname);
  const authCookieNames = getSupabaseAuthCookieNames(request);
  const { response, sessionError, user } = await updateSession(request);

  if (isDashboardRoute && !user) {
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

  if (isAuthPage && user && !isSessionCompletionPage) {
    const redirectResponse = NextResponse.redirect(
      new URL("/dashboard", request.url),
    );
    redirectResponse.headers.set("Cache-Control", "private, no-store");

    return redirectResponse;
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/|api/auth/|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml|json|woff|woff2|ttf)$).*)",
  ],
};
