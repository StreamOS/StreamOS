import { describe, expect, it } from "vitest";

import {
  runGatewayAiAssistantRouteContract,
  type GatewayAiAssistantPreparedAutomationRequest,
} from "./ai-assistant-route-contract.js";
import { createInMemoryGatewayAiAssistantObservabilityRecorder } from "./ai-assistant-route-observability.js";
import { resolveGatewayAiUsageAdmissionPolicies } from "./ai-usage-admission.js";
import { resolveAutomationEntitlementAssertionSigningConfig } from "./automation-entitlement-signing.js";
import {
  InMemoryGatewayAiUsageGuardStore,
  resolveGatewayAiUsageRedisGuardPolicies,
} from "./ai-usage-redis-guard.js";

const SIGNING_SECRET = "a".repeat(32);
const TENANT_ID = "tenant-123";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const REQUEST_ID = "req-123";

describe("AI assistant route contract foundation", () => {
  it("stays unavailable by default and does not invoke any downstream boundary", async () => {
    let downstreamInvocations = 0;

    const result = await runGatewayAiAssistantRouteContract({
      admissionPolicies: createActiveAdmissionPolicies(),
      downstreamOperation: async () => {
        downstreamInvocations += 1;
        return {
          finalUsageUnits: 12,
          outcome: "success",
        };
      },
      limitPolicies: createEnabledLimitPolicies(),
      plan: "pro",
      planSource: "persisted_server_plan",
      redisStore: new InMemoryGatewayAiUsageGuardStore(),
      request: baseRequest(),
      signingConfig: createSigningConfig(),
    });

    expect(result.allowed).toBe(false);
    expect(result.statusCode).toBe(503);
    expect(result.downstreamInvoked).toBe(false);
    expect(result.body).toMatchObject({
      error: "ai_assistant_unavailable",
      reason_code: "ai_assistant_route_unavailable",
      route_mode: "disabled",
    });
    expect(downstreamInvocations).toBe(0);
  });

  it("runs the full mocked orchestration sequence and finalizes metering on success", async () => {
    let preparedRequest: GatewayAiAssistantPreparedAutomationRequest | null =
      null;
    let released = 0;
    let recordedWrite: unknown = null;
    const recorder = createInMemoryGatewayAiAssistantObservabilityRecorder();

    const result = await runGatewayAiAssistantRouteContract({
      admissionPolicies: createActiveAdmissionPolicies(),
      downstreamOperation: async (input) => {
        preparedRequest = input;
        return {
          finalUsageUnits: 9,
          outcome: "success",
        };
      },
      limitPolicies: createEnabledLimitPolicies(),
      loadLedgerEntry: async () => reservedLedgerEntry(),
      plan: "pro",
      planSource: "persisted_server_plan",
      observabilitySink: recorder.sink,
      redisStore: new InMemoryGatewayAiUsageGuardStore(),
      releaseConcurrencyClaim: async () => {
        released += 1;
        return {
          reasonCode: "released",
          released: true,
          remainingConcurrency: 0,
        };
      },
      request: baseRequest({
        prompt:
          "private prompt that must never leak to route responses or metering outputs",
      }),
      reserveLedgerEntry: async () => reservedLedgerEntry(),
      routeMode: "test_only_mock",
      signingConfig: createSigningConfig(),
      writeLedgerEntry: async (input) => {
        recordedWrite = input;
        return recordedLedgerEntry();
      },
    });

    expect(result.allowed).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.downstreamInvoked).toBe(true);
    expect(result.body).toMatchObject({
      feature: "ai_assistant",
      reason_code: "allowed",
      request_id: REQUEST_ID,
      route_mode: "test_only_mock",
    });
    expect(result.meteringResult?.reasonCode).toBe(
      "ai_usage_metering_recorded",
    );
    expect(released).toBe(1);
    expect(preparedRequest).toMatchObject({
      context: {
        tenant_id: TENANT_ID,
        user_id: USER_ID,
      },
      context_boundary_version: "2026-06-30.ai-assistant-context-boundary.v1",
      feature: "ai_assistant",
      request_id: REQUEST_ID,
      request_classification: "assistant_prompt",
      runtime_status: "not_yet_productive",
      usage_context: {
        feature: "ai_assistant",
        plan_source: "persisted_server_plan",
        request_id: REQUEST_ID,
        tenant_id: TENANT_ID,
        user_id: USER_ID,
      },
    });
    expect(preparedRequest?.usage_context_signature).toHaveLength(64);
    expect("signature" in (preparedRequest?.usage_context ?? {})).toBe(false);
    expect(recordedWrite).toEqual({
      estimatedUsageUnits: 12,
      feature: "ai_assistant",
      finalUsageUnits: 9,
      ledgerStatus: "recorded",
      planAtRequestTime: "pro",
      planSource: "persisted_server_plan",
      requestClassification: "assistant_prompt",
      requestId: REQUEST_ID,
      tenantId: TENANT_ID,
      userId: USER_ID,
    });

    const serializedBody = JSON.stringify(result.body);
    expect(serializedBody).not.toContain("private prompt");
    expect(serializedBody).not.toContain("https://");
    expect(serializedBody).not.toContain("sk-secret");
    expect(recorder.events.map((event) => event.phase)).toEqual([
      "request_received",
      "ledger_reserved",
      "usage_context_issued",
      "downstream_prepared",
      "metering_recorded",
      "concurrency_released",
      "route_contract_completed",
    ]);
    expect(recorder.events.at(-1)).toMatchObject({
      evidence_class: "allowed",
      final_usage_units: 9,
      outcome: "allow",
      phase: "route_contract_completed",
      runtime_status: "active",
      reason_code: "allowed",
    });
  });

  it("denies the mock route when the feature remains not yet productive", async () => {
    const result = await runGatewayAiAssistantRouteContract({
      admissionPolicies: resolveGatewayAiUsageAdmissionPolicies(),
      limitPolicies: createEnabledLimitPolicies(),
      plan: "pro",
      planSource: "persisted_server_plan",
      redisStore: new InMemoryGatewayAiUsageGuardStore(),
      request: baseRequest(),
      routeMode: "test_only_mock",
      signingConfig: createSigningConfig(),
    });

    expect(result.allowed).toBe(false);
    expect(result.downstreamInvoked).toBe(false);
    expect(result.statusCode).toBe(503);
    expect(result.body).toMatchObject({
      admission_reason_code: "ai_usage_not_productive",
      error: "ai_assistant_unavailable",
      reason_code: "ai_assistant_not_productive",
    });
  });

  it("denies when trusted tenant, user, or request context is missing", async () => {
    const result = await runGatewayAiAssistantRouteContract({
      admissionPolicies: createActiveAdmissionPolicies(),
      limitPolicies: createEnabledLimitPolicies(),
      plan: "pro",
      planSource: "persisted_server_plan",
      redisStore: new InMemoryGatewayAiUsageGuardStore(),
      request: {
        ...baseRequest(),
        context: {
          ...baseRequest().context,
          tenant_id: "",
        },
      },
      routeMode: "test_only_mock",
      signingConfig: createSigningConfig(),
    });

    expect(result.allowed).toBe(false);
    expect(result.downstreamInvoked).toBe(false);
    expect(result.statusCode).toBe(403);
    expect(result.body).toMatchObject({
      admission_reason_code: "ai_usage_context_missing",
      error: "ai_assistant_forbidden",
      reason_code: "ai_assistant_admission_denied",
      usage_context_reason_code: "ai_usage_context_not_issued",
    });
  });

  it("denies before downstream execution when plan admission fails for a free account", async () => {
    const recorder = createInMemoryGatewayAiAssistantObservabilityRecorder();

    const result = await runGatewayAiAssistantRouteContract({
      admissionPolicies: createActiveAdmissionPolicies(),
      limitPolicies: createEnabledLimitPolicies(),
      observabilitySink: recorder.sink,
      plan: "free",
      planSource: "persisted_server_plan",
      redisStore: new InMemoryGatewayAiUsageGuardStore(),
      request: baseRequest(),
      routeMode: "test_only_mock",
      signingConfig: createSigningConfig(),
    });

    expect(result.allowed).toBe(false);
    expect(result.downstreamInvoked).toBe(false);
    expect(result.statusCode).toBe(403);
    expect(result.body).toMatchObject({
      admission_reason_code: "ai_usage_plan_denied",
      error: "ai_assistant_forbidden",
      reason_code: "ai_assistant_admission_denied",
      usage_context_reason_code: "ai_usage_admission_denied",
    });
    expect(recorder.events.map((event) => event.phase)).toEqual([
      "request_received",
      "admission_denied",
      "route_contract_completed",
    ]);
    expect(recorder.events.at(-2)).toMatchObject({
      evidence_class: "plan_denied",
      outcome: "deny",
      phase: "admission_denied",
      reason_code: "ai_usage_plan_denied",
      runtime_status: "active",
    });
  });

  it("denies before downstream execution when rate limiting blocks the request", async () => {
    const store = new InMemoryGatewayAiUsageGuardStore();
    const recorder = createInMemoryGatewayAiAssistantObservabilityRecorder();

    const first = await runGatewayAiAssistantRouteContract({
      admissionPolicies: createActiveAdmissionPolicies(),
      limitPolicies: createEnabledLimitPolicies({ burstLimit: 1 }),
      plan: "pro",
      planSource: "persisted_server_plan",
      redisStore: store,
      request: baseRequest(),
      reserveLedgerEntry: async () => reservedLedgerEntry(),
      routeMode: "test_only_mock",
      signingConfig: createSigningConfig(),
      writeLedgerEntry: async () => recordedLedgerEntry(),
      loadLedgerEntry: async () => reservedLedgerEntry(),
      observabilitySink: recorder.sink,
    });
    const denied = await runGatewayAiAssistantRouteContract({
      admissionPolicies: createActiveAdmissionPolicies(),
      limitPolicies: createEnabledLimitPolicies({ burstLimit: 1 }),
      plan: "pro",
      planSource: "persisted_server_plan",
      observabilitySink: recorder.sink,
      redisStore: store,
      request: baseRequest({ request_id: "req-124" }),
      reserveLedgerEntry: async () => reservedLedgerRow("req-124"),
      routeMode: "test_only_mock",
      signingConfig: createSigningConfig(),
    });

    expect(first.allowed).toBe(true);
    expect(denied.allowed).toBe(false);
    expect(denied.downstreamInvoked).toBe(false);
    expect(denied.statusCode).toBe(403);
    expect(denied.body).toMatchObject({
      error: "ai_assistant_forbidden",
      limit_reason_code: "ai_usage_rate_limited",
      reason_code: "ai_assistant_admission_denied",
      usage_context_reason_code: "ai_usage_limit_denied",
    });
    expect(recorder.events.slice(-3).map((event) => event.phase)).toEqual([
      "request_received",
      "rate_limited",
      "route_contract_completed",
    ]);
    expect(recorder.events.at(-2)).toMatchObject({
      evidence_class: "rate_guard_denied",
      outcome: "deny",
      phase: "rate_limited",
      reason_code: "ai_usage_rate_limited",
      request_id: "req-124",
      runtime_status: "active",
    });
  });

  it("denies before downstream execution when concurrency protection blocks the request", async () => {
    const store = new InMemoryGatewayAiUsageGuardStore();
    const recorder = createInMemoryGatewayAiAssistantObservabilityRecorder();

    const first = await runGatewayAiAssistantRouteContract({
      admissionPolicies: createActiveAdmissionPolicies(),
      limitPolicies: createEnabledLimitPolicies({ concurrencyLimit: 1 }),
      loadLedgerEntry: async () => reservedLedgerEntry(),
      observabilitySink: recorder.sink,
      plan: "pro",
      planSource: "persisted_server_plan",
      redisStore: store,
      releaseConcurrencyClaim: async () => ({
        reasonCode: "ai_usage_limit_unavailable",
        released: false,
        remainingConcurrency: null,
      }),
      request: baseRequest(),
      reserveLedgerEntry: async () => reservedLedgerEntry(),
      routeMode: "test_only_mock",
      signingConfig: createSigningConfig(),
      writeLedgerEntry: async () => recordedLedgerEntry(),
    });
    const denied = await runGatewayAiAssistantRouteContract({
      admissionPolicies: createActiveAdmissionPolicies(),
      limitPolicies: createEnabledLimitPolicies({ concurrencyLimit: 1 }),
      observabilitySink: recorder.sink,
      plan: "pro",
      planSource: "persisted_server_plan",
      redisStore: store,
      request: baseRequest({ request_id: "req-125" }),
      routeMode: "test_only_mock",
      signingConfig: createSigningConfig(),
    });

    expect(first.allowed).toBe(false);
    expect(first.body).toMatchObject({
      metering_reason_code: "ai_usage_concurrency_release_failed",
      reason_code: "ai_assistant_metering_failed",
    });
    expect(denied.allowed).toBe(false);
    expect(denied.downstreamInvoked).toBe(false);
    expect(denied.statusCode).toBe(403);
    expect(denied.body).toMatchObject({
      error: "ai_assistant_forbidden",
      limit_reason_code: "ai_usage_concurrency_limited",
      reason_code: "ai_assistant_admission_denied",
      usage_context_reason_code: "ai_usage_limit_denied",
    });
    expect(recorder.events.at(-2)).toMatchObject({
      evidence_class: "concurrency_guard_denied",
      outcome: "deny",
      phase: "concurrency_limited",
      reason_code: "ai_usage_concurrency_limited",
      request_id: "req-125",
      runtime_status: "active",
    });
  });

  it("denies unsupported plan_source values before any usage context issuance", async () => {
    const result = await runGatewayAiAssistantRouteContract({
      admissionPolicies: createActiveAdmissionPolicies(),
      limitPolicies: createEnabledLimitPolicies(),
      plan: "pro",
      planSource: "signed_entitlement_assertion",
      redisStore: new InMemoryGatewayAiUsageGuardStore(),
      request: baseRequest(),
      routeMode: "test_only_mock",
      signingConfig: createSigningConfig(),
    });

    expect(result.allowed).toBe(false);
    expect(result.downstreamInvoked).toBe(false);
    expect(result.issuanceResult).toBeNull();
    expect(result.body).toMatchObject({
      admission_reason_code: "ai_usage_plan_required",
      error: "ai_assistant_forbidden",
      reason_code: "ai_assistant_admission_denied",
    });
  });

  it("reconciles denied usage metering when the mocked downstream boundary fails", async () => {
    let deniedWrite: unknown = null;
    let released = 0;
    const recorder = createInMemoryGatewayAiAssistantObservabilityRecorder();

    const result = await runGatewayAiAssistantRouteContract({
      admissionPolicies: createActiveAdmissionPolicies(),
      downstreamOperation: async () => ({
        outcome: "model_timeout",
        safeErrorCategory: "request_timeout",
      }),
      limitPolicies: createEnabledLimitPolicies(),
      loadLedgerEntry: async () => reservedLedgerEntry(),
      observabilitySink: recorder.sink,
      plan: "pro",
      planSource: "persisted_server_plan",
      redisStore: new InMemoryGatewayAiUsageGuardStore(),
      releaseConcurrencyClaim: async () => {
        released += 1;
        return {
          reasonCode: "released",
          released: true,
          remainingConcurrency: 0,
        };
      },
      request: baseRequest(),
      reserveLedgerEntry: async () => reservedLedgerEntry(),
      routeMode: "test_only_mock",
      signingConfig: createSigningConfig(),
      writeLedgerEntry: async (input) => {
        deniedWrite = input;
        return deniedLedgerEntry("request_timeout");
      },
    });

    expect(result.allowed).toBe(false);
    expect(result.downstreamInvoked).toBe(true);
    expect(result.statusCode).toBe(503);
    expect(result.body).toMatchObject({
      error: "ai_assistant_unavailable",
      metering_reason_code: "ai_usage_metering_failed",
      reason_code: "ai_assistant_downstream_unavailable",
    });
    expect(result.meteringResult?.finalized).toBe(true);
    expect(released).toBe(1);
    expect(deniedWrite).toEqual({
      errorCategory: "request_timeout",
      estimatedUsageUnits: 12,
      feature: "ai_assistant",
      ledgerStatus: "denied",
      planAtRequestTime: "pro",
      planSource: "persisted_server_plan",
      requestClassification: "assistant_prompt",
      requestId: REQUEST_ID,
      tenantId: TENANT_ID,
      userId: USER_ID,
    });
    expect(recorder.events.map((event) => event.phase)).toEqual([
      "request_received",
      "ledger_reserved",
      "usage_context_issued",
      "downstream_prepared",
      "downstream_failed",
      "metering_denied",
      "concurrency_released",
      "route_contract_completed",
    ]);
    expect(
      recorder.events.find((event) => event.phase === "downstream_failed"),
    ).toMatchObject({
      outcome: "failed",
      reason_code: "ai_assistant_downstream_unavailable",
      safe_error_category: "request_timeout",
    });
  });

  it("denies when ledger reservation fails and does not invoke the downstream boundary", async () => {
    const recorder = createInMemoryGatewayAiAssistantObservabilityRecorder();

    const result = await runGatewayAiAssistantRouteContract({
      admissionPolicies: createActiveAdmissionPolicies(),
      downstreamOperation: async () => ({
        finalUsageUnits: 9,
        outcome: "success",
      }),
      limitPolicies: createEnabledLimitPolicies(),
      observabilitySink: recorder.sink,
      plan: "pro",
      planSource: "persisted_server_plan",
      redisStore: new InMemoryGatewayAiUsageGuardStore(),
      request: baseRequest(),
      reserveLedgerEntry: async () => {
        throw new Error(
          "https://private.example.com/reservations?token=sk-secret",
        );
      },
      routeMode: "test_only_mock",
      signingConfig: createSigningConfig(),
    });

    expect(result.allowed).toBe(false);
    expect(result.downstreamInvoked).toBe(false);
    expect(result.statusCode).toBe(503);
    expect(result.body).toMatchObject({
      error: "ai_assistant_unavailable",
      reason_code: "ai_assistant_usage_context_unavailable",
      usage_context_reason_code: "ai_usage_budget_reservation_failed",
    });

    const serializedBody = JSON.stringify(result.body);
    expect(serializedBody).not.toContain("private.example.com");
    expect(serializedBody).not.toContain("sk-secret");
    expect(recorder.events.map((event) => event.phase)).toEqual([
      "request_received",
      "usage_context_unavailable",
      "route_contract_completed",
    ]);
    expect(recorder.events[1]).toMatchObject({
      evidence_class: "ledger_reservation_failed",
      phase: "usage_context_unavailable",
      reason_code: "ai_usage_budget_reservation_failed",
      runtime_status: "active",
    });
  });

  it("fails closed when metering cannot be finalized after downstream success", async () => {
    const recorder = createInMemoryGatewayAiAssistantObservabilityRecorder();
    const result = await runGatewayAiAssistantRouteContract({
      admissionPolicies: createActiveAdmissionPolicies(),
      downstreamOperation: async () => ({
        finalUsageUnits: 9,
        outcome: "success",
      }),
      limitPolicies: createEnabledLimitPolicies(),
      loadLedgerEntry: async () => null,
      observabilitySink: recorder.sink,
      plan: "pro",
      planSource: "persisted_server_plan",
      redisStore: new InMemoryGatewayAiUsageGuardStore(),
      request: baseRequest(),
      reserveLedgerEntry: async () => reservedLedgerEntry(),
      routeMode: "test_only_mock",
      signingConfig: createSigningConfig(),
    });

    expect(result.allowed).toBe(false);
    expect(result.downstreamInvoked).toBe(true);
    expect(result.statusCode).toBe(503);
    expect(result.body).toMatchObject({
      error: "ai_assistant_unavailable",
      metering_reason_code: "ai_usage_metering_unavailable",
      reason_code: "ai_assistant_metering_failed",
    });
    expect(recorder.events.at(-1)).toMatchObject({
      evidence_class: "metering_failure",
      phase: "route_contract_completed",
      reason_code: "ai_assistant_metering_failed",
      runtime_status: "active",
    });
  });

  it("emits a concurrency release failure event without overriding the safe failure result", async () => {
    const recorder = createInMemoryGatewayAiAssistantObservabilityRecorder();

    const result = await runGatewayAiAssistantRouteContract({
      admissionPolicies: createActiveAdmissionPolicies(),
      downstreamOperation: async () => ({
        finalUsageUnits: 9,
        outcome: "success",
      }),
      limitPolicies: createEnabledLimitPolicies(),
      loadLedgerEntry: async () => reservedLedgerEntry(),
      observabilitySink: recorder.sink,
      plan: "pro",
      planSource: "persisted_server_plan",
      redisStore: new InMemoryGatewayAiUsageGuardStore(),
      releaseConcurrencyClaim: async () => ({
        reasonCode: "ai_usage_limit_unavailable",
        released: false,
        remainingConcurrency: null,
      }),
      request: baseRequest(),
      reserveLedgerEntry: async () => reservedLedgerEntry(),
      routeMode: "test_only_mock",
      signingConfig: createSigningConfig(),
      writeLedgerEntry: async () => recordedLedgerEntry(),
    });

    expect(result.allowed).toBe(false);
    expect(result.body).toMatchObject({
      error: "ai_assistant_unavailable",
      metering_reason_code: "ai_usage_concurrency_release_failed",
      reason_code: "ai_assistant_metering_failed",
    });
    expect(
      recorder.events.find(
        (event) => event.phase === "concurrency_release_failed",
      ),
    ).toMatchObject({
      evidence_class: "concurrency_release_failure",
      outcome: "failed",
      reason_code: "ai_usage_concurrency_release_failed",
      runtime_status: "active",
    });
  });

  it("keeps the route contract safe when the observability sink throws", async () => {
    const result = await runGatewayAiAssistantRouteContract({
      admissionPolicies: createActiveAdmissionPolicies(),
      downstreamOperation: async () => ({
        finalUsageUnits: 9,
        outcome: "success",
      }),
      limitPolicies: createEnabledLimitPolicies(),
      loadLedgerEntry: async () => reservedLedgerEntry(),
      observabilitySink: async () => {
        throw new Error(
          "https://private.example.com/observability?token=sk-secret",
        );
      },
      plan: "pro",
      planSource: "persisted_server_plan",
      redisStore: new InMemoryGatewayAiUsageGuardStore(),
      request: baseRequest({
        prompt: "private prompt that must never leak through observability",
      }),
      reserveLedgerEntry: async () => reservedLedgerEntry(),
      routeMode: "test_only_mock",
      signingConfig: createSigningConfig(),
      writeLedgerEntry: async () => recordedLedgerEntry(),
    });

    expect(result.allowed).toBe(true);
    expect(result.body).toMatchObject({
      reason_code: "allowed",
    });
  });
});

function createActiveAdmissionPolicies() {
  return resolveGatewayAiUsageAdmissionPolicies({
    ai_assistant: {
      budgetMode: "stubbed_allow",
      runtimeStatus: "active",
    },
  });
}

function createEnabledLimitPolicies(
  overrides: Partial<{
    burstLimit: number;
    concurrencyLimit: number;
  }> = {},
) {
  return resolveGatewayAiUsageRedisGuardPolicies({
    ai_assistant: {
      burstLimit: overrides.burstLimit,
      concurrencyLimit: overrides.concurrencyLimit,
      mode: "enforced",
      runtimeStatus: "active",
    },
  });
}

function createSigningConfig() {
  return resolveAutomationEntitlementAssertionSigningConfig({
    mode: "hmac_sha256",
    secret: SIGNING_SECRET,
  });
}

function baseRequest(
  overrides: Partial<{
    prompt: string;
    request_id: string;
  }> = {},
) {
  return {
    context: {
      sources: [
        {
          item_limit: 8,
          payload_bytes: 2_048,
          source: "channel_platform_status",
          time_window_days: 30,
        },
      ],
      tenant_id: TENANT_ID,
      transcript_excerpt_characters: 0,
      user_id: USER_ID,
    },
    estimated_usage_units: 12,
    prompt: overrides.prompt ?? "Summarize my recent channel status.",
    request_classification: "assistant_prompt",
    request_id: overrides.request_id ?? REQUEST_ID,
  };
}

function reservedLedgerEntry() {
  return reservedLedgerRow(REQUEST_ID);
}

function reservedLedgerRow(requestId: string) {
  return {
    createdAt: "2026-06-30T08:00:00.000Z",
    errorCategory: null,
    estimatedUsageUnits: 12,
    feature: "ai_assistant" as const,
    finalUsageUnits: null,
    id: "11111111-1111-4111-8111-111111111119",
    ledgerStatus: "reserved" as const,
    planAtRequestTime: "pro" as const,
    planSource: "persisted_server_plan" as const,
    requestClassification: "assistant_prompt",
    requestId,
    tenantId: TENANT_ID,
    updatedAt: "2026-06-30T08:00:00.000Z",
    usageMonth: "2026-06-01",
    userId: USER_ID,
  };
}

function recordedLedgerEntry() {
  return {
    ...reservedLedgerEntry(),
    finalUsageUnits: 9,
    ledgerStatus: "recorded" as const,
    updatedAt: "2026-06-30T08:01:00.000Z",
  };
}

function deniedLedgerEntry(errorCategory: "request_timeout") {
  return {
    ...reservedLedgerEntry(),
    errorCategory,
    ledgerStatus: "denied" as const,
    updatedAt: "2026-06-30T08:01:00.000Z",
  };
}
