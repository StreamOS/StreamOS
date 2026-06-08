export type RedisTlsGuardOptions = {
  nodeEnv?: string;
};

export type RedisConnectionOptions = {
  db?: number;
  host: string;
  password?: string;
  port: number;
  tls?: Record<string, never>;
  username?: string;
};

export class RedisTlsError extends Error {
  constructor(redisUrl: string | undefined) {
    super(
      [
        "[StreamOS] Redis TLS is required in production.",
        `Got: ${redactRedisUrl(redisUrl)}`,
        "Expected: rediss:// scheme, for example rediss://default:<token>@<host>:6379",
      ].join(" "),
    );
    this.name = "RedisTlsError";
  }
}

export function redactRedisUrl(redisUrl: string | undefined): string {
  const trimmedUrl = redisUrl?.trim();

  if (!trimmedUrl) {
    return "[missing]";
  }

  try {
    const parsedUrl = new URL(trimmedUrl);

    if (parsedUrl.password) {
      parsedUrl.password = "***";
    }

    return parsedUrl.toString();
  } catch {
    return "[unparseable Redis URL]";
  }
}

export function assertRedisTls(
  redisUrl: string | undefined,
  options: RedisTlsGuardOptions = {},
): void {
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;

  if (nodeEnv !== "production") {
    return;
  }

  const trimmedUrl = redisUrl?.trim();

  if (!trimmedUrl) {
    throw new RedisTlsError(redisUrl);
  }

  try {
    const parsedUrl = new URL(trimmedUrl);

    if (parsedUrl.protocol !== "rediss:") {
      throw new RedisTlsError(redisUrl);
    }
  } catch (error) {
    if (error instanceof RedisTlsError) {
      throw error;
    }

    throw new RedisTlsError(redisUrl);
  }
}

export function parseRedisConnectionOptions(
  redisUrl: string,
  options: RedisTlsGuardOptions = {},
): RedisConnectionOptions {
  assertRedisTls(redisUrl, options);

  const parsedUrl = new URL(redisUrl);

  if (parsedUrl.protocol !== "redis:" && parsedUrl.protocol !== "rediss:") {
    throw new Error("REDIS_URL must use the redis:// or rediss:// protocol.");
  }

  const dbPath = parsedUrl.pathname.replace(/^\//, "");
  const db = dbPath ? Number(dbPath) : undefined;

  if (dbPath && !Number.isInteger(db)) {
    throw new Error("REDIS_URL database path must be an integer.");
  }

  return {
    db,
    host: parsedUrl.hostname,
    password: parsedUrl.password
      ? decodeURIComponent(parsedUrl.password)
      : undefined,
    port: parsedUrl.port ? Number(parsedUrl.port) : 6379,
    tls: parsedUrl.protocol === "rediss:" ? {} : undefined,
    username: parsedUrl.username
      ? decodeURIComponent(parsedUrl.username)
      : undefined,
  };
}
