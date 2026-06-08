import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertEncryptionConfigured } from "@/lib/security/encryption";
import {
  createTwitchAuthorizeUrl,
  getTwitchOAuthConfig,
  TWITCH_OAUTH_STATE_COOKIE,
} from "@/lib/integrations/twitch";

export const runtime = "nodejs";

const TWITCH_OAUTH_NEXT_COOKIE = "streamos_twitch_oauth_next";

export async function GET(request: NextRequest) {
  const dashboardUrl = new URL("/dashboard", request.url);
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("error", "unauthorized");
    loginUrl.searchParams.set(
      "next",
      getSafeNextPath(request.nextUrl.searchParams.get("next")),
    );

    return NextResponse.redirect(loginUrl);
  }

  let authorizeUrl: URL;

  try {
    assertEncryptionConfigured();
    const config = getTwitchOAuthConfig(request.nextUrl.origin);
    const state = randomBytes(24).toString("base64url");
    const nextPath = getSafeNextPath(request.nextUrl.searchParams.get("next"));
    authorizeUrl = createTwitchAuthorizeUrl(config, state);

    const response = NextResponse.redirect(authorizeUrl);
    response.cookies.set(TWITCH_OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      maxAge: 10 * 60,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    response.cookies.set(TWITCH_OAUTH_NEXT_COOKIE, nextPath, {
      httpOnly: true,
      maxAge: 10 * 60,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    return response;
  } catch {
    dashboardUrl.searchParams.set("platform", "twitch");
    dashboardUrl.searchParams.set("error", "twitch-setup");
    return NextResponse.redirect(dashboardUrl);
  }
}

function getSafeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }

  return value;
}
