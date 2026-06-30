import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { validateGatewayAiAssistantAutomationDownstreamRequest } from "./ai-assistant-automation-downstream-contract.js";
import {
  runGatewayAiAssistantRouteContract,
  type GatewayAiAssistantPreparedAutomationRequest,
  type GatewayAiAssistantRouteContractRequest,
} from "./ai-assistant-route-contract.js";
import { createInMemoryGatewayAiAssistantObservabilityRecorder } from "./ai-assistant-route-observability.js";
import { resolveGatewayAiUsageAdmissionPolicies } from "./ai-usage-admission.js";
import {
  verifyGatewayAiUsageContextSignature,
  type GatewayAiUsageContext,
} from "./ai-usage-context-issuance.js";
import {
  InMemoryGatewayAiUsageGuardStore,
  resolveGatewayAiUsageRedisGuardPolicies,
} from "./ai-usage-redis-guard.js";
import { resolveAutomationEntitlementAssertionSigningConfig } from "./automation-entitlement-signing.js";

const SIGNING_SECRET = "a".repeat(32);
const FINAL_USAGE_UNITS = 9;
const FIXTURE = loadFixture();

describe("gateway to automation contract fixture", () => {
  for (const testCase of FIXTURE.cases) {
    it(`prepares the shared automation request fixture for ${testCase.name}`, async () => {
      let preparedRequest: GatewayAiAssistantPreparedAutomationRequest | null =
        null;
      let recordedWrite: Record<string, unknown> | null = null;
      let concurrencyReleases = 0;
      const recorder = createInMemoryGatewayAiAssistantObservabilityRecorder();

      const result = await runGatewayAiAssistantRouteContract({
        admissionPolicies: createActiveAdmissionPolicies(),
        downstreamOperation: async (input) => {
          preparedRequest = input;
          return {
            finalUsageUnits: FINAL_USAGE_UNITS,
            outcome: "success",
          };
        },
        limitPolicies: createEnabledLimitPolicies(),
        loadLedgerEntry: async () =>
          reservedLedgerEntry({
            planSource: testCase.plan_source,
            requestId: testCase.request.request_id,
          }),
        now: testCase.now,
        observabilitySink: recorder.sink,
        plan: testCase.plan,
        planSource: testCase.plan_source,
        redisStore: new InMemoryGatewayAiUsageGuardStore(),
        releaseConcurrencyClaim: async () => {
          concurrencyReleases += 1;
          return {
            reasonCode: "released",
            released: true,
            remainingConcurrency: 0,
          };
        },
        request: testCase.request,
        reserveLedgerEntry: async () =>
          reservedLedgerEntry({
            planSource: testCase.plan_source,
            requestId: testCase.request.request_id,
          }),
        routeMode: "test_only_mock",
        signingConfig: createSigningConfig(),
        writeLedgerEntry: async (input) => {
          recordedWrite = input as Record<string, unknown>;
          return recordedLedgerEntry({
            planSource: testCase.plan_source,
            requestId: testCase.request.request_id,
          });
        },
      });

      expect(result.allowed).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.downstreamInvoked).toBe(true);
      expect(
        validateGatewayAiAssistantAutomationDownstreamRequest(preparedRequest),
      ).toEqual(testCase.expected_prepared_automation_request);
      expect(preparedRequest).toEqual(
        testCase.expected_prepared_automation_request,
      );
      expect(
        verifyGatewayAiUsageContextSignature({
          context: testCase.expected_prepared_automation_request
            .usage_context as GatewayAiUsageContext,
          secret: SIGNING_SECRET,
          signature:
            testCase.expected_prepared_automation_request
              .usage_context_signature,
        }),
      ).toBe(true);
      expect(recordedWrite).toEqual({
        estimatedUsageUnits: testCase.request.estimated_usage_units,
        feature: "ai_assistant",
        finalUsageUnits: FINAL_USAGE_UNITS,
        ledgerStatus: "recorded",
        planAtRequestTime: testCase.plan,
        planSource: testCase.plan_source,
        requestClassification: testCase.request.request_classification,
        requestId: testCase.request.request_id,
        tenantId: testCase.request.context.tenant_id,
        userId: testCase.request.context.user_id,
      });
      expect(concurrencyReleases).toBe(1);
      expect(recorder.events.map((event) => event.phase)).toEqual([
        "request_received",
        "ledger_reserved",
        "usage_context_issued",
        "downstream_prepared",
        "metering_recorded",
        "concurrency_released",
        "route_contract_completed",
      ]);

      const serializedUsageContext = JSON.stringify(
        testCase.expected_prepared_automation_request.usage_context,
      );
      expect(serializedUsageContext).not.toContain(testCase.request.prompt);
      expect(serializedUsageContext).not.toContain("channel_platform_status");

      const serializedObservability = JSON.stringify(recorder.events);
      expect(serializedObservability).not.toContain(testCase.request.prompt);
      expect(serializedObservability).not.toContain(
        testCase.expected_prepared_automation_request.usage_context_signature,
      );
      expect(serializedObservability).not.toContain("channel_platform_status");

      const serializedLedgerWrite = JSON.stringify(recordedWrite);
      expect(serializedLedgerWrite).not.toContain(testCase.request.prompt);
      expect(serializedLedgerWrite).not.toContain("channel_platform_status");
    });
  }

  it("reconciles a mocked automation deny with safe metering and release semantics", async () => {
    const testCase = FIXTURE.cases[0];
    let preparedRequest: GatewayAiAssistantPreparedAutomationRequest | null =
      null;
    let deniedWrite: Record<string, unknown> | null = null;
    let concurrencyReleases = 0;
    const recorder = createInMemoryGatewayAiAssistantObservabilityRecorder();

    const result = await runGatewayAiAssistantRouteContract({
      admissionPolicies: createActiveAdmissionPolicies(),
      downstreamOperation: async (input) => {
        preparedRequest = input;
        return {
          outcome: "operation_denied",
        };
      },
      limitPolicies: createEnabledLimitPolicies(),
      loadLedgerEntry: async () =>
        reservedLedgerEntry({
          planSource: testCase.plan_source,
          requestId: testCase.request.request_id,
        }),
      now: testCase.now,
      observabilitySink: recorder.sink,
      plan: testCase.plan,
      planSource: testCase.plan_source,
      redisStore: new InMemoryGatewayAiUsageGuardStore(),
      releaseConcurrencyClaim: async () => {
        concurrencyReleases += 1;
        return {
          reasonCode: "released",
          released: true,
          remainingConcurrency: 0,
        };
      },
      request: testCase.request,
      reserveLedgerEntry: async () =>
        reservedLedgerEntry({
          planSource: testCase.plan_source,
          requestId: testCase.request.request_id,
        }),
      routeMode: "test_only_mock",
      signingConfig: createSigningConfig(),
      writeLedgerEntry: async (input) => {
        deniedWrite = input as Record<string, unknown>;
        return deniedLedgerEntry({
          planSource: testCase.plan_source,
          requestId: testCase.request.request_id,
        });
      },
    });

    expect(result.allowed).toBe(false);
    expect(result.downstreamInvoked).toBe(true);
    expect(result.statusCode).toBe(503);
    expect(
      validateGatewayAiAssistantAutomationDownstreamRequest(preparedRequest),
    ).toEqual(testCase.expected_prepared_automation_request);
    expect(preparedRequest).toEqual(
      testCase.expected_prepared_automation_request,
    );
    expect(result.body).toMatchObject({
      error: "ai_assistant_unavailable",
      metering_reason_code: "ai_usage_metering_failed",
      reason_code: "ai_assistant_downstream_unavailable",
    });
    expect(deniedWrite).toEqual({
      errorCategory: "policy_blocked",
      estimatedUsageUnits: testCase.request.estimated_usage_units,
      feature: "ai_assistant",
      ledgerStatus: "denied",
      planAtRequestTime: testCase.plan,
      planSource: testCase.plan_source,
      requestClassification: testCase.request.request_classification,
      requestId: testCase.request.request_id,
      tenantId: testCase.request.context.tenant_id,
      userId: testCase.request.context.user_id,
    });
    expect(concurrencyReleases).toBe(1);
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
      safe_error_category: "policy_blocked",
    });

    const serializedObservability = JSON.stringify(recorder.events);
    expect(serializedObservability).not.toContain(testCase.request.prompt);
    expect(serializedObservability).not.toContain(
      testCase.expected_prepared_automation_request.usage_context_signature,
    );
    expect(serializedObservability).not.toContain("channel_platform_status");
  });

  it("rejects secret-bearing fixture drift before any automation boundary would consume it", () => {
    const request = structuredClone(
      FIXTURE.cases[0].expected_prepared_automation_request,
    ) as Record<string, unknown>;
    request.raw_provider_payload = { secret: "sk-secret" };

    expect(() =>
      validateGatewayAiAssistantAutomationDownstreamRequest(request),
    ).toThrow();
  });
});

type GatewayAutomationContractFixture = {
  cases: GatewayAutomationContractFixtureCase[];
};

type GatewayAutomationContractFixtureCase = {
  expected_prepared_automation_request: GatewayAiAssistantPreparedAutomationRequest;
  name: string;
  now: string;
  plan: "pro";
  plan_source: "persisted_server_plan" | "server_verified_billing";
  request: GatewayAiAssistantRouteContractRequest;
};

function loadFixture(): GatewayAutomationContractFixture {
  return JSON.parse(
    readFileSync(
      new URL(
        "./fixtures/ai-assistant-gateway-automation-contract.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as GatewayAutomationContractFixture;
}

function createActiveAdmissionPolicies() {
  return resolveGatewayAiUsageAdmissionPolicies({
    ai_assistant: {
      budgetMode: "stubbed_allow",
      runtimeStatus: "active",
    },
  });
}

function createEnabledLimitPolicies() {
  return resolveGatewayAiUsageRedisGuardPolicies({
    ai_assistant: {
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

function reservedLedgerEntry(params: {
  planSource: "persisted_server_plan" | "server_verified_billing";
  requestId: string;
}) {
  return {
    createdAt: "2026-06-30T08:00:00.000Z",
    errorCategory: null,
    estimatedUsageUnits: 12,
    feature: "ai_assistant" as const,
    finalUsageUnits: null,
    id: "11111111-1111-4111-8111-111111111119",
    ledgerStatus: "reserved" as const,
    planAtRequestTime: "pro" as const,
    planSource: params.planSource,
    requestClassification: "assistant_prompt",
    requestId: params.requestId,
    tenantId: "tenant-123",
    updatedAt: "2026-06-30T08:00:00.000Z",
    usageMonth: "2026-06-01",
    userId: "11111111-1111-4111-8111-111111111111",
  };
}

function recordedLedgerEntry(params: {
  planSource: "persisted_server_plan" | "server_verified_billing";
  requestId: string;
}) {
  return {
    ...reservedLedgerEntry(params),
    finalUsageUnits: FINAL_USAGE_UNITS,
    ledgerStatus: "recorded" as const,
  };
}

function deniedLedgerEntry(params: {
  planSource: "persisted_server_plan" | "server_verified_billing";
  requestId: string;
}) {
  return {
    ...reservedLedgerEntry(params),
    errorCategory: "policy_blocked" as const,
    ledgerStatus: "denied" as const,
  };
}
