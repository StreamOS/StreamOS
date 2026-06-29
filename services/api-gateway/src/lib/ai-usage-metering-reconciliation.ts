import {
  readAiUsageLedgerEntryByRequest,
  recordAiUsageLedgerEntry,
  type AiUsageLedgerEntry,
  type AiUsageLedgerErrorCategory,
} from "./ai-usage-ledger.js";
import {
  releaseGatewayAiUsageConcurrencyClaim,
  type GatewayAiUsageConcurrencyReleaseResult,
  type GatewayAiUsageRedisStore,
} from "./ai-usage-redis-guard.js";
import { type SupabaseRestClient } from "./supabaseRest.js";

export const GATEWAY_AI_USAGE_METERING_OUTCOMES = [
  "success",
  "model_timeout",
  "model_error",
  "operation_denied",
  "released",
] as const;

export const GATEWAY_AI_USAGE_METERING_REASON_CODES = [
  "ai_usage_concurrency_release_failed",
  "ai_usage_metering_failed",
  "ai_usage_metering_idempotent_replay",
  "ai_usage_metering_recorded",
  "ai_usage_metering_released",
  "ai_usage_metering_unavailable",
] as const;

export type GatewayAiUsageMeteringOutcome =
  (typeof GATEWAY_AI_USAGE_METERING_OUTCOMES)[number];

export type GatewayAiUsageMeteringReasonCode =
  (typeof GATEWAY_AI_USAGE_METERING_REASON_CODES)[number];

export type GatewayAiUsageMeteringReconciliationResult = {
  concurrencyRelease: GatewayAiUsageConcurrencyReleaseResult | null;
  finalized: boolean;
  idempotentReplay: boolean;
  ledgerEntry: AiUsageLedgerEntry | null;
  reasonCode: GatewayAiUsageMeteringReasonCode;
};

type GatewayAiUsageMeteringTransition =
  | {
      finalUsageUnits: number;
      kind: "recorded";
    }
  | {
      errorCategory: AiUsageLedgerErrorCategory;
      kind: "denied";
      released: boolean;
    }
  | {
      kind: "idempotent";
      ledgerEntry: AiUsageLedgerEntry;
      released: boolean;
    }
  | {
      kind: "invalid";
    };

export async function reconcileGatewayAiUsageMetering(params: {
  feature: string;
  finalUsageUnits?: number | null;
  ledgerClient?: SupabaseRestClient | null;
  loadLedgerEntry?:
    | ((input: {
        requestId: string;
        tenantId: string;
        userId: string;
      }) => Promise<AiUsageLedgerEntry | null>)
    | null;
  nowMs?: number;
  outcome: string;
  redisStore?: GatewayAiUsageRedisStore | null;
  releaseConcurrencyClaim?:
    | ((input: {
        feature: "ai_assistant";
        nowMs?: number;
        requestId: string;
        tenantId: string;
        userId: string;
      }) => Promise<GatewayAiUsageConcurrencyReleaseResult>)
    | null;
  requestId: string | null;
  safeErrorCategory?: string | null;
  tenantId: string | null;
  userId: string | null;
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
}): Promise<GatewayAiUsageMeteringReconciliationResult> {
  const requestId = asNonEmptyString(params.requestId);
  const tenantId = asNonEmptyString(params.tenantId);
  const userId = asNonEmptyString(params.userId);
  const feature = normalizeFeature(params.feature);
  const outcome = normalizeOutcome(params.outcome);

  if (
    requestId === null ||
    tenantId === null ||
    userId === null ||
    feature === null ||
    outcome === null
  ) {
    return deny({
      reasonCode: "ai_usage_metering_failed",
    });
  }

  const existingEntry = await loadLedgerEntry({
    client: params.ledgerClient ?? null,
    loadLedgerEntry: params.loadLedgerEntry ?? null,
    requestId,
    tenantId,
    userId,
  });

  if (existingEntry === null) {
    return deny({
      reasonCode: "ai_usage_metering_unavailable",
    });
  }

  if (
    existingEntry.feature !== feature ||
    existingEntry.requestId !== requestId ||
    existingEntry.tenantId !== tenantId ||
    existingEntry.userId !== userId
  ) {
    return deny({
      reasonCode: "ai_usage_metering_failed",
    });
  }

  const transition = resolveMeteringTransition({
    existingEntry,
    finalUsageUnits: params.finalUsageUnits,
    outcome,
    safeErrorCategory: params.safeErrorCategory,
  });

  if (transition.kind === "invalid") {
    return deny({
      reasonCode: "ai_usage_metering_failed",
    });
  }

  let ledgerEntry =
    transition.kind === "idempotent" ? transition.ledgerEntry : null;

  if (transition.kind !== "idempotent") {
    try {
      ledgerEntry = await writeLedgerEntry({
        client: params.ledgerClient ?? null,
        existingEntry,
        transition,
        writeLedgerEntry: params.writeLedgerEntry ?? null,
      });
    } catch {
      await releaseConcurrencyClaimIfConfigured({
        feature,
        nowMs: params.nowMs,
        redisStore: params.redisStore ?? null,
        releaseConcurrencyClaim: params.releaseConcurrencyClaim ?? null,
        requestId,
        tenantId,
        userId,
      });

      return deny({
        reasonCode: "ai_usage_metering_unavailable",
      });
    }
  }

  const concurrencyRelease = await releaseConcurrencyClaimIfConfigured({
    feature,
    nowMs: params.nowMs,
    redisStore: params.redisStore ?? null,
    releaseConcurrencyClaim: params.releaseConcurrencyClaim ?? null,
    requestId,
    tenantId,
    userId,
  });

  if (
    concurrencyRelease !== null &&
    concurrencyRelease.reasonCode !== "released"
  ) {
    return {
      concurrencyRelease,
      finalized: true,
      idempotentReplay: transition.kind === "idempotent",
      ledgerEntry,
      reasonCode: "ai_usage_concurrency_release_failed",
    };
  }

  if (transition.kind === "idempotent") {
    return {
      concurrencyRelease,
      finalized: true,
      idempotentReplay: true,
      ledgerEntry,
      reasonCode: "ai_usage_metering_idempotent_replay",
    };
  }

  if (transition.kind === "recorded") {
    return {
      concurrencyRelease,
      finalized: true,
      idempotentReplay: false,
      ledgerEntry,
      reasonCode: "ai_usage_metering_recorded",
    };
  }

  return {
    concurrencyRelease,
    finalized: true,
    idempotentReplay: false,
    ledgerEntry,
    reasonCode: transition.released
      ? "ai_usage_metering_released"
      : "ai_usage_metering_failed",
  };
}

async function loadLedgerEntry(params: {
  client: SupabaseRestClient | null;
  loadLedgerEntry:
    | ((input: {
        requestId: string;
        tenantId: string;
        userId: string;
      }) => Promise<AiUsageLedgerEntry | null>)
    | null;
  requestId: string;
  tenantId: string;
  userId: string;
}): Promise<AiUsageLedgerEntry | null> {
  if (params.loadLedgerEntry !== null) {
    return params.loadLedgerEntry({
      requestId: params.requestId,
      tenantId: params.tenantId,
      userId: params.userId,
    });
  }

  if (params.client === null) {
    return null;
  }

  return readAiUsageLedgerEntryByRequest({
    client: params.client,
    requestId: params.requestId,
    tenantId: params.tenantId,
    userId: params.userId,
  });
}

async function writeLedgerEntry(params: {
  client: SupabaseRestClient | null;
  existingEntry: AiUsageLedgerEntry;
  transition:
    | {
        finalUsageUnits: number;
        kind: "recorded";
      }
    | {
        errorCategory: AiUsageLedgerErrorCategory;
        kind: "denied";
        released: boolean;
      };
  writeLedgerEntry:
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
}): Promise<AiUsageLedgerEntry> {
  const input = {
    estimatedUsageUnits: params.existingEntry.estimatedUsageUnits,
    feature: "ai_assistant" as const,
    planAtRequestTime: params.existingEntry.planAtRequestTime,
    planSource: params.existingEntry.planSource,
    requestClassification: params.existingEntry.requestClassification,
    requestId: params.existingEntry.requestId,
    tenantId: params.existingEntry.tenantId,
    userId: params.existingEntry.userId,
  };

  if (params.transition.kind === "recorded") {
    const recordedInput = {
      ...input,
      finalUsageUnits: params.transition.finalUsageUnits,
      ledgerStatus: "recorded" as const,
    };

    if (params.writeLedgerEntry !== null) {
      return params.writeLedgerEntry(recordedInput);
    }

    if (params.client === null) {
      throw new Error("AI usage metering ledger client is required.");
    }

    return recordAiUsageLedgerEntry({
      client: params.client,
      input: recordedInput,
    });
  }

  const deniedInput = {
    ...input,
    errorCategory: params.transition.errorCategory,
    ledgerStatus: "denied" as const,
  };

  if (params.writeLedgerEntry !== null) {
    return params.writeLedgerEntry(deniedInput);
  }

  if (params.client === null) {
    throw new Error("AI usage metering ledger client is required.");
  }

  return recordAiUsageLedgerEntry({
    client: params.client,
    input: deniedInput,
  });
}

async function releaseConcurrencyClaimIfConfigured(params: {
  feature: "ai_assistant";
  nowMs?: number;
  redisStore: GatewayAiUsageRedisStore | null;
  releaseConcurrencyClaim:
    | ((input: {
        feature: "ai_assistant";
        nowMs?: number;
        requestId: string;
        tenantId: string;
        userId: string;
      }) => Promise<GatewayAiUsageConcurrencyReleaseResult>)
    | null;
  requestId: string;
  tenantId: string;
  userId: string;
}): Promise<GatewayAiUsageConcurrencyReleaseResult | null> {
  if (params.releaseConcurrencyClaim !== null) {
    return params.releaseConcurrencyClaim({
      feature: params.feature,
      nowMs: params.nowMs,
      requestId: params.requestId,
      tenantId: params.tenantId,
      userId: params.userId,
    });
  }

  if (params.redisStore === null) {
    return null;
  }

  return releaseGatewayAiUsageConcurrencyClaim({
    feature: params.feature,
    nowMs: params.nowMs,
    requestId: params.requestId,
    store: params.redisStore,
    tenantId: params.tenantId,
    userId: params.userId,
  });
}

function resolveMeteringTransition(params: {
  existingEntry: AiUsageLedgerEntry;
  finalUsageUnits: number | null | undefined;
  outcome: GatewayAiUsageMeteringOutcome;
  safeErrorCategory: string | null | undefined;
}): GatewayAiUsageMeteringTransition {
  if (params.existingEntry.ledgerStatus === "recorded") {
    return params.outcome === "success" &&
      params.existingEntry.finalUsageUnits === params.finalUsageUnits
      ? {
          kind: "idempotent",
          ledgerEntry: params.existingEntry,
          released: false,
        }
      : { kind: "invalid" };
  }

  if (params.existingEntry.ledgerStatus === "denied") {
    if (params.outcome === "success") {
      return { kind: "invalid" };
    }

    const deniedErrorCategory = resolveDeniedErrorCategory({
      outcome: params.outcome,
      safeErrorCategory: params.safeErrorCategory,
    });

    if (deniedErrorCategory === null) {
      return { kind: "invalid" };
    }

    return params.existingEntry.errorCategory === deniedErrorCategory &&
      (params.finalUsageUnits == null || params.finalUsageUnits === undefined)
      ? {
          kind: "idempotent",
          ledgerEntry: params.existingEntry,
          released: params.outcome === "released",
        }
      : { kind: "invalid" };
  }

  if (params.outcome === "success") {
    const finalUsageUnits = asPositiveInteger(params.finalUsageUnits);
    return finalUsageUnits === null ||
      normalizeSafeErrorCategory(params.safeErrorCategory) !== null
      ? { kind: "invalid" }
      : {
          finalUsageUnits,
          kind: "recorded",
        };
  }

  if (params.finalUsageUnits != null) {
    return { kind: "invalid" };
  }

  const deniedErrorCategory = resolveDeniedErrorCategory({
    outcome: params.outcome,
    safeErrorCategory: params.safeErrorCategory,
  });

  if (deniedErrorCategory === null) {
    return { kind: "invalid" };
  }

  return {
    errorCategory: deniedErrorCategory,
    kind: "denied",
    released: params.outcome === "released",
  };
}

function resolveDeniedErrorCategory(params: {
  outcome: Exclude<GatewayAiUsageMeteringOutcome, "success">;
  safeErrorCategory: string | null | undefined;
}): AiUsageLedgerErrorCategory | null {
  const normalizedSafeErrorCategory = normalizeSafeErrorCategory(
    params.safeErrorCategory,
  );

  switch (params.outcome) {
    case "released":
      return normalizedSafeErrorCategory == null ||
        normalizedSafeErrorCategory === "policy_blocked"
        ? "policy_blocked"
        : null;
    case "model_timeout":
      return normalizedSafeErrorCategory == null ||
        normalizedSafeErrorCategory === "request_timeout"
        ? "request_timeout"
        : null;
    case "operation_denied":
      return normalizedSafeErrorCategory ?? "policy_blocked";
    case "model_error":
      return normalizedSafeErrorCategory ?? "unknown_failure";
  }
}

function normalizeFeature(value: string): "ai_assistant" | null {
  return value.trim() === "ai_assistant" ? "ai_assistant" : null;
}

function normalizeOutcome(value: string): GatewayAiUsageMeteringOutcome | null {
  const normalized = value.trim();

  return GATEWAY_AI_USAGE_METERING_OUTCOMES.includes(normalized as never)
    ? (normalized as GatewayAiUsageMeteringOutcome)
    : null;
}

function normalizeSafeErrorCategory(
  value: string | null | undefined,
): AiUsageLedgerErrorCategory | null {
  if (value == null) {
    return null;
  }

  switch (value.trim()) {
    case "admission_denied":
    case "budget_unavailable":
    case "provider_rate_limit":
    case "request_timeout":
    case "policy_blocked":
    case "upstream_unavailable":
    case "unknown_failure":
      return value.trim() as AiUsageLedgerErrorCategory;
    default:
      return null;
  }
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function asPositiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

function deny(params: {
  reasonCode: "ai_usage_metering_failed" | "ai_usage_metering_unavailable";
}): GatewayAiUsageMeteringReconciliationResult {
  return {
    concurrencyRelease: null,
    finalized: false,
    idempotentReplay: false,
    ledgerEntry: null,
    reasonCode: params.reasonCode,
  };
}
