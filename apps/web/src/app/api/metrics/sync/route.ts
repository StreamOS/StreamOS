import { NextResponse, type NextRequest } from "next/server";
import type { MetricsSyncRequest, MetricsSyncResponse } from "@streamos/types";
import { SUPPORTED_PROVIDERS } from "@streamos/types";

import {
  ApiGatewayConfigurationError,
  callApiGatewayJson,
} from "@/lib/api-gateway";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_REQUEST_BODY_BYTES = 4_096;
const supportedProviderSet = new Set<string>(SUPPORTED_PROVIDERS);

export async function POST(request: NextRequest) {
  if (hasOversizedBody(request)) {
    return NextResponse.json(
      {
        code: "REQUEST_TOO_LARGE",
        error: "Request body exceeds the metrics sync size limit.",
      },
      { status: 413 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return NextResponse.json(
      {
        code: "UNAUTHORIZED",
        error: "An authenticated Supabase session is required.",
      },
      { status: 401 },
    );
  }

  const parsedBody = await readRequestBody(request);

  if (!parsedBody.ok) {
    const isTooLarge = parsedBody.code === "REQUEST_TOO_LARGE";

    return NextResponse.json(
      {
        code: parsedBody.code,
        error: isTooLarge
          ? "Request body exceeds the metrics sync size limit."
          : "Request body must be { providers: SupportedProvider[] }.",
      },
      { status: isTooLarge ? 413 : 400 },
    );
  }

  try {
    const gatewayResult = await callApiGatewayJson<MetricsSyncResponse>({
      body: {
        providers: [...new Set(parsedBody.value.providers)],
        user_id: data.user.id,
      },
      path: "/api/metrics/sync",
    });

    return NextResponse.json(gatewayResult.data, {
      status: gatewayResult.status,
    });
  } catch (gatewayError) {
    if (gatewayError instanceof ApiGatewayConfigurationError) {
      return NextResponse.json(
        {
          code: "GATEWAY_NOT_CONFIGURED",
          error: gatewayError.message,
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        code: "GATEWAY_SYNC_FAILED",
        error: "Metrics sync could not be sent to the API gateway.",
      },
      { status: 502 },
    );
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
