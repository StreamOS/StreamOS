import { createHmac } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { GatewayConnectResponse, OAuthProvider } from "@streamos/types";

import { resolveGatewayReturnTo } from "@/lib/gateway/redirects";
import { ensureCreatorForUser } from "@/lib/supabase/creator";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const HANDOFF_TTL_MS = 60_000;
const GATEWAY_OAUTH_PROVIDERS = [
  "twitch",
  "youtube",
  "tiktok",
  "kick",
] as const;

type ErrorResponse = {
  code: string;
  error: string;
};

export async function GET(request: NextRequest) {
  try {
    const provider = getGatewayOAuthProvider(request);

    if (!provider) {
      return jsonError(
        "provider_not_supported",
        "Gateway OAuth provider is not supported.",
        400,
      );
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      return jsonError(
        "unauthorized",
        "An authenticated Supabase session is required.",
        401,
      );
    }

    const gatewayUrl = process.env.API_GATEWAY_URL?.trim();

    if (!gatewayUrl) {
      return jsonError(
        "gateway_not_configured",
        "API_GATEWAY_URL is not configured.",
        500,
      );
    }

    const apiGatewaySecret = process.env.API_GATEWAY_SECRET?.trim();

    if (!apiGatewaySecret) {
      return jsonError(
        "gateway_not_configured",
        "API_GATEWAY_SECRET is not configured.",
        500,
      );
    }

    const creator = await ensureCreatorForUser(supabase, data.user);
    const handoffToken = createOAuthHandoffToken(
      {
        creator_id: creator.id,
        exp: Date.now() + HANDOFF_TTL_MS,
        return_to: resolveGatewayReturnTo({
          request,
          value: "/dashboard/platforms",
        }),
        user_id: data.user.id,
      },
      apiGatewaySecret,
    );

    const normalizedGatewayUrl = gatewayUrl.replace(/\/+$/, "");
    const connectUrl = new URL(
      `/api/auth/${provider}/connect`,
      normalizedGatewayUrl,
    );
    connectUrl.searchParams.set("handoff", handoffToken);

    const response: GatewayConnectResponse = {
      connect_url: connectUrl.toString(),
      gateway_url: normalizedGatewayUrl,
      provider,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    logGatewayConnectError(error);

    return jsonError(
      "gateway_handoff_failed",
      "Gateway handoff token could not be issued.",
      500,
    );
  }
}

function getGatewayOAuthProvider(request: NextRequest): OAuthProvider | null {
  const provider = request.nextUrl.searchParams.get("provider") ?? "youtube";

  return isGatewayOAuthProvider(provider) ? provider : null;
}

function isGatewayOAuthProvider(value: string): value is OAuthProvider {
  return GATEWAY_OAUTH_PROVIDERS.includes(value as OAuthProvider);
}

function jsonError(code: string, error: string, status: number) {
  const payload: ErrorResponse = { code, error };

  return NextResponse.json(payload, { status });
}

function createOAuthHandoffToken(
  payload: {
    creator_id: string;
    exp: number;
    return_to: string;
    user_id: string;
  },
  secret: string,
): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  const signature = createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");

  return `${encodedPayload}.${signature}`;
}

function logGatewayConnectError(error: unknown) {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  const errorName = error instanceof Error ? error.name : "UnknownError";

  console.error(
    JSON.stringify({
      error: "Gateway connect failed.",
      error_name: errorName,
      event: "gateway_connect_failed",
      service: "web",
    }),
  );
}
