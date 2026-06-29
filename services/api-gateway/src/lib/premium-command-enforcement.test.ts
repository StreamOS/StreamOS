import { describe, expect, it } from "vitest";

import {
  authorizeGatewayPremiumCommand,
  buildGatewayPremiumCommandDenialResponse,
  resolveGatewayPremiumCommandPolicies,
} from "./premium-command-enforcement.js";
import type { SupabaseRestClient } from "./supabaseRest.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";

describe("gateway premium command enforcement", () => {
  it("allows an enforced schedule mutation for a trusted pro plan", async () => {
    const decision = await authorizeGatewayPremiumCommand({
      commandKey: "publication_schedule_mutation",
      policies: resolveGatewayPremiumCommandPolicies({
        publication_schedule_mutation: {
          feature: "publishing_schedule",
          mode: "enforced",
        },
      }),
      supabase: createSupabaseClient([
        {
          billing_status: "active",
          plan: "pro",
          source: "persisted_server_plan",
          user_id: USER_ID,
        },
      ]),
      userId: USER_ID,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.feature).toBe("publishing_schedule");
    expect(decision.normalizedPlan).toBe("pro");
    expect(decision.planSource).toBe("persisted_server_plan");
    expect(decision.reasonCode).toBe("allowed");
  });

  it("denies an enforced schedule mutation when no trusted plan context exists", async () => {
    const decision = await authorizeGatewayPremiumCommand({
      commandKey: "publication_schedule_mutation",
      policies: resolveGatewayPremiumCommandPolicies({
        publication_schedule_mutation: {
          feature: "publishing_schedule",
          mode: "enforced",
        },
      }),
      supabase: createSupabaseClient([]),
      userId: USER_ID,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe("premium_command_plan_required");

    const denial = buildGatewayPremiumCommandDenialResponse(decision);
    expect(denial.statusCode).toBe(403);
    expect(denial.body).toMatchObject({
      command_key: "publication_schedule_mutation",
      error: "premium_command_forbidden",
      feature: "publishing_schedule",
      reason_code: "premium_command_plan_required",
    });
  });

  it("denies an enforced command when the configured feature key is invalid", async () => {
    const decision = await authorizeGatewayPremiumCommand({
      commandKey: "publication_schedule_mutation",
      policies: resolveGatewayPremiumCommandPolicies({
        publication_schedule_mutation: {
          feature: "publishing_schedule_wrong",
          mode: "enforced",
        },
      }),
      supabase: createSupabaseClient([
        {
          billing_status: "active",
          plan: "pro",
          source: "persisted_server_plan",
          user_id: USER_ID,
        },
      ]),
      userId: USER_ID,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.feature).toBeNull();
    expect(decision.reasonCode).toBe("premium_command_feature_not_allowed");
  });

  it("denies a free plan for an enforced premium schedule command", async () => {
    const decision = await authorizeGatewayPremiumCommand({
      commandKey: "fanout_schedule_mutation",
      policies: resolveGatewayPremiumCommandPolicies({
        fanout_schedule_mutation: {
          feature: "publishing_schedule",
          mode: "enforced",
        },
      }),
      supabase: createSupabaseClient([
        {
          billing_status: "active",
          plan: "free",
          source: "persisted_server_plan",
          user_id: USER_ID,
        },
      ]),
      userId: USER_ID,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.feature).toBe("publishing_schedule");
    expect(decision.reasonCode).toBe("premium_command_plan_denied");
  });
});

function createSupabaseClient(
  rows: Array<{
    billing_status: string | null;
    plan: string;
    source: string;
    user_id: string;
  }>,
): SupabaseRestClient {
  return {
    fetchImpl: async () =>
      new Response(JSON.stringify(rows), {
        headers: {
          "Content-Type": "application/json",
        },
        status: 200,
      }),
    serviceRoleKey: "test-service-role-key",
    supabaseUrl: "https://supabase.streamos.test",
  };
}
