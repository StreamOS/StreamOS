import { describe, expect, it } from "vitest";

import {
  authorizeGatewayAiUsageAdmission,
  buildGatewayAiUsageAdmissionDenialResponse,
  resolveGatewayAiUsageAdmissionPolicies,
} from "./ai-usage-admission.js";

const TENANT_ID = "tenant-123";
const USER_ID = "11111111-1111-4111-8111-111111111111";

describe("gateway AI usage admission", () => {
  it("denies ai_assistant by default while the runtime remains not yet productive", () => {
    const decision = authorizeGatewayAiUsageAdmission({
      estimatedUsageUnits: 8,
      feature: "ai_assistant",
      plan: "pro",
      planSource: "persisted_server_plan",
      policies: resolveGatewayAiUsageAdmissionPolicies(),
      requestClassification: "assistant_prompt",
      tenantId: TENANT_ID,
      userId: USER_ID,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe("ai_usage_not_productive");

    const denial = buildGatewayAiUsageAdmissionDenialResponse(decision);
    expect(denial.statusCode).toBe(503);
    expect(denial.body).toEqual({
      error: "ai_usage_admission_unavailable",
      feature: "ai_assistant",
      message: "AI usage admission is not yet productive for this feature.",
      reason_code: "ai_usage_not_productive",
    });
  });

  it("denies when tenant or user context is missing", () => {
    const decision = authorizeGatewayAiUsageAdmission({
      estimatedUsageUnits: 8,
      feature: "ai_assistant",
      plan: "pro",
      planSource: "persisted_server_plan",
      policies: resolveGatewayAiUsageAdmissionPolicies({
        ai_assistant: {
          budgetMode: "stubbed_allow",
          runtimeStatus: "active",
        },
      }),
      requestClassification: "assistant_prompt",
      tenantId: "",
      userId: USER_ID,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe("ai_usage_context_missing");

    const denial = buildGatewayAiUsageAdmissionDenialResponse(decision);
    expect(denial.statusCode).toBe(403);
    expect(denial.body.reason_code).toBe("ai_usage_context_missing");
  });

  it("denies when no trusted plan context exists", () => {
    const decision = authorizeGatewayAiUsageAdmission({
      estimatedUsageUnits: 8,
      feature: "ai_assistant",
      plan: null,
      planSource: null,
      policies: resolveGatewayAiUsageAdmissionPolicies({
        ai_assistant: {
          budgetMode: "stubbed_allow",
          runtimeStatus: "active",
        },
      }),
      requestClassification: "assistant_prompt",
      tenantId: TENANT_ID,
      userId: USER_ID,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe("ai_usage_plan_required");
  });

  it("denies an invalid feature key with a stable secret-safe response", () => {
    const decision = authorizeGatewayAiUsageAdmission({
      estimatedUsageUnits: 8,
      feature: "https://private.example.com?token=sk-secret",
      plan: "pro",
      planSource: "persisted_server_plan",
      policies: resolveGatewayAiUsageAdmissionPolicies(),
      requestClassification: "prompt: summarize secret roadmap",
      tenantId: TENANT_ID,
      userId: USER_ID,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.feature).toBeNull();
    expect(decision.reasonCode).toBe("ai_usage_feature_not_allowed");

    const denial = buildGatewayAiUsageAdmissionDenialResponse(decision);
    const serialized = JSON.stringify(denial.body);
    expect(denial.statusCode).toBe(403);
    expect(serialized).not.toContain("private.example.com");
    expect(serialized).not.toContain("sk-secret");
    expect(serialized).not.toContain("summarize secret roadmap");
    expect(serialized).not.toContain("prompt:");
  });

  it("allows a trusted pro context when a test-only active policy override is used", () => {
    const decision = authorizeGatewayAiUsageAdmission({
      estimatedUsageUnits: 12,
      feature: "ai_assistant",
      plan: "pro",
      planSource: "persisted_server_plan",
      policies: resolveGatewayAiUsageAdmissionPolicies({
        ai_assistant: {
          budgetMode: "stubbed_allow",
          runtimeStatus: "active",
        },
      }),
      requestClassification: "assistant_prompt",
      tenantId: TENANT_ID,
      userId: USER_ID,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.reasonCode).toBe("allowed");
    expect(decision.feature).toBe("ai_assistant");
    expect(decision.normalizedPlan).toBe("pro");
    expect(decision.planSource).toBe("persisted_server_plan");
    expect(decision.budgetContext).toEqual({
      contractVersion: "2026-06-29.ai-usage-admission.v1",
      estimatedUsageUnits: 12,
      feature: "ai_assistant",
      normalizedPlan: "pro",
      requestClassification: "assistant_prompt",
      tenantId: TENANT_ID,
      userId: USER_ID,
    });
  });

  it("denies a free plan even when the runtime and budget policy are explicitly enabled", () => {
    const decision = authorizeGatewayAiUsageAdmission({
      estimatedUsageUnits: 12,
      feature: "ai_assistant",
      plan: "free",
      planSource: "persisted_server_plan",
      policies: resolveGatewayAiUsageAdmissionPolicies({
        ai_assistant: {
          budgetMode: "stubbed_allow",
          runtimeStatus: "active",
        },
      }),
      requestClassification: "assistant_prompt",
      tenantId: TENANT_ID,
      userId: USER_ID,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe("ai_usage_plan_denied");
  });

  it("denies when runtime is active but budget enforcement is not configured", () => {
    const decision = authorizeGatewayAiUsageAdmission({
      estimatedUsageUnits: 12,
      feature: "ai_assistant",
      plan: "pro",
      planSource: "persisted_server_plan",
      policies: resolveGatewayAiUsageAdmissionPolicies({
        ai_assistant: {
          runtimeStatus: "active",
        },
      }),
      requestClassification: "assistant_prompt",
      tenantId: TENANT_ID,
      userId: USER_ID,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe("ai_usage_budget_not_configured");

    const denial = buildGatewayAiUsageAdmissionDenialResponse(decision);
    expect(denial.statusCode).toBe(503);
    expect(denial.body).toEqual({
      error: "ai_usage_admission_unavailable",
      feature: "ai_assistant",
      message: "AI usage budget enforcement is not configured.",
      reason_code: "ai_usage_budget_not_configured",
    });
  });
});
