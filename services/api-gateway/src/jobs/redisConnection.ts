import { createHash } from "node:crypto";
import type { ConnectionOptions } from "bullmq";
import { parseRedisConnectionOptions } from "@streamos/redis";

export function getDeterministicJobId(prefix: string, value: string): string {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new Error(`${prefix} job ID requires a non-empty source value.`);
  }

  const digest = createHash("sha256")
    .update(normalizedValue)
    .digest("base64url");

  return `${prefix}-${digest}`;
}

export function createRedisConnectionOptions(
  redisUrl: string,
): ConnectionOptions {
  return parseRedisConnectionOptions(redisUrl);
}
