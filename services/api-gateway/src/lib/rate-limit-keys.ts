import type { Request } from "express";
import { ipKeyGenerator } from "express-rate-limit";

export function getRateLimitClientIp(request: Request): string {
  return request.socket.remoteAddress ?? "0.0.0.0";
}

export function createRateLimitKey(
  request: Request,
  ...scopeParts: string[]
): string {
  return [...scopeParts, ipKeyGenerator(getRateLimitClientIp(request))].join(
    ":",
  );
}
