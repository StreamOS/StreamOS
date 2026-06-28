import {
  AUTOMATION_ENTITLEMENT_ASSERTION_AUDIENCES,
  AUTOMATION_ENTITLEMENT_ASSERTION_ISSUERS,
  AUTOMATION_ENTITLEMENT_ASSERTION_MAX_TTL_SECONDS,
  isAutomationEntitlementAssertionPurpose,
  isFeatureGateKey,
  isTrustedPlanModelSource,
  resolvePlanModel,
  type AutomationEntitlementAssertion,
  type AutomationEntitlementAssertionPurpose,
  type AutomationEntitlementAssertionReasonCode,
  type EntitlementPlan,
  type FeatureGateKey,
  type TrustedPlanModelSource,
  validateAutomationEntitlementAssertion,
} from "@streamos/types";
import { evaluateFeatureGate } from "@streamos/types";

export const GATEWAY_AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE =
  "unsigned_internal_contract" as const;

export type GatewayAutomationEntitlementAssertionSigningMode =
  typeof GATEWAY_AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE;

export type GatewayAutomationEntitlementAssertionIssueResult = {
  allowed: boolean;
  assertion: AutomationEntitlementAssertion | null;
  feature: FeatureGateKey | null;
  normalizedPlan: EntitlementPlan;
  planSource: TrustedPlanModelSource | null;
  reason: AutomationEntitlementAssertionReasonCode;
  signing: GatewayAutomationEntitlementAssertionSigningMode;
  ttlSeconds: number | null;
  userId: string | null;
};

export function issueAutomationEntitlementAssertion(params: {
  feature: string;
  now?: Date | number | string;
  plan: unknown;
  planSource: unknown;
  purpose?: string;
  requestId?: string;
  ttlSeconds?: number;
  userId: string | null;
}): GatewayAutomationEntitlementAssertionIssueResult {
  const requestedFeature = params.feature.trim();
  const userId = asNonEmptyString(params.userId);

  if (userId === null) {
    return deny({
      feature: isFeatureGateKey(requestedFeature) ? requestedFeature : null,
      normalizedPlan: "free",
      planSource: null,
      reason: "entitlement_user_context_mismatch",
      ttlSeconds: null,
      userId,
    });
  }

  if (!isFeatureGateKey(requestedFeature)) {
    return deny({
      feature: null,
      normalizedPlan: "free",
      planSource: null,
      reason: "entitlement_feature_not_allowed",
      ttlSeconds: null,
      userId,
    });
  }

  const purpose = normalizePurpose(params.purpose);
  if (purpose === INVALID_OPTIONAL_VALUE) {
    return deny({
      feature: requestedFeature,
      normalizedPlan: "free",
      planSource: null,
      reason: "entitlement_assertion_malformed",
      ttlSeconds: null,
      userId,
    });
  }

  const requestId = normalizeOptionalNonEmptyString(params.requestId);
  if (requestId === INVALID_OPTIONAL_VALUE) {
    return deny({
      feature: requestedFeature,
      normalizedPlan: "free",
      planSource: null,
      reason: "entitlement_assertion_malformed",
      ttlSeconds: null,
      userId,
    });
  }

  const planResolution = resolvePlanModel({
    plan: params.plan,
    source: params.planSource,
  });
  const trustedPlanSource = isTrustedPlanModelSource(planResolution.source)
    ? planResolution.source
    : null;

  if (!planResolution.hasTrustedPlanSource || trustedPlanSource === null) {
    return deny({
      feature: requestedFeature,
      normalizedPlan: planResolution.normalizedPlan,
      planSource: null,
      reason: "entitlement_plan_source_untrusted",
      ttlSeconds: null,
      userId,
    });
  }

  const ttlSeconds = normalizeTtlSeconds(params.ttlSeconds);
  if (ttlSeconds === null) {
    return deny({
      feature: requestedFeature,
      normalizedPlan: planResolution.normalizedPlan,
      planSource: trustedPlanSource,
      reason: "entitlement_assertion_malformed",
      ttlSeconds: null,
      userId,
    });
  }

  const featureDecision = evaluateFeatureGate({
    feature: requestedFeature,
    plan:
      planResolution.reason === "unknown_plan_fallback"
        ? params.plan
        : planResolution.normalizedPlan,
  });

  if (!featureDecision.allowed || featureDecision.feature === null) {
    return deny({
      feature: featureDecision.feature,
      normalizedPlan: featureDecision.normalizedPlan,
      planSource: trustedPlanSource,
      reason: "entitlement_feature_not_allowed",
      ttlSeconds,
      userId,
    });
  }

  const issuedAtMs = parseNow(params.now);
  const assertion: AutomationEntitlementAssertion = {
    audience: AUTOMATION_ENTITLEMENT_ASSERTION_AUDIENCES[0],
    expires_at: new Date(issuedAtMs + ttlSeconds * 1000).toISOString(),
    feature: requestedFeature,
    issued_at: new Date(issuedAtMs).toISOString(),
    issuer: AUTOMATION_ENTITLEMENT_ASSERTION_ISSUERS[0],
    plan: featureDecision.normalizedPlan,
    plan_source: trustedPlanSource,
    ...(purpose === null ? {} : { purpose }),
    ...(requestId === null ? {} : { request_id: requestId }),
    user_id: userId,
  };

  const validation = validateAutomationEntitlementAssertion({
    assertion,
    feature: requestedFeature,
    now: issuedAtMs,
    userId,
  });

  if (!validation.allowed || validation.assertion === null) {
    return deny({
      feature: validation.feature,
      normalizedPlan: featureDecision.normalizedPlan,
      planSource: trustedPlanSource,
      reason: validation.reason,
      ttlSeconds,
      userId,
    });
  }

  return {
    allowed: true,
    assertion: validation.assertion,
    feature: validation.feature,
    normalizedPlan: validation.normalizedPlan ?? featureDecision.normalizedPlan,
    planSource: validation.assertion.plan_source,
    reason: "allowed",
    signing: GATEWAY_AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE,
    ttlSeconds,
    userId,
  };
}

function deny(params: {
  feature: FeatureGateKey | null;
  normalizedPlan: EntitlementPlan;
  planSource: TrustedPlanModelSource | null;
  reason: AutomationEntitlementAssertionReasonCode;
  ttlSeconds: number | null;
  userId: string | null;
}): GatewayAutomationEntitlementAssertionIssueResult {
  return {
    allowed: false,
    assertion: null,
    feature: params.feature,
    normalizedPlan: params.normalizedPlan,
    planSource: params.planSource,
    reason: params.reason,
    signing: GATEWAY_AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE,
    ttlSeconds: params.ttlSeconds,
    userId: params.userId,
  };
}

const INVALID_OPTIONAL_VALUE = Symbol("invalid_optional_value");

function normalizeOptionalNonEmptyString(
  value: unknown,
): string | null | typeof INVALID_OPTIONAL_VALUE {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    return INVALID_OPTIONAL_VALUE;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : INVALID_OPTIONAL_VALUE;
}

function normalizePurpose(
  value: unknown,
):
  | AutomationEntitlementAssertionPurpose
  | null
  | typeof INVALID_OPTIONAL_VALUE {
  const normalized = normalizeOptionalNonEmptyString(value);

  if (normalized === null || normalized === INVALID_OPTIONAL_VALUE) {
    return normalized;
  }

  return isAutomationEntitlementAssertionPurpose(normalized)
    ? normalized
    : INVALID_OPTIONAL_VALUE;
}

function normalizeTtlSeconds(value: unknown): number | null {
  if (value === undefined) {
    return AUTOMATION_ENTITLEMENT_ASSERTION_MAX_TTL_SECONDS;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

function parseNow(value: Date | number | string | undefined): number {
  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return Date.now();
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}
