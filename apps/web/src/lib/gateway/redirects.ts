import type { NextRequest } from "next/server";

import { getSafeNextPath, resolveAppOrigin } from "@/lib/auth/redirects";

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
  const origin = resolveAppOrigin({
    fallbackOrigin: request.url,
  });

  return new URL(nextPath, origin).toString();
}
