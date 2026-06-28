import { describe, expect, it } from "vitest";

import {
  AUTOMATION_ENTITLEMENT_ASSERTION_SECRET_ENV_NAME,
  AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE_ENV_NAME,
} from "@streamos/types";

import {
  issueSignedAutomationEntitlementAssertion,
  resolveAutomationEntitlementAssertionSigningConfig,
  signAutomationEntitlementAssertion,
  verifyAutomationEntitlementAssertionSignature,
} from "./automation-entitlement-signing.js";

const TEST_SECRET = "a".repeat(32);

describe("automation entitlement signing", () => {
  it("defaults to unsigned internal contract mode when no signing env is configured", () => {
    expect(
      resolveAutomationEntitlementAssertionSigningConfig({
        env: {},
      }),
    ).toEqual({
      mode: "unsigned_internal_contract",
      secret: null,
      secretEnvName: AUTOMATION_ENTITLEMENT_ASSERTION_SECRET_ENV_NAME,
      signingModeEnvName:
        AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE_ENV_NAME,
    });
  });

  it("requires a secret when hmac signing mode is enabled", () => {
    expect(() =>
      resolveAutomationEntitlementAssertionSigningConfig({
        env: {
          AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE: "hmac_sha256",
        },
      }),
    ).toThrow(
      /AUTOMATION_ENTITLEMENT_ASSERTION_SECRET is required when AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE=hmac_sha256/,
    );
  });

  it("rejects unsupported signing modes fail-closed", () => {
    expect(() =>
      resolveAutomationEntitlementAssertionSigningConfig({
        env: {
          AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE: "jwt",
        },
      }),
    ).toThrow(
      /AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE must be one of: unsigned_internal_contract, hmac_sha256/,
    );
  });

  it("signs and verifies a trusted premium assertion with HMAC-SHA256", () => {
    const signed = signAutomationEntitlementAssertion({
      assertion: {
        audience: "automation-service",
        expires_at: "2026-06-28T12:01:30.000Z",
        feature: "ai_assistant",
        issued_at: "2026-06-28T12:00:00.000Z",
        issuer: "api-gateway",
        plan: "pro",
        plan_source: "persisted_server_plan",
        purpose: "premium_ai_access",
        request_id: "req-123",
        user_id: "user-123",
      },
      secret: TEST_SECRET,
    });

    expect(signed.signing_mode).toBe("hmac_sha256");
    expect(signed.signature).toHaveLength(64);
    expect(
      verifyAutomationEntitlementAssertionSignature({
        assertion: signed.assertion,
        secret: TEST_SECRET,
        signature: signed.signature,
      }),
    ).toBe(true);
  });

  it("denies missing or invalid signatures fail-closed", () => {
    const assertion = {
      audience: "automation-service" as const,
      expires_at: "2026-06-28T12:01:30.000Z",
      feature: "branding_ai" as const,
      issued_at: "2026-06-28T12:00:00.000Z",
      issuer: "api-gateway" as const,
      plan: "pro" as const,
      plan_source: "persisted_server_plan" as const,
      user_id: "user-123",
    };

    expect(
      verifyAutomationEntitlementAssertionSignature({
        assertion,
        secret: TEST_SECRET,
        signature: undefined,
      }),
    ).toBe(false);
    expect(
      verifyAutomationEntitlementAssertionSignature({
        assertion,
        secret: TEST_SECRET,
        signature: "bad-signature",
      }),
    ).toBe(false);
  });

  it("issues a signed assertion when a trusted premium decision is allowed", () => {
    const result = issueSignedAutomationEntitlementAssertion({
      feature: "branding_ai",
      now: "2026-06-28T12:00:00.000Z",
      plan: "pro",
      planSource: "server_verified_billing",
      secret: TEST_SECRET,
      ttlSeconds: 90,
      userId: "user-123",
    });

    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("allowed");
    expect(result.signedAssertion).not.toBeNull();
    expect(result.signedAssertion?.assertion.issuer).toBe("api-gateway");
  });

  it("does not sign denied assertions", () => {
    const result = issueSignedAutomationEntitlementAssertion({
      feature: "branding_ai",
      now: "2026-06-28T12:00:00.000Z",
      plan: "free",
      planSource: "persisted_server_plan",
      secret: TEST_SECRET,
      userId: "user-123",
    });

    expect(result.allowed).toBe(false);
    expect(result.signedAssertion).toBeNull();
    expect(result.reason).toBe("entitlement_feature_not_allowed");
  });
});
