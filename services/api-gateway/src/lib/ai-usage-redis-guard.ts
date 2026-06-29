import { Redis } from "ioredis";
import { assertRedisTls } from "@streamos/redis";

import {
  GATEWAY_AI_USAGE_ADMISSION_FEATURES,
  type GatewayAiUsageAdmissionKnownFeature,
  type GatewayAiUsageAdmissionRuntimeStatus,
} from "./ai-usage-admission.js";

export const GATEWAY_AI_USAGE_LIMIT_ENFORCEMENT_MODES = [
  "disabled",
  "enforced",
] as const;

export type GatewayAiUsageLimitEnforcementMode =
  (typeof GATEWAY_AI_USAGE_LIMIT_ENFORCEMENT_MODES)[number];

export type GatewayAiUsageLimitReasonCode =
  | "allowed"
  | "ai_usage_concurrency_limited"
  | "ai_usage_limit_unavailable"
  | "ai_usage_rate_limited";

export type GatewayAiUsageRedisGuardPolicy = {
  burstLimit: number;
  burstWindowMs: number;
  concurrencyLimit: number;
  concurrencyTtlMs: number;
  mode: GatewayAiUsageLimitEnforcementMode;
  runtimeStatus: GatewayAiUsageAdmissionRuntimeStatus;
};

export type GatewayAiUsageRedisGuardPolicies = Record<
  GatewayAiUsageAdmissionKnownFeature,
  GatewayAiUsageRedisGuardPolicy
>;

export type GatewayAiUsageRedisGuardPoliciesInput = Partial<
  Record<
    GatewayAiUsageAdmissionKnownFeature,
    Partial<GatewayAiUsageRedisGuardPolicy>
  >
>;

export type GatewayAiUsageRedisGuardDecision = {
  activeConcurrency: number | null;
  allowed: boolean;
  burstCount: number | null;
  feature: GatewayAiUsageAdmissionKnownFeature | null;
  policyMode: GatewayAiUsageLimitEnforcementMode;
  reasonCode: GatewayAiUsageLimitReasonCode;
  requestId: string | null;
  runtimeStatus: GatewayAiUsageAdmissionRuntimeStatus;
  tenantId: string | null;
  userId: string | null;
};

export type GatewayAiUsageConcurrencyReleaseResult = {
  reasonCode: "ai_usage_limit_unavailable" | "released";
  released: boolean;
  remainingConcurrency: number | null;
};

export type GatewayAiUsageRedisStore = {
  claimBurst(params: {
    key: string;
    nowMs: number;
    ttlMs: number;
  }): Promise<number>;
  claimConcurrency(params: {
    key: string;
    limit: number;
    nowMs: number;
    requestId: string;
    ttlMs: number;
  }): Promise<{
    activeCount: number;
    allowed: boolean;
  }>;
  releaseConcurrency(params: {
    key: string;
    nowMs: number;
    requestId: string;
  }): Promise<{
    released: boolean;
    remainingCount: number;
  }>;
};

export type RedisAiUsageGuardClient = Pick<Redis, "call">;

const DEFAULT_GATEWAY_AI_USAGE_REDIS_GUARD_POLICIES: GatewayAiUsageRedisGuardPolicies =
  {
    ai_assistant: {
      burstLimit: 5,
      burstWindowMs: 60_000,
      concurrencyLimit: 2,
      concurrencyTtlMs: 120_000,
      mode: "disabled",
      runtimeStatus: "not_yet_productive",
    },
  };

const AI_USAGE_GUARD_KEY_PREFIX = "streamos:ai-usage";

const CLAIM_BURST_SCRIPT = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
return count
`;

const CLAIM_CONCURRENCY_SCRIPT = `
redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", ARGV[1])
local existing = redis.call("ZSCORE", KEYS[1], ARGV[2])
if existing then
  redis.call("PEXPIRE", KEYS[1], ARGV[4])
  return {1, redis.call("ZCARD", KEYS[1])}
end
local active = redis.call("ZCARD", KEYS[1])
if active >= tonumber(ARGV[3]) then
  return {0, active}
end
redis.call("ZADD", KEYS[1], ARGV[5], ARGV[2])
redis.call("PEXPIRE", KEYS[1], ARGV[4])
return {1, active + 1}
`;

const RELEASE_CONCURRENCY_SCRIPT = `
redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", ARGV[1])
local removed = redis.call("ZREM", KEYS[1], ARGV[2])
local remaining = redis.call("ZCARD", KEYS[1])
if remaining == 0 then
  redis.call("DEL", KEYS[1])
end
return {removed, remaining}
`;

export function resolveGatewayAiUsageRedisGuardPolicies(
  input: GatewayAiUsageRedisGuardPoliciesInput = {},
): GatewayAiUsageRedisGuardPolicies {
  return {
    ai_assistant: resolveGatewayAiUsageRedisGuardPolicy({
      fallback: DEFAULT_GATEWAY_AI_USAGE_REDIS_GUARD_POLICIES.ai_assistant,
      input: input.ai_assistant,
    }),
  };
}

export async function evaluateGatewayAiUsageRedisGuard(params: {
  feature: string;
  nowMs?: number;
  policies: GatewayAiUsageRedisGuardPolicies;
  requestId: string | null;
  store: GatewayAiUsageRedisStore | null;
  tenantId: string | null;
  userId: string | null;
}): Promise<GatewayAiUsageRedisGuardDecision> {
  const normalizedFeature = normalizeKnownFeature(params.feature);
  const normalizedTenantId = asNonEmptyString(params.tenantId);
  const normalizedUserId = asNonEmptyString(params.userId);
  const normalizedRequestId = asNonEmptyString(params.requestId);

  if (
    normalizedFeature === null ||
    normalizedTenantId === null ||
    normalizedUserId === null ||
    normalizedRequestId === null
  ) {
    return deny({
      feature: normalizedFeature,
      policyMode:
        normalizedFeature === null
          ? "enforced"
          : params.policies[normalizedFeature].mode,
      reasonCode: "ai_usage_limit_unavailable",
      requestId: normalizedRequestId,
      runtimeStatus:
        normalizedFeature === null
          ? "active"
          : params.policies[normalizedFeature].runtimeStatus,
      tenantId: normalizedTenantId,
      userId: normalizedUserId,
    });
  }

  const policy = params.policies[normalizedFeature];
  if (policy.mode === "disabled") {
    return allow({
      feature: normalizedFeature,
      policyMode: policy.mode,
      requestId: normalizedRequestId,
      runtimeStatus: policy.runtimeStatus,
      tenantId: normalizedTenantId,
      userId: normalizedUserId,
    });
  }

  if (params.store === null) {
    return policy.runtimeStatus === "active"
      ? deny({
          feature: normalizedFeature,
          policyMode: policy.mode,
          reasonCode: "ai_usage_limit_unavailable",
          requestId: normalizedRequestId,
          runtimeStatus: policy.runtimeStatus,
          tenantId: normalizedTenantId,
          userId: normalizedUserId,
        })
      : allow({
          feature: normalizedFeature,
          policyMode: policy.mode,
          requestId: normalizedRequestId,
          runtimeStatus: policy.runtimeStatus,
          tenantId: normalizedTenantId,
          userId: normalizedUserId,
        });
  }

  const nowMs = normalizeNow(params.nowMs);
  const burstKey = buildGatewayAiUsageBurstKey({
    feature: normalizedFeature,
    nowMs,
    tenantId: normalizedTenantId,
    userId: normalizedUserId,
    windowMs: policy.burstWindowMs,
  });
  const concurrencyKey = buildGatewayAiUsageConcurrencyKey({
    feature: normalizedFeature,
    tenantId: normalizedTenantId,
    userId: normalizedUserId,
  });

  try {
    const burstCount = await params.store.claimBurst({
      key: burstKey,
      nowMs,
      ttlMs: policy.burstWindowMs,
    });

    if (burstCount > policy.burstLimit) {
      return deny({
        burstCount,
        feature: normalizedFeature,
        policyMode: policy.mode,
        reasonCode: "ai_usage_rate_limited",
        requestId: normalizedRequestId,
        runtimeStatus: policy.runtimeStatus,
        tenantId: normalizedTenantId,
        userId: normalizedUserId,
      });
    }

    const concurrency = await params.store.claimConcurrency({
      key: concurrencyKey,
      limit: policy.concurrencyLimit,
      nowMs,
      requestId: normalizedRequestId,
      ttlMs: policy.concurrencyTtlMs,
    });

    if (!concurrency.allowed) {
      return deny({
        activeConcurrency: concurrency.activeCount,
        burstCount,
        feature: normalizedFeature,
        policyMode: policy.mode,
        reasonCode: "ai_usage_concurrency_limited",
        requestId: normalizedRequestId,
        runtimeStatus: policy.runtimeStatus,
        tenantId: normalizedTenantId,
        userId: normalizedUserId,
      });
    }

    return allow({
      activeConcurrency: concurrency.activeCount,
      burstCount,
      feature: normalizedFeature,
      policyMode: policy.mode,
      requestId: normalizedRequestId,
      runtimeStatus: policy.runtimeStatus,
      tenantId: normalizedTenantId,
      userId: normalizedUserId,
    });
  } catch {
    return policy.runtimeStatus === "active"
      ? deny({
          feature: normalizedFeature,
          policyMode: policy.mode,
          reasonCode: "ai_usage_limit_unavailable",
          requestId: normalizedRequestId,
          runtimeStatus: policy.runtimeStatus,
          tenantId: normalizedTenantId,
          userId: normalizedUserId,
        })
      : allow({
          feature: normalizedFeature,
          policyMode: policy.mode,
          requestId: normalizedRequestId,
          runtimeStatus: policy.runtimeStatus,
          tenantId: normalizedTenantId,
          userId: normalizedUserId,
        });
  }
}

export async function releaseGatewayAiUsageConcurrencyClaim(params: {
  feature: string;
  nowMs?: number;
  requestId: string | null;
  store: GatewayAiUsageRedisStore | null;
  tenantId: string | null;
  userId: string | null;
}): Promise<GatewayAiUsageConcurrencyReleaseResult> {
  const normalizedFeature = normalizeKnownFeature(params.feature);
  const normalizedTenantId = asNonEmptyString(params.tenantId);
  const normalizedUserId = asNonEmptyString(params.userId);
  const normalizedRequestId = asNonEmptyString(params.requestId);

  if (
    normalizedFeature === null ||
    normalizedTenantId === null ||
    normalizedUserId === null ||
    normalizedRequestId === null ||
    params.store === null
  ) {
    return {
      reasonCode: "ai_usage_limit_unavailable",
      released: false,
      remainingConcurrency: null,
    };
  }

  try {
    const result = await params.store.releaseConcurrency({
      key: buildGatewayAiUsageConcurrencyKey({
        feature: normalizedFeature,
        tenantId: normalizedTenantId,
        userId: normalizedUserId,
      }),
      nowMs: normalizeNow(params.nowMs),
      requestId: normalizedRequestId,
    });

    return {
      reasonCode: "released",
      released: result.released,
      remainingConcurrency: result.remainingCount,
    };
  } catch {
    return {
      reasonCode: "ai_usage_limit_unavailable",
      released: false,
      remainingConcurrency: null,
    };
  }
}

export function buildGatewayAiUsageLimitDenialResponse(
  decision: GatewayAiUsageRedisGuardDecision,
): {
  body: {
    error: "ai_usage_forbidden" | "ai_usage_limit_unavailable";
    feature: GatewayAiUsageAdmissionKnownFeature | null;
    message: string;
    reason_code: Exclude<GatewayAiUsageLimitReasonCode, "allowed">;
  };
  statusCode: number;
} {
  if (decision.allowed) {
    throw new Error(
      "Gateway AI usage limit denial response requires a denied decision.",
    );
  }

  const deniedDecision = decision as GatewayAiUsageRedisGuardDecision & {
    allowed: false;
    reasonCode: Exclude<GatewayAiUsageLimitReasonCode, "allowed">;
  };

  if (deniedDecision.reasonCode === "ai_usage_limit_unavailable") {
    return {
      body: {
        error: "ai_usage_limit_unavailable",
        feature: deniedDecision.feature,
        message: "AI usage protection is temporarily unavailable.",
        reason_code: deniedDecision.reasonCode,
      },
      statusCode: 503,
    };
  }

  return {
    body: {
      error: "ai_usage_forbidden",
      feature: deniedDecision.feature,
      message:
        deniedDecision.reasonCode === "ai_usage_rate_limited"
          ? "AI usage burst protection denied the request."
          : "AI usage concurrency protection denied the request.",
      reason_code: deniedDecision.reasonCode,
    },
    statusCode: 429,
  };
}

export function buildGatewayAiUsageLimitScopeKey(params: {
  feature: GatewayAiUsageAdmissionKnownFeature;
  tenantId: string;
  userId: string;
}): string {
  return [
    AI_USAGE_GUARD_KEY_PREFIX,
    params.feature,
    params.tenantId,
    params.userId,
  ].join(":");
}

export function buildGatewayAiUsageBurstKey(params: {
  feature: GatewayAiUsageAdmissionKnownFeature;
  nowMs: number;
  tenantId: string;
  userId: string;
  windowMs: number;
}): string {
  const windowBucket = Math.floor(params.nowMs / params.windowMs);
  return `${buildGatewayAiUsageLimitScopeKey(params)}:burst:${windowBucket}`;
}

export function buildGatewayAiUsageConcurrencyKey(params: {
  feature: GatewayAiUsageAdmissionKnownFeature;
  tenantId: string;
  userId: string;
}): string {
  return `${buildGatewayAiUsageLimitScopeKey(params)}:concurrency`;
}

export function createDefaultGatewayAiUsageRedisGuardStore(
  nodeEnv = process.env.NODE_ENV,
): GatewayAiUsageRedisStore | null {
  const redisUrl = process.env.REDIS_URL?.trim();

  if (!redisUrl) {
    return null;
  }

  assertRedisTls(redisUrl, { nodeEnv });

  return new RedisGatewayAiUsageGuardStore(
    new Redis(redisUrl, {
      enableReadyCheck: true,
      lazyConnect: true,
      maxRetriesPerRequest: null,
    }),
  );
}

export class RedisGatewayAiUsageGuardStore implements GatewayAiUsageRedisStore {
  constructor(private readonly redis: RedisAiUsageGuardClient) {}

  async claimBurst(params: {
    key: string;
    nowMs: number;
    ttlMs: number;
  }): Promise<number> {
    void params.nowMs;
    const result = await this.redis.call(
      "EVAL",
      CLAIM_BURST_SCRIPT,
      "1",
      params.key,
      String(params.ttlMs),
    );

    return coerceIntegerResult(result, "burst count");
  }

  async claimConcurrency(params: {
    key: string;
    limit: number;
    nowMs: number;
    requestId: string;
    ttlMs: number;
  }): Promise<{
    activeCount: number;
    allowed: boolean;
  }> {
    const expiresAtMs = params.nowMs + params.ttlMs;
    const result = await this.redis.call(
      "EVAL",
      CLAIM_CONCURRENCY_SCRIPT,
      "1",
      params.key,
      String(params.nowMs),
      params.requestId,
      String(params.limit),
      String(params.ttlMs),
      String(expiresAtMs),
    );

    const [allowed, activeCount] = coercePairResult(
      result,
      "concurrency claim result",
    );

    return {
      activeCount,
      allowed: allowed === 1,
    };
  }

  async releaseConcurrency(params: {
    key: string;
    nowMs: number;
    requestId: string;
  }): Promise<{
    released: boolean;
    remainingCount: number;
  }> {
    const result = await this.redis.call(
      "EVAL",
      RELEASE_CONCURRENCY_SCRIPT,
      "1",
      params.key,
      String(params.nowMs),
      params.requestId,
    );

    const [released, remainingCount] = coercePairResult(
      result,
      "concurrency release result",
    );

    return {
      released: released === 1,
      remainingCount,
    };
  }
}

export class InMemoryGatewayAiUsageGuardStore implements GatewayAiUsageRedisStore {
  private readonly burstEntries = new Map<
    string,
    { count: number; expiresAt: number }
  >();
  private readonly concurrencyEntries = new Map<string, Map<string, number>>();

  async claimBurst(params: {
    key: string;
    nowMs: number;
    ttlMs: number;
  }): Promise<number> {
    this.cleanupBurstEntry(params.key, params.nowMs);
    const existing = this.burstEntries.get(params.key) ?? {
      count: 0,
      expiresAt: params.nowMs + params.ttlMs,
    };
    existing.count += 1;
    existing.expiresAt = Math.max(
      existing.expiresAt,
      params.nowMs + params.ttlMs,
    );
    this.burstEntries.set(params.key, existing);

    return existing.count;
  }

  async claimConcurrency(params: {
    key: string;
    limit: number;
    nowMs: number;
    requestId: string;
    ttlMs: number;
  }): Promise<{
    activeCount: number;
    allowed: boolean;
  }> {
    const entries = this.getConcurrencyEntries(params.key, params.nowMs);
    const existingExpiry = entries.get(params.requestId);

    if (existingExpiry && existingExpiry > params.nowMs) {
      return {
        activeCount: entries.size,
        allowed: true,
      };
    }

    if (entries.size >= params.limit) {
      return {
        activeCount: entries.size,
        allowed: false,
      };
    }

    entries.set(params.requestId, params.nowMs + params.ttlMs);
    return {
      activeCount: entries.size,
      allowed: true,
    };
  }

  async releaseConcurrency(params: {
    key: string;
    nowMs: number;
    requestId: string;
  }): Promise<{
    released: boolean;
    remainingCount: number;
  }> {
    const entries = this.getConcurrencyEntries(params.key, params.nowMs);
    const released = entries.delete(params.requestId);

    if (entries.size === 0) {
      this.concurrencyEntries.delete(params.key);
    }

    return {
      released,
      remainingCount: entries.size,
    };
  }

  private cleanupBurstEntry(key: string, nowMs: number) {
    const existing = this.burstEntries.get(key);
    if (!existing) {
      return;
    }

    if (existing.expiresAt <= nowMs) {
      this.burstEntries.delete(key);
    }
  }

  private getConcurrencyEntries(
    key: string,
    nowMs: number,
  ): Map<string, number> {
    const entries =
      this.concurrencyEntries.get(key) ?? new Map<string, number>();

    for (const [requestId, expiresAt] of entries.entries()) {
      if (expiresAt <= nowMs) {
        entries.delete(requestId);
      }
    }

    this.concurrencyEntries.set(key, entries);
    return entries;
  }
}

function resolveGatewayAiUsageRedisGuardPolicy(params: {
  fallback: GatewayAiUsageRedisGuardPolicy;
  input: Partial<GatewayAiUsageRedisGuardPolicy> | undefined;
}): GatewayAiUsageRedisGuardPolicy {
  return {
    burstLimit: normalizePositiveInteger(
      params.input?.burstLimit,
      params.fallback.burstLimit,
    ),
    burstWindowMs: normalizePositiveInteger(
      params.input?.burstWindowMs,
      params.fallback.burstWindowMs,
    ),
    concurrencyLimit: normalizePositiveInteger(
      params.input?.concurrencyLimit,
      params.fallback.concurrencyLimit,
    ),
    concurrencyTtlMs: normalizePositiveInteger(
      params.input?.concurrencyTtlMs,
      params.fallback.concurrencyTtlMs,
    ),
    mode:
      params.input?.mode === "enforced"
        ? "enforced"
        : params.fallback.mode === "enforced"
          ? "enforced"
          : "disabled",
    runtimeStatus:
      params.input?.runtimeStatus === "active"
        ? "active"
        : params.fallback.runtimeStatus,
  };
}

function allow(params: {
  activeConcurrency?: number;
  burstCount?: number;
  feature: GatewayAiUsageAdmissionKnownFeature;
  policyMode: GatewayAiUsageLimitEnforcementMode;
  requestId: string;
  runtimeStatus: GatewayAiUsageAdmissionRuntimeStatus;
  tenantId: string;
  userId: string;
}): GatewayAiUsageRedisGuardDecision {
  return {
    activeConcurrency: params.activeConcurrency ?? null,
    allowed: true,
    burstCount: params.burstCount ?? null,
    feature: params.feature,
    policyMode: params.policyMode,
    reasonCode: "allowed",
    requestId: params.requestId,
    runtimeStatus: params.runtimeStatus,
    tenantId: params.tenantId,
    userId: params.userId,
  };
}

function deny(params: {
  activeConcurrency?: number;
  burstCount?: number;
  feature: GatewayAiUsageAdmissionKnownFeature | null;
  policyMode: GatewayAiUsageLimitEnforcementMode;
  reasonCode: Exclude<GatewayAiUsageLimitReasonCode, "allowed">;
  requestId: string | null;
  runtimeStatus: GatewayAiUsageAdmissionRuntimeStatus;
  tenantId: string | null;
  userId: string | null;
}): GatewayAiUsageRedisGuardDecision {
  return {
    activeConcurrency: params.activeConcurrency ?? null,
    allowed: false,
    burstCount: params.burstCount ?? null,
    feature: params.feature,
    policyMode: params.policyMode,
    reasonCode: params.reasonCode,
    requestId: params.requestId,
    runtimeStatus: params.runtimeStatus,
    tenantId: params.tenantId,
    userId: params.userId,
  };
}

function normalizeKnownFeature(
  value: string,
): GatewayAiUsageAdmissionKnownFeature | null {
  const normalized = value.trim();

  return GATEWAY_AI_USAGE_ADMISSION_FEATURES.includes(normalized as never)
    ? (normalized as GatewayAiUsageAdmissionKnownFeature)
    : null;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return fallback;
  }

  return value;
}

function normalizeNow(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return Date.now();
  }

  return value;
}

function coerceIntegerResult(value: unknown, label: string): number {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    return Number(value);
  }

  throw new Error(`Invalid ${label}.`);
}

function coercePairResult(value: unknown, label: string): [number, number] {
  if (!Array.isArray(value) || value.length < 2) {
    throw new Error(`Invalid ${label}.`);
  }

  return [
    coerceIntegerResult(value[0], `${label} allowed flag`),
    coerceIntegerResult(value[1], `${label} count`),
  ];
}
