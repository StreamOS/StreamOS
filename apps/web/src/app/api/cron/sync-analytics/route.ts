import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SyncAnalyticsResponse = {
  ok: true;
  triggered: true;
};

type SyncAnalyticsErrorResponse = {
  error: string;
  ok: false;
};

export async function GET(request: NextRequest) {
  const unauthorizedResponse = requireCronAuth(request);

  if (unauthorizedResponse) {
    return unauthorizedResponse;
  }

  logCronEvent("info", "sync-analytics cron started");

  try {
    const gatewayUrl = process.env.API_GATEWAY_URL?.trim();
    const gatewaySecret = process.env.API_GATEWAY_SECRET?.trim();

    if (!gatewayUrl || !gatewaySecret) {
      throw new Error(
        "API_GATEWAY_URL or API_GATEWAY_SECRET is not configured.",
      );
    }

    const normalizedGatewayUrl = gatewayUrl.replace(/\/+$/, "");
    const triggerUrl = new URL(
      "/api/jobs/sync-analytics",
      normalizedGatewayUrl,
    );

    const response = await fetch(triggerUrl.toString(), {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${gatewaySecret}`,
      },
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(
        `API gateway responded with HTTP ${response.status} for sync-analytics.`,
      );
    }

    logCronEvent("info", "sync-analytics cron succeeded", {
      status: response.status,
    });

    const body: SyncAnalyticsResponse = {
      ok: true,
      triggered: true,
    };

    return NextResponse.json(body, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown sync-analytics error.";

    logCronEvent("error", "sync-analytics cron failed", {
      error: message,
    });

    const body: SyncAnalyticsErrorResponse = {
      error: message,
      ok: false,
    };

    return NextResponse.json(body, { status: 500 });
  }
}

function logCronEvent(
  level: "error" | "info",
  event: string,
  details: Record<string, unknown> = {},
) {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  const payload = JSON.stringify({
    event,
    service: "web",
    timestamp: new Date().toISOString(),
    ...details,
  });

  if (level === "error") {
    console.error(payload);
    return;
  }

  console.info(payload);
}
