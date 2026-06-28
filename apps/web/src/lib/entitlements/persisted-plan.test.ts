import type { User } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import {
  evaluatePersistedServerFeatureGate,
  readPersistedPlanModelForUser,
  resolvePersistedServerEntitlementContext,
} from "./persisted-plan";

const mockCreateClient = vi.mocked(createClient);

function createUser(id = "11111111-1111-4111-8111-111111111111") {
  return { id } as Pick<User, "id">;
}

function mockPlanModelLookup(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));

  mockCreateClient.mockResolvedValue({
    from,
  } as never);

  return { eq, from, maybeSingle, select };
}

describe("persisted plan model entitlements", () => {
  it("reads the persisted plan model through a tenant-scoped select", async () => {
    const lookup = mockPlanModelLookup({
      data: {
        billing_status: "active",
        plan: "pro",
        source: "persisted_server_plan",
        updated_at: "2026-06-28T11:00:00.000Z",
        user_id: "11111111-1111-4111-8111-111111111111",
      },
      error: null,
    });

    await expect(readPersistedPlanModelForUser(createUser())).resolves.toEqual({
      billing_status: "active",
      plan: "pro",
      source: "persisted_server_plan",
      updated_at: "2026-06-28T11:00:00.000Z",
      user_id: "11111111-1111-4111-8111-111111111111",
    });

    expect(lookup.from).toHaveBeenCalledWith("user_plan_models");
    expect(lookup.select).toHaveBeenCalledWith(
      "billing_status, plan, source, updated_at, user_id",
    );
    expect(lookup.eq).toHaveBeenCalledWith(
      "user_id",
      "11111111-1111-4111-8111-111111111111",
    );
    expect(lookup.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it("uses the persisted table as a trusted source when a plan row exists", async () => {
    mockPlanModelLookup({
      data: {
        billing_status: "active",
        plan: "pro",
        source: "persisted_server_plan",
        updated_at: "2026-06-28T11:00:00.000Z",
        user_id: "22222222-2222-4222-8222-222222222222",
      },
      error: null,
    });

    await expect(
      resolvePersistedServerEntitlementContext({
        user: createUser("22222222-2222-4222-8222-222222222222"),
      }),
    ).resolves.toMatchObject({
      billingStatus: "active",
      hasPersistedPlanModel: true,
      hasTrustedPlanSource: true,
      normalizedPlan: "pro",
      source: "trusted_plan",
      sourceKind: "persisted_server_plan",
      sourceTrust: "trusted",
    });
  });

  it("falls back to free when no persisted row exists", async () => {
    mockPlanModelLookup({
      data: null,
      error: null,
    });

    await expect(
      resolvePersistedServerEntitlementContext({
        user: createUser("33333333-3333-4333-8333-333333333333"),
      }),
    ).resolves.toMatchObject({
      hasPersistedPlanModel: false,
      hasTrustedPlanSource: false,
      normalizedPlan: "free",
      source: "default_free_no_plan_source",
      sourceKind: "none",
    });
  });

  it("fails closed on read errors instead of unlocking premium access", async () => {
    mockPlanModelLookup({
      data: null,
      error: new Error("database unavailable"),
    });

    await expect(
      evaluatePersistedServerFeatureGate({
        feature: "branding_ai",
        user: createUser("44444444-4444-4444-8444-444444444444"),
      }),
    ).resolves.toMatchObject({
      allowed: false,
      context: {
        normalizedPlan: "free",
        source: "default_free_no_plan_source",
        sourceKind: "none",
      },
      feature: "branding_ai",
      reason: "plan_denied",
    });
  });

  it("keeps unknown persisted plans fail-closed even when the row exists", async () => {
    mockPlanModelLookup({
      data: {
        billing_status: "active",
        plan: "business",
        source: "persisted_server_plan",
        updated_at: "2026-06-28T11:00:00.000Z",
        user_id: "55555555-5555-4555-8555-555555555555",
      },
      error: null,
    });

    await expect(
      evaluatePersistedServerFeatureGate({
        feature: "publishing_schedule",
        user: createUser("55555555-5555-4555-8555-555555555555"),
      }),
    ).resolves.toMatchObject({
      allowed: false,
      context: {
        hasPersistedPlanModel: true,
        hasTrustedPlanSource: true,
        normalizedPlan: "free",
        source: "unknown_plan_fallback",
      },
      feature: "publishing_schedule",
      reason: "unknown_plan_fallback",
    });
  });
});
