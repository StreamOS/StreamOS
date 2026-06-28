import "server-only";

import type { User } from "@supabase/supabase-js";
import type { Tables } from "@streamos/database";
import { createClient } from "@/lib/supabase/server";
import {
  evaluateServerFeatureGate,
  resolveServerEntitlementContext,
  type ServerEntitlementContext,
  type ServerFeatureGateDecision,
} from "./server";

type PersistedPlanModelRecord = Pick<
  Tables<"user_plan_models">,
  "billing_status" | "plan" | "source" | "updated_at" | "user_id"
>;

export async function readPersistedPlanModelForUser(
  user: Pick<User, "id">,
): Promise<PersistedPlanModelRecord | null> {
  const supabase = await createClient();
  const result = await supabase
    .from("user_plan_models")
    .select("billing_status, plan, source, updated_at, user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (result.error) {
    throw result.error;
  }

  return result.data as PersistedPlanModelRecord | null;
}

export async function resolvePersistedServerEntitlementContext(params: {
  user: Pick<User, "id"> | null;
}): Promise<ServerEntitlementContext> {
  if (params.user === null) {
    return resolveServerEntitlementContext({
      user: null,
    });
  }

  try {
    const persistedPlanModel = await readPersistedPlanModelForUser(params.user);

    return resolveServerEntitlementContext({
      billingStatus: persistedPlanModel?.billing_status,
      trustedPlan: persistedPlanModel?.plan,
      trustedSource: persistedPlanModel?.source,
      user: params.user,
    });
  } catch {
    return resolveServerEntitlementContext({
      user: params.user,
    });
  }
}

export async function evaluatePersistedServerFeatureGate(params: {
  feature: string;
  user: Pick<User, "id"> | null;
}): Promise<ServerFeatureGateDecision> {
  if (params.user === null) {
    return evaluateServerFeatureGate({
      feature: params.feature,
      user: null,
    });
  }

  try {
    const persistedPlanModel = await readPersistedPlanModelForUser(params.user);

    return evaluateServerFeatureGate({
      billingStatus: persistedPlanModel?.billing_status,
      feature: params.feature,
      trustedPlan: persistedPlanModel?.plan,
      trustedSource: persistedPlanModel?.source,
      user: params.user,
    });
  } catch {
    return evaluateServerFeatureGate({
      feature: params.feature,
      user: params.user,
    });
  }
}
