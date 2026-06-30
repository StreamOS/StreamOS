import { z } from "zod";
import { type TrustedPlanModelSource } from "@streamos/types";

import {
  buildGatewayAiAssistantObservabilityEvent,
  emitGatewayAiAssistantObservabilityEvent,
  type GatewayAiAssistantObservabilityPhase,
  type GatewayAiAssistantObservabilitySink,
} from "./ai-assistant-route-observability.js";
import {
  issueGatewayAiUsageContext,
  type GatewayAiUsageContext,
  type GatewayAiUsageContextIssuanceResult,
  type SignedGatewayAiUsageContext,
} from "./ai-usage-context-issuance.js";
import {
  reconcileGatewayAiUsageMetering,
  type GatewayAiUsageMeteringOutcome,
  type GatewayAiUsageMeteringReasonCode,
  type GatewayAiUsageMeteringReconciliationResult,
} from "./ai-usage-metering-reconciliation.js";
import {
  type GatewayAiUsageAdmissionPolicies,
  type GatewayAiUsageAdmissionReasonCode,
} from "./ai-usage-admission.js";
import {
  type AiUsageLedgerEntry,
  type AiUsageLedgerErrorCategory,
} from "./ai-usage-ledger.js";
import {
  type GatewayAiUsageConcurrencyReleaseResult,
  type GatewayAiUsageLimitReasonCode,
  type GatewayAiUsageRedisGuardPolicies,
  type GatewayAiUsageRedisStore,
} from "./ai-usage-redis-guard.js";
import { type GatewayAutomationEntitlementSigningConfig } from "./automation-entitlement-signing.js";
import { type SupabaseRestClient } from "./supabaseRest.js";

export const GATEWAY_AI_ASSISTANT_ROUTE_CONTRACT_MODES = [
  "disabled",
  "test_only_mock",
] as const;

export const GATEWAY_AI_ASSISTANT_ROUTE_CONTRACT_REASON_CODES = [
  "allowed",
  "ai_assistant_admission_denied",
  "ai_assistant_downstream_unavailable",
  "ai_assistant_metering_failed",
  "ai_assistant_not_productive",
  "ai_assistant_route_unavailable",
  "ai_assistant_usage_context_unavailable",
] as const;

export type GatewayAiAssistantRouteContractMode =
  (typeof GATEWAY_AI_ASSISTANT_ROUTE_CONTRACT_MODES)[number];

export type GatewayAiAssistantRouteContractReasonCode =
  (typeof GATEWAY_AI_ASSISTANT_ROUTE_CONTRACT_REASON_CODES)[number];

export const gatewayAiAssistantRouteContractRequestSchema = z.object({
  context: z.object({
    sources: z
      .array(
        z.object({
          item_limit: z.number().int().positive().max(50),
          payload_bytes: z.number().int().positive().max(24_576),
          source: z.string().trim().min(1).max(64),
          time_window_days: z.number().int().positive().max(90),
        }),
      )
      .min(1)
      .max(6),
    tenant_id: z.string().trim().min(1).max(200),
    transcript_excerpt_characters: z
      .number()
      .int()
      .min(0)
      .max(4_000)
      .default(0),
    user_id: z.string().uuid(),
  }),
  estimated_usage_units: z.number().int().positive().max(10_000),
  prompt: z.string().trim().min(1).max(4_000),
  request_classification: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .default("assistant_prompt"),
  request_id: z.string().trim().min(1).max(120),
});

export type GatewayAiAssistantRouteContractRequest = z.infer<
  typeof gatewayAiAssistantRouteContractRequestSchema
>;

export type GatewayAiAssistantPreparedAutomationRequest = {
  context: GatewayAiAssistantRouteContractRequest["context"];
  feature: "ai_assistant";
  prompt: string;
  request_id: string;
  usage_context: GatewayAiUsageContext;
  usage_context_signature: string;
};

export type GatewayAiAssistantDownstreamResult =
  | {
      finalUsageUnits: number;
      message?: string;
      outcome: "success";
    }
  | {
      outcome: Exclude<GatewayAiUsageMeteringOutcome, "released" | "success">;
      safeErrorCategory?: AiUsageLedgerErrorCategory | null;
    };

export type GatewayAiAssistantRouteContractResponse =
  | {
      feature: "ai_assistant";
      message: string;
      reason_code: "allowed";
      request_id: string;
      route_mode: GatewayAiAssistantRouteContractMode;
      usage_context_expires_at: string;
    }
  | {
      admission_reason_code?: GatewayAiUsageAdmissionReasonCode;
      error: "ai_assistant_forbidden" | "ai_assistant_unavailable";
      feature: "ai_assistant";
      limit_reason_code?: GatewayAiUsageLimitReasonCode;
      message: string;
      metering_reason_code?: GatewayAiUsageMeteringReasonCode;
      reason_code: Exclude<
        GatewayAiAssistantRouteContractReasonCode,
        "allowed"
      >;
      request_id: string | null;
      route_mode: GatewayAiAssistantRouteContractMode;
      usage_context_reason_code?: GatewayAiUsageContextIssuanceResult["reasonCode"];
    };

export type GatewayAiAssistantRouteContractResult = {
  allowed: boolean;
  body: GatewayAiAssistantRouteContractResponse;
  downstreamInvoked: boolean;
  issuanceResult: GatewayAiUsageContextIssuanceResult | null;
  meteringResult: GatewayAiUsageMeteringReconciliationResult | null;
  statusCode: number;
};

export async function runGatewayAiAssistantRouteContract(params: {
  admissionPolicies: GatewayAiUsageAdmissionPolicies;
  downstreamOperation?:
    | ((
        input: GatewayAiAssistantPreparedAutomationRequest,
      ) => Promise<GatewayAiAssistantDownstreamResult>)
    | null;
  ledgerClient?: SupabaseRestClient | null;
  limitPolicies: GatewayAiUsageRedisGuardPolicies;
  loadLedgerEntry?:
    | ((input: {
        requestId: string;
        tenantId: string;
        userId: string;
      }) => Promise<AiUsageLedgerEntry | null>)
    | null;
  now?: Date | number | string;
  observabilitySink?: GatewayAiAssistantObservabilitySink | null;
  plan: unknown;
  planSource: unknown;
  productGateStatus?: "open" | "closed" | null;
  redisStore: GatewayAiUsageRedisStore | null;
  releaseConcurrencyClaim?:
    | ((input: {
        feature: "ai_assistant";
        nowMs?: number;
        requestId: string;
        tenantId: string;
        userId: string;
      }) => Promise<GatewayAiUsageConcurrencyReleaseResult>)
    | null;
  request: unknown;
  reserveLedgerEntry?:
    | ((input: {
        estimatedUsageUnits: number;
        feature: "ai_assistant";
        planAtRequestTime: AiUsageLedgerEntry["planAtRequestTime"];
        planSource: AiUsageLedgerEntry["planSource"];
        requestClassification: string;
        requestId: string;
        tenantId: string;
        userId: string;
      }) => Promise<AiUsageLedgerEntry>)
    | null;
  routeMode?: GatewayAiAssistantRouteContractMode;
  signingConfig?: GatewayAutomationEntitlementSigningConfig;
  signingSecret?: string | null;
  signingTtlSeconds?: number;
  writeLedgerEntry?:
    | ((input: {
        errorCategory?: AiUsageLedgerErrorCategory | null;
        estimatedUsageUnits: number;
        feature: "ai_assistant";
        finalUsageUnits?: number | null;
        ledgerStatus: "denied" | "recorded";
        planAtRequestTime: AiUsageLedgerEntry["planAtRequestTime"];
        planSource: AiUsageLedgerEntry["planSource"];
        requestClassification: string;
        requestId: string;
        tenantId: string;
        userId: string;
      }) => Promise<AiUsageLedgerEntry>)
    | null;
}): Promise<GatewayAiAssistantRouteContractResult> {
  const routeMode = normalizeRouteMode(params.routeMode);
  const runtimeStatus = params.admissionPolicies.ai_assistant.runtimeStatus;
  const startedAtMs = Date.now();
  const parsedRequest = gatewayAiAssistantRouteContractRequestSchema.safeParse(
    params.request,
  );
  const requestId =
    parsedRequest.success && typeof parsedRequest.data.request_id === "string"
      ? parsedRequest.data.request_id
      : null;

  await observeRouteContractEvent({
    outcome: routeMode === "test_only_mock" ? "completed" : "unavailable",
    params,
    phase: "request_received",
    reasonCode: parsedRequest.success
      ? "request_received"
      : "ai_usage_context_missing",
    request: parsedRequest.success ? parsedRequest.data : null,
    requestId,
    routeMode,
    productGateStatus: params.productGateStatus,
    runtimeStatus,
    startedAtMs,
  });

  if (!parsedRequest.success) {
    await observeRouteContractEvent({
      outcome: "deny",
      params,
      phase: "admission_denied",
      reasonCode: "ai_usage_context_missing",
      request: null,
      requestId,
      routeMode,
      productGateStatus: params.productGateStatus,
      runtimeStatus,
      startedAtMs,
    });
    await observeRouteContractEvent({
      outcome: "deny",
      params,
      phase: "route_contract_completed",
      reasonCode: "ai_assistant_admission_denied",
      request: null,
      requestId,
      routeMode,
      productGateStatus: params.productGateStatus,
      runtimeStatus,
      startedAtMs,
    });

    return deny({
      body: {
        admission_reason_code: "ai_usage_context_missing",
        error: "ai_assistant_forbidden",
        feature: "ai_assistant",
        message:
          "AI assistant route contract requires trusted tenant, user, request, and prompt context.",
        reason_code: "ai_assistant_admission_denied",
        request_id: requestId,
        route_mode: routeMode,
        usage_context_reason_code: "ai_usage_context_not_issued",
      },
      issuanceResult: null,
      meteringResult: null,
      statusCode: 403,
    });
  }

  if (routeMode !== "test_only_mock") {
    await observeRouteContractEvent({
      estimatedUsageUnits: parsedRequest.data.estimated_usage_units,
      outcome: "unavailable",
      params,
      phase: "route_contract_completed",
      reasonCode: "ai_assistant_route_unavailable",
      request: parsedRequest.data,
      requestId: parsedRequest.data.request_id,
      routeMode,
      productGateStatus: params.productGateStatus,
      runtimeStatus,
      startedAtMs,
    });

    return deny({
      body: {
        error: "ai_assistant_unavailable",
        feature: "ai_assistant",
        message:
          "AI assistant route contract exists only as an internal foundation and is not mounted productively.",
        reason_code: "ai_assistant_route_unavailable",
        request_id: parsedRequest.data.request_id,
        route_mode: routeMode,
      },
      issuanceResult: null,
      meteringResult: null,
      statusCode: 503,
    });
  }

  const normalizedPlanSource = normalizeSupportedPlanSource(params.planSource);
  if (normalizedPlanSource === null) {
    await observeRouteContractEvent({
      estimatedUsageUnits: parsedRequest.data.estimated_usage_units,
      outcome: "deny",
      params,
      phase: "admission_denied",
      reasonCode: "ai_usage_plan_required",
      request: parsedRequest.data,
      requestId: parsedRequest.data.request_id,
      routeMode,
      productGateStatus: params.productGateStatus,
      runtimeStatus,
      startedAtMs,
    });
    await observeRouteContractEvent({
      estimatedUsageUnits: parsedRequest.data.estimated_usage_units,
      outcome: "deny",
      params,
      phase: "route_contract_completed",
      reasonCode: "ai_assistant_admission_denied",
      request: parsedRequest.data,
      requestId: parsedRequest.data.request_id,
      routeMode,
      productGateStatus: params.productGateStatus,
      runtimeStatus,
      startedAtMs,
    });

    return deny({
      body: {
        admission_reason_code: "ai_usage_plan_required",
        error: "ai_assistant_forbidden",
        feature: "ai_assistant",
        message:
          "AI assistant route contract requires a trusted persisted or billing-backed plan source.",
        reason_code: "ai_assistant_admission_denied",
        request_id: parsedRequest.data.request_id,
        route_mode: routeMode,
      },
      issuanceResult: null,
      meteringResult: null,
      statusCode: 403,
    });
  }

  const request = parsedRequest.data;
  const issuanceResult = await issueGatewayAiUsageContext({
    admissionPolicies: params.admissionPolicies,
    estimatedUsageUnits: request.estimated_usage_units,
    feature: "ai_assistant",
    ledgerClient: params.ledgerClient ?? null,
    limitPolicies: params.limitPolicies,
    now: params.now,
    plan: params.plan,
    planSource: normalizedPlanSource,
    redisStore: params.redisStore,
    requestClassification: request.request_classification,
    requestId: request.request_id,
    reserveLedgerEntry: params.reserveLedgerEntry ?? null,
    signingConfig: params.signingConfig,
    signingSecret: params.signingSecret ?? null,
    signingTtlSeconds: params.signingTtlSeconds,
    tenantId: request.context.tenant_id,
    userId: request.context.user_id,
  });

  if (!issuanceResult.allowed || issuanceResult.signedContext === null) {
    await observeIssuanceFailure({
      issuanceResult,
      params,
      productGateStatus: params.productGateStatus,
      request,
      routeMode,
      runtimeStatus,
      startedAtMs,
    });

    return buildIssuanceDenial({
      issuanceResult,
      requestId: request.request_id,
      routeMode,
      statusCode:
        issuanceResult.reasonCode === "ai_usage_admission_denied" &&
        issuanceResult.admissionDecision?.reasonCode !==
          "ai_usage_not_productive"
          ? 403
          : issuanceResult.reasonCode === "ai_usage_limit_denied"
            ? 403
            : 503,
    });
  }

  await observeRouteContractEvent({
    estimatedUsageUnits: issuanceResult.ledgerEntry?.estimatedUsageUnits,
    outcome: "completed",
    params,
    phase: "ledger_reserved",
    planAtRequestTime: issuanceResult.ledgerEntry?.planAtRequestTime,
    planSource: issuanceResult.ledgerEntry?.planSource,
    reasonCode: "ledger_reserved",
    request,
    requestId: request.request_id,
    routeMode,
    productGateStatus: params.productGateStatus,
    runtimeStatus,
    startedAtMs,
  });
  await observeRouteContractEvent({
    estimatedUsageUnits: issuanceResult.signedContext.estimated_usage_units,
    outcome: "allow",
    params,
    phase: "usage_context_issued",
    planAtRequestTime: issuanceResult.signedContext.plan_at_request_time,
    planSource: issuanceResult.signedContext.plan_source,
    reasonCode: issuanceResult.reasonCode,
    request,
    requestId: request.request_id,
    routeMode,
    productGateStatus: params.productGateStatus,
    runtimeStatus,
    startedAtMs,
  });

  const preparedRequest = createPreparedAutomationRequest({
    request,
    signedContext: issuanceResult.signedContext,
  });

  await observeRouteContractEvent({
    estimatedUsageUnits: issuanceResult.signedContext.estimated_usage_units,
    outcome: "completed",
    params,
    phase: "downstream_prepared",
    planAtRequestTime: issuanceResult.signedContext.plan_at_request_time,
    planSource: issuanceResult.signedContext.plan_source,
    reasonCode: "downstream_prepared",
    request,
    requestId: request.request_id,
    routeMode,
    productGateStatus: params.productGateStatus,
    runtimeStatus,
    startedAtMs,
  });

  let downstreamInvoked = false;
  let downstreamResult: GatewayAiAssistantDownstreamResult;

  try {
    downstreamInvoked = true;
    downstreamResult = await (
      params.downstreamOperation ?? defaultMockAiAssistantDownstreamOperation
    )(preparedRequest);
  } catch {
    downstreamResult = {
      outcome: "model_error",
      safeErrorCategory: "upstream_unavailable",
    };
  }

  if (downstreamResult.outcome !== "success") {
    await observeRouteContractEvent({
      estimatedUsageUnits: issuanceResult.signedContext.estimated_usage_units,
      outcome: "failed",
      params,
      phase: "downstream_failed",
      planAtRequestTime: issuanceResult.signedContext.plan_at_request_time,
      planSource: issuanceResult.signedContext.plan_source,
      reasonCode: "ai_assistant_downstream_unavailable",
      request,
      requestId: request.request_id,
      routeMode,
      productGateStatus: params.productGateStatus,
      runtimeStatus,
      safeErrorCategory: resolveSafeDownstreamErrorCategory(downstreamResult),
      startedAtMs,
    });
  }

  const meteringResult = await reconcileGatewayAiUsageMetering({
    feature: "ai_assistant",
    finalUsageUnits:
      downstreamResult.outcome === "success"
        ? downstreamResult.finalUsageUnits
        : undefined,
    ledgerClient: params.ledgerClient ?? null,
    loadLedgerEntry: params.loadLedgerEntry ?? null,
    nowMs: normalizeNowMs(params.now),
    outcome: downstreamResult.outcome,
    redisStore: params.redisStore,
    releaseConcurrencyClaim: params.releaseConcurrencyClaim ?? null,
    requestId: request.request_id,
    safeErrorCategory:
      downstreamResult.outcome === "success"
        ? null
        : resolveSafeDownstreamErrorCategory(downstreamResult),
    tenantId: request.context.tenant_id,
    userId: request.context.user_id,
    writeLedgerEntry: params.writeLedgerEntry ?? null,
  });

  await observeMeteringResult({
    downstreamResult,
    meteringResult,
    params,
    productGateStatus: params.productGateStatus,
    request,
    routeMode,
    signedContext: issuanceResult.signedContext,
    runtimeStatus,
    startedAtMs,
  });

  if (
    !isAcceptableMeteringResult({
      downstreamOutcome: downstreamResult.outcome,
      meteringResult,
    })
  ) {
    await observeRouteContractEvent({
      estimatedUsageUnits: issuanceResult.signedContext.estimated_usage_units,
      finalUsageUnits:
        downstreamResult.outcome === "success"
          ? downstreamResult.finalUsageUnits
          : null,
      outcome: "failed",
      params,
      phase: "route_contract_completed",
      planAtRequestTime: issuanceResult.signedContext.plan_at_request_time,
      planSource: issuanceResult.signedContext.plan_source,
      reasonCode: "ai_assistant_metering_failed",
      request,
      requestId: request.request_id,
      routeMode,
      productGateStatus: params.productGateStatus,
      runtimeStatus,
      safeErrorCategory:
        downstreamResult.outcome === "success"
          ? null
          : resolveSafeDownstreamErrorCategory(downstreamResult),
      startedAtMs,
    });

    return deny({
      body: {
        error: "ai_assistant_unavailable",
        feature: "ai_assistant",
        message:
          "AI assistant route contract could not finalize secret-safe usage metering.",
        metering_reason_code: meteringResult.reasonCode,
        reason_code: "ai_assistant_metering_failed",
        request_id: request.request_id,
        route_mode: routeMode,
      },
      downstreamInvoked,
      issuanceResult,
      meteringResult,
      statusCode: 503,
    });
  }

  if (downstreamResult.outcome !== "success") {
    await observeRouteContractEvent({
      estimatedUsageUnits: issuanceResult.signedContext.estimated_usage_units,
      outcome: "unavailable",
      params,
      phase: "route_contract_completed",
      planAtRequestTime: issuanceResult.signedContext.plan_at_request_time,
      planSource: issuanceResult.signedContext.plan_source,
      reasonCode: "ai_assistant_downstream_unavailable",
      request,
      requestId: request.request_id,
      routeMode,
      productGateStatus: params.productGateStatus,
      runtimeStatus,
      safeErrorCategory: resolveSafeDownstreamErrorCategory(downstreamResult),
      startedAtMs,
    });

    return deny({
      body: {
        error: "ai_assistant_unavailable",
        feature: "ai_assistant",
        message:
          "AI assistant downstream execution is not available in this foundation slice.",
        metering_reason_code: meteringResult.reasonCode,
        reason_code: "ai_assistant_downstream_unavailable",
        request_id: request.request_id,
        route_mode: routeMode,
      },
      downstreamInvoked,
      issuanceResult,
      meteringResult,
      statusCode: 503,
    });
  }

  await observeRouteContractEvent({
    estimatedUsageUnits: issuanceResult.signedContext.estimated_usage_units,
    finalUsageUnits: downstreamResult.finalUsageUnits,
    outcome: "allow",
    params,
    phase: "route_contract_completed",
    planAtRequestTime: issuanceResult.signedContext.plan_at_request_time,
    planSource: issuanceResult.signedContext.plan_source,
    reasonCode: "allowed",
    request,
    requestId: request.request_id,
    routeMode,
    productGateStatus: params.productGateStatus,
    runtimeStatus,
    startedAtMs,
  });

  return {
    allowed: true,
    body: {
      feature: "ai_assistant",
      message:
        downstreamResult.message ??
        "AI assistant route contract mock completed without productive activation.",
      reason_code: "allowed",
      request_id: request.request_id,
      route_mode: routeMode,
      usage_context_expires_at: issuanceResult.signedContext.expires_at,
    },
    downstreamInvoked,
    issuanceResult,
    meteringResult,
    statusCode: 200,
  };
}

async function defaultMockAiAssistantDownstreamOperation(
  input: GatewayAiAssistantPreparedAutomationRequest,
): Promise<GatewayAiAssistantDownstreamResult> {
  return {
    finalUsageUnits: input.usage_context.estimated_usage_units,
    message:
      "AI assistant route contract mock completed without a productive downstream call.",
    outcome: "success",
  };
}

async function observeIssuanceFailure(params: {
  issuanceResult: GatewayAiUsageContextIssuanceResult;
  params: { observabilitySink?: GatewayAiAssistantObservabilitySink | null };
  productGateStatus?: "open" | "closed" | null;
  request: GatewayAiAssistantRouteContractRequest;
  routeMode: GatewayAiAssistantRouteContractMode;
  runtimeStatus: "active" | "not_yet_productive";
  startedAtMs: number;
}) {
  const phase = resolveIssuanceFailurePhase(params.issuanceResult);
  const denialReasonCode =
    phase === "rate_limited" || phase === "concurrency_limited"
      ? (params.issuanceResult.limitDecision?.reasonCode ??
        params.issuanceResult.reasonCode)
      : phase === "usage_context_unavailable"
        ? params.issuanceResult.reasonCode
        : (params.issuanceResult.admissionDecision?.reasonCode ??
          params.issuanceResult.reasonCode);

  await observeRouteContractEvent({
    estimatedUsageUnits: params.request.estimated_usage_units,
    outcome:
      phase === "admission_denied" ||
      phase === "rate_limited" ||
      phase === "concurrency_limited"
        ? "deny"
        : "unavailable",
    params: params.params,
    phase,
    planAtRequestTime: params.issuanceResult.admissionDecision?.normalizedPlan,
    planSource: params.issuanceResult.admissionDecision?.planSource,
    productGateStatus: params.productGateStatus,
    reasonCode: denialReasonCode,
    request: params.request,
    requestId: params.request.request_id,
    routeMode: params.routeMode,
    runtimeStatus: params.runtimeStatus,
    startedAtMs: params.startedAtMs,
  });

  await observeRouteContractEvent({
    estimatedUsageUnits: params.request.estimated_usage_units,
    outcome:
      phase === "admission_denied" ||
      phase === "rate_limited" ||
      phase === "concurrency_limited"
        ? "deny"
        : "unavailable",
    params: params.params,
    phase: "route_contract_completed",
    planAtRequestTime: params.issuanceResult.admissionDecision?.normalizedPlan,
    planSource: params.issuanceResult.admissionDecision?.planSource,
    productGateStatus: params.productGateStatus,
    reasonCode:
      params.issuanceResult.reasonCode === "ai_usage_admission_denied" ||
      params.issuanceResult.reasonCode === "ai_usage_limit_denied"
        ? "ai_assistant_admission_denied"
        : params.issuanceResult.admissionDecision?.reasonCode ===
            "ai_usage_not_productive"
          ? "ai_assistant_not_productive"
          : "ai_assistant_usage_context_unavailable",
    request: params.request,
    requestId: params.request.request_id,
    routeMode: params.routeMode,
    runtimeStatus: params.runtimeStatus,
    startedAtMs: params.startedAtMs,
  });
}

async function observeMeteringResult(params: {
  downstreamResult: GatewayAiAssistantDownstreamResult;
  meteringResult: GatewayAiUsageMeteringReconciliationResult;
  params: { observabilitySink?: GatewayAiAssistantObservabilitySink | null };
  productGateStatus?: "open" | "closed" | null;
  request: GatewayAiAssistantRouteContractRequest;
  routeMode: GatewayAiAssistantRouteContractMode;
  signedContext: SignedGatewayAiUsageContext;
  runtimeStatus: "active" | "not_yet_productive";
  startedAtMs: number;
}) {
  const baseParams = {
    estimatedUsageUnits: params.signedContext.estimated_usage_units,
    planAtRequestTime: params.signedContext.plan_at_request_time,
    planSource: params.signedContext.plan_source,
    request: params.request,
    requestId: params.request.request_id,
    routeMode: params.routeMode,
    startedAtMs: params.startedAtMs,
  } as const;

  if (
    params.meteringResult.reasonCode === "ai_usage_metering_recorded" ||
    (params.meteringResult.reasonCode ===
      "ai_usage_metering_idempotent_replay" &&
      params.downstreamResult.outcome === "success")
  ) {
    await observeRouteContractEvent({
      ...baseParams,
      finalUsageUnits:
        params.downstreamResult.outcome === "success"
          ? params.downstreamResult.finalUsageUnits
          : null,
      outcome: "completed",
      params: params.params,
      phase: "metering_recorded",
      productGateStatus: params.productGateStatus,
      reasonCode: params.meteringResult.reasonCode,
      runtimeStatus: params.runtimeStatus,
    });
  } else if (
    params.meteringResult.reasonCode === "ai_usage_metering_released"
  ) {
    await observeRouteContractEvent({
      ...baseParams,
      outcome: "released",
      params: params.params,
      phase: "metering_released",
      productGateStatus: params.productGateStatus,
      reasonCode: params.meteringResult.reasonCode,
      runtimeStatus: params.runtimeStatus,
      safeErrorCategory: "policy_blocked",
    });
  } else {
    await observeRouteContractEvent({
      ...baseParams,
      outcome: "failed",
      params: params.params,
      phase: "metering_denied",
      productGateStatus: params.productGateStatus,
      reasonCode: params.meteringResult.reasonCode,
      runtimeStatus: params.runtimeStatus,
      safeErrorCategory:
        params.downstreamResult.outcome === "success"
          ? null
          : resolveSafeDownstreamErrorCategory(params.downstreamResult),
    });
  }

  if (params.meteringResult.concurrencyRelease?.reasonCode === "released") {
    await observeRouteContractEvent({
      ...baseParams,
      outcome: "released",
      params: params.params,
      phase: "concurrency_released",
      productGateStatus: params.productGateStatus,
      reasonCode: "released",
      runtimeStatus: params.runtimeStatus,
    });
  } else if (params.meteringResult.concurrencyRelease !== null) {
    await observeRouteContractEvent({
      ...baseParams,
      outcome: "failed",
      params: params.params,
      phase: "concurrency_release_failed",
      productGateStatus: params.productGateStatus,
      reasonCode: params.meteringResult.reasonCode,
      runtimeStatus: params.runtimeStatus,
    });
  }
}

function createPreparedAutomationRequest(params: {
  request: GatewayAiAssistantRouteContractRequest;
  signedContext: SignedGatewayAiUsageContext;
}): GatewayAiAssistantPreparedAutomationRequest {
  const {
    signature,
    signing_mode: _signingMode,
    ...usageContext
  } = params.signedContext;

  return {
    context: params.request.context,
    feature: "ai_assistant",
    prompt: params.request.prompt,
    request_id: params.request.request_id,
    usage_context: usageContext,
    usage_context_signature: signature,
  };
}

function buildIssuanceDenial(params: {
  issuanceResult: GatewayAiUsageContextIssuanceResult;
  requestId: string;
  routeMode: GatewayAiAssistantRouteContractMode;
  statusCode: number;
}): GatewayAiAssistantRouteContractResult {
  const admissionReason = params.issuanceResult.admissionDecision?.reasonCode;
  const limitReason = params.issuanceResult.limitDecision?.reasonCode;

  if (admissionReason === "ai_usage_not_productive") {
    return deny({
      body: {
        admission_reason_code: admissionReason,
        error: "ai_assistant_unavailable",
        feature: "ai_assistant",
        message:
          "AI assistant remains not yet productive even in the route contract foundation.",
        reason_code: "ai_assistant_not_productive",
        request_id: params.requestId,
        route_mode: params.routeMode,
        usage_context_reason_code: params.issuanceResult.reasonCode,
      },
      issuanceResult: params.issuanceResult,
      meteringResult: null,
      statusCode: 503,
    });
  }

  if (
    params.issuanceResult.reasonCode === "ai_usage_admission_denied" ||
    params.issuanceResult.reasonCode === "ai_usage_limit_denied"
  ) {
    return deny({
      body: {
        admission_reason_code: admissionReason,
        error: "ai_assistant_forbidden",
        feature: "ai_assistant",
        limit_reason_code: limitReason,
        message:
          "AI assistant route contract denied the request before any downstream execution.",
        reason_code: "ai_assistant_admission_denied",
        request_id: params.requestId,
        route_mode: params.routeMode,
        usage_context_reason_code: params.issuanceResult.reasonCode,
      },
      issuanceResult: params.issuanceResult,
      meteringResult: null,
      statusCode: params.statusCode,
    });
  }

  return deny({
    body: {
      admission_reason_code: admissionReason,
      error: "ai_assistant_unavailable",
      feature: "ai_assistant",
      limit_reason_code: limitReason,
      message:
        "AI assistant route contract could not issue a trusted usage context.",
      reason_code: "ai_assistant_usage_context_unavailable",
      request_id: params.requestId,
      route_mode: params.routeMode,
      usage_context_reason_code: params.issuanceResult.reasonCode,
    },
    issuanceResult: params.issuanceResult,
    meteringResult: null,
    statusCode: params.statusCode,
  });
}

function deny(params: {
  body: Extract<GatewayAiAssistantRouteContractResponse, { error: string }>;
  downstreamInvoked?: boolean;
  issuanceResult: GatewayAiUsageContextIssuanceResult | null;
  meteringResult: GatewayAiUsageMeteringReconciliationResult | null;
  statusCode: number;
}): GatewayAiAssistantRouteContractResult {
  return {
    allowed: false,
    body: params.body,
    downstreamInvoked: params.downstreamInvoked ?? false,
    issuanceResult: params.issuanceResult,
    meteringResult: params.meteringResult,
    statusCode: params.statusCode,
  };
}

function normalizeRouteMode(
  value: GatewayAiAssistantRouteContractMode | undefined,
): GatewayAiAssistantRouteContractMode {
  return value === "test_only_mock" ? "test_only_mock" : "disabled";
}

function normalizeSupportedPlanSource(
  value: unknown,
): TrustedPlanModelSource | null {
  if (
    value === "persisted_server_plan" ||
    value === "server_verified_billing"
  ) {
    return value;
  }

  return null;
}

function normalizeNowMs(
  value: Date | number | string | undefined,
): number | undefined {
  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function resolveSafeDownstreamErrorCategory(
  result: Exclude<GatewayAiAssistantDownstreamResult, { outcome: "success" }>,
): AiUsageLedgerErrorCategory {
  if (result.safeErrorCategory != null) {
    return result.safeErrorCategory;
  }

  switch (result.outcome) {
    case "model_timeout":
      return "request_timeout";
    case "operation_denied":
      return "policy_blocked";
    case "model_error":
      return "unknown_failure";
  }
}

function isAcceptableMeteringResult(params: {
  downstreamOutcome: GatewayAiAssistantDownstreamResult["outcome"];
  meteringResult: GatewayAiUsageMeteringReconciliationResult;
}): boolean {
  if (!params.meteringResult.finalized) {
    return false;
  }

  if (
    params.meteringResult.reasonCode === "ai_usage_metering_unavailable" ||
    params.meteringResult.reasonCode === "ai_usage_concurrency_release_failed"
  ) {
    return false;
  }

  if (params.downstreamOutcome === "success") {
    return (
      params.meteringResult.reasonCode === "ai_usage_metering_recorded" ||
      params.meteringResult.reasonCode === "ai_usage_metering_idempotent_replay"
    );
  }

  return (
    params.meteringResult.reasonCode === "ai_usage_metering_failed" ||
    params.meteringResult.reasonCode === "ai_usage_metering_idempotent_replay"
  );
}

async function observeRouteContractEvent(params: {
  estimatedUsageUnits?: number | null;
  finalUsageUnits?: number | null;
  outcome:
    | "allow"
    | "completed"
    | "deny"
    | "failed"
    | "released"
    | "unavailable";
  params: { observabilitySink?: GatewayAiAssistantObservabilitySink | null };
  phase: GatewayAiAssistantObservabilityPhase;
  planAtRequestTime?: string | null;
  planSource?: string | null;
  productGateStatus?: "open" | "closed" | null;
  reasonCode: string;
  request: GatewayAiAssistantRouteContractRequest | null;
  requestId: string | null;
  routeMode: GatewayAiAssistantRouteContractMode;
  runtimeStatus: "active" | "not_yet_productive";
  safeErrorCategory?: string | null;
  startedAtMs: number;
}) {
  await emitGatewayAiAssistantObservabilityEvent({
    event: buildGatewayAiAssistantObservabilityEvent({
      durationMs: Math.max(0, Date.now() - params.startedAtMs),
      estimatedUsageUnits: params.estimatedUsageUnits ?? null,
      finalUsageUnits: params.finalUsageUnits ?? null,
      outcome: params.outcome,
      phase: params.phase,
      planAtRequestTime: params.planAtRequestTime ?? null,
      planSource: params.planSource ?? null,
      productGateStatus: params.productGateStatus ?? null,
      reasonCode: params.reasonCode,
      requestClassification: params.request?.request_classification ?? null,
      requestId: params.requestId,
      routeMode: params.routeMode,
      runtimeStatus: params.runtimeStatus,
      safeErrorCategory: params.safeErrorCategory ?? null,
      tenantId: params.request?.context.tenant_id ?? null,
      userId: params.request?.context.user_id ?? null,
    }),
    sink: params.params.observabilitySink ?? null,
  });
}

function resolveIssuanceFailurePhase(
  issuanceResult: GatewayAiUsageContextIssuanceResult,
): GatewayAiAssistantObservabilityPhase {
  if (issuanceResult.reasonCode === "ai_usage_limit_denied") {
    return issuanceResult.limitDecision?.reasonCode ===
      "ai_usage_concurrency_limited"
      ? "concurrency_limited"
      : "rate_limited";
  }

  if (issuanceResult.reasonCode === "ai_usage_admission_denied") {
    return "admission_denied";
  }

  return "usage_context_unavailable";
}
