import type { ConnectionOptions } from "bullmq";
import { parseRedisConnectionOptions } from "@streamos/redis";

export function createRedisConnectionOptions(
  redisUrl: string,
): ConnectionOptions {
  return parseRedisConnectionOptions(redisUrl);
}
