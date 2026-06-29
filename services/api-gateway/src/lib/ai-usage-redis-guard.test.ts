import { describe, expect, it } from "vitest";

import {
  buildGatewayAiUsageConcurrencyKey,
  buildGatewayAiUsageLimitDenialResponse,
  buildGatewayAiUsageLimitScopeKey,
  evaluateGatewayAiUsageRedisGuard,
  InMemoryGatewayAiUsageGuardStore,
  releaseGatewayAiUsageConcurrencyClaim,
  resolveGatewayAiUsageRedisGuardPolicies,
  type GatewayAiUsageRedisStore,
} from "./ai-usage-redis-guard.js";

const TENANT_ID = "tenant-123";
const TENANT_ID_TWO = "tenant-456";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID_TWO = "22222222-2222-4222-8222-222222222222";
const REQUEST_ID = "req-123";

describe("gateway AI usage Redis guard", () => {
  it("allows a request inside the configured burst limit", async () => {
    const decision = await evaluateGatewayAiUsageRedisGuard({
      feature: "ai_assistant",
      nowMs: 1_000,
      policies: createEnabledPolicies({
        burstLimit: 2,
      }),
      requestId: REQUEST_ID,
      store: new InMemoryGatewayAiUsageGuardStore(),
      tenantId: TENANT_ID,
      userId: USER_ID,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.reasonCode).toBe("allowed");
    expect(decision.burstCount).toBe(1);
    expect(decision.activeConcurrency).toBe(1);
  });

  it("denies when the burst limit is exceeded", async () => {
    const store = new InMemoryGatewayAiUsageGuardStore();
    const policies = createEnabledPolicies({
      burstLimit: 1,
      concurrencyLimit: 3,
    });

    const first = await evaluateGatewayAiUsageRedisGuard({
      feature: "ai_assistant",
      nowMs: 1_000,
      policies,
      requestId: REQUEST_ID,
      store,
      tenantId: TENANT_ID,
      userId: USER_ID,
    });
    const second = await evaluateGatewayAiUsageRedisGuard({
      feature: "ai_assistant",
      nowMs: 1_100,
      policies,
      requestId: "req-124",
      store,
      tenantId: TENANT_ID,
      userId: USER_ID,
    });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(false);
    expect(second.reasonCode).toBe("ai_usage_rate_limited");

    const denial = buildGatewayAiUsageLimitDenialResponse(second);
    expect(denial.statusCode).toBe(429);
    expect(denial.body).toEqual({
      error: "ai_usage_forbidden",
      feature: "ai_assistant",
      message: "AI usage burst protection denied the request.",
      reason_code: "ai_usage_rate_limited",
    });
  });

  it("denies when the concurrency limit is exceeded and allows again after release", async () => {
    const store = new InMemoryGatewayAiUsageGuardStore();
    const policies = createEnabledPolicies({
      burstLimit: 5,
      concurrencyLimit: 1,
    });

    const first = await evaluateGatewayAiUsageRedisGuard({
      feature: "ai_assistant",
      nowMs: 1_000,
      policies,
      requestId: REQUEST_ID,
      store,
      tenantId: TENANT_ID,
      userId: USER_ID,
    });
    const second = await evaluateGatewayAiUsageRedisGuard({
      feature: "ai_assistant",
      nowMs: 1_050,
      policies,
      requestId: "req-124",
      store,
      tenantId: TENANT_ID,
      userId: USER_ID,
    });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(false);
    expect(second.reasonCode).toBe("ai_usage_concurrency_limited");
    expect(second.activeConcurrency).toBe(1);

    const released = await releaseGatewayAiUsageConcurrencyClaim({
      feature: "ai_assistant",
      nowMs: 1_060,
      requestId: REQUEST_ID,
      store,
      tenantId: TENANT_ID,
      userId: USER_ID,
    });

    expect(released).toEqual({
      reasonCode: "released",
      released: true,
      remainingConcurrency: 0,
    });

    const third = await evaluateGatewayAiUsageRedisGuard({
      feature: "ai_assistant",
      nowMs: 1_070,
      policies,
      requestId: "req-125",
      store,
      tenantId: TENANT_ID,
      userId: USER_ID,
    });

    expect(third.allowed).toBe(true);
    expect(third.activeConcurrency).toBe(1);
  });

  it("keeps tenant and user scopes separated in keys and counters", async () => {
    const store = new InMemoryGatewayAiUsageGuardStore();
    const policies = createEnabledPolicies({
      burstLimit: 1,
      concurrencyLimit: 1,
    });

    const firstTenant = await evaluateGatewayAiUsageRedisGuard({
      feature: "ai_assistant",
      nowMs: 2_000,
      policies,
      requestId: REQUEST_ID,
      store,
      tenantId: TENANT_ID,
      userId: USER_ID,
    });
    const secondTenant = await evaluateGatewayAiUsageRedisGuard({
      feature: "ai_assistant",
      nowMs: 2_010,
      policies,
      requestId: REQUEST_ID,
      store,
      tenantId: TENANT_ID_TWO,
      userId: USER_ID,
    });
    const secondUser = await evaluateGatewayAiUsageRedisGuard({
      feature: "ai_assistant",
      nowMs: 2_020,
      policies,
      requestId: REQUEST_ID,
      store,
      tenantId: TENANT_ID,
      userId: USER_ID_TWO,
    });

    expect(firstTenant.allowed).toBe(true);
    expect(secondTenant.allowed).toBe(true);
    expect(secondUser.allowed).toBe(true);

    expect(
      buildGatewayAiUsageLimitScopeKey({
        feature: "ai_assistant",
        tenantId: TENANT_ID,
        userId: USER_ID,
      }),
    ).toContain(":ai_assistant:");
    expect(
      buildGatewayAiUsageConcurrencyKey({
        feature: "ai_assistant",
        tenantId: TENANT_ID,
        userId: USER_ID,
      }),
    ).not.toBe(
      buildGatewayAiUsageConcurrencyKey({
        feature: "ai_assistant",
        tenantId: TENANT_ID_TWO,
        userId: USER_ID,
      }),
    );
    expect(
      buildGatewayAiUsageConcurrencyKey({
        feature: "ai_assistant",
        tenantId: TENANT_ID,
        userId: USER_ID,
      }),
    ).not.toBe(
      buildGatewayAiUsageConcurrencyKey({
        feature: "ai_assistant",
        tenantId: TENANT_ID,
        userId: USER_ID_TWO,
      }),
    );
  });

  it("fails closed when Redis protection is unavailable in active enforced mode", async () => {
    const decision = await evaluateGatewayAiUsageRedisGuard({
      feature: "ai_assistant",
      nowMs: 3_000,
      policies: createEnabledPolicies(),
      requestId: REQUEST_ID,
      store: null,
      tenantId: TENANT_ID,
      userId: USER_ID,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe("ai_usage_limit_unavailable");

    const denial = buildGatewayAiUsageLimitDenialResponse(decision);
    expect(denial.statusCode).toBe(503);
    expect(denial.body).toEqual({
      error: "ai_usage_limit_unavailable",
      feature: "ai_assistant",
      message: "AI usage protection is temporarily unavailable.",
      reason_code: "ai_usage_limit_unavailable",
    });
  });

  it("keeps secret-like Redis failures out of denial responses", async () => {
    const store: GatewayAiUsageRedisStore = {
      async claimBurst() {
        throw new Error(
          "rediss://default:secret@private.example.com and https://private.example.com?token=sk-secret",
        );
      },
      async claimConcurrency() {
        return { activeCount: 0, allowed: true };
      },
      async releaseConcurrency() {
        return { released: true, remainingCount: 0 };
      },
    };

    const decision = await evaluateGatewayAiUsageRedisGuard({
      feature: "ai_assistant",
      nowMs: 4_000,
      policies: createEnabledPolicies(),
      requestId: REQUEST_ID,
      store,
      tenantId: TENANT_ID,
      userId: USER_ID,
    });
    const denial = buildGatewayAiUsageLimitDenialResponse(decision);
    const serialized = JSON.stringify(denial.body);

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe("ai_usage_limit_unavailable");
    expect(serialized).not.toContain("private.example.com");
    expect(serialized).not.toContain("sk-secret");
    expect(serialized).not.toContain("rediss://");
  });
});

function createEnabledPolicies(
  overrides: Partial<{
    burstLimit: number;
    burstWindowMs: number;
    concurrencyLimit: number;
    concurrencyTtlMs: number;
  }> = {},
) {
  return resolveGatewayAiUsageRedisGuardPolicies({
    ai_assistant: {
      burstLimit: overrides.burstLimit,
      burstWindowMs: overrides.burstWindowMs,
      concurrencyLimit: overrides.concurrencyLimit,
      concurrencyTtlMs: overrides.concurrencyTtlMs,
      mode: "enforced",
      runtimeStatus: "active",
    },
  });
}
