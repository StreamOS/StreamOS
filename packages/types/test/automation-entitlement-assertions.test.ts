import assert from "node:assert/strict";
import test from "node:test";

import {
  AUTOMATION_ENTITLEMENT_ASSERTION_AUDIENCES,
  AUTOMATION_ENTITLEMENT_ASSERTION_CLOCK_SKEW_SECONDS,
  AUTOMATION_ENTITLEMENT_ASSERTION_ISSUERS,
  AUTOMATION_ENTITLEMENT_ASSERTION_MAX_TTL_SECONDS,
  AUTOMATION_ENTITLEMENT_ASSERTION_PURPOSES,
  AUTOMATION_ENTITLEMENT_ASSERTION_REASON_CODES,
  validateAutomationEntitlementAssertion,
} from "../src/automation-entitlement-assertions.js";

void test("automation entitlement assertion contract keeps canonical values stable", () => {
  assert.deepEqual(AUTOMATION_ENTITLEMENT_ASSERTION_ISSUERS, ["api-gateway"]);
  assert.deepEqual(AUTOMATION_ENTITLEMENT_ASSERTION_AUDIENCES, [
    "automation-service",
  ]);
  assert.deepEqual(AUTOMATION_ENTITLEMENT_ASSERTION_PURPOSES, [
    "premium_ai_access",
  ]);
  assert.deepEqual(AUTOMATION_ENTITLEMENT_ASSERTION_REASON_CODES, [
    "allowed",
    "entitlement_assertion_missing",
    "entitlement_assertion_expired",
    "entitlement_assertion_malformed",
    "entitlement_feature_not_allowed",
    "entitlement_plan_source_untrusted",
    "entitlement_user_context_mismatch",
  ]);
  assert.equal(AUTOMATION_ENTITLEMENT_ASSERTION_MAX_TTL_SECONDS, 120);
  assert.equal(AUTOMATION_ENTITLEMENT_ASSERTION_CLOCK_SKEW_SECONDS, 15);
});

void test("valid trusted pro assertion is accepted for a premium automation feature", () => {
  const now = "2026-06-28T12:00:00.000Z";

  assert.deepEqual(
    validateAutomationEntitlementAssertion({
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
      feature: "ai_assistant",
      now,
      userId: "user-123",
    }),
    {
      allowed: true,
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
      feature: "ai_assistant",
      normalizedPlan: "pro",
      reason: "allowed",
      userId: "user-123",
    },
  );
});

void test("missing assertion is denied fail-closed", () => {
  assert.deepEqual(
    validateAutomationEntitlementAssertion({
      assertion: null,
      feature: "branding_ai",
      now: "2026-06-28T12:00:00.000Z",
      userId: "user-123",
    }),
    {
      allowed: false,
      assertion: null,
      feature: "branding_ai",
      normalizedPlan: null,
      reason: "entitlement_assertion_missing",
      userId: "user-123",
    },
  );
});

void test("expired assertion is denied", () => {
  assert.equal(
    validateAutomationEntitlementAssertion({
      assertion: {
        audience: "automation-service",
        expires_at: "2026-06-28T12:01:00.000Z",
        feature: "branding_ai",
        issued_at: "2026-06-28T12:00:00.000Z",
        issuer: "api-gateway",
        plan: "pro",
        plan_source: "server_verified_billing",
        user_id: "user-123",
      },
      feature: "branding_ai",
      now: "2026-06-28T12:01:16.000Z",
      userId: "user-123",
    }).reason,
    "entitlement_assertion_expired",
  );
});

void test("untrusted plan sources are denied", () => {
  assert.equal(
    validateAutomationEntitlementAssertion({
      assertion: {
        audience: "automation-service",
        expires_at: "2026-06-28T12:01:00.000Z",
        feature: "branding_ai",
        issued_at: "2026-06-28T12:00:00.000Z",
        issuer: "api-gateway",
        plan: "pro",
        plan_source: "ui_badge",
        user_id: "user-123",
      },
      feature: "branding_ai",
      now: "2026-06-28T12:00:30.000Z",
      userId: "user-123",
    }).reason,
    "entitlement_plan_source_untrusted",
  );
});

void test("unknown or mismatched features are denied", () => {
  assert.equal(
    validateAutomationEntitlementAssertion({
      assertion: {
        audience: "automation-service",
        expires_at: "2026-06-28T12:01:00.000Z",
        feature: "branding_ai",
        issued_at: "2026-06-28T12:00:00.000Z",
        issuer: "api-gateway",
        plan: "pro",
        plan_source: "persisted_server_plan",
        user_id: "user-123",
      },
      feature: "unknown_feature",
      now: "2026-06-28T12:00:30.000Z",
      userId: "user-123",
    }).reason,
    "entitlement_feature_not_allowed",
  );

  assert.equal(
    validateAutomationEntitlementAssertion({
      assertion: {
        audience: "automation-service",
        expires_at: "2026-06-28T12:01:00.000Z",
        feature: "branding_ai",
        issued_at: "2026-06-28T12:00:00.000Z",
        issuer: "api-gateway",
        plan: "pro",
        plan_source: "persisted_server_plan",
        user_id: "user-123",
      },
      feature: "ai_assistant",
      now: "2026-06-28T12:00:30.000Z",
      userId: "user-123",
    }).reason,
    "entitlement_feature_not_allowed",
  );
});

void test("user context mismatch is denied", () => {
  assert.equal(
    validateAutomationEntitlementAssertion({
      assertion: {
        audience: "automation-service",
        expires_at: "2026-06-28T12:01:00.000Z",
        feature: "branding_ai",
        issued_at: "2026-06-28T12:00:00.000Z",
        issuer: "api-gateway",
        plan: "pro",
        plan_source: "persisted_server_plan",
        user_id: "user-123",
      },
      feature: "branding_ai",
      now: "2026-06-28T12:00:30.000Z",
      userId: "other-user",
    }).reason,
    "entitlement_user_context_mismatch",
  );
});

void test("free plan cannot unlock a premium feature", () => {
  assert.equal(
    validateAutomationEntitlementAssertion({
      assertion: {
        audience: "automation-service",
        expires_at: "2026-06-28T12:01:00.000Z",
        feature: "branding_ai",
        issued_at: "2026-06-28T12:00:00.000Z",
        issuer: "api-gateway",
        plan: "free",
        plan_source: "persisted_server_plan",
        user_id: "user-123",
      },
      feature: "branding_ai",
      now: "2026-06-28T12:00:30.000Z",
      userId: "user-123",
    }).reason,
    "entitlement_feature_not_allowed",
  );
});

void test("oversized ttl, invalid timestamps, and extra security-adjacent fields are denied as malformed", () => {
  assert.equal(
    validateAutomationEntitlementAssertion({
      assertion: {
        audience: "automation-service",
        expires_at: "2026-06-28T12:05:00.000Z",
        feature: "branding_ai",
        issued_at: "2026-06-28T12:00:00.000Z",
        issuer: "api-gateway",
        plan: "pro",
        plan_source: "persisted_server_plan",
        user_id: "user-123",
      },
      feature: "branding_ai",
      now: "2026-06-28T12:00:30.000Z",
      userId: "user-123",
    }).reason,
    "entitlement_assertion_malformed",
  );

  assert.equal(
    validateAutomationEntitlementAssertion({
      assertion: {
        audience: "automation-service",
        expires_at: "not-a-date",
        feature: "branding_ai",
        issued_at: "2026-06-28T12:00:00.000Z",
        issuer: "api-gateway",
        plan: "pro",
        plan_source: "persisted_server_plan",
        user_id: "user-123",
      },
      feature: "branding_ai",
      now: "2026-06-28T12:00:30.000Z",
      userId: "user-123",
    }).reason,
    "entitlement_assertion_malformed",
  );

  assert.equal(
    validateAutomationEntitlementAssertion({
      assertion: {
        audience: "automation-service",
        expires_at: "2026-06-28T12:01:00.000Z",
        feature: "branding_ai",
        issued_at: "2026-06-28T12:00:00.000Z",
        issuer: "api-gateway",
        plan: "pro",
        plan_source: "persisted_server_plan",
        provider_token: "should-not-be-here",
        user_id: "user-123",
      },
      feature: "branding_ai",
      now: "2026-06-28T12:00:30.000Z",
      userId: "user-123",
    }).reason,
    "entitlement_assertion_malformed",
  );
});
