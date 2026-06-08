import { describe, expect, it } from "vitest";

import {
  RedisOAuthStateStore,
  type RedisOAuthClient,
  type StoredOAuthState,
} from "./stateStore.js";

const NOW = new Date("2026-06-06T10:00:00.000Z").getTime();
const STATE_KEY_PREFIX = "streamos:oauth:state:";

class InMemoryRedisClient {
  readonly setCalls: Array<{
    key: string;
    ttlMs: number;
    value: string;
  }> = [];

  private readonly values = new Map<string, string>();

  async set(
    key: string,
    value: string,
    expiryMode: string,
    ttlMs: number,
  ): Promise<"OK"> {
    expect(expiryMode).toBe("PX");

    this.values.set(key, value);
    this.setCalls.push({ key, ttlMs, value });

    return "OK";
  }

  async call(command: string, key: string): Promise<string | null> {
    expect(command).toBe("GETDEL");

    const value = this.values.get(key) ?? null;
    this.values.delete(key);

    return value;
  }

  seed(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function createState(overrides: Partial<StoredOAuthState> = {}) {
  return {
    codeVerifier: "pkce-verifier",
    creatorId: "22222222-2222-4222-8222-222222222222",
    expiresAt: NOW + 60_000,
    provider: "tiktok",
    returnTo: "/dashboard/platforms",
    state: "oauth-state",
    userId: "11111111-1111-4111-8111-111111111111",
    ...overrides,
  } satisfies StoredOAuthState;
}

function createStore({
  now = () => NOW,
  redis = new InMemoryRedisClient(),
}: {
  now?: () => number;
  redis?: InMemoryRedisClient;
} = {}) {
  return {
    redis,
    store: new RedisOAuthStateStore(redis as unknown as RedisOAuthClient, now),
  };
}

describe("RedisOAuthStateStore", () => {
  it("stores state with a Redis TTL and consumes it once", async () => {
    const { redis, store } = createStore();
    const state = createState();

    await store.save(state);
    const consumedState = await store.consume(state.state);
    const replayState = await store.consume(state.state);

    expect(redis.setCalls).toEqual([
      {
        key: `${STATE_KEY_PREFIX}${state.state}`,
        ttlMs: 60_000,
        value: JSON.stringify(state),
      },
    ]);
    expect(consumedState).toEqual(state);
    expect(replayState).toBeNull();
  });

  it("clamps Redis TTL to at least one millisecond", async () => {
    const { redis, store } = createStore();
    const state = createState({ expiresAt: NOW - 1 });

    await store.save(state);

    expect(redis.setCalls[0]?.ttlMs).toBe(1);
  });

  it("rejects expired stored state after GETDEL", async () => {
    const { store } = createStore();
    const state = createState({ expiresAt: NOW - 1 });

    await store.save(state);

    await expect(store.consume(state.state)).resolves.toBeNull();
  });

  it("rejects malformed stored state payloads", async () => {
    const { redis, store } = createStore();

    redis.seed(`${STATE_KEY_PREFIX}malformed`, "{");

    await expect(store.consume("malformed")).resolves.toBeNull();
  });
});
