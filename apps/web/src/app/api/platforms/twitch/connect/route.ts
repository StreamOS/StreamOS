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

export async function GET(request: NextRequest) {
  const dashboardUrl = new URL("/dashboard", request.url);
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  let authorizeUrl: URL;

  try {
    assertEncryptionConfigured();
    const config = getTwitchOAuthConfig(request.nextUrl.origin);
    const state = randomBytes(24).toString("base64url");
    authorizeUrl = createTwitchAuthorizeUrl(config, state);

    const response = NextResponse.redirect(authorizeUrl);
    response.cookies.set(TWITCH_OAUTH_STATE_COOKIE, state, {
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
