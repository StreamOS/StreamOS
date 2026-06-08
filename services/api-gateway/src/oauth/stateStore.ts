import { timingSafeEqual } from "node:crypto";
import type { OAuthProvider } from "@streamos/types";
import { Redis } from "ioredis";

export type StoredOAuthState = {
  codeVerifier: string;
  creatorId: string;
  expiresAt: number;
  provider: OAuthProvider;
  returnTo?: string;
  state: string;
  userId: string;
};

export type OAuthStateStore = {
  consume(state: string): Promise<StoredOAuthState | null>;
  save(state: StoredOAuthState): Promise<void>;
};

export type RedisOAuthClient = Pick<Redis, "call" | "set">;

const OAUTH_STATE_KEY_PREFIX = "streamos:oauth:state:";

export function hasMatchingState(
  returnedState: string,
  storedState: string,
): boolean {
  const returnedBuffer = Buffer.from(returnedState);
  const storedBuffer = Buffer.from(storedState);

  return (
    returnedBuffer.byteLength === storedBuffer.byteLength &&
    timingSafeEqual(returnedBuffer, storedBuffer)
  );
}

export class MemoryOAuthStateStore implements OAuthStateStore {
  private readonly states = new Map<string, StoredOAuthState>();

  constructor(private readonly now: () => number = Date.now) {}

  async save(state: StoredOAuthState): Promise<void> {
    this.cleanupExpired(this.now());
    this.states.set(state.state, state);
  }

  async consume(state: string): Promise<StoredOAuthState | null> {
    const now = this.now();
    this.cleanupExpired(now);

    const storedState = this.states.get(state) ?? null;
    this.states.delete(state);

    if (!storedState || storedState.expiresAt <= now) {
      return null;
    }

    return storedState;
  }

  private cleanupExpired(now: number) {
    if (this.states.size < 100) {
      return;
    }

    for (const [key, state] of this.states.entries()) {
      if (state.expiresAt <= now) {
        this.states.delete(key);
      }
    }
  }
}

export class RedisOAuthStateStore implements OAuthStateStore {
  constructor(
    private readonly redis: RedisOAuthClient,
    private readonly now: () => number = Date.now,
  ) {}

  async save(state: StoredOAuthState): Promise<void> {
    const ttlMs = Math.max(state.expiresAt - this.now(), 1);

    await this.redis.set(
      getOAuthStateKey(state.state),
      JSON.stringify(state),
      "PX",
      ttlMs,
    );
  }

  async consume(state: string): Promise<StoredOAuthState | null> {
    const rawPayload = await this.redis.call("GETDEL", getOAuthStateKey(state));

    if (typeof rawPayload !== "string") {
      return null;
    }

    const storedState = parseStoredOAuthState(rawPayload);

    if (!storedState || storedState.expiresAt <= this.now()) {
      return null;
    }

    return storedState;
  }
}

export function createDefaultOAuthStateStore(
  now: () => number = Date.now,
): OAuthStateStore {
  const redisUrl = process.env.REDIS_URL?.trim();

  if (!redisUrl) {
    return new MemoryOAuthStateStore(now);
  }

  return new RedisOAuthStateStore(
    new Redis(redisUrl, {
      enableReadyCheck: true,
      lazyConnect: true,
      maxRetriesPerRequest: null,
    }),
    now,
  );
}

function getOAuthStateKey(state: string): string {
  return `${OAUTH_STATE_KEY_PREFIX}${state}`;
}

function parseStoredOAuthState(payload: string): StoredOAuthState | null {
  let parsed: Partial<StoredOAuthState>;

  try {
    parsed = JSON.parse(payload) as Partial<StoredOAuthState>;
  } catch {
    return null;
  }

  if (
    typeof parsed.codeVerifier !== "string" ||
    typeof parsed.creatorId !== "string" ||
    typeof parsed.expiresAt !== "number" ||
    !isOAuthProvider(parsed.provider) ||
    typeof parsed.state !== "string" ||
    typeof parsed.userId !== "string" ||
    (parsed.returnTo !== undefined && typeof parsed.returnTo !== "string")
  ) {
    return null;
  }

  return {
    codeVerifier: parsed.codeVerifier,
    creatorId: parsed.creatorId,
    expiresAt: parsed.expiresAt,
    provider: parsed.provider,
    returnTo: parsed.returnTo,
    state: parsed.state,
    userId: parsed.userId,
  };
}

function isOAuthProvider(value: unknown): value is OAuthProvider {
  return value === "youtube" || value === "tiktok" || value === "kick";
}
