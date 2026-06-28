export const FEATURE_GATE_KEYS = [
  "ai_assistant",
  "advanced_analytics",
  "publishing_schedule",
  "monetization_exports",
  "branding_ai",
  "team_workspace",
] as const;

export type FeatureGateKey = (typeof FEATURE_GATE_KEYS)[number];

export const ENTITLEMENT_PLANS = ["free", "pro", "agency"] as const;

export type EntitlementPlan = (typeof ENTITLEMENT_PLANS)[number];

export const FEATURE_GATE_DECISION_REASONS = [
  "allowed",
  "plan_denied",
  "unknown_feature",
  "unknown_plan_fallback",
] as const;

export type FeatureGateDecisionReason =
  (typeof FEATURE_GATE_DECISION_REASONS)[number];

export type FeatureGateDefinition = {
  description: string;
  minimumPlan: EntitlementPlan;
};

export type FeatureGateDecision = {
  allowed: boolean;
  feature: FeatureGateKey | null;
  normalizedPlan: EntitlementPlan;
  reason: FeatureGateDecisionReason;
  requestedFeature: string;
};

export const FEATURE_GATE_DEFINITIONS: Record<
  FeatureGateKey,
  FeatureGateDefinition
> = {
  advanced_analytics: {
    description:
      "Enables future premium analytics layers beyond the current read-only dashboard contract.",
    minimumPlan: "pro",
  },
  ai_assistant: {
    description:
      "Enables future AI assistant entry points after separate cost, abuse, and model guardrails exist.",
    minimumPlan: "pro",
  },
  branding_ai: {
    description:
      "Enables future AI-assisted branding flows without authorizing brand mutations in this foundation slice.",
    minimumPlan: "pro",
  },
  monetization_exports: {
    description:
      "Enables future premium monetization export flows without introducing billing or export execution here.",
    minimumPlan: "pro",
  },
  publishing_schedule: {
    description:
      "Enables future scheduling controls after server-side scheduler execution remains separately guarded.",
    minimumPlan: "pro",
  },
  team_workspace: {
    description:
      "Reserves future multi-user and agency workspace gates without adding a team model in this slice.",
    minimumPlan: "agency",
  },
};

const PLAN_RANK: Record<EntitlementPlan, number> = {
  agency: 2,
  free: 0,
  pro: 1,
};

export function isFeatureGateKey(value: string): value is FeatureGateKey {
  return FEATURE_GATE_KEYS.includes(value as FeatureGateKey);
}

export function isEntitlementPlan(value: string): value is EntitlementPlan {
  return ENTITLEMENT_PLANS.includes(value as EntitlementPlan);
}

export function normalizeEntitlementPlan(value: unknown): EntitlementPlan {
  if (typeof value !== "string") {
    return "free";
  }

  const normalized = value.trim().toLowerCase();

  return isEntitlementPlan(normalized) ? normalized : "free";
}

export function getFeatureGateDefinition(
  feature: FeatureGateKey,
): FeatureGateDefinition {
  return FEATURE_GATE_DEFINITIONS[feature];
}

export function getFeaturesForPlan(plan: EntitlementPlan): FeatureGateKey[] {
  return FEATURE_GATE_KEYS.filter((feature) =>
    isFeatureAllowedForPlan(feature, plan),
  );
}

export function isFeatureAllowedForPlan(
  feature: FeatureGateKey,
  plan: EntitlementPlan,
): boolean {
  const definition = FEATURE_GATE_DEFINITIONS[feature];

  return PLAN_RANK[plan] >= PLAN_RANK[definition.minimumPlan];
}

export function evaluateFeatureGate(params: {
  feature: string;
  plan: unknown;
}): FeatureGateDecision {
  const normalizedPlan = normalizeEntitlementPlan(params.plan);
  const feature = params.feature.trim();
  const rawPlan = asString(params.plan);
  const reason =
    normalizedPlan === "free" && rawPlan !== null && !isEntitlementPlan(rawPlan)
      ? "unknown_plan_fallback"
      : null;

  if (!isFeatureGateKey(feature)) {
    return {
      allowed: false,
      feature: null,
      normalizedPlan,
      reason: "unknown_feature",
      requestedFeature: params.feature,
    };
  }

  if (isFeatureAllowedForPlan(feature, normalizedPlan)) {
    return {
      allowed: true,
      feature,
      normalizedPlan,
      reason: "allowed",
      requestedFeature: params.feature,
    };
  }

  return {
    allowed: false,
    feature,
    normalizedPlan,
    reason: reason ?? "plan_denied",
    requestedFeature: params.feature,
  };
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value.trim().toLowerCase() : null;
}
