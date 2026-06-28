import {
  isEntitlementPlan,
  isFeatureAllowedForPlan,
  isFeatureGateKey,
  type EntitlementPlan,
  type FeatureGateKey,
} from "./feature-gates.js";
import {
  isTrustedPlanModelSource,
  type TrustedPlanModelSource,
} from "./plan-model.js";

export const AUTOMATION_ENTITLEMENT_ASSERTION_ISSUERS = [
  "api-gateway",
] as const;

export type AutomationEntitlementAssertionIssuer =
  (typeof AUTOMATION_ENTITLEMENT_ASSERTION_ISSUERS)[number];

export const AUTOMATION_ENTITLEMENT_ASSERTION_AUDIENCES = [
  "automation-service",
] as const;

export type AutomationEntitlementAssertionAudience =
  (typeof AUTOMATION_ENTITLEMENT_ASSERTION_AUDIENCES)[number];

export const AUTOMATION_ENTITLEMENT_ASSERTION_PURPOSES = [
  "premium_ai_access",
] as const;

export type AutomationEntitlementAssertionPurpose =
  (typeof AUTOMATION_ENTITLEMENT_ASSERTION_PURPOSES)[number];

export const AUTOMATION_ENTITLEMENT_ASSERTION_REASON_CODES = [
  "allowed",
  "entitlement_assertion_missing",
  "entitlement_assertion_expired",
  "entitlement_assertion_malformed",
  "entitlement_feature_not_allowed",
  "entitlement_plan_source_untrusted",
  "entitlement_user_context_mismatch",
] as const;

export type AutomationEntitlementAssertionReasonCode =
  (typeof AUTOMATION_ENTITLEMENT_ASSERTION_REASON_CODES)[number];

export const AUTOMATION_ENTITLEMENT_ASSERTION_MAX_TTL_SECONDS = 120;
export const AUTOMATION_ENTITLEMENT_ASSERTION_CLOCK_SKEW_SECONDS = 15;
const AUTOMATION_ENTITLEMENT_ASSERTION_ALLOWED_KEYS = new Set([
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

export type AutomationEntitlementAssertion = {
  audience: AutomationEntitlementAssertionAudience;
  expires_at: string;
  feature: FeatureGateKey;
  issued_at: string;
  issuer: AutomationEntitlementAssertionIssuer;
  plan: EntitlementPlan;
  plan_source: TrustedPlanModelSource;
  purpose?: AutomationEntitlementAssertionPurpose;
  request_id?: string;
  user_id: string;
};

export type AutomationEntitlementAssertionValidation = {
  allowed: boolean;
  assertion: AutomationEntitlementAssertion | null;
  feature: FeatureGateKey | null;
  normalizedPlan: EntitlementPlan | null;
  reason: AutomationEntitlementAssertionReasonCode;
  userId: string | null;
};

export function validateAutomationEntitlementAssertion(params: {
  assertion: unknown;
  feature: string;
  now?: Date | number | string;
  userId: string | null;
}): AutomationEntitlementAssertionValidation {
  const requestedFeature = params.feature.trim();

  if (!isFeatureGateKey(requestedFeature)) {
    return deny({
      feature: null,
      reason: "entitlement_feature_not_allowed",
      userId: params.userId,
    });
  }

  if (!params.userId?.trim()) {
    return deny({
      feature: requestedFeature,
      reason: "entitlement_user_context_mismatch",
      userId: params.userId,
    });
  }

  if (params.assertion === null || params.assertion === undefined) {
    return deny({
      feature: requestedFeature,
      reason: "entitlement_assertion_missing",
      userId: params.userId,
    });
  }

  if (!isRecord(params.assertion)) {
    return deny({
      feature: requestedFeature,
      reason: "entitlement_assertion_malformed",
      userId: params.userId,
    });
  }

  const rawIssuer = asNonEmptyString(params.assertion.issuer);
  const rawAudience = asNonEmptyString(params.assertion.audience);
  const rawFeature = asNonEmptyString(params.assertion.feature);
  const rawPlan = asNonEmptyString(params.assertion.plan);
  const rawPlanSource = asNonEmptyString(params.assertion.plan_source);
  const rawUserId = asNonEmptyString(params.assertion.user_id);
  const rawIssuedAt = asNonEmptyString(params.assertion.issued_at);
  const rawExpiresAt = asNonEmptyString(params.assertion.expires_at);
  const rawPurpose = asOptionalNonEmptyString(params.assertion.purpose);
  const rawRequestId = asOptionalNonEmptyString(params.assertion.request_id);

  if (
    Object.keys(params.assertion).some(
      (key) => !AUTOMATION_ENTITLEMENT_ASSERTION_ALLOWED_KEYS.has(key),
    )
  ) {
    return deny({
      feature: requestedFeature,
      reason: "entitlement_assertion_malformed",
      userId: params.userId,
    });
  }

  if (
    rawIssuer === null ||
    rawAudience === null ||
    rawFeature === null ||
    rawPlan === null ||
    rawPlanSource === null ||
    rawUserId === null ||
    rawIssuedAt === null ||
    rawExpiresAt === null ||
    !isAutomationEntitlementAssertionIssuer(rawIssuer) ||
    !isAutomationEntitlementAssertionAudience(rawAudience) ||
    !isFeatureGateKey(rawFeature) ||
    !isEntitlementPlan(rawPlan) ||
    !isTrustedPlanModelSource(rawPlanSource)
  ) {
    return deny({
      feature: requestedFeature,
      reason:
        rawPlanSource !== null && !isTrustedPlanModelSource(rawPlanSource)
          ? "entitlement_plan_source_untrusted"
          : "entitlement_assertion_malformed",
      userId: params.userId,
    });
  }

  if (
    rawPurpose !== null &&
    !isAutomationEntitlementAssertionPurpose(rawPurpose)
  ) {
    return deny({
      feature: requestedFeature,
      reason: "entitlement_assertion_malformed",
      userId: params.userId,
    });
  }

  if (rawFeature !== requestedFeature) {
    return deny({
      feature: requestedFeature,
      reason: "entitlement_feature_not_allowed",
      userId: params.userId,
    });
  }

  if (rawUserId !== params.userId.trim()) {
    return deny({
      feature: requestedFeature,
      reason: "entitlement_user_context_mismatch",
      userId: params.userId,
    });
  }

  const issuedAtMs = parseTimestamp(rawIssuedAt);
  const expiresAtMs = parseTimestamp(rawExpiresAt);
  const nowMs = parseNow(params.now);

  if (
    issuedAtMs === null ||
    expiresAtMs === null ||
    expiresAtMs <= issuedAtMs
  ) {
    return deny({
      feature: requestedFeature,
      reason: "entitlement_assertion_malformed",
      userId: params.userId,
    });
  }

  if (
    expiresAtMs - issuedAtMs >
      AUTOMATION_ENTITLEMENT_ASSERTION_MAX_TTL_SECONDS * 1000 ||
    issuedAtMs - nowMs >
      AUTOMATION_ENTITLEMENT_ASSERTION_CLOCK_SKEW_SECONDS * 1000
  ) {
    return deny({
      feature: requestedFeature,
      reason: "entitlement_assertion_malformed",
      userId: params.userId,
    });
  }

  if (
    nowMs - expiresAtMs >
    AUTOMATION_ENTITLEMENT_ASSERTION_CLOCK_SKEW_SECONDS * 1000
  ) {
    return deny({
      feature: requestedFeature,
      reason: "entitlement_assertion_expired",
      userId: params.userId,
    });
  }

  if (!isFeatureAllowedForPlan(requestedFeature, rawPlan)) {
    return deny({
      feature: requestedFeature,
      reason: "entitlement_feature_not_allowed",
      userId: params.userId,
    });
  }

  return {
    allowed: true,
    assertion: {
      audience: rawAudience,
      expires_at: rawExpiresAt,
      feature: rawFeature,
      issued_at: rawIssuedAt,
      issuer: rawIssuer,
      plan: rawPlan,
      plan_source: rawPlanSource,
      ...(rawPurpose === null ? {} : { purpose: rawPurpose }),
      ...(rawRequestId === null ? {} : { request_id: rawRequestId }),
      user_id: rawUserId,
    },
    feature: requestedFeature,
    normalizedPlan: rawPlan,
    reason: "allowed",
    userId: rawUserId,
  };
}

export function isAutomationEntitlementAssertionIssuer(
  value: string,
): value is AutomationEntitlementAssertionIssuer {
  return AUTOMATION_ENTITLEMENT_ASSERTION_ISSUERS.includes(
    value as AutomationEntitlementAssertionIssuer,
  );
}

export function isAutomationEntitlementAssertionAudience(
  value: string,
): value is AutomationEntitlementAssertionAudience {
  return AUTOMATION_ENTITLEMENT_ASSERTION_AUDIENCES.includes(
    value as AutomationEntitlementAssertionAudience,
  );
}

export function isAutomationEntitlementAssertionPurpose(
  value: string,
): value is AutomationEntitlementAssertionPurpose {
  return AUTOMATION_ENTITLEMENT_ASSERTION_PURPOSES.includes(
    value as AutomationEntitlementAssertionPurpose,
  );
}

function deny(params: {
  feature: FeatureGateKey | null;
  reason: AutomationEntitlementAssertionReasonCode;
  userId: string | null;
}): AutomationEntitlementAssertionValidation {
  return {
    allowed: false,
    assertion: null,
    feature: params.feature,
    normalizedPlan: null,
    reason: params.reason,
    userId: params.userId?.trim() || null,
  };
}

function parseTimestamp(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
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

function asOptionalNonEmptyString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return asNonEmptyString(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
