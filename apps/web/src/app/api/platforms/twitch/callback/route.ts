import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const dashboardUrl = new URL("/dashboard/platforms", request.url);
  dashboardUrl.searchParams.set("platform", "twitch");
  dashboardUrl.searchParams.set("error", "gateway-owned-oauth");

  return NextResponse.redirect(dashboardUrl);
}
