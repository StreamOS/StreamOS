import { NextResponse, type NextRequest } from "next/server";
import {
  deleteEventSubSubscriptions,
  getTwitchAppAccessToken,
} from "@streamos/twitch-eventsub";
import type { Json, Tables } from "@streamos/database";
import { getTwitchOAuthConfig } from "@/lib/integrations/twitch";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type JsonRecord = { [key: string]: Json | undefined };

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return NextResponse.json(
      {
        error: "unauthorized",
        message: "Authentication is required to disconnect Twitch.",
      },
      { status: 401 },
    );
  }

  const serviceSupabase = createServiceRoleClient();
  const connectionResult = await serviceSupabase
    .from("platform_connections")
    .select("id, metadata")
    .eq("user_id", data.user.id)
    .eq("platform", "twitch")
    .eq("status", "connected")
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (connectionResult.error) {
    return NextResponse.json(
      {
        error: "twitch_disconnect_lookup_failed",
        message: "Twitch connection could not be loaded.",
      },
      { status: 500 },
    );
  }

  const connection = connectionResult.data as Pick<
    Tables<"platform_connections">,
    "id" | "metadata"
  > | null;

  if (!connection) {
    return NextResponse.json(
      {
        error: "twitch_connection_not_found",
        message: "No connected Twitch account was found.",
      },
      { status: 404 },
    );
  }

  const metadata = toJsonRecord(connection.metadata);
  const subscriptionIds = getEventSubSubscriptionIds(metadata.eventsub);
  let deleted: string[] = [];
  let failed: string[] = [];

  if (subscriptionIds.length > 0) {
    try {
      const config = getTwitchOAuthConfig(request.nextUrl.origin);
      const appAccessToken = await getTwitchAppAccessToken({
        config: {
          clientId: config.clientId,
          clientSecret: config.clientSecret,
        },
      });
      const deletionResult = await deleteEventSubSubscriptions({
        appAccessToken,
        clientId: config.clientId,
        subscriptionIds,
      });

      deleted = deletionResult.deleted;
      failed = deletionResult.failed;
    } catch (deleteError) {
      console.error("Twitch EventSub cleanup failed during disconnect.", {
        deleteError,
        subscriptionIds,
        userId: data.user.id,
      });
      failed = subscriptionIds;
    }
  }

  const updateResult = await serviceSupabase
    .from("platform_connections")
    .update({
      metadata: {
        ...metadata,
        eventsub: null,
      },
      status: "disconnected",
    } as never)
    .eq("user_id", data.user.id)
    .eq("id", connection.id);

  if (updateResult.error) {
    return NextResponse.json(
      {
        error: "twitch_disconnect_update_failed",
        message: "Twitch connection status could not be updated.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    data: {
      eventsub: {
        deleted,
        failed,
      },
      platform: "twitch",
      status: "disconnected",
    },
    success: true,
  });
}

function getEventSubSubscriptionIds(value: Json | undefined): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  const subscriptionIds = (value as JsonRecord).subscription_ids;

  if (!Array.isArray(subscriptionIds)) {
    return [];
  }

  return subscriptionIds.filter(
    (subscriptionId): subscriptionId is string =>
      typeof subscriptionId === "string" && subscriptionId.length > 0,
  );
}

function toJsonRecord(value: Json | null | undefined): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as JsonRecord;
}
