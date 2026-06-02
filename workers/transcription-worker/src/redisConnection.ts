import type { ConnectionOptions } from "bullmq";

export function createRedisConnectionOptions(
  redisUrl: string,
): ConnectionOptions {
  const url = new URL(redisUrl);

  if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
    throw new Error("REDIS_URL must use the redis:// or rediss:// protocol.");
  }

  const dbPath = url.pathname.replace("/", "");
  const db = dbPath ? Number(dbPath) : undefined;

  if (dbPath && !Number.isInteger(db)) {
    throw new Error("REDIS_URL database path must be an integer.");
  }

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db,
    tls: url.protocol === "rediss:" ? {} : undefined,
  };
}
