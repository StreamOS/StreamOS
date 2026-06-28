import {
  isEntitlementPlan,
  normalizeEntitlementPlan,
  type EntitlementPlan,
} from "./feature-gates.js";

export const BILLING_READINESS_STATUSES = [
  "active",
  "trialing",
  "past_due",
  "canceled",
  "incomplete",
  "unknown",
] as const;

export type BillingReadinessStatus =
  (typeof BILLING_READINESS_STATUSES)[number];

export const TRUSTED_PLAN_MODEL_SOURCES = [
  "persisted_server_plan",
  "server_verified_billing",
] as const;

export type TrustedPlanModelSource =
  (typeof TRUSTED_PLAN_MODEL_SOURCES)[number];

export const UNTRUSTED_PLAN_MODEL_SOURCES = [
  "client_state",
  "ui_badge",
  "query_parameter",
  "request_header",
  "cookie",
  "local_storage",
] as const;

export type UntrustedPlanModelSource =
  (typeof UNTRUSTED_PLAN_MODEL_SOURCES)[number];

export const PLAN_MODEL_SOURCES = [
  ...TRUSTED_PLAN_MODEL_SOURCES,
  ...UNTRUSTED_PLAN_MODEL_SOURCES,
  "none",
] as const;

export type PlanModelSource = (typeof PLAN_MODEL_SOURCES)[number];

export const PLAN_MODEL_RESOLUTION_REASONS = [
  "default_free_no_plan_source",
  "trusted_plan",
  "trusted_source_missing_plan",
  "unknown_plan_fallback",
  "untrusted_plan_source",
] as const;

export type PlanModelResolutionReason =
  (typeof PLAN_MODEL_RESOLUTION_REASONS)[number];

export type PlanModelSourceTrust = "trusted" | "untrusted" | "none";

export type PlanModelResolution = {
  billingStatus: BillingReadinessStatus | null;
  hasPersistedPlanModel: boolean;
  hasTrustedPlanSource: boolean;
  normalizedPlan: EntitlementPlan;
  reason: PlanModelResolutionReason;
  source: PlanModelSource;
  sourceTrust: PlanModelSourceTrust;
};

export type PersistedPlanModelReadiness = {
  billingStatus: BillingReadinessStatus | null;
  plan: EntitlementPlan;
  source: TrustedPlanModelSource;
  userId: string;
};

export function isBillingReadinessStatus(
  value: string,
): value is BillingReadinessStatus {
  return BILLING_READINESS_STATUSES.includes(value as BillingReadinessStatus);
}

export function isTrustedPlanModelSource(
  value: string,
): value is TrustedPlanModelSource {
  return TRUSTED_PLAN_MODEL_SOURCES.includes(value as TrustedPlanModelSource);
}

export function isUntrustedPlanModelSource(
  value: string,
): value is UntrustedPlanModelSource {
  return UNTRUSTED_PLAN_MODEL_SOURCES.includes(
    value as UntrustedPlanModelSource,
  );
}

export function isPlanModelSource(value: string): value is PlanModelSource {
  return PLAN_MODEL_SOURCES.includes(value as PlanModelSource);
}

export function resolvePlanModel(params: {
  billingStatus?: unknown;
  plan?: unknown;
  source?: unknown;
}): PlanModelResolution {
  const source = normalizePlanModelSource(params.source);
  const sourceTrust = getPlanModelSourceTrust(source);
  const normalizedPlan = normalizeEntitlementPlan(params.plan);
  const billingStatus = normalizeBillingReadinessStatus(params.billingStatus);

  if (source === "none") {
    return {
      billingStatus,
      hasPersistedPlanModel: false,
      hasTrustedPlanSource: false,
      normalizedPlan: "free",
      reason: "default_free_no_plan_source",
      source,
      sourceTrust,
    };
  }

  if (sourceTrust === "untrusted") {
    return {
      billingStatus,
      hasPersistedPlanModel: false,
      hasTrustedPlanSource: false,
      normalizedPlan: "free",
      reason: "untrusted_plan_source",
      source,
      sourceTrust,
    };
  }

  if (params.plan === undefined || params.plan === null) {
    return {
      billingStatus,
      hasPersistedPlanModel: source === "persisted_server_plan",
      hasTrustedPlanSource: true,
      normalizedPlan: "free",
      reason: "trusted_source_missing_plan",
      source,
      sourceTrust,
    };
  }

  const rawPlan = asString(params.plan);

  if (rawPlan !== null && isEntitlementPlan(rawPlan)) {
    return {
      billingStatus,
      hasPersistedPlanModel: source === "persisted_server_plan",
      hasTrustedPlanSource: true,
      normalizedPlan,
      reason: "trusted_plan",
      source,
      sourceTrust,
    };
  }

  return {
    billingStatus,
    hasPersistedPlanModel: source === "persisted_server_plan",
    hasTrustedPlanSource: true,
    normalizedPlan: "free",
    reason: "unknown_plan_fallback",
    source,
    sourceTrust,
  };
}

function normalizeBillingReadinessStatus(
  value: unknown,
): BillingReadinessStatus | null {
  const normalized = asString(value);

  if (normalized === null) {
    return null;
  }

  return isBillingReadinessStatus(normalized) ? normalized : "unknown";
}

function normalizePlanModelSource(value: unknown): PlanModelSource {
  const normalized = asString(value);

  if (normalized === null) {
    return "none";
  }

  return isPlanModelSource(normalized) ? normalized : "none";
}

function getPlanModelSourceTrust(
  source: PlanModelSource,
): PlanModelSourceTrust {
  if (source === "none") {
    return "none";
  }

  return isTrustedPlanModelSource(source) ? "trusted" : "untrusted";
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value.trim().toLowerCase() : null;
}
