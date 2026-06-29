import {
  evaluateFeatureGate,
  isFeatureGateKey,
  isTrustedPlanModelSource,
  resolvePlanModel,
  type EntitlementPlan,
  type FeatureGateKey,
  type TrustedPlanModelSource,
} from "@streamos/types";

import { readSupabaseRows, type SupabaseRestClient } from "./supabaseRest.js";

export const GATEWAY_PREMIUM_COMMAND_KEYS = [
  "publication_schedule_mutation",
  "fanout_schedule_mutation",
] as const;

export type GatewayPremiumCommandKey =
  (typeof GATEWAY_PREMIUM_COMMAND_KEYS)[number];

export const GATEWAY_PREMIUM_COMMAND_ENFORCEMENT_MODES = [
  "disabled",
  "enforced",
] as const;

export type GatewayPremiumCommandEnforcementMode =
  (typeof GATEWAY_PREMIUM_COMMAND_ENFORCEMENT_MODES)[number];

export type GatewayPremiumCommandReasonCode =
  | "allowed"
  | "premium_command_enforcement_unavailable"
  | "premium_command_feature_not_allowed"
  | "premium_command_plan_denied"
  | "premium_command_plan_required"
  | "premium_command_user_context_mismatch";

export type GatewayPremiumCommandPolicy = {
  feature: string;
  mode: GatewayPremiumCommandEnforcementMode;
};

export type GatewayPremiumCommandPolicies = Record<
  GatewayPremiumCommandKey,
  GatewayPremiumCommandPolicy
>;

export type GatewayPremiumCommandPoliciesInput = Partial<
  Record<GatewayPremiumCommandKey, Partial<GatewayPremiumCommandPolicy>>
>;

export type GatewayPremiumCommandDecision = {
  allowed: boolean;
  commandKey: GatewayPremiumCommandKey;
  feature: FeatureGateKey | null;
  normalizedPlan: EntitlementPlan;
  planSource: TrustedPlanModelSource | null;
  policyMode: GatewayPremiumCommandEnforcementMode;
  reasonCode: GatewayPremiumCommandReasonCode;
  requestedFeature: string;
  userId: string | null;
};

type UserPlanModelRow = Pick<
  {
    billing_status: string | null;
    plan: string | null;
    source: string | null;
    user_id: string;
  },
  "billing_status" | "plan" | "source" | "user_id"
>;

const DEFAULT_GATEWAY_PREMIUM_COMMAND_POLICIES: GatewayPremiumCommandPolicies =
  {
    fanout_schedule_mutation: {
      feature: "publishing_schedule",
      mode: "disabled",
    },
    publication_schedule_mutation: {
      feature: "publishing_schedule",
      mode: "disabled",
    },
  };

export function resolveGatewayPremiumCommandPolicies(
  input: GatewayPremiumCommandPoliciesInput = {},
): GatewayPremiumCommandPolicies {
  return {
    fanout_schedule_mutation: resolveGatewayPremiumCommandPolicy({
      fallback:
        DEFAULT_GATEWAY_PREMIUM_COMMAND_POLICIES.fanout_schedule_mutation,
      input: input.fanout_schedule_mutation,
    }),
    publication_schedule_mutation: resolveGatewayPremiumCommandPolicy({
      fallback:
        DEFAULT_GATEWAY_PREMIUM_COMMAND_POLICIES.publication_schedule_mutation,
      input: input.publication_schedule_mutation,
    }),
  };
}

export async function authorizeGatewayPremiumCommand(params: {
  commandKey: GatewayPremiumCommandKey;
  policies: GatewayPremiumCommandPolicies;
  supabase: SupabaseRestClient;
  userId: string | null;
}): Promise<GatewayPremiumCommandDecision> {
  const policy = params.policies[params.commandKey];
  const normalizedUserId = asNonEmptyString(params.userId);
  const requestedFeature = policy.feature.trim();

  if (policy.mode === "disabled") {
    return allow({
      commandKey: params.commandKey,
      feature: isFeatureGateKey(requestedFeature) ? requestedFeature : null,
      normalizedPlan: "free",
      planSource: null,
      policyMode: policy.mode,
      requestedFeature,
      userId: normalizedUserId,
    });
  }

  if (normalizedUserId === null) {
    return deny({
      commandKey: params.commandKey,
      feature: isFeatureGateKey(requestedFeature) ? requestedFeature : null,
      normalizedPlan: "free",
      planSource: null,
      policyMode: policy.mode,
      reasonCode: "premium_command_user_context_mismatch",
      requestedFeature,
      userId: null,
    });
  }

  if (!isFeatureGateKey(requestedFeature)) {
    return deny({
      commandKey: params.commandKey,
      feature: null,
      normalizedPlan: "free",
      planSource: null,
      policyMode: policy.mode,
      reasonCode: "premium_command_feature_not_allowed",
      requestedFeature,
      userId: normalizedUserId,
    });
  }

  let persistedPlanModel: UserPlanModelRow | null;

  try {
    persistedPlanModel = await loadUserPlanModel({
      supabase: params.supabase,
      userId: normalizedUserId,
    });
  } catch {
    return deny({
      commandKey: params.commandKey,
      feature: requestedFeature,
      normalizedPlan: "free",
      planSource: null,
      policyMode: policy.mode,
      reasonCode: "premium_command_enforcement_unavailable",
      requestedFeature,
      userId: normalizedUserId,
    });
  }

  if (
    persistedPlanModel !== null &&
    persistedPlanModel.user_id.trim() !== normalizedUserId
  ) {
    return deny({
      commandKey: params.commandKey,
      feature: requestedFeature,
      normalizedPlan: "free",
      planSource: null,
      policyMode: policy.mode,
      reasonCode: "premium_command_user_context_mismatch",
      requestedFeature,
      userId: normalizedUserId,
    });
  }

  const planResolution = resolvePlanModel({
    billingStatus: persistedPlanModel?.billing_status,
    plan: persistedPlanModel?.plan,
    source: persistedPlanModel?.source,
  });
  const trustedPlanSource =
    persistedPlanModel?.source &&
    isTrustedPlanModelSource(persistedPlanModel.source)
      ? persistedPlanModel.source
      : null;

  if (!planResolution.hasTrustedPlanSource || trustedPlanSource === null) {
    return deny({
      commandKey: params.commandKey,
      feature: requestedFeature,
      normalizedPlan: planResolution.normalizedPlan,
      planSource: null,
      policyMode: policy.mode,
      reasonCode: "premium_command_plan_required",
      requestedFeature,
      userId: normalizedUserId,
    });
  }

  const featureDecision = evaluateFeatureGate({
    feature: requestedFeature,
    plan: persistedPlanModel?.plan ?? planResolution.normalizedPlan,
  });

  if (!featureDecision.allowed || featureDecision.feature === null) {
    return deny({
      commandKey: params.commandKey,
      feature: featureDecision.feature,
      normalizedPlan: featureDecision.normalizedPlan,
      planSource: trustedPlanSource,
      policyMode: policy.mode,
      reasonCode: "premium_command_plan_denied",
      requestedFeature,
      userId: normalizedUserId,
    });
  }

  return allow({
    commandKey: params.commandKey,
    feature: featureDecision.feature,
    normalizedPlan: featureDecision.normalizedPlan,
    planSource: trustedPlanSource,
    policyMode: policy.mode,
    requestedFeature,
    userId: normalizedUserId,
  });
}

export function buildGatewayPremiumCommandDenialResponse(
  decision: GatewayPremiumCommandDecision,
): {
  body: {
    command_key: GatewayPremiumCommandKey;
    error:
      | "premium_command_enforcement_unavailable"
      | "premium_command_forbidden";
    feature: FeatureGateKey | null;
    message: string;
    reason_code: Exclude<GatewayPremiumCommandReasonCode, "allowed">;
  };
  statusCode: number;
} {
  if (decision.allowed) {
    throw new Error(
      "Gateway premium command denial response requires a denied decision.",
    );
  }

  const deniedDecision = decision as GatewayPremiumCommandDecision & {
    allowed: false;
    reasonCode: Exclude<GatewayPremiumCommandReasonCode, "allowed">;
  };

  if (deniedDecision.reasonCode === "premium_command_enforcement_unavailable") {
    return {
      body: {
        command_key: deniedDecision.commandKey,
        error: "premium_command_enforcement_unavailable",
        feature: deniedDecision.feature,
        message: "Premium command enforcement is temporarily unavailable.",
        reason_code: "premium_command_enforcement_unavailable",
      },
      statusCode: 503,
    };
  }

  return {
    body: {
      command_key: deniedDecision.commandKey,
      error: "premium_command_forbidden",
      feature: deniedDecision.feature,
      message: "This command is not available for the current account context.",
      reason_code: deniedDecision.reasonCode,
    },
    statusCode: 403,
  };
}

async function loadUserPlanModel(params: {
  supabase: SupabaseRestClient;
  userId: string;
}): Promise<UserPlanModelRow | null> {
  const rows = await readSupabaseRows<UserPlanModelRow>({
    client: params.supabase,
    params: {
      limit: "1",
      select: "billing_status,plan,source,user_id",
      user_id: `eq.${params.userId}`,
    },
    table: "user_plan_models",
  });

  return rows[0] ?? null;
}

function resolveGatewayPremiumCommandPolicy(params: {
  fallback: GatewayPremiumCommandPolicy;
  input: Partial<GatewayPremiumCommandPolicy> | undefined;
}): GatewayPremiumCommandPolicy {
  return {
    feature: normalizeFeature(params.input?.feature, params.fallback.feature),
    mode:
      params.input?.mode === "enforced"
        ? "enforced"
        : params.fallback.mode === "enforced"
          ? "enforced"
          : "disabled",
  };
}

function normalizeFeature(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : fallback;
}

function allow(params: {
  commandKey: GatewayPremiumCommandKey;
  feature: FeatureGateKey | null;
  normalizedPlan: EntitlementPlan;
  planSource: TrustedPlanModelSource | null;
  policyMode: GatewayPremiumCommandEnforcementMode;
  requestedFeature: string;
  userId: string | null;
}): GatewayPremiumCommandDecision {
  return {
    allowed: true,
    commandKey: params.commandKey,
    feature: params.feature,
    normalizedPlan: params.normalizedPlan,
    planSource: params.planSource,
    policyMode: params.policyMode,
    reasonCode: "allowed",
    requestedFeature: params.requestedFeature,
    userId: params.userId,
  };
}

function deny(params: {
  commandKey: GatewayPremiumCommandKey;
  feature: FeatureGateKey | null;
  normalizedPlan: EntitlementPlan;
  planSource: TrustedPlanModelSource | null;
  policyMode: GatewayPremiumCommandEnforcementMode;
  reasonCode: Exclude<GatewayPremiumCommandReasonCode, "allowed">;
  requestedFeature: string;
  userId: string | null;
}): GatewayPremiumCommandDecision {
  return {
    allowed: false,
    commandKey: params.commandKey,
    feature: params.feature,
    normalizedPlan: params.normalizedPlan,
    planSource: params.planSource,
    policyMode: params.policyMode,
    reasonCode: params.reasonCode,
    requestedFeature: params.requestedFeature,
    userId: params.userId,
  };
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}
