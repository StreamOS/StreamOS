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
import { type GatewayAiUsageAdmissionRuntimeStatus } from "./ai-usage-admission.js";
import { sanitizeLogText } from "./log-sanitizer.js";

export const GATEWAY_AI_ASSISTANT_PRODUCT_GATE_STATUSES = [
  "open",
  "closed",
] as const;

export const GATEWAY_AI_ASSISTANT_OBSERVABILITY_EVIDENCE_CLASSES = [
  "request_received",
  "allowed",
  "product_gate_closed",
  "request_context_missing",
  "route_mode_disabled",
  "runtime_not_productive",
  "plan_denied",
  "plan_source_untrusted",
  "rate_guard_denied",
  "concurrency_guard_denied",
  "ledger_reserved",
  "usage_context_issued",
  "usage_context_unavailable",
  "ledger_reservation_failed",
  "downstream_prepared",
  "downstream_unavailable",
  "metering_recorded",
  "metering_released",
  "metering_failure",
  "concurrency_released",
  "concurrency_release_failure",
] as const;

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

export type GatewayAiAssistantProductGateStatus =
  (typeof GATEWAY_AI_ASSISTANT_PRODUCT_GATE_STATUSES)[number];

export type GatewayAiAssistantObservabilityEvidenceClass =
  (typeof GATEWAY_AI_ASSISTANT_OBSERVABILITY_EVIDENCE_CLASSES)[number];

export const gatewayAiAssistantObservabilityEventSchema = z
  .object({
    contract_version: z.literal("2026-06-30.ai-assistant-observability.v1"),
    created_at: z.string().datetime({ offset: true }),
    duration_ms: z.number().int().min(0).max(86_400_000).nullable(),
    evidence_class: z.enum(GATEWAY_AI_ASSISTANT_OBSERVABILITY_EVIDENCE_CLASSES),
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
    product_gate_status: z
      .enum(GATEWAY_AI_ASSISTANT_PRODUCT_GATE_STATUSES)
      .nullable(),
    reason_code: z.string().trim().min(1).max(120),
    request_classification: z.string().trim().min(1).max(120).nullable(),
    request_id: z.string().trim().min(1).max(120).nullable(),
    route_mode: z.enum(["disabled", "test_only_mock"]),
    runtime_status: z.enum(["active", "not_yet_productive"]).nullable(),
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
  evidenceClass?: GatewayAiAssistantObservabilityEvidenceClass | null;
  estimatedUsageUnits?: number | null;
  finalUsageUnits?: number | null;
  occurredAt?: Date | number | string;
  outcome: GatewayAiAssistantObservabilityOutcome;
  phase: GatewayAiAssistantObservabilityPhase;
  planAtRequestTime?: string | null;
  planSource?: string | null;
  productGateStatus?: GatewayAiAssistantProductGateStatus | null;
  reasonCode: string;
  requestClassification?: string | null;
  requestId?: string | null;
  routeMode: "disabled" | "test_only_mock";
  runtimeStatus?: GatewayAiUsageAdmissionRuntimeStatus | null;
  safeErrorCategory?: string | null;
  tenantId?: string | null;
  userId?: string | null;
}): GatewayAiAssistantObservabilityEvent {
  const occurredAt = normalizeOccurredAt(params.occurredAt);
  const reasonCode = normalizeReasonCode(params.reasonCode);
  const productGateStatus = normalizeProductGateStatus(
    params.productGateStatus,
  );
  const runtimeStatus = normalizeRuntimeStatus(params.runtimeStatus);

  return gatewayAiAssistantObservabilityEventSchema.parse({
    contract_version: "2026-06-30.ai-assistant-observability.v1",
    created_at: occurredAt,
    duration_ms: normalizeDurationMs(params.durationMs),
    evidence_class:
      normalizeEvidenceClass(params.evidenceClass) ??
      classifyGatewayAiAssistantObservabilityEvidenceClass({
        phase: params.phase,
        productGateStatus,
        reasonCode,
        routeMode: params.routeMode,
        runtimeStatus,
      }),
    estimated_usage_units: normalizeUsageUnits(params.estimatedUsageUnits),
    feature: "ai_assistant",
    final_usage_units: normalizeUsageUnits(params.finalUsageUnits),
    occurred_at: occurredAt,
    outcome: params.outcome,
    phase: params.phase,
    plan_at_request_time: normalizePlan(params.planAtRequestTime),
    plan_source: normalizePlanSource(params.planSource),
    product_gate_status: productGateStatus,
    reason_code: reasonCode,
    request_classification: normalizeRequestClassification(
      params.requestClassification,
    ),
    request_id: normalizeRequestId(params.requestId),
    route_mode: params.routeMode,
    runtime_status: runtimeStatus,
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

export function classifyGatewayAiAssistantObservabilityEvidenceClass(params: {
  phase: GatewayAiAssistantObservabilityPhase;
  productGateStatus?: GatewayAiAssistantProductGateStatus | null;
  reasonCode: string;
  routeMode: "disabled" | "test_only_mock";
  runtimeStatus?: GatewayAiUsageAdmissionRuntimeStatus | null;
}): GatewayAiAssistantObservabilityEvidenceClass {
  if (params.phase === "request_received") {
    return "request_received";
  }

  if (
    params.productGateStatus === "closed" ||
    params.reasonCode === "ai_assistant_product_gate_closed"
  ) {
    return "product_gate_closed";
  }

  if (
    params.reasonCode === "allowed" ||
    params.reasonCode.startsWith("allowed ")
  ) {
    return "allowed";
  }

  switch (params.reasonCode) {
    case "ledger_reserved":
      return "ledger_reserved";
    case "downstream_prepared":
      return "downstream_prepared";
    case "ai_usage_context_issued":
      return "usage_context_issued";
    case "ai_assistant_route_unavailable":
      return "route_mode_disabled";
    case "ai_usage_not_productive":
    case "ai_assistant_not_productive":
      return "runtime_not_productive";
    case "ai_usage_plan_denied":
      return "plan_denied";
    case "ai_usage_plan_required":
      return "plan_source_untrusted";
    case "ai_usage_context_missing":
      return "request_context_missing";
    case "ai_usage_rate_limited":
      return "rate_guard_denied";
    case "ai_usage_concurrency_limited":
      return "concurrency_guard_denied";
    case "ai_usage_budget_reservation_failed":
      return "ledger_reservation_failed";
    case "ai_assistant_downstream_unavailable":
      return "downstream_unavailable";
    case "ai_usage_metering_recorded":
      return "metering_recorded";
    case "ai_usage_metering_released":
      return "metering_released";
    case "ai_usage_concurrency_release_failed":
      return "concurrency_release_failure";
    case "ai_usage_metering_failed":
    case "ai_usage_metering_unavailable":
    case "ai_assistant_metering_failed":
      return "metering_failure";
    case "released":
      return params.phase === "concurrency_released"
        ? "concurrency_released"
        : "metering_released";
    case "ai_usage_context_not_issued":
    case "ai_usage_signing_unavailable":
    case "ai_assistant_usage_context_unavailable":
      return "usage_context_unavailable";
  }

  switch (params.phase) {
    case "usage_context_unavailable":
      return params.runtimeStatus === "not_yet_productive"
        ? "runtime_not_productive"
        : "usage_context_unavailable";
    case "downstream_failed":
      return "downstream_unavailable";
    case "metering_denied":
      return params.runtimeStatus === "not_yet_productive" &&
        params.reasonCode === "ai_assistant_not_productive"
        ? "runtime_not_productive"
        : "metering_failure";
    case "route_contract_completed":
      return params.runtimeStatus === "not_yet_productive" &&
        params.reasonCode === "ai_assistant_not_productive"
        ? "runtime_not_productive"
        : "usage_context_unavailable";
    case "metering_recorded":
      return "metering_recorded";
    case "metering_released":
      return "metering_released";
    case "concurrency_released":
      return "concurrency_released";
    case "concurrency_release_failed":
      return "concurrency_release_failure";
    case "admission_denied":
      return params.runtimeStatus === "not_yet_productive" &&
        params.reasonCode === "ai_usage_not_productive"
        ? "runtime_not_productive"
        : "usage_context_unavailable";
    default:
      return "usage_context_unavailable";
  }
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

function normalizeProductGateStatus(
  value: GatewayAiAssistantProductGateStatus | null | undefined,
): GatewayAiAssistantProductGateStatus | null {
  return value === "open" || value === "closed" ? value : null;
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

function normalizeRuntimeStatus(
  value: GatewayAiUsageAdmissionRuntimeStatus | null | undefined,
): GatewayAiUsageAdmissionRuntimeStatus | null {
  return value === "active" || value === "not_yet_productive" ? value : null;
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

function normalizeEvidenceClass(
  value: GatewayAiAssistantObservabilityEvidenceClass | null | undefined,
): GatewayAiAssistantObservabilityEvidenceClass | null {
  return value != null &&
    GATEWAY_AI_ASSISTANT_OBSERVABILITY_EVIDENCE_CLASSES.includes(value)
    ? value
    : null;
}
