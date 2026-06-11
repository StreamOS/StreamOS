import { NextResponse, type NextRequest } from "next/server";
import { SUPPORTED_PROVIDERS, type MetricsSyncRequest } from "@streamos/types";

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_REQUEST_BODY_BYTES = 4_096;
const supportedProviderSet = new Set<string>(SUPPORTED_PROVIDERS);

export async function POST(request: NextRequest) {
  if (hasOversizedBody(request)) {
    return NextResponse.json(
      {
        error: "Request body exceeds the metrics sync size limit.",
        code: "REQUEST_TOO_LARGE",
      },
      { status: 413 },
    );
  }

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

    const parsedBody = await readRequestBody(request);

    if (!parsedBody.ok) {
      const isTooLarge = parsedBody.code === "REQUEST_TOO_LARGE";

      return NextResponse.json(
        {
          error: isTooLarge
            ? "Request body exceeds the metrics sync size limit."
            : "Request body must be { providers: SupportedProvider[] }.",
          code: parsedBody.code,
        },
        { status: isTooLarge ? 413 : 400 },
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

    const response = await fetch(
      new URL("/api/metrics/sync-request", gatewayUrl),
      {
        body: JSON.stringify({
          providers: parsedBody.value.providers,
          user_id: data.user.id,
        } satisfies MetricsSyncRequest & { user_id: string }),
        headers: {
          Authorization: `Bearer ${apiGatewaySecret}`,
          "Content-Type": "application/json",
        },
        method: "POST",
        signal: abortController.signal,
      },
    );

    return NextResponse.json(await readGatewayResponse(response), {
      status: response.status,
    });
  } catch (error) {
    logMetricsSyncError(error);

    return NextResponse.json(
      {
        error: "Metrics sync could not be initialized.",
        code: "METRICS_SYNC_FAILED",
      },
      { status: 500 },
    );
  } finally {
    clearTimeout(timeout);
  }
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

async function readRequestBody(
  request: NextRequest,
): Promise<
  | { ok: true; value: MetricsSyncRequest }
  | { code: "INVALID_REQUEST" | "REQUEST_TOO_LARGE"; ok: false; value: null }
> {
  const rawBody = await readRequestText(request);

  if (!rawBody.ok) {
    return rawBody;
  }

  let body: unknown;

  try {
    body = JSON.parse(rawBody.value) as unknown;
  } catch {
    body = null;
  }

  if (!isMetricsSyncRequest(body)) {
    return { code: "INVALID_REQUEST", ok: false, value: null };
  }

  return { ok: true, value: body };
}

async function readRequestText(
  request: NextRequest,
): Promise<
  | { ok: true; value: string }
  | { code: "INVALID_REQUEST" | "REQUEST_TOO_LARGE"; ok: false; value: null }
> {
  const reader = request.body?.getReader();

  if (!reader) {
    return { code: "INVALID_REQUEST", ok: false, value: null };
  }

  const decoder = new TextDecoder();
  let bytesRead = 0;
  let rawBody = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    bytesRead += value.byteLength;

    if (bytesRead > MAX_REQUEST_BODY_BYTES) {
      await reader.cancel();

      return { code: "REQUEST_TOO_LARGE", ok: false, value: null };
    }

    rawBody += decoder.decode(value, { stream: true });
  }

  rawBody += decoder.decode();

  return { ok: true, value: rawBody };
}

function isMetricsSyncRequest(value: unknown): value is MetricsSyncRequest {
  if (!isRecord(value) || !Array.isArray(value.providers)) {
    return false;
  }

  return (
    value.providers.length > 0 &&
    value.providers.every(
      (provider) =>
        typeof provider === "string" && supportedProviderSet.has(provider),
    )
  );
}

function hasOversizedBody(request: NextRequest): boolean {
  const contentLength = request.headers.get("content-length");

  if (!contentLength) {
    return false;
  }

  const parsed = Number.parseInt(contentLength, 10);

  return Number.isFinite(parsed) && parsed > MAX_REQUEST_BODY_BYTES;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function logMetricsSyncError(error: unknown) {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  console.error(
    JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error",
      event: "metrics_sync_failed",
      service: "web",
    }),
  );
}
