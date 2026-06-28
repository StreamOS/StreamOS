import assert from "node:assert/strict";
import test from "node:test";

import {
  ENTITLEMENT_PLANS,
  FEATURE_GATE_DECISION_REASONS,
  FEATURE_GATE_DEFINITIONS,
  FEATURE_GATE_KEYS,
  evaluateFeatureGate,
  getFeaturesForPlan,
  isEntitlementPlan,
  isFeatureAllowedForPlan,
  isFeatureGateKey,
  normalizeEntitlementPlan,
  type FeatureGateKey,
} from "../src/feature-gates.js";

void test("feature gate contract keeps canonical keys and plans stable", () => {
  assert.deepEqual(FEATURE_GATE_KEYS, [
    "ai_assistant",
    "advanced_analytics",
    "publishing_schedule",
    "monetization_exports",
    "branding_ai",
    "team_workspace",
  ]);
  assert.deepEqual(ENTITLEMENT_PLANS, ["free", "pro", "agency"]);
  assert.deepEqual(FEATURE_GATE_DECISION_REASONS, [
    "allowed",
    "plan_denied",
    "unknown_feature",
    "unknown_plan_fallback",
  ]);
});

void test("known feature keys and plans are recognized while unknown values fail closed", () => {
  assert.equal(isFeatureGateKey("ai_assistant"), true);
  assert.equal(isFeatureGateKey("totally_unknown_feature"), false);
  assert.equal(isEntitlementPlan("pro"), true);
  assert.equal(isEntitlementPlan("business"), false);
  assert.equal(normalizeEntitlementPlan("agency"), "agency");
  assert.equal(normalizeEntitlementPlan("Business"), "free");
  assert.equal(normalizeEntitlementPlan(undefined), "free");
});

void test("free denies premium gates while pro and agency model future upgrades", () => {
  const gatedFeatures = FEATURE_GATE_KEYS.filter(
    (feature) => FEATURE_GATE_DEFINITIONS[feature].minimumPlan !== "free",
  );

  for (const feature of gatedFeatures) {
    assert.equal(isFeatureAllowedForPlan(feature, "free"), false);
  }

  assert.equal(isFeatureAllowedForPlan("advanced_analytics", "pro"), true);
  assert.equal(isFeatureAllowedForPlan("ai_assistant", "pro"), true);
  assert.equal(isFeatureAllowedForPlan("team_workspace", "pro"), false);
  assert.equal(isFeatureAllowedForPlan("team_workspace", "agency"), true);
  assert.deepEqual(getFeaturesForPlan("free"), []);
  assert.deepEqual(getFeaturesForPlan("pro"), [
    "ai_assistant",
    "advanced_analytics",
    "publishing_schedule",
    "monetization_exports",
    "branding_ai",
  ] satisfies FeatureGateKey[]);
});

void test("feature gate evaluation stays fail-closed for unknown features and unknown plans", () => {
  assert.deepEqual(
    evaluateFeatureGate({ feature: "branding_ai", plan: "pro" }),
    {
      allowed: true,
      feature: "branding_ai",
      normalizedPlan: "pro",
      reason: "allowed",
      requestedFeature: "branding_ai",
    },
  );

  assert.deepEqual(
    evaluateFeatureGate({ feature: "team_workspace", plan: "pro" }),
    {
      allowed: false,
      feature: "team_workspace",
      normalizedPlan: "pro",
      reason: "plan_denied",
      requestedFeature: "team_workspace",
    },
  );

  assert.deepEqual(
    evaluateFeatureGate({ feature: "ai_assistant", plan: "business" }),
    {
      allowed: false,
      feature: "ai_assistant",
      normalizedPlan: "free",
      reason: "unknown_plan_fallback",
      requestedFeature: "ai_assistant",
    },
  );

  assert.deepEqual(
    evaluateFeatureGate({ feature: "custom_export", plan: "agency" }),
    {
      allowed: false,
      feature: null,
      normalizedPlan: "agency",
      reason: "unknown_feature",
      requestedFeature: "custom_export",
    },
  );
});
