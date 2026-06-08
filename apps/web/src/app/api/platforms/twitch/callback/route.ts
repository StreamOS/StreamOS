import { NextResponse, type NextRequest } from "next/server";
import {
  exchangeTwitchCode,
  fetchTwitchUser,
  getTwitchOAuthConfig,
  persistTwitchConnection,
  registerTwitchEventSubForConnection,
  syncTwitchAnalytics,
  TWITCH_OAUTH_STATE_COOKIE,
} from "@/lib/integrations/twitch";
import { ensureCreatorForUser } from "@/lib/supabase/creator";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const TWITCH_OAUTH_NEXT_COOKIE = "streamos_twitch_oauth_next";

export async function GET(request: NextRequest) {
  const nextPath = getSafeNextPath(
    request.cookies.get(TWITCH_OAUTH_NEXT_COOKIE)?.value,
  );
  const dashboardUrl = new URL(nextPath, request.url);
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
  const serviceSupabase = createServiceRoleClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("error", "unauthorized");
    loginUrl.searchParams.set("next", nextPath);

    return redirectAndClearState(loginUrl);
  }

  try {
    const config = getTwitchOAuthConfig(request.nextUrl.origin);
    const token = await exchangeTwitchCode(config, code);
    const twitchUser = await fetchTwitchUser(config, token.access_token);
    const creator = await ensureCreatorForUser(supabase, data.user);

    const connection = await persistTwitchConnection({
      connectionSupabase: serviceSupabase,
      creatorId: creator.id,
      supabase,
      token,
      twitchUser,
      userId: data.user.id,
    });

    try {
      await registerTwitchEventSubForConnection({
        broadcasterId: twitchUser.id,
        config,
        connectionId: connection.connectionId,
        connectionSupabase: serviceSupabase,
        userId: data.user.id,
      });
    } catch (error) {
      console.error(
        "Twitch EventSub registration failed after OAuth connect.",
        {
          error,
          twitchUserId: twitchUser.id,
          userId: data.user.id,
        },
      );
    }

    dashboardUrl.searchParams.set("platform", "twitch");

    try {
      await syncTwitchAnalytics({
        connectionSupabase: serviceSupabase,
        config,
        creatorId: creator.id,
        metricsSupabase: serviceSupabase,
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
  response.cookies.delete(TWITCH_OAUTH_NEXT_COOKIE);
  return response;
}

function getSafeNextPath(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }

  return value;
}
