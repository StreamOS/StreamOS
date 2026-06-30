import { z } from "zod";
import {
  isEntitlementPlan,
  isTrustedPlanModelSource,
  type EntitlementPlan,
  type TrustedPlanModelSource,
} from "@streamos/types";

import {
  AI_USAGE_LEDGER_ERROR_CATEGORIES,
  type AiUsageLedgerErrorCategory,
} from "./ai-usage-ledger.js";
import { sanitizeLogText } from "./log-sanitizer.js";

export const GATEWAY_AI_ASSISTANT_OBSERVABILITY_PHASES = [
  "request_received",
  "admission_denied",
  "rate_limited",
  "concurrency_limited",
  "ledger_reserved",
  "usage_context_issued",
  "usage_context_unavailable",
  "downstream_prepared",
  "downstream_failed",
  "metering_recorded",
  "metering_denied",
  "metering_released",
  "concurrency_released",
  "concurrency_release_failed",
  "route_contract_completed",
] as const;

export const GATEWAY_AI_ASSISTANT_OBSERVABILITY_OUTCOMES = [
  "allow",
  "deny",
  "unavailable",
  "completed",
  "failed",
  "released",
] as const;

export type GatewayAiAssistantObservabilityPhase =
  (typeof GATEWAY_AI_ASSISTANT_OBSERVABILITY_PHASES)[number];

export type GatewayAiAssistantObservabilityOutcome =
  (typeof GATEWAY_AI_ASSISTANT_OBSERVABILITY_OUTCOMES)[number];

export const gatewayAiAssistantObservabilityEventSchema = z
  .object({
    contract_version: z.literal("2026-06-30.ai-assistant-observability.v1"),
    created_at: z.string().datetime({ offset: true }),
    duration_ms: z.number().int().min(0).max(86_400_000).nullable(),
    estimated_usage_units: z.number().int().positive().max(10_000).nullable(),
    feature: z.literal("ai_assistant"),
    final_usage_units: z.number().int().positive().max(10_000).nullable(),
    occurred_at: z.string().datetime({ offset: true }),
    outcome: z.enum(GATEWAY_AI_ASSISTANT_OBSERVABILITY_OUTCOMES),
    phase: z.enum(GATEWAY_AI_ASSISTANT_OBSERVABILITY_PHASES),
    plan_at_request_time: z.enum(["free", "pro", "agency"]).nullable(),
    plan_source: z
      .enum(["persisted_server_plan", "server_verified_billing"])
      .nullable(),
    reason_code: z.string().trim().min(1).max(120),
    request_classification: z.string().trim().min(1).max(120).nullable(),
    request_id: z.string().trim().min(1).max(120).nullable(),
    route_mode: z.enum(["disabled", "test_only_mock"]),
    safe_error_category: z.enum(AI_USAGE_LEDGER_ERROR_CATEGORIES).nullable(),
    tenant_id: z.string().trim().min(1).max(200).nullable(),
    user_id: z.string().uuid().nullable(),
  })
  .strict();

export type GatewayAiAssistantObservabilityEvent = z.infer<
  typeof gatewayAiAssistantObservabilityEventSchema
>;

export type GatewayAiAssistantObservabilitySink = (
  event: GatewayAiAssistantObservabilityEvent,
) => void | Promise<void>;

export function buildGatewayAiAssistantObservabilityEvent(params: {
  durationMs?: number | null;
  estimatedUsageUnits?: number | null;
  finalUsageUnits?: number | null;
  occurredAt?: Date | number | string;
  outcome: GatewayAiAssistantObservabilityOutcome;
  phase: GatewayAiAssistantObservabilityPhase;
  planAtRequestTime?: string | null;
  planSource?: string | null;
  reasonCode: string;
  requestClassification?: string | null;
  requestId?: string | null;
  routeMode: "disabled" | "test_only_mock";
  safeErrorCategory?: string | null;
  tenantId?: string | null;
  userId?: string | null;
}): GatewayAiAssistantObservabilityEvent {
  const occurredAt = normalizeOccurredAt(params.occurredAt);

  return gatewayAiAssistantObservabilityEventSchema.parse({
    contract_version: "2026-06-30.ai-assistant-observability.v1",
    created_at: occurredAt,
    duration_ms: normalizeDurationMs(params.durationMs),
    estimated_usage_units: normalizeUsageUnits(params.estimatedUsageUnits),
    feature: "ai_assistant",
    final_usage_units: normalizeUsageUnits(params.finalUsageUnits),
    occurred_at: occurredAt,
    outcome: params.outcome,
    phase: params.phase,
    plan_at_request_time: normalizePlan(params.planAtRequestTime),
    plan_source: normalizePlanSource(params.planSource),
    reason_code: normalizeReasonCode(params.reasonCode),
    request_classification: normalizeRequestClassification(
      params.requestClassification,
    ),
    request_id: normalizeRequestId(params.requestId),
    route_mode: params.routeMode,
    safe_error_category: normalizeSafeErrorCategory(params.safeErrorCategory),
    tenant_id: normalizeTenantId(params.tenantId),
    user_id: normalizeUserId(params.userId),
  });
}

export async function emitGatewayAiAssistantObservabilityEvent(params: {
  event: GatewayAiAssistantObservabilityEvent;
  sink?: GatewayAiAssistantObservabilitySink | null;
}): Promise<void> {
  if (params.sink == null) {
    return;
  }

  try {
    await params.sink(params.event);
  } catch {
    // Observability is best-effort for this foundation slice.
  }
}

export function createInMemoryGatewayAiAssistantObservabilityRecorder() {
  const events: GatewayAiAssistantObservabilityEvent[] = [];

  return {
    events,
    sink(event: GatewayAiAssistantObservabilityEvent) {
      events.push(event);
    },
  };
}

function normalizeOccurredAt(
  value: Date | number | string | undefined,
): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  return new Date().toISOString();
}

function normalizeDurationMs(value: number | null | undefined): number | null {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 86_400_000
    ? value
    : null;
}

function normalizeUsageUnits(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

function normalizePlan(
  value: string | null | undefined,
): EntitlementPlan | null {
  return value != null && isEntitlementPlan(value) ? value : null;
}

function normalizePlanSource(
  value: string | null | undefined,
): TrustedPlanModelSource | null {
  if (
    value != null &&
    isTrustedPlanModelSource(value) &&
    (value === "persisted_server_plan" || value === "server_verified_billing")
  ) {
    return value;
  }

  return null;
}

function normalizeReasonCode(value: string): string {
  const normalized = sanitizeLogText(value.trim());
  return normalized.length > 0 ? normalized.slice(0, 120) : "unknown_reason";
}

function normalizeRequestClassification(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = sanitizeLogText(value.trim());
  return normalized.length > 0 ? normalized.slice(0, 120) : null;
}

function normalizeRequestId(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = sanitizeLogText(value.trim());
  return normalized.length > 0 ? normalized.slice(0, 120) : null;
}

function normalizeTenantId(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = sanitizeLogText(value.trim());
  return normalized.length > 0 ? normalized.slice(0, 200) : null;
}

function normalizeUserId(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return z.string().uuid().safeParse(normalized).success ? normalized : null;
}

function normalizeSafeErrorCategory(
  value: string | null | undefined,
): AiUsageLedgerErrorCategory | null {
  return typeof value === "string" &&
    AI_USAGE_LEDGER_ERROR_CATEGORIES.includes(
      value as AiUsageLedgerErrorCategory,
    )
    ? (value as AiUsageLedgerErrorCategory)
    : null;
}
