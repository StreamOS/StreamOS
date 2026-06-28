import "server-only";

import type { User } from "@supabase/supabase-js";
import {
  evaluateFeatureGate,
  resolvePlanModel,
  type BillingReadinessStatus,
  type EntitlementPlan,
  type FeatureGateDecision,
  type PlanModelResolutionReason,
  type PlanModelSource,
  type PlanModelSourceTrust,
  type TrustedPlanModelSource,
} from "@streamos/types";

export type ServerEntitlementSource = PlanModelResolutionReason;

export type ServerEntitlementContext = {
  authenticated: boolean;
  billingStatus: BillingReadinessStatus | null;
  hasPersistedPlanModel: boolean;
  hasTrustedPlanSource: boolean;
  normalizedPlan: EntitlementPlan;
  sourceKind: PlanModelSource;
  source: ServerEntitlementSource;
  sourceTrust: PlanModelSourceTrust;
  userId: string | null;
};

export type ServerFeatureGateDecision = FeatureGateDecision & {
  context: ServerEntitlementContext;
  enforcedServerSide: true;
};

export function resolveServerEntitlementContext(params: {
  billingStatus?: unknown;
  trustedPlan?: unknown;
  trustedSource?: TrustedPlanModelSource;
  user: Pick<User, "id"> | null;
}): ServerEntitlementContext {
  const resolution = resolvePlanModel({
    billingStatus: params.billingStatus,
    plan: params.trustedPlan,
    source: params.trustedSource,
  });

  return {
    authenticated: params.user !== null,
    billingStatus: resolution.billingStatus,
    hasPersistedPlanModel: resolution.hasPersistedPlanModel,
    hasTrustedPlanSource: resolution.hasTrustedPlanSource,
    normalizedPlan: resolution.normalizedPlan,
    source: resolution.reason,
    sourceKind: resolution.source,
    sourceTrust: resolution.sourceTrust,
    userId: params.user?.id ?? null,
  };
}

export function evaluateServerFeatureGate(params: {
  billingStatus?: unknown;
  feature: string;
  trustedPlan?: unknown;
  trustedSource?: TrustedPlanModelSource;
  user: Pick<User, "id"> | null;
}): ServerFeatureGateDecision {
  const context = resolveServerEntitlementContext({
    billingStatus: params.billingStatus,
    trustedPlan: params.trustedPlan,
    trustedSource: params.trustedSource,
    user: params.user,
  });
  const decision = evaluateFeatureGate({
    feature: params.feature,
    plan:
      context.source === "unknown_plan_fallback"
        ? params.trustedPlan
        : context.normalizedPlan,
  });

  return {
    ...decision,
    context,
    enforcedServerSide: true,
  };
}
