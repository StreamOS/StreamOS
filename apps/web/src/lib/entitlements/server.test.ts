import type { User } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  evaluateServerFeatureGate,
  resolveServerEntitlementContext,
} from "./server";

function createUser(id = "11111111-1111-4111-8111-111111111111") {
  return { id } as Pick<User, "id">;
}

describe("server entitlements", () => {
  it("defaults to a fail-closed free context when no persisted plan model exists", () => {
    expect(
      resolveServerEntitlementContext({
        user: createUser(),
      }),
    ).toEqual({
      authenticated: true,
      hasPersistedPlanModel: false,
      normalizedPlan: "free",
      source: "default_free_no_persisted_plan",
      userId: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("accepts only trusted known plans and otherwise falls back to free", () => {
    expect(
      resolveServerEntitlementContext({
        trustedPlan: "pro",
        user: createUser("22222222-2222-4222-8222-222222222222"),
      }),
    ).toMatchObject({
      normalizedPlan: "pro",
      source: "trusted_server_input",
    });

    expect(
      resolveServerEntitlementContext({
        trustedPlan: "Business",
        user: createUser("33333333-3333-4333-8333-333333333333"),
      }),
    ).toMatchObject({
      normalizedPlan: "free",
      source: "unknown_plan_fallback",
    });
  });

  it("evaluates future premium gates server-side without enabling client-side unlocks", () => {
    expect(
      evaluateServerFeatureGate({
        feature: "publishing_schedule",
        trustedPlan: "pro",
        user: createUser(),
      }),
    ).toMatchObject({
      allowed: true,
      enforcedServerSide: true,
      feature: "publishing_schedule",
      normalizedPlan: "pro",
      reason: "allowed",
    });

    expect(
      evaluateServerFeatureGate({
        feature: "team_workspace",
        trustedPlan: "pro",
        user: createUser(),
      }),
    ).toMatchObject({
      allowed: false,
      enforcedServerSide: true,
      feature: "team_workspace",
      normalizedPlan: "pro",
      reason: "plan_denied",
    });

    expect(
      evaluateServerFeatureGate({
        feature: "ai_assistant",
        trustedPlan: "free",
        user: createUser(),
        ...({
          featureOverrides: ["ai_assistant"],
        } as Record<string, unknown>),
      } as never),
    ).toMatchObject({
      allowed: false,
      enforcedServerSide: true,
      feature: "ai_assistant",
      normalizedPlan: "free",
      reason: "plan_denied",
    });
  });

  it("fails closed for unknown features and does not leak secret-like or URL-like values", () => {
    const decision = evaluateServerFeatureGate({
      feature: "custom_ai_export",
      trustedPlan: "agency",
      user: null,
    });

    expect(decision).toMatchObject({
      allowed: false,
      enforcedServerSide: true,
      feature: null,
      normalizedPlan: "agency",
      reason: "unknown_feature",
    });

    const serialized = JSON.stringify(decision);
    expect(serialized).not.toContain("http://");
    expect(serialized).not.toContain("https://");
    expect(serialized).not.toContain("service_role");
    expect(serialized).not.toContain("token");
  });
});
