import "server-only";

import type { Json, Tables, Updates } from "@streamos/database";
import {
  parseYouTubeChannelIdFromTopic,
  type WebSubSubscription,
} from "@streamos/youtube-websub";
import type { createServiceRoleAdminClient } from "@/lib/supabase/admin";

type ServiceRoleClient = ReturnType<typeof createServiceRoleAdminClient>;
type JsonRecord = { [key: string]: Json | undefined };

export type WebSubMetadata = {
  failedRenewals: number;
  lastRenewedAt: string | null;
  subscriptions: WebSubSubscription[];
};

export type YouTubeConnection = Pick<
  Tables<"platform_connections">,
  "id" | "metadata" | "provider_account_id" | "status" | "user_id"
>;

export function getWebSubMetadata(metadata: Json | null): WebSubMetadata {
  const record = toJsonRecord(metadata);
  const websub = toJsonRecord(record.websub);
  const subscriptions = Array.isArray(websub.subscriptions)
    ? websub.subscriptions.flatMap((subscription) => {
        const parsed = parseSubscription(subscription);
        return parsed ? [parsed] : [];
      })
    : [];

  return {
    failedRenewals:
      typeof websub.failedRenewals === "number" ? websub.failedRenewals : 0,
    lastRenewedAt:
      typeof websub.lastRenewedAt === "string" ? websub.lastRenewedAt : null,
    subscriptions,
  };
}

export function mergeWebSubMetadata({
  metadata,
  patch,
}: {
  metadata: Json | null;
  patch: Partial<WebSubMetadata> & { subscriptions?: WebSubSubscription[] };
}): JsonRecord {
  const record = toJsonRecord(metadata);
  const current = getWebSubMetadata(metadata);

  return {
    ...record,
    websub: {
      failedRenewals: patch.failedRenewals ?? current.failedRenewals,
      lastRenewedAt:
        patch.lastRenewedAt === undefined
          ? current.lastRenewedAt
          : patch.lastRenewedAt,
      subscriptions: patch.subscriptions ?? current.subscriptions,
    },
  };
}

export function upsertSubscription(
  subscriptions: WebSubSubscription[],
  subscription: WebSubSubscription,
): WebSubSubscription[] {
  return [
    ...subscriptions.filter(
      (candidate) => candidate.topicUrl !== subscription.topicUrl,
    ),
    subscription,
  ];
}

export function markSubscriptionsUnsubscribed(
  subscriptions: WebSubSubscription[],
): WebSubSubscription[] {
  return subscriptions.map((subscription) => ({
    ...subscription,
    status: "unsubscribed",
  }));
}

export async function upsertWebSubTracking({
  connection,
  failedRenewals = 0,
  lastRenewedAt = null,
  serviceSupabase,
  subscription,
}: {
  connection: YouTubeConnection;
  failedRenewals?: number;
  lastRenewedAt?: string | null;
  serviceSupabase: ServiceRoleClient;
  subscription: WebSubSubscription;
}) {
  const { error } = await serviceSupabase
    .from("youtube_websub_subscriptions")
    .upsert(
      {
        channel_connection_id: connection.id,
        expires_at: subscription.expiresAt,
        failed_renewals: failedRenewals,
        last_renewed_at: lastRenewedAt,
        lease_seconds: subscription.leaseSeconds,
        status: subscription.status,
        subscribed_at: subscription.subscribedAt,
        topic_url: subscription.topicUrl,
        user_id: connection.user_id,
        youtube_channel_id:
          parseYouTubeChannelIdFromTopic(subscription.topicUrl) ??
          connection.provider_account_id,
      },
      { onConflict: "channel_connection_id,topic_url" },
    );

  if (error) {
    throw new Error(`YouTube WebSub tracking upsert failed: ${error.message}`);
  }
}

export async function updateConnectionWebSubMetadata({
  connection,
  metadata,
  serviceSupabase,
  status,
}: {
  connection: Pick<Tables<"platform_connections">, "id" | "user_id">;
  metadata: JsonRecord;
  serviceSupabase: ServiceRoleClient;
  status?: Updates<"platform_connections">["status"];
}) {
  const payload: Updates<"platform_connections"> = {
    metadata,
  };

  if (status) {
    payload.status = status;
  }

  const { error } = await serviceSupabase
    .from("platform_connections")
    .update(payload)
    .eq("id", connection.id)
    .eq("user_id", connection.user_id);

  if (error) {
    throw new Error(
      `YouTube connection metadata update failed: ${error.message}`,
    );
  }
}

export function shouldRenewSubscription(
  subscription: WebSubSubscription,
  nowMs = Date.now(),
): boolean {
  const expiresAtMs = Date.parse(subscription.expiresAt);

  return (
    subscription.status === "expired" ||
    !Number.isFinite(expiresAtMs) ||
    expiresAtMs - nowMs < 48 * 60 * 60 * 1000
  );
}

export function getChannelIdForSubscription({
  connection,
  subscription,
}: {
  connection: Pick<Tables<"platform_connections">, "provider_account_id">;
  subscription: Pick<WebSubSubscription, "topicUrl">;
}): string {
  return (
    parseYouTubeChannelIdFromTopic(subscription.topicUrl) ??
    connection.provider_account_id
  );
}

function parseSubscription(value: Json): WebSubSubscription | null {
  const record = toJsonRecord(value);

  if (
    typeof record.topicUrl !== "string" ||
    typeof record.leaseSeconds !== "number" ||
    typeof record.subscribedAt !== "string" ||
    typeof record.expiresAt !== "string" ||
    typeof record.status !== "string"
  ) {
    return null;
  }

  if (
    record.status !== "pending" &&
    record.status !== "active" &&
    record.status !== "expired" &&
    record.status !== "failed" &&
    record.status !== "unsubscribed"
  ) {
    return null;
  }

  return {
    expiresAt: record.expiresAt,
    leaseSeconds: record.leaseSeconds,
    status: record.status,
    subscribedAt: record.subscribedAt,
    topicUrl: record.topicUrl,
  };
}

function toJsonRecord(value: Json | null | undefined): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as JsonRecord;
}
