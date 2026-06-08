import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { Database } from "@streamos/database";
import { getSupabaseConfig } from "@/lib/supabase/config";

type CookieSetOptions = Parameters<NextResponse["cookies"]["set"]>[2];

type CookieToSet = {
  name: string;
  options?: CookieSetOptions;
  value: string;
};

export type SessionUpdateResult = {
  response: NextResponse;
  sessionError: boolean;
  user: User | null;
};

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}

function getSessionCookieOptions(options?: CookieSetOptions): CookieSetOptions {
  return {
    ...options,
    path: options?.path ?? "/",
    sameSite: options?.sameSite ?? "lax",
    secure: isProductionRuntime() ? true : options?.secure,
  };
}

function getExpiredCookieOptions(options?: CookieSetOptions): CookieSetOptions {
  return {
    ...getSessionCookieOptions(options),
    expires: new Date(0),
    maxAge: 0,
  };
}

export function isSupabaseAuthCookieName(name: string): boolean {
  return name.startsWith("sb-") && name.includes("auth-token");
}

export function getSupabaseAuthCookieNames(request: NextRequest): string[] {
  return request.cookies
    .getAll()
    .filter((cookie) => isSupabaseAuthCookieName(cookie.name))
    .map((cookie) => cookie.name);
}

export function clearSupabaseAuthCookies(
  request: NextRequest,
  response: NextResponse,
  cookieNames = getSupabaseAuthCookieNames(request),
): void {
  cookieNames.forEach((cookieName) => {
    request.cookies.delete(cookieName);
    response.cookies.set(cookieName, "", getExpiredCookieOptions());
  });
}

export async function updateSession(
  request: NextRequest,
): Promise<SessionUpdateResult> {
  const supabaseConfig = getSupabaseConfig();
  const requestHeaders = new Headers(request.headers);

  requestHeaders.set("x-streamos-pathname", request.nextUrl.pathname);

  const createResponse = () =>
    NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });

  let response = createResponse();

  if (!supabaseConfig) {
    return {
      response,
      sessionError: false,
      user: null,
    };
  }

  const supabase = createServerClient<Database, "public", Database["public"]>(
    supabaseConfig.url,
    supabaseConfig.anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          response = createResponse();

          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, getSessionCookieOptions(options));
          });
        },
      },
    },
  );

  const { data, error } = await supabase.auth.getUser();

  response.headers.set("Cache-Control", "private, no-store");

  if (error) {
    clearSupabaseAuthCookies(request, response);
  }

  return {
    response,
    sessionError: Boolean(error),
    user: error ? null : data.user,
  };
}
