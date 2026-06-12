import { createHash, randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import type {
  ChannelSnapshot,
  MetricsSyncProvider,
  SupportedProvider,
} from "@streamos/types";

import {
  syncTwitchAnalytics,
  getTwitchOAuthConfig,
} from "@/lib/integrations/twitch";
import { ensureCreatorForUser } from "@/lib/supabase/creator";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const metricsSyncBodySchema = z.object({
  provider: z.enum(["twitch", "youtube", "tiktok", "kick"]),
});

type GatewayMetricsSyncRequest = {
  creatorId: string;
  provider: MetricsSyncProvider;
  userId: string;
};

type ConnectionSummary = {
  channel_id: string | null;
};

type TwitchChannelSnapshot = Omit<ChannelSnapshot, "provider"> & {
  provider: "twitch";
};

type TwitchMetricsSyncResult = {
  provider: "twitch";
  snapshot: TwitchChannelSnapshot;
  syncedAt: string;
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return NextResponse.json(
      {
        error: "An authenticated Supabase session is required.",
        code: "UNAUTHORIZED",
      },
      { status: 401 },
    );
  }

  const parsedBody = await parseRequestBody(request);

  if (!parsedBody.ok) {
    return NextResponse.json(
      {
        error: parsedBody.message,
        code: "INVALID_REQUEST_BODY",
      },
      { status: 400 },
    );
  }

  const creator = await ensureCreatorForUser(supabase, data.user);

  if (parsedBody.value.provider === "twitch") {
    return syncTwitchMetrics({
      creatorId: creator.id,
      supabase,
      userId: data.user.id,
    });
  }

  return proxyMetricsSyncToGateway({
    creatorId: creator.id,
    provider: parsedBody.value.provider,
    userId: data.user.id,
  });
}

async function proxyMetricsSyncToGateway({
  creatorId,
  provider,
  userId,
}: GatewayMetricsSyncRequest): Promise<NextResponse> {
  const gatewayUrl = process.env.API_GATEWAY_URL?.trim();
  const gatewaySecret = process.env.API_GATEWAY_SECRET?.trim();

  if (!gatewayUrl || !gatewaySecret) {
    return NextResponse.json(
      {
        error:
          "API_GATEWAY_URL and API_GATEWAY_SECRET are required for non-Twitch metrics sync.",
        code: "GATEWAY_NOT_CONFIGURED",
      },
      { status: 500 },
    );
  }

  const normalizedGatewayUrl = gatewayUrl.replace(/\/+$/, "");
  const requestUrl = new URL("/api/metrics/sync", normalizedGatewayUrl);

  try {
    const gatewayResponse = await fetch(requestUrl, {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${gatewaySecret}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      body: JSON.stringify({
        creatorId,
        provider,
        userId,
      }),
    });

    const responseBody = await readJsonResponse(gatewayResponse);

    return NextResponse.json(responseBody, {
      headers: copyRetryAfterHeader(gatewayResponse),
      status: gatewayResponse.status,
    });
  } catch {
    return NextResponse.json(
      {
        code: "GATEWAY_REQUEST_FAILED",
        error: "The API gateway could not be reached.",
      },
      { status: 502 },
    );
  }
}

async function syncTwitchMetrics({
  creatorId,
  supabase,
  userId,
}: {
  creatorId: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
}): Promise<NextResponse> {
  const serviceSupabase = createServiceRoleClient();
  const connectionResult = await serviceSupabase
    .from("platform_connections")
    .select("channel_id")
    .eq("user_id", userId)
    .eq("creator_id", creatorId)
    .eq("platform", "twitch")
    .in("status", ["connected", "expired", "degraded"])
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (connectionResult.error || !connectionResult.data) {
    return NextResponse.json(
      {
        code: "PLATFORM_CONNECTION_NOT_FOUND",
        error: "No twitch connection found for this user.",
      },
      { status: 404 },
    );
  }

  const connection = connectionResult.data as ConnectionSummary;

  if (!connection.channel_id) {
    return NextResponse.json(
      {
        code: "PLATFORM_CONNECTION_NOT_FOUND",
        error: "Twitch connection has no linked StreamOS channel.",
      },
      { status: 404 },
    );
  }

  const headerStore = await headers();
  const origin =
    headerStore.get("origin") ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000";
  const config = getTwitchOAuthConfig(origin);

  try {
    const result = await syncTwitchAnalytics({
      config,
      creatorId,
      metricsSupabase: serviceSupabase,
      supabase,
      userId,
    });

    const snapshot = buildTwitchSnapshot({
      capturedAt: result.capturedAt,
      channelId: connection.channel_id,
      creatorId,
      followerCount: result.followerCount,
      isLive: result.isLive,
      userId,
      viewerCount: result.viewerCount,
    });

    const payload: TwitchMetricsSyncResult = {
      provider: "twitch",
      snapshot,
      syncedAt: result.capturedAt,
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (syncError) {
    const errorId = randomUUID();
    console.error(
      JSON.stringify({
        errorId,
        event: "metrics_sync_failed",
        provider: "twitch",
        service: "web",
        userId: hashUserId(userId),
        error: syncError instanceof Error ? syncError.message : "Unknown error",
      }),
    );

    return NextResponse.json(
      {
        code: "METRICS_SYNC_FAILED",
        error: "Twitch metrics sync failed.",
        errorId,
      },
      { status: 500 },
    );
  }
}

function buildTwitchSnapshot({
  capturedAt,
  channelId,
  creatorId,
  followerCount,
  isLive,
  userId,
  viewerCount,
}: {
  capturedAt: string;
  channelId: string;
  creatorId: string;
  followerCount: number;
  isLive: boolean;
  userId: string;
  viewerCount: number;
}): TwitchChannelSnapshot {
  return {
    channelId,
    creatorId,
    followers: followerCount,
    peakViewers: viewerCount,
    provider: "twitch",
    rawPayload: {
      followerCount,
      isLive,
      viewerCount,
    },
    snapshotAt: capturedAt,
    subscribers: null,
    userId,
    views: null,
  };
}

async function parseRequestBody(
  request: NextRequest,
): Promise<
  | { ok: true; value: { provider: SupportedProvider } }
  | { message: string; ok: false }
> {
  try {
    const body = metricsSyncBodySchema.parse(await request.json());

    return { ok: true, value: body };
  } catch {
    return {
      message:
        "Request body must be { provider: 'twitch' | 'youtube' | 'tiktok' | 'kick' }.",
      ok: false,
    };
  }
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return {
      code: "PROVIDER_API_ERROR",
      error: await response.text(),
    };
  }

  try {
    return await response.json();
  } catch {
    return {
      code: "PROVIDER_API_ERROR",
      error: "Gateway returned an invalid JSON payload.",
    };
  }
}

function copyRetryAfterHeader(response: Response): HeadersInit {
  const retryAfter = response.headers.get("retry-after");

  return retryAfter ? { "Retry-After": retryAfter } : {};
}

function hashUserId(userId: string): string {
  return createHash("sha256").update(userId).digest("hex").slice(0, 16);
}
