"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  getTwitchOAuthConfig,
  refreshTwitchConnection,
  syncTwitchAnalytics,
} from "@/lib/integrations/twitch";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ensureCreatorForUser } from "@/lib/supabase/creator";
import { createClient } from "@/lib/supabase/server";

export async function refreshTwitchConnectionAction() {
  if (!isSupabaseConfigured()) {
    redirect("/dashboard?platform=twitch&error=twitch-refresh");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/login");
  }

  const headerStore = await headers();
  const origin =
    headerStore.get("origin") ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000";

  let refreshFailed = false;

  try {
    const creator = await ensureCreatorForUser(supabase, data.user);
    const config = getTwitchOAuthConfig(origin);

    await refreshTwitchConnection({
      config,
      creatorId: creator.id,
      supabase,
    });
  } catch {
    refreshFailed = true;
  }

  if (refreshFailed) {
    redirect("/dashboard?platform=twitch&error=twitch-refresh");
  }

  redirect("/dashboard?platform=twitch&status=refreshed");
}

export async function syncTwitchAnalyticsAction() {
  if (!isSupabaseConfigured()) {
    redirect("/dashboard/analytics?platform=twitch&error=twitch-sync");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/login");
  }

  const headerStore = await headers();
  const origin =
    headerStore.get("origin") ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000";

  let syncFailed = false;

  try {
    const creator = await ensureCreatorForUser(supabase, data.user);
    const config = getTwitchOAuthConfig(origin);

    await syncTwitchAnalytics({
      config,
      creatorId: creator.id,
      supabase,
    });
  } catch {
    syncFailed = true;
  }

  if (syncFailed) {
    redirect("/dashboard/analytics?platform=twitch&error=twitch-sync");
  }

  redirect("/dashboard/analytics?platform=twitch&status=synced");
}
