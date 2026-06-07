import {
  YOUTUBE_WEBSUB_RENEWAL_WINDOW_MS,
  type YouTubeWebSubHealth,
} from "./types.js";

type SubscriptionRow = {
  expires_at: string;
  status: string;
};

export async function getSubscriptionHealth(
  userId: string,
): Promise<YouTubeWebSubHealth> {
  const supabaseUrl =
    process.env.SUPABASE_URL?.trim() ??
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for YouTube WebSub health checks.",
    );
  }

  const url = new URL("/rest/v1/youtube_websub_subscriptions", supabaseUrl);
  url.searchParams.set("select", "status,expires_at");
  url.searchParams.set("user_id", `eq.${userId}`);

  const response = await fetch(url, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `YouTube WebSub health query failed with status ${response.status}.`,
    );
  }

  return summarizeHealth((await response.json()) as SubscriptionRow[]);
}

export function summarizeHealth(rows: SubscriptionRow[]): YouTubeWebSubHealth {
  const now = Date.now();
  const health: YouTubeWebSubHealth = {
    active: 0,
    expired: 0,
    expiringSoon: 0,
    failed: 0,
    total: rows.length,
  };

  for (const row of rows) {
    const expiresAtMs = Date.parse(row.expires_at);

    if (row.status === "failed") {
      health.failed += 1;
      continue;
    }

    if (
      row.status === "expired" ||
      (Number.isFinite(expiresAtMs) && expiresAtMs <= now)
    ) {
      health.expired += 1;
      continue;
    }

    if (row.status === "active") {
      health.active += 1;

      if (expiresAtMs - now < YOUTUBE_WEBSUB_RENEWAL_WINDOW_MS) {
        health.expiringSoon += 1;
      }
    }
  }

  return health;
}
