import "server-only";

import type { User } from "@supabase/supabase-js";
import {
  evaluateFeatureGate,
  normalizeEntitlementPlan,
  type EntitlementPlan,
  type FeatureGateDecision,
} from "@streamos/types";

export type ServerEntitlementSource =
  | "default_free_no_persisted_plan"
  | "trusted_server_input"
  | "unknown_plan_fallback";

export type ServerEntitlementContext = {
  authenticated: boolean;
  hasPersistedPlanModel: false;
  normalizedPlan: EntitlementPlan;
  source: ServerEntitlementSource;
  userId: string | null;
};

export type ServerFeatureGateDecision = FeatureGateDecision & {
  context: ServerEntitlementContext;
  enforcedServerSide: true;
};

export function resolveServerEntitlementContext(params: {
  trustedPlan?: unknown;
  user: Pick<User, "id"> | null;
}): ServerEntitlementContext {
  const normalizedPlan = normalizeEntitlementPlan(params.trustedPlan);
  const trustedPlanKnown =
    typeof params.trustedPlan === "string" &&
    normalizeEntitlementPlan(params.trustedPlan) ===
      params.trustedPlan.trim().toLowerCase();

  return {
    authenticated: params.user !== null,
    hasPersistedPlanModel: false,
    normalizedPlan,
    source:
      params.trustedPlan === undefined
        ? "default_free_no_persisted_plan"
        : trustedPlanKnown
          ? "trusted_server_input"
          : "unknown_plan_fallback",
    userId: params.user?.id ?? null,
  };
}

export function evaluateServerFeatureGate(params: {
  feature: string;
  trustedPlan?: unknown;
  user: Pick<User, "id"> | null;
}): ServerFeatureGateDecision {
  const context = resolveServerEntitlementContext({
    trustedPlan: params.trustedPlan,
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
