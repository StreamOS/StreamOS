"use server";

import { redirect } from "next/navigation";
import type { MetricsSyncResponse } from "@streamos/types";

import {
  ApiGatewayConfigurationError,
  callApiGatewayJson,
} from "@/lib/api-gateway";
import { isSupabaseConfigured } from "@/lib/supabase/config";
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

  if (await syncTwitchViaGateway(data.user.id)) {
    redirect("/dashboard?platform=twitch&status=refreshed");
  }

  redirect("/dashboard?platform=twitch&error=twitch-refresh");
}

export async function disconnectTwitchConnectionAction() {
  if (!isSupabaseConfigured()) {
    redirect("/dashboard/platforms?platform=twitch&error=twitch-disconnect");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/login");
  }

  try {
    const result = await callApiGatewayJson<{
      data?: {
        platform?: string;
        status?: string;
      };
      success?: boolean;
    }>({
      body: {
        user_id: data.user.id,
      },
      path: "/api/platforms/twitch/disconnect",
    });

    if (
      result.ok &&
      result.data.success === true &&
      result.data.data?.status === "disconnected"
    ) {
      redirect("/dashboard/platforms?platform=twitch&status=disconnected");
    }
  } catch (error) {
    if (error instanceof ApiGatewayConfigurationError) {
      redirect("/dashboard/platforms?platform=twitch&error=twitch-disconnect");
    }
  }

  redirect("/dashboard/platforms?platform=twitch&error=twitch-disconnect");
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

  if (await syncTwitchViaGateway(data.user.id)) {
    redirect("/dashboard/analytics?platform=twitch&status=synced");
  }

  redirect("/dashboard/analytics?platform=twitch&error=twitch-sync");
}

async function syncTwitchViaGateway(userId: string): Promise<boolean> {
  try {
    const result = await callApiGatewayJson<MetricsSyncResponse>({
      body: {
        providers: ["twitch"],
        user_id: userId,
      },
      path: "/api/metrics/sync",
    });

    return (
      result.ok &&
      !result.data.failed.some((failure) => failure.provider === "twitch")
    );
  } catch (error) {
    if (error instanceof ApiGatewayConfigurationError) {
      return false;
    }

    return false;
  }
}
