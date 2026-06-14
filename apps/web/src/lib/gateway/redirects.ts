import type { NextRequest } from "next/server";

import { getSafeNextPath } from "@/lib/auth/redirects";

export function resolveGatewayReturnTo({
  fallbackPath = "/dashboard/platforms",
  request,
  value,
}: {
  fallbackPath?: string;
  request: NextRequest;
  value: string | null;
}) {
  const nextPath = getSafeNextPath(value, fallbackPath);

  return new URL(nextPath, request.url).toString();
}
