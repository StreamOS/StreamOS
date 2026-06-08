import { parseRedisConnectionOptions } from "@streamos/redis";

export function createRedisConnectionOptions(redisUrl: string) {
  return parseRedisConnectionOptions(redisUrl);
}
