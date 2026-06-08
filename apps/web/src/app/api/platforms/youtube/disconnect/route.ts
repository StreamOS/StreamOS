import { NextResponse, type NextRequest } from "next/server";
import { unsubscribe } from "@streamos/youtube-websub";
import {
  getChannelIdForSubscription,
  getWebSubMetadata,
  markSubscriptionsUnsubscribed,
  mergeWebSubMetadata,
  updateConnectionWebSubMetadata,
  type YouTubeConnection,
} from "@/lib/integrations/youtube-websub";
import { createServiceRoleAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(_request: NextRequest) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return NextResponse.json(
      {
        error: "unauthorized",
        message: "Authentication is required to disconnect YouTube.",
      },
      { status: 401 },
    );
  }

  const serviceSupabase = createServiceRoleAdminClient();
  const connectionResult = await serviceSupabase
    .from("platform_connections")
    .select("id,user_id,provider_account_id,metadata,status")
    .eq("user_id", data.user.id)
    .eq("platform", "youtube")
    .in("status", ["connected", "degraded"])
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (connectionResult.error) {
    return NextResponse.json(
      {
        error: "youtube_disconnect_lookup_failed",
        message: "YouTube connection could not be loaded.",
      },
      { status: 500 },
    );
  }

  const connection = connectionResult.data as YouTubeConnection | null;

  if (!connection) {
    return NextResponse.json(
      {
        error: "youtube_connection_not_found",
        message: "No connected YouTube account was found.",
      },
      { status: 404 },
    );
  }

  const websub = getWebSubMetadata(connection.metadata);
  const unsubscribed: string[] = [];
  const failed: string[] = [];

  for (const subscription of websub.subscriptions) {
    if (subscription.status !== "active" && subscription.status !== "pending") {
      continue;
    }

    try {
      await unsubscribe(
        getChannelIdForSubscription({
          connection,
          subscription,
        }),
      );
      unsubscribed.push(subscription.topicUrl);
    } catch (unsubscribeError) {
      console.error("YouTube WebSub unsubscribe failed during disconnect.", {
        connectionId: connection.id,
        topicUrl: subscription.topicUrl,
        unsubscribeError,
        userId: data.user.id,
      });
      failed.push(subscription.topicUrl);
    }
  }

  const subscriptions = markSubscriptionsUnsubscribed(websub.subscriptions);

  await updateConnectionWebSubMetadata({
    connection,
    metadata: mergeWebSubMetadata({
      metadata: connection.metadata,
      patch: {
        subscriptions,
      },
    }),
    serviceSupabase,
    status: "disconnected",
  });

  const { error: trackingError } = await serviceSupabase
    .from("youtube_websub_subscriptions")
    .update({ status: "unsubscribed" })
    .eq("user_id", data.user.id)
    .eq("channel_connection_id", connection.id);

  if (trackingError) {
    console.error("YouTube WebSub tracking disconnect update failed.", {
      connectionId: connection.id,
      trackingError,
      userId: data.user.id,
    });
  }

  return NextResponse.json({
    data: {
      platform: "youtube",
      status: "disconnected",
      websub: {
        failed,
        unsubscribed,
      },
    },
    success: true,
  });
}
