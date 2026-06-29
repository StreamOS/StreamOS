import { createHmac, timingSafeEqual } from "node:crypto";

import {
  AUTOMATION_ENTITLEMENT_ASSERTION_AUDIENCES,
  AUTOMATION_ENTITLEMENT_ASSERTION_ISSUERS,
  AUTOMATION_ENTITLEMENT_ASSERTION_MAX_TTL_SECONDS,
  type EntitlementPlan,
  type TrustedPlanModelSource,
} from "@streamos/types";

import {
  authorizeGatewayAiUsageAdmission,
  type GatewayAiUsageAdmissionDecision,
  type GatewayAiUsageAdmissionPolicies,
} from "./ai-usage-admission.js";
import {
  recordAiUsageLedgerEntry,
  type AiUsageLedgerEntry,
} from "./ai-usage-ledger.js";
import {
  evaluateGatewayAiUsageRedisGuard,
  releaseGatewayAiUsageConcurrencyClaim,
  type GatewayAiUsageRedisGuardDecision,
  type GatewayAiUsageRedisGuardPolicies,
  type GatewayAiUsageRedisStore,
} from "./ai-usage-redis-guard.js";
import {
  resolveAutomationEntitlementAssertionSigningConfig,
  type GatewayAutomationEntitlementSigningConfig,
} from "./automation-entitlement-signing.js";
import { type SupabaseRestClient } from "./supabaseRest.js";

export const GATEWAY_AI_USAGE_CONTEXT_PURPOSE =
  "ai_usage_budget_admission" as const;
export const GATEWAY_AI_USAGE_CONTEXT_BUDGET_STATUSES = [
  "within_budget",
] as const;
export const GATEWAY_AI_USAGE_CONTEXT_ADMISSION_DECISIONS = ["allow"] as const;
export const GATEWAY_AI_USAGE_CONTEXT_REASON_CODES = [
  "ai_usage_admission_denied",
  "ai_usage_budget_reservation_failed",
  "ai_usage_context_issued",
  "ai_usage_context_not_issued",
  "ai_usage_limit_denied",
  "ai_usage_signing_unavailable",
] as const;
export const DEFAULT_GATEWAY_AI_USAGE_CONTEXT_TTL_SECONDS = 90;

export type GatewayAiUsageContextBudgetStatus =
  (typeof GATEWAY_AI_USAGE_CONTEXT_BUDGET_STATUSES)[number];
export type GatewayAiUsageContextAdmissionDecision =
  (typeof GATEWAY_AI_USAGE_CONTEXT_ADMISSION_DECISIONS)[number];
export type GatewayAiUsageContextReasonCode =
  (typeof GATEWAY_AI_USAGE_CONTEXT_REASON_CODES)[number];

export type GatewayAiUsageContext = {
  admission_decision: GatewayAiUsageContextAdmissionDecision;
  audience: (typeof AUTOMATION_ENTITLEMENT_ASSERTION_AUDIENCES)[0];
  budget_status: GatewayAiUsageContextBudgetStatus;
  estimated_usage_units: number;
  expires_at: string;
  feature: "ai_assistant";
  issued_at: string;
  issuer: (typeof AUTOMATION_ENTITLEMENT_ASSERTION_ISSUERS)[0];
  plan_at_request_time: EntitlementPlan;
  plan_source: TrustedPlanModelSource;
  purpose: typeof GATEWAY_AI_USAGE_CONTEXT_PURPOSE;
  request_classification: string;
  request_id: string;
  tenant_id: string;
  user_id: string;
};

export type SignedGatewayAiUsageContext = GatewayAiUsageContext & {
  signature: string;
  signing_mode: "hmac_sha256";
};

export type GatewayAiUsageContextIssuanceResult = {
  admissionDecision: GatewayAiUsageAdmissionDecision | null;
  allowed: boolean;
  ledgerEntry: AiUsageLedgerEntry | null;
  limitDecision: GatewayAiUsageRedisGuardDecision | null;
  reasonCode: GatewayAiUsageContextReasonCode;
  signedContext: SignedGatewayAiUsageContext | null;
};

type GatewayIssuableAiUsageAdmissionDecision =
  GatewayAiUsageAdmissionDecision & {
    allowed: true;
    budgetContext: NonNullable<
      GatewayAiUsageAdmissionDecision["budgetContext"]
    >;
    feature: "ai_assistant";
    planSource: TrustedPlanModelSource;
    tenantId: string;
    userId: string;
  };

export async function issueGatewayAiUsageContext(params: {
  admissionPolicies: GatewayAiUsageAdmissionPolicies;
  estimatedUsageUnits: number;
  feature: string;
  ledgerClient?: SupabaseRestClient | null;
  limitPolicies: GatewayAiUsageRedisGuardPolicies;
  now?: Date | number | string;
  plan: unknown;
  planSource: unknown;
  redisStore: GatewayAiUsageRedisStore | null;
  requestClassification: string;
  requestId: string | null;
  reserveLedgerEntry?:
    | ((input: {
        estimatedUsageUnits: number;
        feature: "ai_assistant";
        planAtRequestTime: EntitlementPlan;
        planSource: TrustedPlanModelSource;
        requestClassification: string;
        requestId: string;
        tenantId: string;
        userId: string;
      }) => Promise<AiUsageLedgerEntry>)
    | null;
  signingConfig?: GatewayAutomationEntitlementSigningConfig;
  signingSecret?: string | null;
  signingTtlSeconds?: number;
  tenantId: string | null;
  userId: string | null;
}): Promise<GatewayAiUsageContextIssuanceResult> {
  const normalizedRequestId = asNonEmptyString(params.requestId);
  const normalizedTenantId = asNonEmptyString(params.tenantId);
  const normalizedUserId = asNonEmptyString(params.userId);

  if (
    normalizedRequestId === null ||
    normalizedTenantId === null ||
    normalizedUserId === null
  ) {
    return deny({
      reasonCode: "ai_usage_context_not_issued",
    });
  }

  const admissionDecision = authorizeGatewayAiUsageAdmission({
    estimatedUsageUnits: params.estimatedUsageUnits,
    feature: params.feature,
    plan: params.plan,
    planSource: params.planSource,
    policies: params.admissionPolicies,
    requestClassification: params.requestClassification,
    tenantId: normalizedTenantId,
    userId: normalizedUserId,
  });

  if (!isGatewayIssuableAiUsageAdmissionDecision(admissionDecision)) {
    return deny({
      admissionDecision,
      reasonCode: "ai_usage_admission_denied",
    });
  }

  const issuableAdmissionDecision = admissionDecision;

  const nowMs = normalizeNow(params.now);
  const limitDecision = await evaluateGatewayAiUsageRedisGuard({
    feature: params.feature,
    nowMs,
    policies: params.limitPolicies,
    requestId: normalizedRequestId,
    store: params.redisStore,
    tenantId: normalizedTenantId,
    userId: normalizedUserId,
  });

  if (!limitDecision.allowed || limitDecision.feature !== "ai_assistant") {
    return deny({
      admissionDecision,
      limitDecision,
      reasonCode: "ai_usage_limit_denied",
    });
  }

  try {
    const ledgerEntry = await reserveLedgerEntry({
      admissionDecision: issuableAdmissionDecision,
      client: params.ledgerClient ?? null,
      reserveLedgerEntry: params.reserveLedgerEntry ?? null,
      requestId: normalizedRequestId,
    });

    const signingConfig =
      params.signingConfig ??
      resolveAutomationEntitlementAssertionSigningConfig({
        secret: params.signingSecret ?? undefined,
      });

    if (signingConfig.mode !== "hmac_sha256" || signingConfig.secret === null) {
      await cleanupConcurrencyClaim({
        feature: params.feature,
        nowMs,
        requestId: normalizedRequestId,
        store: params.redisStore,
        tenantId: normalizedTenantId,
        userId: normalizedUserId,
      });

      return deny({
        admissionDecision,
        ledgerEntry,
        limitDecision,
        reasonCode: "ai_usage_signing_unavailable",
      });
    }

    const context = createGatewayAiUsageContext({
      admissionDecision: issuableAdmissionDecision,
      now: nowMs,
      requestId: normalizedRequestId,
      ttlSeconds: normalizeTtlSeconds(params.signingTtlSeconds),
    });
    const signedContext = signGatewayAiUsageContext({
      context,
      secret: signingConfig.secret,
    });

    return {
      admissionDecision,
      allowed: true,
      ledgerEntry,
      limitDecision,
      reasonCode: "ai_usage_context_issued",
      signedContext,
    };
  } catch {
    await cleanupConcurrencyClaim({
      feature: params.feature,
      nowMs,
      requestId: normalizedRequestId,
      store: params.redisStore,
      tenantId: normalizedTenantId,
      userId: normalizedUserId,
    });

    return deny({
      admissionDecision,
      limitDecision,
      reasonCode: "ai_usage_budget_reservation_failed",
    });
  }
}

export function createGatewayAiUsageContext(params: {
  admissionDecision: GatewayIssuableAiUsageAdmissionDecision;
  now?: Date | number | string;
  requestId: string;
  ttlSeconds?: number;
}): GatewayAiUsageContext {
  const nowMs = normalizeNow(params.now);
  const ttlSeconds = normalizeTtlSeconds(params.ttlSeconds);

  return {
    admission_decision: "allow",
    audience: AUTOMATION_ENTITLEMENT_ASSERTION_AUDIENCES[0],
    budget_status: "within_budget",
    estimated_usage_units:
      params.admissionDecision.budgetContext.estimatedUsageUnits,
    expires_at: new Date(nowMs + ttlSeconds * 1000).toISOString(),
    feature: "ai_assistant",
    issued_at: new Date(nowMs).toISOString(),
    issuer: AUTOMATION_ENTITLEMENT_ASSERTION_ISSUERS[0],
    plan_at_request_time: params.admissionDecision.normalizedPlan,
    plan_source: params.admissionDecision.planSource,
    purpose: GATEWAY_AI_USAGE_CONTEXT_PURPOSE,
    request_classification:
      params.admissionDecision.budgetContext.requestClassification,
    request_id: params.requestId,
    tenant_id: params.admissionDecision.tenantId,
    user_id: params.admissionDecision.userId,
  };
}

export function serializeGatewayAiUsageContext(
  context: GatewayAiUsageContext,
): string {
  return ensureAsciiJson(
    JSON.stringify({
      audience: context.audience,
      estimated_usage_units: context.estimated_usage_units,
      expires_at: context.expires_at,
      feature: context.feature,
      issued_at: context.issued_at,
      issuer: context.issuer,
      plan_at_request_time: context.plan_at_request_time,
      plan_source: context.plan_source,
      request_classification: context.request_classification,
      request_id: context.request_id,
      tenant_id: context.tenant_id,
      user_id: context.user_id,
      purpose: context.purpose,
      admission_decision: context.admission_decision,
      budget_status: context.budget_status,
    }),
  );
}

export function signGatewayAiUsageContext(params: {
  context: GatewayAiUsageContext;
  secret: string;
}): SignedGatewayAiUsageContext {
  const secret = normalizeSigningSecret(params.secret);

  return {
    ...params.context,
    signature: createHmac("sha256", secret)
      .update(serializeGatewayAiUsageContext(params.context))
      .digest("hex"),
    signing_mode: "hmac_sha256",
  };
}

export function verifyGatewayAiUsageContextSignature(params: {
  context: GatewayAiUsageContext;
  secret: string;
  signature: string | null | undefined;
}): boolean {
  const signature = asNonEmptyString(params.signature);
  if (signature === null) {
    return false;
  }

  const expected = signGatewayAiUsageContext({
    context: params.context,
    secret: params.secret,
  }).signature;
  const receivedBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  return (
    receivedBuffer.byteLength === expectedBuffer.byteLength &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

async function reserveLedgerEntry(params: {
  admissionDecision: GatewayIssuableAiUsageAdmissionDecision;
  client: SupabaseRestClient | null;
  requestId: string;
  reserveLedgerEntry:
    | ((input: {
        estimatedUsageUnits: number;
        feature: "ai_assistant";
        planAtRequestTime: EntitlementPlan;
        planSource: TrustedPlanModelSource;
        requestClassification: string;
        requestId: string;
        tenantId: string;
        userId: string;
      }) => Promise<AiUsageLedgerEntry>)
    | null;
}): Promise<AiUsageLedgerEntry> {
  const input = {
    estimatedUsageUnits:
      params.admissionDecision.budgetContext.estimatedUsageUnits,
    feature: "ai_assistant" as const,
    planAtRequestTime: params.admissionDecision.normalizedPlan,
    planSource: params.admissionDecision.planSource,
    requestClassification:
      params.admissionDecision.budgetContext.requestClassification,
    requestId: params.requestId,
    tenantId: params.admissionDecision.tenantId,
    userId: params.admissionDecision.userId,
  };

  if (params.reserveLedgerEntry !== null) {
    return params.reserveLedgerEntry(input);
  }

  if (params.client === null) {
    throw new Error("AI usage ledger reservation client is required.");
  }

  return recordAiUsageLedgerEntry({
    client: params.client,
    input: {
      ...input,
      ledgerStatus: "reserved",
    },
  });
}

async function cleanupConcurrencyClaim(params: {
  feature: string;
  nowMs: number;
  requestId: string;
  store: GatewayAiUsageRedisStore | null;
  tenantId: string;
  userId: string;
}) {
  await releaseGatewayAiUsageConcurrencyClaim({
    feature: params.feature,
    nowMs: params.nowMs,
    requestId: params.requestId,
    store: params.store,
    tenantId: params.tenantId,
    userId: params.userId,
  });
}

function deny(params: {
  admissionDecision?: GatewayAiUsageAdmissionDecision | null;
  ledgerEntry?: AiUsageLedgerEntry | null;
  limitDecision?: GatewayAiUsageRedisGuardDecision | null;
  reasonCode: GatewayAiUsageContextReasonCode;
}): GatewayAiUsageContextIssuanceResult {
  return {
    admissionDecision: params.admissionDecision ?? null,
    allowed: false,
    ledgerEntry: params.ledgerEntry ?? null,
    limitDecision: params.limitDecision ?? null,
    reasonCode: params.reasonCode,
    signedContext: null,
  };
}

function isGatewayIssuableAiUsageAdmissionDecision(
  value: GatewayAiUsageAdmissionDecision,
): value is GatewayIssuableAiUsageAdmissionDecision {
  return (
    value.allowed &&
    value.feature === "ai_assistant" &&
    value.budgetContext !== null &&
    isTrustedPlanSource(value.planSource)
  );
}

function normalizeNow(value: Date | number | string | undefined): number {
  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return Date.now();
}

function normalizeTtlSeconds(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_GATEWAY_AI_USAGE_CONTEXT_TTL_SECONDS;
  }

  return Math.min(value, AUTOMATION_ENTITLEMENT_ASSERTION_MAX_TTL_SECONDS);
}

function normalizeSigningSecret(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error("Gateway AI usage context signing secret is required.");
  }

  return normalized;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function isTrustedPlanSource(value: unknown): value is TrustedPlanModelSource {
  return (
    value === "persisted_server_plan" ||
    value === "signed_entitlement_assertion"
  );
}

function ensureAsciiJson(value: string): string {
  return value.replace(
    /[\u007f-\uffff]/g,
    (character) =>
      `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}
