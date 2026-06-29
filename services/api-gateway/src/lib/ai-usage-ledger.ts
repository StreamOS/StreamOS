import {
  isEntitlementPlan,
  isTrustedPlanModelSource,
  type EntitlementPlan,
  type TrustedPlanModelSource,
} from "@streamos/types";

import {
  GATEWAY_AI_USAGE_ADMISSION_FEATURES,
  type GatewayAiUsageAdmissionKnownFeature,
} from "./ai-usage-admission.js";
import {
  readSupabaseRows,
  upsertSupabaseRow,
  type SupabaseRestClient,
} from "./supabaseRest.js";

export const AI_USAGE_LEDGER_STATUSES = [
  "reserved",
  "recorded",
  "denied",
] as const;

export type AiUsageLedgerStatus = (typeof AI_USAGE_LEDGER_STATUSES)[number];

export const AI_USAGE_LEDGER_ERROR_CATEGORIES = [
  "admission_denied",
  "budget_unavailable",
  "provider_rate_limit",
  "request_timeout",
  "policy_blocked",
  "upstream_unavailable",
  "unknown_failure",
] as const;

export type AiUsageLedgerErrorCategory =
  (typeof AI_USAGE_LEDGER_ERROR_CATEGORIES)[number];

export type AiUsageLedgerEntry = {
  createdAt: string;
  errorCategory: AiUsageLedgerErrorCategory | null;
  estimatedUsageUnits: number;
  feature: GatewayAiUsageAdmissionKnownFeature;
  finalUsageUnits: number | null;
  id: string;
  ledgerStatus: AiUsageLedgerStatus;
  planAtRequestTime: EntitlementPlan;
  planSource: TrustedPlanModelSource;
  requestClassification: string;
  requestId: string;
  tenantId: string;
  updatedAt: string;
  usageMonth: string;
  userId: string;
};

export type AiUsageMonthlyLedgerSummary = {
  deniedCount: number;
  feature: GatewayAiUsageAdmissionKnownFeature;
  monthStart: string;
  recordedUsageUnits: number;
  reservedUsageUnits: number;
  tenantId: string;
  totalRows: number;
  userId: string;
};

export async function recordAiUsageLedgerEntry(params: {
  client: SupabaseRestClient;
  input: {
    errorCategory?: AiUsageLedgerErrorCategory | null;
    estimatedUsageUnits: number;
    feature: GatewayAiUsageAdmissionKnownFeature;
    finalUsageUnits?: number | null;
    ledgerStatus: AiUsageLedgerStatus;
    planAtRequestTime: EntitlementPlan;
    planSource: TrustedPlanModelSource;
    requestClassification: string;
    requestId: string;
    tenantId: string;
    userId: string;
  };
}): Promise<AiUsageLedgerEntry> {
  const normalizedInput = normalizeAiUsageLedgerWriteInput(params.input);
  const row = await upsertSupabaseRow<AiUsageLedgerRow>({
    client: params.client,
    onConflict: "user_id,request_id",
    payload: {
      error_category: normalizedInput.errorCategory,
      estimated_usage_units: normalizedInput.estimatedUsageUnits,
      feature: normalizedInput.feature,
      final_usage_units: normalizedInput.finalUsageUnits,
      ledger_status: normalizedInput.ledgerStatus,
      plan_at_request_time: normalizedInput.planAtRequestTime,
      plan_source: normalizedInput.planSource,
      request_classification: normalizedInput.requestClassification,
      request_id: normalizedInput.requestId,
      tenant_id: normalizedInput.tenantId,
      user_id: normalizedInput.userId,
    },
    returnRepresentation: true,
    table: "ai_usage_ledger",
  });

  if (row === null) {
    throw new Error("AI usage ledger entry upsert returned no row.");
  }

  return mapAiUsageLedgerRow(row);
}

export async function readAiUsageMonthlyLedgerSummary(params: {
  client: SupabaseRestClient;
  feature: GatewayAiUsageAdmissionKnownFeature;
  monthStart: Date;
  tenantId: string;
  userId: string;
}): Promise<AiUsageMonthlyLedgerSummary> {
  const userId = asNonEmptyString(params.userId, "userId", 80);
  const tenantId = asNonEmptyString(params.tenantId, "tenantId", 200);
  const feature = normalizeAiUsageLedgerFeature(params.feature);
  const monthStart = normalizeMonthStart(params.monthStart);

  const rows = await readSupabaseRows<AiUsageMonthlySummaryRow>({
    client: params.client,
    params: {
      feature: `eq.${feature}`,
      select:
        "estimated_usage_units,final_usage_units,ledger_status,user_id,tenant_id",
      tenant_id: `eq.${tenantId}`,
      usage_month: `eq.${monthStart}`,
      user_id: `eq.${userId}`,
    },
    table: "ai_usage_ledger",
  });

  let reservedUsageUnits = 0;
  let recordedUsageUnits = 0;
  let deniedCount = 0;
  let totalRows = 0;

  for (const row of rows) {
    if (row.user_id !== userId || row.tenant_id !== tenantId) {
      continue;
    }

    totalRows += 1;

    if (row.ledger_status === "reserved") {
      reservedUsageUnits += row.estimated_usage_units;
      continue;
    }

    if (row.ledger_status === "recorded") {
      recordedUsageUnits += row.final_usage_units ?? 0;
      continue;
    }

    deniedCount += 1;
  }

  return {
    deniedCount,
    feature,
    monthStart,
    recordedUsageUnits,
    reservedUsageUnits,
    tenantId,
    totalRows,
    userId,
  };
}

type AiUsageLedgerRow = {
  created_at: string;
  error_category: AiUsageLedgerErrorCategory | null;
  estimated_usage_units: number;
  feature: GatewayAiUsageAdmissionKnownFeature;
  final_usage_units: number | null;
  id: string;
  ledger_status: AiUsageLedgerStatus;
  plan_at_request_time: EntitlementPlan;
  plan_source: TrustedPlanModelSource;
  request_classification: string;
  request_id: string;
  tenant_id: string;
  updated_at: string;
  usage_month: string;
  user_id: string;
};

type AiUsageMonthlySummaryRow = {
  estimated_usage_units: number;
  final_usage_units: number | null;
  ledger_status: AiUsageLedgerStatus;
  tenant_id: string;
  user_id: string;
};

function mapAiUsageLedgerRow(row: AiUsageLedgerRow): AiUsageLedgerEntry {
  return {
    createdAt: row.created_at,
    errorCategory: row.error_category,
    estimatedUsageUnits: row.estimated_usage_units,
    feature: row.feature,
    finalUsageUnits: row.final_usage_units,
    id: row.id,
    ledgerStatus: row.ledger_status,
    planAtRequestTime: row.plan_at_request_time,
    planSource: row.plan_source,
    requestClassification: row.request_classification,
    requestId: row.request_id,
    tenantId: row.tenant_id,
    updatedAt: row.updated_at,
    usageMonth: row.usage_month,
    userId: row.user_id,
  };
}

function normalizeAiUsageLedgerWriteInput(input: {
  errorCategory?: AiUsageLedgerErrorCategory | null;
  estimatedUsageUnits: number;
  feature: GatewayAiUsageAdmissionKnownFeature;
  finalUsageUnits?: number | null;
  ledgerStatus: AiUsageLedgerStatus;
  planAtRequestTime: EntitlementPlan;
  planSource: TrustedPlanModelSource;
  requestClassification: string;
  requestId: string;
  tenantId: string;
  userId: string;
}) {
  const userId = asNonEmptyString(input.userId, "userId", 80);
  // The current persistence boundary remains user_id-primary; tenant_id is
  // stored as defense in depth until a stronger workspace model exists.
  const tenantId = asNonEmptyString(input.tenantId, "tenantId", 200);
  const feature = normalizeAiUsageLedgerFeature(input.feature);
  const requestId = asNonEmptyString(input.requestId, "requestId", 120);
  const requestClassification = asNonEmptyString(
    input.requestClassification,
    "requestClassification",
    120,
  );
  const estimatedUsageUnits = asPositiveInteger(
    input.estimatedUsageUnits,
    "estimatedUsageUnits",
  );
  const ledgerStatus = normalizeAiUsageLedgerStatus(input.ledgerStatus);
  const planAtRequestTime = normalizeEntitlementPlanValue(
    input.planAtRequestTime,
  );
  const planSource = normalizeTrustedPlanSource(input.planSource);
  const finalUsageUnits =
    input.finalUsageUnits == null
      ? null
      : asPositiveInteger(input.finalUsageUnits, "finalUsageUnits");
  const errorCategory =
    input.errorCategory == null
      ? null
      : normalizeAiUsageLedgerErrorCategory(input.errorCategory);

  if (ledgerStatus === "reserved") {
    if (finalUsageUnits !== null || errorCategory !== null) {
      throw new Error(
        "Reserved AI usage ledger entries cannot include finalUsageUnits or errorCategory.",
      );
    }
  } else if (ledgerStatus === "recorded") {
    if (finalUsageUnits === null || errorCategory !== null) {
      throw new Error(
        "Recorded AI usage ledger entries require finalUsageUnits and cannot include errorCategory.",
      );
    }
  } else if (finalUsageUnits !== null || errorCategory === null) {
    throw new Error(
      "Denied AI usage ledger entries require errorCategory and cannot include finalUsageUnits.",
    );
  }

  return {
    errorCategory,
    estimatedUsageUnits,
    feature,
    finalUsageUnits,
    ledgerStatus,
    planAtRequestTime,
    planSource,
    requestClassification,
    requestId,
    tenantId,
    userId,
  };
}

function normalizeAiUsageLedgerFeature(
  value: string,
): GatewayAiUsageAdmissionKnownFeature {
  if (GATEWAY_AI_USAGE_ADMISSION_FEATURES.includes(value as never)) {
    return value as GatewayAiUsageAdmissionKnownFeature;
  }

  throw new Error("AI usage ledger feature is invalid.");
}

function normalizeAiUsageLedgerStatus(value: string): AiUsageLedgerStatus {
  if (AI_USAGE_LEDGER_STATUSES.includes(value as AiUsageLedgerStatus)) {
    return value as AiUsageLedgerStatus;
  }

  throw new Error("AI usage ledger status is invalid.");
}

function normalizeAiUsageLedgerErrorCategory(
  value: string,
): AiUsageLedgerErrorCategory {
  if (AI_USAGE_LEDGER_ERROR_CATEGORIES.includes(value as never)) {
    return value as AiUsageLedgerErrorCategory;
  }

  throw new Error("AI usage ledger error category is invalid.");
}

function normalizeEntitlementPlanValue(value: string): EntitlementPlan {
  if (!isEntitlementPlan(value)) {
    throw new Error("AI usage ledger plan is invalid.");
  }

  return value;
}

function normalizeTrustedPlanSource(value: string): TrustedPlanModelSource {
  if (!isTrustedPlanModelSource(value)) {
    throw new Error("AI usage ledger plan source is invalid.");
  }

  return value;
}

function asNonEmptyString(
  value: unknown,
  fieldName: string,
  maxLength: number,
): string {
  if (typeof value !== "string") {
    throw new Error(`AI usage ledger ${fieldName} is required.`);
  }

  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new Error(`AI usage ledger ${fieldName} is invalid.`);
  }

  return normalized;
}

function asPositiveInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`AI usage ledger ${fieldName} must be a positive integer.`);
  }

  return value;
}

function normalizeMonthStart(value: Date): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error("AI usage ledger monthStart is invalid.");
  }

  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}
