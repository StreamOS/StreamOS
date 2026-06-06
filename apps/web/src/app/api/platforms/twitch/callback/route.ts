import { NextResponse, type NextRequest } from "next/server";
import {
  exchangeTwitchCode,
  fetchTwitchUser,
  getTwitchOAuthConfig,
  persistTwitchConnection,
  syncTwitchAnalytics,
  TWITCH_OAUTH_STATE_COOKIE,
} from "@/lib/integrations/twitch";
import { ensureCreatorForUser } from "@/lib/supabase/creator";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const dashboardUrl = new URL("/dashboard", request.url);
  const code = request.nextUrl.searchParams.get("code");
  const returnedState = request.nextUrl.searchParams.get("state");
  const storedState = request.cookies.get(TWITCH_OAUTH_STATE_COOKIE)?.value;

  if (
    !code ||
    !returnedState ||
    !storedState ||
    returnedState !== storedState
  ) {
    dashboardUrl.searchParams.set("platform", "twitch");
    dashboardUrl.searchParams.set("error", "twitch-state");
    return redirectAndClearState(dashboardUrl);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    const loginUrl = new URL("/login", request.url);
    return redirectAndClearState(loginUrl);
  }

  try {
    const config = getTwitchOAuthConfig(request.nextUrl.origin);
    const token = await exchangeTwitchCode(config, code);
    const twitchUser = await fetchTwitchUser(config, token.access_token);
    const creator = await ensureCreatorForUser(supabase, data.user);

    await persistTwitchConnection({
      creatorId: creator.id,
      supabase,
      token,
      twitchUser,
      userId: data.user.id,
    });

    dashboardUrl.searchParams.set("platform", "twitch");

    try {
      await syncTwitchAnalytics({
        config,
        creatorId: creator.id,
        supabase,
        userId: data.user.id,
      });
      dashboardUrl.searchParams.set("status", "connected-synced");
    } catch {
      dashboardUrl.searchParams.set("status", "connected-sync-pending");
    }
  } catch {
    dashboardUrl.searchParams.set("platform", "twitch");
    dashboardUrl.searchParams.set("error", "twitch-callback");
  }

  return redirectAndClearState(dashboardUrl);
}

function redirectAndClearState(url: URL) {
  const response = NextResponse.redirect(url);
  response.cookies.delete(TWITCH_OAUTH_STATE_COOKIE);
  return response;
}
