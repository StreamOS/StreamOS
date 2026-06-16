import { createHmac } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { ensureCreatorForUser } from "@/lib/supabase/creator";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const HANDOFF_TTL_MS = 60_000;

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("error", "unauthorized");
    loginUrl.searchParams.set(
      "next",
      getSafeNextPath(request.nextUrl.searchParams.get("next")),
    );

    return NextResponse.redirect(loginUrl);
  }

  const gatewayUrl = process.env.API_GATEWAY_URL?.trim();
  const apiGatewaySecret = process.env.API_GATEWAY_SECRET?.trim();

  if (!gatewayUrl || !apiGatewaySecret) {
    const dashboardUrl = new URL("/dashboard/platforms", request.url);
    dashboardUrl.searchParams.set("platform", "twitch");
    dashboardUrl.searchParams.set("error", "gateway-not-configured");

    return NextResponse.redirect(dashboardUrl);
  }

  const creator = await ensureCreatorForUser(supabase, data.user);
  const handoffToken = createOAuthHandoffToken(
    {
      creator_id: creator.id,
      exp: Date.now() + HANDOFF_TTL_MS,
      return_to: getSafeNextPath(request.nextUrl.searchParams.get("next")),
      user_id: data.user.id,
    },
    apiGatewaySecret,
  );
  const connectUrl = new URL(
    "/api/auth/twitch/connect",
    gatewayUrl.replace(/\/+$/, ""),
  );
  connectUrl.searchParams.set("handoff", handoffToken);

  return NextResponse.redirect(connectUrl);
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

function getSafeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard/platforms";
  }

  return value;
}
