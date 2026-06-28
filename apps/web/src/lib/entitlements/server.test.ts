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
      billingStatus: null,
      hasPersistedPlanModel: false,
      hasTrustedPlanSource: false,
      normalizedPlan: "free",
      source: "default_free_no_plan_source",
      sourceKind: "none",
      sourceTrust: "none",
      userId: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("accepts only explicit trusted server sources and otherwise falls back to free", () => {
    expect(
      resolveServerEntitlementContext({
        billingStatus: "active",
        trustedPlan: "pro",
        trustedSource: "persisted_server_plan",
        user: createUser("22222222-2222-4222-8222-222222222222"),
      }),
    ).toMatchObject({
      billingStatus: "active",
      hasPersistedPlanModel: true,
      hasTrustedPlanSource: true,
      normalizedPlan: "pro",
      source: "trusted_plan",
      sourceKind: "persisted_server_plan",
      sourceTrust: "trusted",
    });

    expect(
      resolveServerEntitlementContext({
        trustedPlan: "Business",
        trustedSource: "server_verified_billing",
        user: createUser("33333333-3333-4333-8333-333333333333"),
      }),
    ).toMatchObject({
      normalizedPlan: "free",
      source: "unknown_plan_fallback",
    });

    expect(
      resolveServerEntitlementContext({
        trustedPlan: "agency",
        user: createUser("44444444-4444-4444-8444-444444444444"),
      }),
    ).toMatchObject({
      normalizedPlan: "free",
      source: "default_free_no_plan_source",
      sourceKind: "none",
      sourceTrust: "none",
    });
  });

  it("evaluates future premium gates server-side without enabling client-side unlocks", () => {
    expect(
      evaluateServerFeatureGate({
        feature: "publishing_schedule",
        trustedPlan: "pro",
        trustedSource: "persisted_server_plan",
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
        trustedSource: "persisted_server_plan",
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
        trustedSource: "persisted_server_plan",
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

  it("does not treat client-like plan hints as trusted premium evidence", () => {
    expect(
      evaluateServerFeatureGate({
        feature: "branding_ai",
        trustedPlan: "agency",
        user: createUser(),
      }),
    ).toMatchObject({
      allowed: false,
      context: {
        normalizedPlan: "free",
        source: "default_free_no_plan_source",
        sourceKind: "none",
      },
      enforcedServerSide: true,
      feature: "branding_ai",
      reason: "plan_denied",
    });
  });

  it("fails closed for unknown features and does not leak secret-like or URL-like values", () => {
    const decision = evaluateServerFeatureGate({
      feature: "custom_ai_export",
      trustedPlan: "agency",
      trustedSource: "server_verified_billing",
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
