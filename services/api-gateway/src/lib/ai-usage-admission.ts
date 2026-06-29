import {
  evaluateFeatureGate,
  isFeatureGateKey,
  isTrustedPlanModelSource,
  resolvePlanModel,
  type EntitlementPlan,
  type FeatureGateKey,
  type TrustedPlanModelSource,
} from "@streamos/types";

export const GATEWAY_AI_USAGE_ADMISSION_FEATURES = ["ai_assistant"] as const;

export type GatewayAiUsageAdmissionKnownFeature =
  (typeof GATEWAY_AI_USAGE_ADMISSION_FEATURES)[number];

export const GATEWAY_AI_USAGE_ADMISSION_RUNTIME_STATUSES = [
  "active",
  "not_yet_productive",
] as const;

export type GatewayAiUsageAdmissionRuntimeStatus =
  (typeof GATEWAY_AI_USAGE_ADMISSION_RUNTIME_STATUSES)[number];

export const GATEWAY_AI_USAGE_BUDGET_MODES = [
  "not_configured",
  "stubbed_allow",
] as const;

export type GatewayAiUsageBudgetMode =
  (typeof GATEWAY_AI_USAGE_BUDGET_MODES)[number];

export type GatewayAiUsageAdmissionReasonCode =
  | "allowed"
  | "ai_usage_budget_not_configured"
  | "ai_usage_context_missing"
  | "ai_usage_feature_not_allowed"
  | "ai_usage_not_productive"
  | "ai_usage_plan_denied"
  | "ai_usage_plan_required";

export type GatewayAiUsageAdmissionPolicy = {
  budgetMode: GatewayAiUsageBudgetMode;
  runtimeStatus: GatewayAiUsageAdmissionRuntimeStatus;
};

export type GatewayAiUsageAdmissionPolicies = Record<
  GatewayAiUsageAdmissionKnownFeature,
  GatewayAiUsageAdmissionPolicy
>;

export type GatewayAiUsageAdmissionPoliciesInput = Partial<
  Record<
    GatewayAiUsageAdmissionKnownFeature,
    Partial<GatewayAiUsageAdmissionPolicy>
  >
>;

export type GatewayAiUsageBudgetContext = {
  contractVersion: "2026-06-29.ai-usage-admission.v1";
  estimatedUsageUnits: number;
  feature: FeatureGateKey;
  normalizedPlan: EntitlementPlan;
  requestClassification: string;
  tenantId: string;
  userId: string;
};

export type GatewayAiUsageAdmissionDecision = {
  allowed: boolean;
  budgetContext: GatewayAiUsageBudgetContext | null;
  feature: FeatureGateKey | null;
  normalizedPlan: EntitlementPlan;
  planSource: TrustedPlanModelSource | null;
  policyBudgetMode: GatewayAiUsageBudgetMode;
  policyRuntimeStatus: GatewayAiUsageAdmissionRuntimeStatus;
  reasonCode: GatewayAiUsageAdmissionReasonCode;
  requestedFeature: string;
  tenantId: string | null;
  userId: string | null;
};

const DEFAULT_GATEWAY_AI_USAGE_ADMISSION_POLICIES: GatewayAiUsageAdmissionPolicies =
  {
    ai_assistant: {
      budgetMode: "not_configured",
      runtimeStatus: "not_yet_productive",
    },
  };

export function resolveGatewayAiUsageAdmissionPolicies(
  input: GatewayAiUsageAdmissionPoliciesInput = {},
): GatewayAiUsageAdmissionPolicies {
  return {
    ai_assistant: resolveGatewayAiUsageAdmissionPolicy({
      fallback: DEFAULT_GATEWAY_AI_USAGE_ADMISSION_POLICIES.ai_assistant,
      input: input.ai_assistant,
    }),
  };
}

export function authorizeGatewayAiUsageAdmission(params: {
  estimatedUsageUnits: number;
  feature: string;
  plan: unknown;
  planSource: unknown;
  policies: GatewayAiUsageAdmissionPolicies;
  requestClassification: string;
  tenantId: string | null;
  userId: string | null;
}): GatewayAiUsageAdmissionDecision {
  const normalizedUserId = asNonEmptyString(params.userId);
  const normalizedTenantId = asNonEmptyString(params.tenantId);
  const requestedFeature = params.feature.trim();

  if (!isKnownGatewayAiUsageAdmissionFeature(requestedFeature)) {
    return deny({
      feature: isFeatureGateKey(requestedFeature) ? requestedFeature : null,
      normalizedPlan: "free",
      planSource: null,
      policyBudgetMode: "not_configured",
      policyRuntimeStatus: "not_yet_productive",
      reasonCode: "ai_usage_feature_not_allowed",
      requestedFeature,
      tenantId: normalizedTenantId,
      userId: normalizedUserId,
    });
  }

  const policy = params.policies[requestedFeature];
  const requestClassification = asNonEmptyString(params.requestClassification);
  const estimatedUsageUnits = normalizeEstimatedUsageUnits(
    params.estimatedUsageUnits,
  );

  if (
    normalizedTenantId === null ||
    normalizedUserId === null ||
    requestClassification === null ||
    estimatedUsageUnits === null
  ) {
    return deny({
      feature: requestedFeature,
      normalizedPlan: "free",
      planSource: null,
      policyBudgetMode: policy.budgetMode,
      policyRuntimeStatus: policy.runtimeStatus,
      reasonCode: "ai_usage_context_missing",
      requestedFeature,
      tenantId: normalizedTenantId,
      userId: normalizedUserId,
    });
  }

  if (policy.runtimeStatus !== "active") {
    return deny({
      feature: requestedFeature,
      normalizedPlan: "free",
      planSource: null,
      policyBudgetMode: policy.budgetMode,
      policyRuntimeStatus: policy.runtimeStatus,
      reasonCode: "ai_usage_not_productive",
      requestedFeature,
      tenantId: normalizedTenantId,
      userId: normalizedUserId,
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
      policyBudgetMode: policy.budgetMode,
      policyRuntimeStatus: policy.runtimeStatus,
      reasonCode: "ai_usage_plan_required",
      requestedFeature,
      tenantId: normalizedTenantId,
      userId: normalizedUserId,
    });
  }

  const featureDecision = evaluateFeatureGate({
    feature: requestedFeature,
    plan: params.plan,
  });

  if (!featureDecision.allowed || featureDecision.feature === null) {
    return deny({
      feature: featureDecision.feature,
      normalizedPlan: featureDecision.normalizedPlan,
      planSource: trustedPlanSource,
      policyBudgetMode: policy.budgetMode,
      policyRuntimeStatus: policy.runtimeStatus,
      reasonCode: "ai_usage_plan_denied",
      requestedFeature,
      tenantId: normalizedTenantId,
      userId: normalizedUserId,
    });
  }

  if (policy.budgetMode !== "stubbed_allow") {
    return deny({
      feature: featureDecision.feature,
      normalizedPlan: featureDecision.normalizedPlan,
      planSource: trustedPlanSource,
      policyBudgetMode: policy.budgetMode,
      policyRuntimeStatus: policy.runtimeStatus,
      reasonCode: "ai_usage_budget_not_configured",
      requestedFeature,
      tenantId: normalizedTenantId,
      userId: normalizedUserId,
    });
  }

  return allow({
    budgetContext: {
      contractVersion: "2026-06-29.ai-usage-admission.v1",
      estimatedUsageUnits,
      feature: featureDecision.feature,
      normalizedPlan: featureDecision.normalizedPlan,
      requestClassification,
      tenantId: normalizedTenantId,
      userId: normalizedUserId,
    },
    feature: featureDecision.feature,
    normalizedPlan: featureDecision.normalizedPlan,
    planSource: trustedPlanSource,
    policyBudgetMode: policy.budgetMode,
    policyRuntimeStatus: policy.runtimeStatus,
    requestedFeature,
    tenantId: normalizedTenantId,
    userId: normalizedUserId,
  });
}

export function buildGatewayAiUsageAdmissionDenialResponse(
  decision: GatewayAiUsageAdmissionDecision,
): {
  body: {
    error: "ai_usage_admission_unavailable" | "ai_usage_forbidden";
    feature: FeatureGateKey | null;
    message: string;
    reason_code: Exclude<GatewayAiUsageAdmissionReasonCode, "allowed">;
  };
  statusCode: number;
} {
  if (decision.allowed) {
    throw new Error(
      "Gateway AI usage admission denial response requires a denied decision.",
    );
  }

  const deniedDecision = decision as GatewayAiUsageAdmissionDecision & {
    allowed: false;
    reasonCode: Exclude<GatewayAiUsageAdmissionReasonCode, "allowed">;
  };

  if (
    deniedDecision.reasonCode === "ai_usage_budget_not_configured" ||
    deniedDecision.reasonCode === "ai_usage_not_productive"
  ) {
    return {
      body: {
        error: "ai_usage_admission_unavailable",
        feature: deniedDecision.feature,
        message: buildUnavailableMessage(deniedDecision.reasonCode),
        reason_code: deniedDecision.reasonCode,
      },
      statusCode: 503,
    };
  }

  return {
    body: {
      error: "ai_usage_forbidden",
      feature: deniedDecision.feature,
      message:
        "AI usage admission is not available for the current account context.",
      reason_code: deniedDecision.reasonCode,
    },
    statusCode: 403,
  };
}

function resolveGatewayAiUsageAdmissionPolicy(params: {
  fallback: GatewayAiUsageAdmissionPolicy;
  input: Partial<GatewayAiUsageAdmissionPolicy> | undefined;
}): GatewayAiUsageAdmissionPolicy {
  return {
    budgetMode:
      params.input?.budgetMode === "stubbed_allow"
        ? "stubbed_allow"
        : params.fallback.budgetMode,
    runtimeStatus:
      params.input?.runtimeStatus === "active"
        ? "active"
        : params.fallback.runtimeStatus,
  };
}

function allow(params: {
  budgetContext: GatewayAiUsageBudgetContext;
  feature: FeatureGateKey;
  normalizedPlan: EntitlementPlan;
  planSource: TrustedPlanModelSource;
  policyBudgetMode: GatewayAiUsageBudgetMode;
  policyRuntimeStatus: GatewayAiUsageAdmissionRuntimeStatus;
  requestedFeature: string;
  tenantId: string;
  userId: string;
}): GatewayAiUsageAdmissionDecision {
  return {
    allowed: true,
    budgetContext: params.budgetContext,
    feature: params.feature,
    normalizedPlan: params.normalizedPlan,
    planSource: params.planSource,
    policyBudgetMode: params.policyBudgetMode,
    policyRuntimeStatus: params.policyRuntimeStatus,
    reasonCode: "allowed",
    requestedFeature: params.requestedFeature,
    tenantId: params.tenantId,
    userId: params.userId,
  };
}

function deny(params: {
  feature: FeatureGateKey | null;
  normalizedPlan: EntitlementPlan;
  planSource: TrustedPlanModelSource | null;
  policyBudgetMode: GatewayAiUsageBudgetMode;
  policyRuntimeStatus: GatewayAiUsageAdmissionRuntimeStatus;
  reasonCode: Exclude<GatewayAiUsageAdmissionReasonCode, "allowed">;
  requestedFeature: string;
  tenantId: string | null;
  userId: string | null;
}): GatewayAiUsageAdmissionDecision {
  return {
    allowed: false,
    budgetContext: null,
    feature: params.feature,
    normalizedPlan: params.normalizedPlan,
    planSource: params.planSource,
    policyBudgetMode: params.policyBudgetMode,
    policyRuntimeStatus: params.policyRuntimeStatus,
    reasonCode: params.reasonCode,
    requestedFeature: params.requestedFeature,
    tenantId: params.tenantId,
    userId: params.userId,
  };
}

function buildUnavailableMessage(
  reasonCode: "ai_usage_budget_not_configured" | "ai_usage_not_productive",
): string {
  if (reasonCode === "ai_usage_budget_not_configured") {
    return "AI usage budget enforcement is not configured.";
  }

  return "AI usage admission is not yet productive for this feature.";
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function isKnownGatewayAiUsageAdmissionFeature(
  value: string,
): value is GatewayAiUsageAdmissionKnownFeature {
  return GATEWAY_AI_USAGE_ADMISSION_FEATURES.includes(
    value as GatewayAiUsageAdmissionKnownFeature,
  );
}

function normalizeEstimatedUsageUnits(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return null;
  }

  return value;
}
