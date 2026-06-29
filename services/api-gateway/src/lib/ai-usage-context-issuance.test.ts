import { describe, expect, it } from "vitest";

import {
  resolveGatewayAiUsageAdmissionPolicies,
  type GatewayAiUsageAdmissionDecision,
} from "./ai-usage-admission.js";
import {
  InMemoryGatewayAiUsageGuardStore,
  resolveGatewayAiUsageRedisGuardPolicies,
} from "./ai-usage-redis-guard.js";
import {
  createGatewayAiUsageContext,
  issueGatewayAiUsageContext,
  serializeGatewayAiUsageContext,
  signGatewayAiUsageContext,
  verifyGatewayAiUsageContextSignature,
  DEFAULT_GATEWAY_AI_USAGE_CONTEXT_TTL_SECONDS,
} from "./ai-usage-context-issuance.js";
import { resolveAutomationEntitlementAssertionSigningConfig } from "./automation-entitlement-signing.js";

const SIGNING_SECRET = "a".repeat(32);
const TENANT_ID = "tenant-123";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const REQUEST_ID = "req-123";

describe("gateway AI usage context issuance", () => {
  it("issues a signed short-lived context for a valid test-only pro request", async () => {
    const issued = await issueGatewayAiUsageContext({
      admissionPolicies: createActiveAdmissionPolicies(),
      estimatedUsageUnits: 12,
      feature: "ai_assistant",
      limitPolicies: createEnabledLimitPolicies(),
      now: "2026-06-29T22:00:00.000Z",
      plan: "pro",
      planSource: "persisted_server_plan",
      redisStore: new InMemoryGatewayAiUsageGuardStore(),
      requestClassification: "assistant_prompt",
      requestId: REQUEST_ID,
      reserveLedgerEntry: async (input) => ({
        createdAt: "2026-06-29T22:00:00.000Z",
        errorCategory: null,
        estimatedUsageUnits: input.estimatedUsageUnits,
        feature: input.feature,
        finalUsageUnits: null,
        id: "11111111-1111-4111-8111-111111111119",
        ledgerStatus: "reserved",
        planAtRequestTime: input.planAtRequestTime,
        planSource: input.planSource,
        requestClassification: input.requestClassification,
        requestId: input.requestId,
        tenantId: input.tenantId,
        updatedAt: "2026-06-29T22:00:00.000Z",
        usageMonth: "2026-06-01",
        userId: input.userId,
      }),
      signingConfig: resolveAutomationEntitlementAssertionSigningConfig({
        mode: "hmac_sha256",
        secret: SIGNING_SECRET,
      }),
      tenantId: TENANT_ID,
      userId: USER_ID,
    });

    expect(issued.allowed).toBe(true);
    expect(issued.reasonCode).toBe("ai_usage_context_issued");
    expect(issued.ledgerEntry?.requestId).toBe(REQUEST_ID);
    expect(issued.signedContext).toMatchObject({
      admission_decision: "allow",
      audience: "automation-service",
      budget_status: "within_budget",
      estimated_usage_units: 12,
      feature: "ai_assistant",
      issuer: "api-gateway",
      plan_at_request_time: "pro",
      plan_source: "persisted_server_plan",
      purpose: "ai_usage_budget_admission",
      request_classification: "assistant_prompt",
      request_id: REQUEST_ID,
      signing_mode: "hmac_sha256",
      tenant_id: TENANT_ID,
      user_id: USER_ID,
    });
    expect(issued.signedContext?.signature).toHaveLength(64);
    expect(
      verifyGatewayAiUsageContextSignature({
        context: issued.signedContext!,
        secret: SIGNING_SECRET,
        signature: issued.signedContext?.signature,
      }),
    ).toBe(true);

    const issuedAtMs = Date.parse(issued.signedContext!.issued_at);
    const expiresAtMs = Date.parse(issued.signedContext!.expires_at);
    expect((expiresAtMs - issuedAtMs) / 1000).toBe(
      DEFAULT_GATEWAY_AI_USAGE_CONTEXT_TTL_SECONDS,
    );
  });

  it("does not issue a context when admission is denied", async () => {
    const issued = await issueGatewayAiUsageContext({
      admissionPolicies: createActiveAdmissionPolicies(),
      estimatedUsageUnits: 12,
      feature: "ai_assistant",
      limitPolicies: createEnabledLimitPolicies(),
      now: 1_000,
      plan: "free",
      planSource: "persisted_server_plan",
      redisStore: new InMemoryGatewayAiUsageGuardStore(),
      requestClassification: "assistant_prompt",
      requestId: REQUEST_ID,
      signingConfig: resolveAutomationEntitlementAssertionSigningConfig({
        mode: "hmac_sha256",
        secret: SIGNING_SECRET,
      }),
      tenantId: TENANT_ID,
      userId: USER_ID,
    });

    expect(issued.allowed).toBe(false);
    expect(issued.reasonCode).toBe("ai_usage_admission_denied");
    expect(issued.limitDecision).toBeNull();
    expect(issued.ledgerEntry).toBeNull();
    expect(issued.signedContext).toBeNull();
  });

  it("does not issue a context when the redis burst limit denies the request", async () => {
    const store = new InMemoryGatewayAiUsageGuardStore();
    const first = await issueGatewayAiUsageContext({
      admissionPolicies: createActiveAdmissionPolicies(),
      estimatedUsageUnits: 12,
      feature: "ai_assistant",
      limitPolicies: createEnabledLimitPolicies({ burstLimit: 1 }),
      now: 1_000,
      plan: "pro",
      planSource: "persisted_server_plan",
      redisStore: store,
      requestClassification: "assistant_prompt",
      requestId: REQUEST_ID,
      reserveLedgerEntry: async () => reservedLedgerRow(),
      signingConfig: resolveAutomationEntitlementAssertionSigningConfig({
        mode: "hmac_sha256",
        secret: SIGNING_SECRET,
      }),
      tenantId: TENANT_ID,
      userId: USER_ID,
    });
    const denied = await issueGatewayAiUsageContext({
      admissionPolicies: createActiveAdmissionPolicies(),
      estimatedUsageUnits: 12,
      feature: "ai_assistant",
      limitPolicies: createEnabledLimitPolicies({ burstLimit: 1 }),
      now: 1_010,
      plan: "pro",
      planSource: "persisted_server_plan",
      redisStore: store,
      requestClassification: "assistant_prompt",
      requestId: "req-124",
      reserveLedgerEntry: async () => reservedLedgerRow(),
      signingConfig: resolveAutomationEntitlementAssertionSigningConfig({
        mode: "hmac_sha256",
        secret: SIGNING_SECRET,
      }),
      tenantId: TENANT_ID,
      userId: USER_ID,
    });

    expect(first.allowed).toBe(true);
    expect(denied.allowed).toBe(false);
    expect(denied.reasonCode).toBe("ai_usage_limit_denied");
    expect(denied.limitDecision?.reasonCode).toBe("ai_usage_rate_limited");
    expect(denied.ledgerEntry).toBeNull();
    expect(denied.signedContext).toBeNull();
  });

  it("does not issue a context when the redis concurrency limit denies the request", async () => {
    const store = new InMemoryGatewayAiUsageGuardStore();
    const first = await issueGatewayAiUsageContext({
      admissionPolicies: createActiveAdmissionPolicies(),
      estimatedUsageUnits: 12,
      feature: "ai_assistant",
      limitPolicies: createEnabledLimitPolicies({ concurrencyLimit: 1 }),
      now: 1_000,
      plan: "pro",
      planSource: "persisted_server_plan",
      redisStore: store,
      requestClassification: "assistant_prompt",
      requestId: REQUEST_ID,
      reserveLedgerEntry: async () => reservedLedgerRow(),
      signingConfig: resolveAutomationEntitlementAssertionSigningConfig({
        mode: "hmac_sha256",
        secret: SIGNING_SECRET,
      }),
      tenantId: TENANT_ID,
      userId: USER_ID,
    });
    const denied = await issueGatewayAiUsageContext({
      admissionPolicies: createActiveAdmissionPolicies(),
      estimatedUsageUnits: 12,
      feature: "ai_assistant",
      limitPolicies: createEnabledLimitPolicies({ concurrencyLimit: 1 }),
      now: 1_010,
      plan: "pro",
      planSource: "persisted_server_plan",
      redisStore: store,
      requestClassification: "assistant_prompt",
      requestId: "req-124",
      reserveLedgerEntry: async () => reservedLedgerRow(),
      signingConfig: resolveAutomationEntitlementAssertionSigningConfig({
        mode: "hmac_sha256",
        secret: SIGNING_SECRET,
      }),
      tenantId: TENANT_ID,
      userId: USER_ID,
    });

    expect(first.allowed).toBe(true);
    expect(denied.allowed).toBe(false);
    expect(denied.reasonCode).toBe("ai_usage_limit_denied");
    expect(denied.limitDecision?.reasonCode).toBe(
      "ai_usage_concurrency_limited",
    );
    expect(denied.signedContext).toBeNull();
  });

  it("does not issue a context when ledger reservation fails", async () => {
    const store = new InMemoryGatewayAiUsageGuardStore();
    const issued = await issueGatewayAiUsageContext({
      admissionPolicies: createActiveAdmissionPolicies(),
      estimatedUsageUnits: 12,
      feature: "ai_assistant",
      limitPolicies: createEnabledLimitPolicies({ concurrencyLimit: 1 }),
      now: 1_000,
      plan: "pro",
      planSource: "persisted_server_plan",
      redisStore: store,
      requestClassification: "assistant_prompt",
      requestId: REQUEST_ID,
      reserveLedgerEntry: async () => {
        throw new Error(
          "https://private.example.com/reservations?token=sk-secret",
        );
      },
      signingConfig: resolveAutomationEntitlementAssertionSigningConfig({
        mode: "hmac_sha256",
        secret: SIGNING_SECRET,
      }),
      tenantId: TENANT_ID,
      userId: USER_ID,
    });
    const retried = await issueGatewayAiUsageContext({
      admissionPolicies: createActiveAdmissionPolicies(),
      estimatedUsageUnits: 12,
      feature: "ai_assistant",
      limitPolicies: createEnabledLimitPolicies({ concurrencyLimit: 1 }),
      now: 1_010,
      plan: "pro",
      planSource: "persisted_server_plan",
      redisStore: store,
      requestClassification: "assistant_prompt",
      requestId: "req-124",
      reserveLedgerEntry: async () => reservedLedgerRow(),
      signingConfig: resolveAutomationEntitlementAssertionSigningConfig({
        mode: "hmac_sha256",
        secret: SIGNING_SECRET,
      }),
      tenantId: TENANT_ID,
      userId: USER_ID,
    });

    expect(issued.allowed).toBe(false);
    expect(issued.reasonCode).toBe("ai_usage_budget_reservation_failed");
    expect(issued.signedContext).toBeNull();
    expect(retried.allowed).toBe(true);
  });

  it("does not issue a context when tenant, user, or request context is missing", async () => {
    const issued = await issueGatewayAiUsageContext({
      admissionPolicies: createActiveAdmissionPolicies(),
      estimatedUsageUnits: 12,
      feature: "ai_assistant",
      limitPolicies: createEnabledLimitPolicies(),
      plan: "pro",
      planSource: "persisted_server_plan",
      redisStore: new InMemoryGatewayAiUsageGuardStore(),
      requestClassification: "assistant_prompt",
      requestId: "",
      signingConfig: resolveAutomationEntitlementAssertionSigningConfig({
        mode: "hmac_sha256",
        secret: SIGNING_SECRET,
      }),
      tenantId: TENANT_ID,
      userId: USER_ID,
    });

    expect(issued.allowed).toBe(false);
    expect(issued.reasonCode).toBe("ai_usage_context_not_issued");
    expect(issued.signedContext).toBeNull();
  });

  it("does not issue a context when the plan source is untrusted", async () => {
    const issued = await issueGatewayAiUsageContext({
      admissionPolicies: createActiveAdmissionPolicies(),
      estimatedUsageUnits: 12,
      feature: "ai_assistant",
      limitPolicies: createEnabledLimitPolicies(),
      plan: "pro",
      planSource: "ui_badge",
      redisStore: new InMemoryGatewayAiUsageGuardStore(),
      requestClassification: "assistant_prompt",
      requestId: REQUEST_ID,
      signingConfig: resolveAutomationEntitlementAssertionSigningConfig({
        mode: "hmac_sha256",
        secret: SIGNING_SECRET,
      }),
      tenantId: TENANT_ID,
      userId: USER_ID,
    });

    expect(issued.allowed).toBe(false);
    expect(issued.reasonCode).toBe("ai_usage_admission_denied");
    expect(issued.signedContext).toBeNull();
  });

  it("does not sign prompts, context payloads, model responses, urls, or secrets into the issued context", async () => {
    const issued = await issueGatewayAiUsageContext({
      admissionPolicies: createActiveAdmissionPolicies(),
      estimatedUsageUnits: 12,
      feature: "ai_assistant",
      limitPolicies: createEnabledLimitPolicies(),
      now: "2026-06-29T22:00:00.000Z",
      plan: "pro",
      planSource: "persisted_server_plan",
      redisStore: new InMemoryGatewayAiUsageGuardStore(),
      requestClassification: "assistant_prompt",
      requestId: REQUEST_ID,
      reserveLedgerEntry: async () => reservedLedgerRow(),
      signingConfig: resolveAutomationEntitlementAssertionSigningConfig({
        mode: "hmac_sha256",
        secret: SIGNING_SECRET,
      }),
      tenantId: TENANT_ID,
      userId: USER_ID,
    });

    const serialized = JSON.stringify(issued.signedContext);
    expect(serialized).not.toContain("private prompt");
    expect(serialized).not.toContain("resolved_context");
    expect(serialized).not.toContain("model_response");
    expect(serialized).not.toContain("private.example.com");
    expect(serialized).not.toContain("sk-secret");
  });

  it("keeps repeated issuance deterministic and request_id-bound for idempotent callers", async () => {
    const store = new InMemoryGatewayAiUsageGuardStore();
    const first = await issueGatewayAiUsageContext({
      admissionPolicies: createActiveAdmissionPolicies(),
      estimatedUsageUnits: 12,
      feature: "ai_assistant",
      limitPolicies: createEnabledLimitPolicies({ burstLimit: 5 }),
      now: "2026-06-29T22:00:00.000Z",
      plan: "pro",
      planSource: "persisted_server_plan",
      redisStore: store,
      requestClassification: "assistant_prompt",
      requestId: REQUEST_ID,
      reserveLedgerEntry: async (input) => reservedLedgerRow(input.requestId),
      signingConfig: resolveAutomationEntitlementAssertionSigningConfig({
        mode: "hmac_sha256",
        secret: SIGNING_SECRET,
      }),
      tenantId: TENANT_ID,
      userId: USER_ID,
    });
    const second = await issueGatewayAiUsageContext({
      admissionPolicies: createActiveAdmissionPolicies(),
      estimatedUsageUnits: 12,
      feature: "ai_assistant",
      limitPolicies: createEnabledLimitPolicies({ burstLimit: 5 }),
      now: "2026-06-29T22:00:00.000Z",
      plan: "pro",
      planSource: "persisted_server_plan",
      redisStore: store,
      requestClassification: "assistant_prompt",
      requestId: REQUEST_ID,
      reserveLedgerEntry: async (input) => reservedLedgerRow(input.requestId),
      signingConfig: resolveAutomationEntitlementAssertionSigningConfig({
        mode: "hmac_sha256",
        secret: SIGNING_SECRET,
      }),
      tenantId: TENANT_ID,
      userId: USER_ID,
    });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(first.signedContext?.request_id).toBe(REQUEST_ID);
    expect(second.signedContext?.request_id).toBe(REQUEST_ID);
    expect(second.signedContext?.signature).toBe(
      first.signedContext?.signature,
    );
  });

  it("serializes the usage context canonically and verifies signatures", () => {
    const admissionDecision = {
      allowed: true,
      budgetContext: {
        contractVersion: "2026-06-29.ai-usage-admission.v1" as const,
        estimatedUsageUnits: 12,
        feature: "ai_assistant" as const,
        normalizedPlan: "pro" as const,
        requestClassification: "assistant_prompt",
        tenantId: TENANT_ID,
        userId: USER_ID,
      },
      feature: "ai_assistant" as const,
      normalizedPlan: "pro" as const,
      planSource: "persisted_server_plan" as const,
      policyBudgetMode: "stubbed_allow" as const,
      policyRuntimeStatus: "active" as const,
      reasonCode: "allowed" as const,
      requestedFeature: "ai_assistant",
      tenantId: TENANT_ID,
      userId: USER_ID,
    } satisfies GatewayAiUsageAdmissionDecision & {
      allowed: true;
      feature: "ai_assistant";
      planSource: "persisted_server_plan";
      tenantId: string;
      userId: string;
      budgetContext: NonNullable<
        GatewayAiUsageAdmissionDecision["budgetContext"]
      >;
    };

    const context = createGatewayAiUsageContext({
      admissionDecision,
      now: "2026-06-29T22:00:00.000Z",
      requestId: REQUEST_ID,
      ttlSeconds: 90,
    });
    const signed = signGatewayAiUsageContext({
      context,
      secret: SIGNING_SECRET,
    });

    expect(serializeGatewayAiUsageContext(context)).toBe(
      '{"audience":"automation-service","estimated_usage_units":12,"expires_at":"2026-06-29T22:01:30.000Z","feature":"ai_assistant","issued_at":"2026-06-29T22:00:00.000Z","issuer":"api-gateway","plan_at_request_time":"pro","plan_source":"persisted_server_plan","request_classification":"assistant_prompt","request_id":"req-123","tenant_id":"tenant-123","user_id":"11111111-1111-4111-8111-111111111111","purpose":"ai_usage_budget_admission","admission_decision":"allow","budget_status":"within_budget"}',
    );
    expect(
      verifyGatewayAiUsageContextSignature({
        context,
        secret: SIGNING_SECRET,
        signature: signed.signature,
      }),
    ).toBe(true);
    expect(
      verifyGatewayAiUsageContextSignature({
        context,
        secret: SIGNING_SECRET,
        signature: "bad-signature",
      }),
    ).toBe(false);
  });
});

function createActiveAdmissionPolicies() {
  return resolveGatewayAiUsageAdmissionPolicies({
    ai_assistant: {
      budgetMode: "stubbed_allow",
      runtimeStatus: "active",
    },
  });
}

function createEnabledLimitPolicies(
  overrides: Partial<{
    burstLimit: number;
    concurrencyLimit: number;
  }> = {},
) {
  return resolveGatewayAiUsageRedisGuardPolicies({
    ai_assistant: {
      burstLimit: overrides.burstLimit,
      concurrencyLimit: overrides.concurrencyLimit,
      mode: "enforced",
      runtimeStatus: "active",
    },
  });
}

function reservedLedgerRow(requestId = REQUEST_ID) {
  return {
    createdAt: "2026-06-29T22:00:00.000Z",
    errorCategory: null,
    estimatedUsageUnits: 12,
    feature: "ai_assistant" as const,
    finalUsageUnits: null,
    id: "11111111-1111-4111-8111-111111111119",
    ledgerStatus: "reserved" as const,
    planAtRequestTime: "pro" as const,
    planSource: "persisted_server_plan" as const,
    requestClassification: "assistant_prompt",
    requestId,
    tenantId: TENANT_ID,
    updatedAt: "2026-06-29T22:00:00.000Z",
    usageMonth: "2026-06-01",
    userId: USER_ID,
  };
}
