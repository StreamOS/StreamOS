import { NextResponse, type NextRequest } from "next/server";
import { renewSubscription } from "@streamos/youtube-websub";
import {
  getChannelIdForSubscription,
  getWebSubMetadata,
  mergeWebSubMetadata,
  shouldRenewSubscription,
  updateConnectionWebSubMetadata,
  upsertSubscription,
  upsertWebSubTracking,
  type YouTubeConnection,
} from "@/lib/integrations/youtube-websub";
import { createServiceRoleAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RenewReport = {
  checked: number;
  renewed: number;
  skipped: number;
  failed: number;
  duration_ms: number;
};

export async function GET(request: NextRequest) {
  const startedAt = Date.now();

  if (!hasValidCronSecret(request)) {
    return NextResponse.json(
      {
        error: "unauthorized",
        message: "Valid cron authorization is required.",
      },
      { status: 401 },
    );
  }

  const serviceSupabase = createServiceRoleAdminClient();
  const { data, error } = await serviceSupabase
    .from("platform_connections")
    .select("id,user_id,provider_account_id,metadata,status")
    .eq("platform", "youtube")
    .in("status", ["connected", "degraded"])
    .order("connected_at", { ascending: true });

  if (error) {
    return NextResponse.json(
      {
        error: "youtube_websub_connection_lookup_failed",
        message: "YouTube connections could not be loaded.",
      },
      { status: 500 },
    );
  }

  const report: RenewReport = {
    checked: 0,
    duration_ms: 0,
    failed: 0,
    renewed: 0,
    skipped: 0,
  };

  for (const connection of (data ?? []) as YouTubeConnection[]) {
    const websub = getWebSubMetadata(connection.metadata);

    for (const subscription of websub.subscriptions) {
      report.checked += 1;

      if (!shouldRenewSubscription(subscription, startedAt)) {
        report.skipped += 1;
        continue;
      }

      try {
        const channelId = getChannelIdForSubscription({
          connection,
          subscription,
        });
        const renewedSubscription = await renewSubscription(channelId);
        const renewedAt = new Date().toISOString();
        const subscriptions = upsertSubscription(
          websub.subscriptions,
          renewedSubscription,
        );

        await upsertWebSubTracking({
          connection,
          failedRenewals:
            renewedSubscription.status === "failed"
              ? websub.failedRenewals + 1
              : 0,
          lastRenewedAt: renewedAt,
          serviceSupabase,
          subscription: renewedSubscription,
        });

        await updateConnectionWebSubMetadata({
          connection,
          metadata: mergeWebSubMetadata({
            metadata: connection.metadata,
            patch: {
              failedRenewals:
                renewedSubscription.status === "failed"
                  ? websub.failedRenewals + 1
                  : 0,
              lastRenewedAt: renewedAt,
              subscriptions,
            },
          }),
          serviceSupabase,
          status:
            renewedSubscription.status === "failed" &&
            websub.failedRenewals + 1 >= 3
              ? "degraded"
              : "connected",
        });

        if (renewedSubscription.status === "failed") {
          report.failed += 1;
        } else {
          report.renewed += 1;
        }
      } catch (renewError) {
        const failedRenewals = websub.failedRenewals + 1;

        console.error("YouTube WebSub renewal failed.", {
          connectionId: connection.id,
          renewError,
          topicUrl: subscription.topicUrl,
          userId: connection.user_id,
        });

        await updateConnectionWebSubMetadata({
          connection,
          metadata: mergeWebSubMetadata({
            metadata: connection.metadata,
            patch: {
              failedRenewals,
              subscriptions: websub.subscriptions,
            },
          }),
          serviceSupabase,
          status: failedRenewals >= 3 ? "degraded" : connection.status,
        });

        report.failed += 1;
      }
    }
  }

  report.duration_ms = Date.now() - startedAt;

  return NextResponse.json(report);
}

function hasValidCronSecret(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (!cronSecret) {
    return false;
  }

  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}
