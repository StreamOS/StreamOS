import assert from "node:assert/strict";
import test from "node:test";

import {
  BILLING_READINESS_STATUSES,
  PLAN_MODEL_RESOLUTION_REASONS,
  PLAN_MODEL_SOURCES,
  TRUSTED_PLAN_MODEL_SOURCES,
  UNTRUSTED_PLAN_MODEL_SOURCES,
  isBillingReadinessStatus,
  isPlanModelSource,
  isTrustedPlanModelSource,
  isUntrustedPlanModelSource,
  resolvePlanModel,
} from "../src/plan-model.js";

void test("plan model readiness contract keeps canonical source and status values stable", () => {
  assert.deepEqual(BILLING_READINESS_STATUSES, [
    "active",
    "trialing",
    "past_due",
    "canceled",
    "incomplete",
    "unknown",
  ]);
  assert.deepEqual(TRUSTED_PLAN_MODEL_SOURCES, [
    "persisted_server_plan",
    "server_verified_billing",
  ]);
  assert.deepEqual(UNTRUSTED_PLAN_MODEL_SOURCES, [
    "client_state",
    "ui_badge",
    "query_parameter",
    "request_header",
    "cookie",
    "local_storage",
  ]);
  assert.deepEqual(PLAN_MODEL_SOURCES, [
    "persisted_server_plan",
    "server_verified_billing",
    "client_state",
    "ui_badge",
    "query_parameter",
    "request_header",
    "cookie",
    "local_storage",
    "none",
  ]);
  assert.deepEqual(PLAN_MODEL_RESOLUTION_REASONS, [
    "default_free_no_plan_source",
    "trusted_plan",
    "trusted_source_missing_plan",
    "unknown_plan_fallback",
    "untrusted_plan_source",
  ]);
});

void test("recognizers distinguish trusted and untrusted plan sources", () => {
  assert.equal(isBillingReadinessStatus("trialing"), true);
  assert.equal(isBillingReadinessStatus("paused"), false);
  assert.equal(isTrustedPlanModelSource("persisted_server_plan"), true);
  assert.equal(isTrustedPlanModelSource("ui_badge"), false);
  assert.equal(isUntrustedPlanModelSource("request_header"), true);
  assert.equal(isUntrustedPlanModelSource("server_verified_billing"), false);
  assert.equal(isPlanModelSource("cookie"), true);
  assert.equal(isPlanModelSource("operator_override"), false);
});

void test("missing plan source stays fail-closed on free", () => {
  assert.deepEqual(resolvePlanModel({}), {
    billingStatus: null,
    hasPersistedPlanModel: false,
    hasTrustedPlanSource: false,
    normalizedPlan: "free",
    reason: "default_free_no_plan_source",
    source: "none",
    sourceTrust: "none",
  });
});

void test("trusted plan sources can model future persisted or billing-backed plans", () => {
  assert.deepEqual(
    resolvePlanModel({
      billingStatus: "active",
      plan: "pro",
      source: "persisted_server_plan",
    }),
    {
      billingStatus: "active",
      hasPersistedPlanModel: true,
      hasTrustedPlanSource: true,
      normalizedPlan: "pro",
      reason: "trusted_plan",
      source: "persisted_server_plan",
      sourceTrust: "trusted",
    },
  );

  assert.deepEqual(
    resolvePlanModel({
      billingStatus: "trialing",
      plan: "agency",
      source: "server_verified_billing",
    }),
    {
      billingStatus: "trialing",
      hasPersistedPlanModel: false,
      hasTrustedPlanSource: true,
      normalizedPlan: "agency",
      reason: "trusted_plan",
      source: "server_verified_billing",
      sourceTrust: "trusted",
    },
  );
});

void test("unknown or missing trusted plans still fall back to free", () => {
  assert.deepEqual(
    resolvePlanModel({
      source: "persisted_server_plan",
    }),
    {
      billingStatus: null,
      hasPersistedPlanModel: true,
      hasTrustedPlanSource: true,
      normalizedPlan: "free",
      reason: "trusted_source_missing_plan",
      source: "persisted_server_plan",
      sourceTrust: "trusted",
    },
  );

  assert.deepEqual(
    resolvePlanModel({
      billingStatus: "past_due",
      plan: "business",
      source: "server_verified_billing",
    }),
    {
      billingStatus: "past_due",
      hasPersistedPlanModel: false,
      hasTrustedPlanSource: true,
      normalizedPlan: "free",
      reason: "unknown_plan_fallback",
      source: "server_verified_billing",
      sourceTrust: "trusted",
    },
  );
});

void test("untrusted client-like sources can never unlock pro or agency plans", () => {
  for (const source of UNTRUSTED_PLAN_MODEL_SOURCES) {
    assert.deepEqual(
      resolvePlanModel({
        billingStatus: "active",
        plan: "agency",
        source,
      }),
      {
        billingStatus: "active",
        hasPersistedPlanModel: false,
        hasTrustedPlanSource: false,
        normalizedPlan: "free",
        reason: "untrusted_plan_source",
        source,
        sourceTrust: "untrusted",
      },
    );
  }
});

void test("unknown billing-like status strings are normalized without leaking trust", () => {
  assert.deepEqual(
    resolvePlanModel({
      billingStatus: "paused",
      plan: "pro",
      source: "query_parameter",
    }),
    {
      billingStatus: "unknown",
      hasPersistedPlanModel: false,
      hasTrustedPlanSource: false,
      normalizedPlan: "free",
      reason: "untrusted_plan_source",
      source: "query_parameter",
      sourceTrust: "untrusted",
    },
  );
});
