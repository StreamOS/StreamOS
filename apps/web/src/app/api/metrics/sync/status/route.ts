import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REQUEST_TIMEOUT_MS = 10_000;

function getQueryValue(value: string | string[] | null): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return typeof value === "string" && value.trim() ? value : undefined;
}

async function readGatewayResponse(response: Response): Promise<unknown> {
  const rawText = await response.text();

  if (!rawText.trim()) {
    return null;
  }

  try {
    return JSON.parse(rawText) as unknown;
  } catch {
    return {
      error: "gateway_response_unparseable",
      message: rawText.trim(),
    };
  }
}

export async function GET(request: NextRequest) {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), REQUEST_TIMEOUT_MS);

  try {
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

    const jobId =
      getQueryValue(request.nextUrl.searchParams.get("job_id")) ??
      getQueryValue(request.nextUrl.searchParams.get("queue_job_id"));

    if (!jobId) {
      return NextResponse.json(
        {
          error: "Request query must include job_id or queue_job_id.",
          code: "INVALID_REQUEST",
        },
        { status: 400 },
      );
    }

    const gatewayUrl = process.env.API_GATEWAY_URL?.trim();
    const apiGatewaySecret = process.env.API_GATEWAY_SECRET?.trim();

    if (!gatewayUrl || !apiGatewaySecret) {
      return NextResponse.json(
        {
          error: "Metrics sync gateway is not configured.",
          code: "METRICS_SYNC_FAILED",
        },
        { status: 500 },
      );
    }

    const gatewayStatusUrl = new URL("/api/metrics/sync-status", gatewayUrl);
    gatewayStatusUrl.searchParams.set("job_id", jobId);

    const response = await fetch(gatewayStatusUrl, {
      headers: {
        Authorization: `Bearer ${apiGatewaySecret}`,
      },
      signal: abortController.signal,
    });

    return NextResponse.json(await readGatewayResponse(response), {
      status: response.status,
    });
  } catch (error) {
    logMetricsSyncError(error);

    return NextResponse.json(
      {
        error: "Metrics sync status could not be loaded.",
        code: "METRICS_SYNC_FAILED",
      },
      { status: 500 },
    );
  } finally {
    clearTimeout(timeout);
  }
}

function logMetricsSyncError(error: unknown) {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  console.error(
    JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error",
      event: "metrics_sync_status_failed",
      service: "web",
    }),
  );
}
