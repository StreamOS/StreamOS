import type { ConnectionOptions } from "bullmq";
import type { RedisOptions } from "ioredis";
import { parseRedisConnectionOptions } from "@streamos/redis";

export function createRedisConnectionOptions(
  redisUrl: string,
): ConnectionOptions {
  return parseRedisConnectionOptions(redisUrl);
}

export function createRedisClientOptions(redisUrl: string): RedisOptions {
  return {
    ...parseRedisConnectionOptions(redisUrl),
    enableReadyCheck: true,
    maxRetriesPerRequest: null,
  };
}
