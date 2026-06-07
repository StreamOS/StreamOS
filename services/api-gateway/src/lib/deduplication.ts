export type RedisDeduplicationClient = {
  set(
    key: string,
    value: string,
    mode: "NX",
    ttlMode: "EX",
    ttlSeconds: number,
  ): Promise<"OK" | null>;
};

export async function isMessageDuplicate(
  redisClient: RedisDeduplicationClient,
  key: string,
  ttlSeconds: number,
): Promise<boolean> {
  const result = await redisClient.set(key, "1", "NX", "EX", ttlSeconds);

  return result !== "OK";
}

export class InMemoryDeduplicationClient implements RedisDeduplicationClient {
  private readonly entries = new Map<string, number>();

  async set(
    key: string,
    value: string,
    mode: "NX",
    ttlMode: "EX",
    ttlSeconds: number,
  ): Promise<"OK" | null> {
    void value;
    void mode;
    void ttlMode;

    const now = Date.now();
    const existingExpiresAt = this.entries.get(key);

    if (existingExpiresAt && existingExpiresAt > now) {
      return null;
    }

    this.entries.set(key, now + ttlSeconds * 1000);

    if (this.entries.size > 1_000) {
      for (const [entryKey, expiresAt] of this.entries.entries()) {
        if (expiresAt <= now) {
          this.entries.delete(entryKey);
        }
      }
    }

    return "OK";
  }
}
