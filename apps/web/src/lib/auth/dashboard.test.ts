import type { User } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  hasCompletedProfileBootstrap,
  isSupabaseEmailConfirmed,
  toDashboardAuthUser,
} from "./dashboard";

function createUser(overrides: Partial<User>): User {
  return {
    app_metadata: {},
    aud: "authenticated",
    created_at: "2026-06-06T10:00:00.000Z",
    id: "11111111-1111-4111-8111-111111111111",
    user_metadata: {},
    ...overrides,
  } as User;
}

describe("dashboard auth guards", () => {
  it("treats users with confirmed email timestamps as confirmed", () => {
    expect(
      isSupabaseEmailConfirmed(
        createUser({
          email: "creator@example.com",
          email_confirmed_at: "2026-06-06T10:01:00.000Z",
        }),
      ),
    ).toBe(true);
  });

  it("detects unconfirmed email users", () => {
    expect(
      isSupabaseEmailConfirmed(
        createUser({
          confirmed_at: undefined,
          email: "creator@example.com",
          email_confirmed_at: undefined,
        }),
      ),
    ).toBe(false);
  });

  it("reads profile_created only as a strict boolean", () => {
    expect(
      hasCompletedProfileBootstrap(
        createUser({ user_metadata: { profile_created: true } }),
      ),
    ).toBe(true);
    expect(
      hasCompletedProfileBootstrap(
        createUser({ user_metadata: { profile_created: "true" } }),
      ),
    ).toBe(false);
  });

  it("serializes a Supabase user into the dashboard auth context shape", () => {
    expect(
      toDashboardAuthUser(
        createUser({
          email: "creator@example.com",
          email_confirmed_at: "2026-06-06T10:01:00.000Z",
          user_metadata: { profile_created: true },
        }),
      ),
    ).toEqual({
      email: "creator@example.com",
      emailConfirmedAt: "2026-06-06T10:01:00.000Z",
      id: "11111111-1111-4111-8111-111111111111",
      profileCreated: true,
    });
  });
});
