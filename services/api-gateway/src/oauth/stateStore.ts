import { timingSafeEqual } from "node:crypto";
import type { OAuthProvider } from "@streamos/types";

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
