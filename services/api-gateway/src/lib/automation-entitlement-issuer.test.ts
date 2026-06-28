import { describe, expect, it } from "vitest";

import {
  GATEWAY_AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE,
  issueAutomationEntitlementAssertion,
} from "./automation-entitlement-issuer.js";

describe("automation entitlement issuer", () => {
  it("uses the unsigned internal signing mode until a dedicated signing slice exists", () => {
    expect(GATEWAY_AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE).toBe(
      "unsigned_internal_contract",
    );
  });

  it("issues a short-lived assertion for a trusted pro premium feature", () => {
    const result = issueAutomationEntitlementAssertion({
      feature: "ai_assistant",
      now: "2026-06-28T13:00:00.000Z",
      plan: "pro",
      planSource: "persisted_server_plan",
      purpose: "premium_ai_access",
      requestId: "req-issuer-1",
      ttlSeconds: 90,
      userId: "user-123",
    });

    expect(result).toMatchObject({
      allowed: true,
      feature: "ai_assistant",
      normalizedPlan: "pro",
      planSource: "persisted_server_plan",
      reason: "allowed",
      signing: "unsigned_internal_contract",
      ttlSeconds: 90,
      userId: "user-123",
    });
    expect(result.assertion).toEqual({
      audience: "automation-service",
      expires_at: "2026-06-28T13:01:30.000Z",
      feature: "ai_assistant",
      issued_at: "2026-06-28T13:00:00.000Z",
      issuer: "api-gateway",
      plan: "pro",
      plan_source: "persisted_server_plan",
      purpose: "premium_ai_access",
      request_id: "req-issuer-1",
      user_id: "user-123",
    });
    expect(Object.keys(result.assertion ?? {}).sort()).toEqual([
      "audience",
      "expires_at",
      "feature",
      "issued_at",
      "issuer",
      "plan",
      "plan_source",
      "purpose",
      "request_id",
      "user_id",
    ]);
  });

  it("issues agency-only assertions for trusted agency features", () => {
    const result = issueAutomationEntitlementAssertion({
      feature: "team_workspace",
      now: "2026-06-28T13:00:00.000Z",
      plan: "agency",
      planSource: "server_verified_billing",
      ttlSeconds: 60,
      userId: "user-123",
    });

    expect(result.allowed).toBe(true);
    expect(result.assertion).toMatchObject({
      audience: "automation-service",
      feature: "team_workspace",
      issuer: "api-gateway",
      plan: "agency",
      plan_source: "server_verified_billing",
      user_id: "user-123",
    });
  });

  it("denies free plans for premium features", () => {
    expect(
      issueAutomationEntitlementAssertion({
        feature: "branding_ai",
        now: "2026-06-28T13:00:00.000Z",
        plan: "free",
        planSource: "persisted_server_plan",
        userId: "user-123",
      }),
    ).toMatchObject({
      allowed: false,
      assertion: null,
      feature: "branding_ai",
      normalizedPlan: "free",
      planSource: "persisted_server_plan",
      reason: "entitlement_feature_not_allowed",
    });
  });

  it("denies untrusted plan sources", () => {
    expect(
      issueAutomationEntitlementAssertion({
        feature: "branding_ai",
        now: "2026-06-28T13:00:00.000Z",
        plan: "pro",
        planSource: "ui_badge",
        userId: "user-123",
      }),
    ).toMatchObject({
      allowed: false,
      assertion: null,
      feature: "branding_ai",
      normalizedPlan: "free",
      planSource: null,
      reason: "entitlement_plan_source_untrusted",
    });
  });

  it("denies unknown features fail-closed", () => {
    expect(
      issueAutomationEntitlementAssertion({
        feature: "unknown_feature",
        now: "2026-06-28T13:00:00.000Z",
        plan: "pro",
        planSource: "persisted_server_plan",
        userId: "user-123",
      }),
    ).toMatchObject({
      allowed: false,
      assertion: null,
      feature: null,
      normalizedPlan: "free",
      planSource: null,
      reason: "entitlement_feature_not_allowed",
    });
  });

  it("denies unknown plans by falling back to free without unlocking premium", () => {
    expect(
      issueAutomationEntitlementAssertion({
        feature: "ai_assistant",
        now: "2026-06-28T13:00:00.000Z",
        plan: "enterprise",
        planSource: "persisted_server_plan",
        userId: "user-123",
      }),
    ).toMatchObject({
      allowed: false,
      assertion: null,
      feature: "ai_assistant",
      normalizedPlan: "free",
      planSource: "persisted_server_plan",
      reason: "entitlement_feature_not_allowed",
    });
  });

  it("denies missing user context", () => {
    expect(
      issueAutomationEntitlementAssertion({
        feature: "ai_assistant",
        now: "2026-06-28T13:00:00.000Z",
        plan: "pro",
        planSource: "persisted_server_plan",
        userId: null,
      }),
    ).toMatchObject({
      allowed: false,
      assertion: null,
      feature: "ai_assistant",
      normalizedPlan: "free",
      planSource: null,
      reason: "entitlement_user_context_mismatch",
      userId: null,
    });
  });

  it("denies overlong ttl values", () => {
    expect(
      issueAutomationEntitlementAssertion({
        feature: "branding_ai",
        now: "2026-06-28T13:00:00.000Z",
        plan: "pro",
        planSource: "persisted_server_plan",
        ttlSeconds: 121,
        userId: "user-123",
      }),
    ).toMatchObject({
      allowed: false,
      assertion: null,
      feature: "branding_ai",
      normalizedPlan: "pro",
      planSource: "persisted_server_plan",
      reason: "entitlement_assertion_malformed",
      ttlSeconds: 121,
    });
  });

  it("denies malformed optional issuer inputs instead of silently normalizing them", () => {
    expect(
      issueAutomationEntitlementAssertion({
        feature: "branding_ai",
        now: "2026-06-28T13:00:00.000Z",
        plan: "pro",
        planSource: "persisted_server_plan",
        purpose: "  ",
        userId: "user-123",
      }).reason,
    ).toBe("entitlement_assertion_malformed");

    expect(
      issueAutomationEntitlementAssertion({
        feature: "branding_ai",
        now: "2026-06-28T13:00:00.000Z",
        plan: "pro",
        planSource: "persisted_server_plan",
        requestId: "  ",
        userId: "user-123",
      }).reason,
    ).toBe("entitlement_assertion_malformed");
  });
});
