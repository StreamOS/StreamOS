import { describe, expect, it } from "vitest";

import {
  reconcileGatewayAiUsageMetering,
  type GatewayAiUsageMeteringReconciliationResult,
} from "./ai-usage-metering-reconciliation.js";

const TENANT_ID = "tenant-123";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const REQUEST_ID = "req-123";

describe("gateway AI usage metering reconciliation", () => {
  it("records a reserved request with final usage units and releases concurrency", async () => {
    let released = 0;
    let capturedWrite: unknown = null;

    const result = await reconcileGatewayAiUsageMetering({
      feature: "ai_assistant",
      finalUsageUnits: 9,
      loadLedgerEntry: async () => reservedLedgerEntry(),
      outcome: "success",
      releaseConcurrencyClaim: async () => {
        released += 1;
        return {
          reasonCode: "released",
          released: true,
          remainingConcurrency: 0,
        };
      },
      requestId: REQUEST_ID,
      tenantId: TENANT_ID,
      userId: USER_ID,
      writeLedgerEntry: async (input) => {
        capturedWrite = input;
        return recordedLedgerEntry();
      },
    });

    expect(result).toEqual({
      concurrencyRelease: {
        reasonCode: "released",
        released: true,
        remainingConcurrency: 0,
      },
      finalized: true,
      idempotentReplay: false,
      ledgerEntry: recordedLedgerEntry(),
      reasonCode: "ai_usage_metering_recorded",
    });
    expect(capturedWrite).toEqual({
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
    expect(released).toBe(1);
  });

  it("does not double count idempotent replay for the same request", async () => {
    let writes = 0;

    const result = await reconcileGatewayAiUsageMetering({
      feature: "ai_assistant",
      finalUsageUnits: 9,
      loadLedgerEntry: async () => recordedLedgerEntry(),
      outcome: "success",
      requestId: REQUEST_ID,
      tenantId: TENANT_ID,
      userId: USER_ID,
      writeLedgerEntry: async () => {
        writes += 1;
        return recordedLedgerEntry();
      },
    });

    expect(result).toEqual({
      concurrencyRelease: null,
      finalized: true,
      idempotentReplay: true,
      ledgerEntry: recordedLedgerEntry(),
      reasonCode: "ai_usage_metering_idempotent_replay",
    });
    expect(writes).toBe(0);
  });

  it("marks a reserved request as denied on timeout with only a safe error category", async () => {
    let released = 0;
    let capturedWrite: unknown = null;

    const result = await reconcileGatewayAiUsageMetering({
      feature: "ai_assistant",
      loadLedgerEntry: async () => reservedLedgerEntry(),
      outcome: "model_timeout",
      releaseConcurrencyClaim: async () => {
        released += 1;
        return {
          reasonCode: "released",
          released: true,
          remainingConcurrency: 0,
        };
      },
      requestId: REQUEST_ID,
      safeErrorCategory: "request_timeout",
      tenantId: TENANT_ID,
      userId: USER_ID,
      writeLedgerEntry: async (input) => {
        capturedWrite = input;
        return deniedLedgerEntry("request_timeout");
      },
    });

    expect(result).toEqual({
      concurrencyRelease: {
        reasonCode: "released",
        released: true,
        remainingConcurrency: 0,
      },
      finalized: true,
      idempotentReplay: false,
      ledgerEntry: deniedLedgerEntry("request_timeout"),
      reasonCode: "ai_usage_metering_failed",
    });
    expect(capturedWrite).toEqual({
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
    expect(released).toBe(1);
  });

  it("marks an abandoned reservation as released using the existing denied-equivalent ledger shape", async () => {
    const result = await reconcileGatewayAiUsageMetering({
      feature: "ai_assistant",
      loadLedgerEntry: async () => reservedLedgerEntry(),
      outcome: "released",
      requestId: REQUEST_ID,
      tenantId: TENANT_ID,
      userId: USER_ID,
      writeLedgerEntry: async () => deniedLedgerEntry("policy_blocked"),
    });

    expect(result.reasonCode).toBe("ai_usage_metering_released");
    expect(result.ledgerEntry).toEqual(deniedLedgerEntry("policy_blocked"));
  });

  it("denies reconciliation when tenant, user, or request context is missing", async () => {
    const result = await reconcileGatewayAiUsageMetering({
      feature: "ai_assistant",
      outcome: "success",
      requestId: "",
      tenantId: TENANT_ID,
      userId: USER_ID,
    });

    expect(result).toEqual({
      concurrencyRelease: null,
      finalized: false,
      idempotentReplay: false,
      ledgerEntry: null,
      reasonCode: "ai_usage_metering_failed",
    });
  });

  it("denies reconciliation on feature mismatch", async () => {
    const result = await reconcileGatewayAiUsageMetering({
      feature: "advanced_analytics",
      loadLedgerEntry: async () => reservedLedgerEntry(),
      outcome: "success",
      requestId: REQUEST_ID,
      tenantId: TENANT_ID,
      userId: USER_ID,
    });

    expect(result.reasonCode).toBe("ai_usage_metering_failed");
    expect(result.finalized).toBe(false);
  });

  it("denies reconciliation when final usage units are invalid", async () => {
    const result = await reconcileGatewayAiUsageMetering({
      feature: "ai_assistant",
      finalUsageUnits: -1,
      loadLedgerEntry: async () => reservedLedgerEntry(),
      outcome: "success",
      requestId: REQUEST_ID,
      tenantId: TENANT_ID,
      userId: USER_ID,
    });

    expect(result.reasonCode).toBe("ai_usage_metering_failed");
    expect(result.finalized).toBe(false);
  });

  it("does not pass raw prompts, context payloads, model responses, urls, or secrets into ledger writes", async () => {
    let capturedWrite: unknown = null;

    await reconcileGatewayAiUsageMetering({
      feature: "ai_assistant",
      loadLedgerEntry: async () => reservedLedgerEntry(),
      outcome: "success",
      requestId: REQUEST_ID,
      tenantId: TENANT_ID,
      userId: USER_ID,
      writeLedgerEntry: async (input) => {
        capturedWrite = input;
        return recordedLedgerEntry();
      },
      finalUsageUnits: 9,
      prompt:
        "private prompt that must never be stored in gateway post-call metering",
      rawContextPayload: {
        privateUrl: "https://private.example.com?token=sk-secret",
      },
      modelResponse:
        "full model response that must never be stored in gateway post-call metering",
    } as Parameters<typeof reconcileGatewayAiUsageMetering>[0] & {
      modelResponse?: string;
      prompt?: string;
      rawContextPayload?: Record<string, unknown>;
    });

    const serializedWrite = JSON.stringify(capturedWrite);
    expect(serializedWrite).not.toContain("private prompt");
    expect(serializedWrite).not.toContain("rawContextPayload");
    expect(serializedWrite).not.toContain("model response");
    expect(serializedWrite).not.toContain("private.example.com");
    expect(serializedWrite).not.toContain("sk-secret");
  });

  it("surfaces a secret-safe concurrency release failure without double counting", async () => {
    let writes = 0;

    const result = await reconcileGatewayAiUsageMetering({
      feature: "ai_assistant",
      finalUsageUnits: 9,
      loadLedgerEntry: async () => reservedLedgerEntry(),
      outcome: "success",
      releaseConcurrencyClaim: async () => ({
        reasonCode: "ai_usage_limit_unavailable",
        released: false,
        remainingConcurrency: null,
      }),
      requestId: REQUEST_ID,
      tenantId: TENANT_ID,
      userId: USER_ID,
      writeLedgerEntry: async () => {
        writes += 1;
        return recordedLedgerEntry();
      },
    });

    expect(result).toEqual({
      concurrencyRelease: {
        reasonCode: "ai_usage_limit_unavailable",
        released: false,
        remainingConcurrency: null,
      },
      finalized: true,
      idempotentReplay: false,
      ledgerEntry: recordedLedgerEntry(),
      reasonCode: "ai_usage_concurrency_release_failed",
    });
    expect(writes).toBe(1);
  });

  it("returns unavailable when the reserved ledger entry cannot be loaded", async () => {
    const result = await reconcileGatewayAiUsageMetering({
      feature: "ai_assistant",
      loadLedgerEntry: async () => null,
      outcome: "success",
      requestId: REQUEST_ID,
      tenantId: TENANT_ID,
      userId: USER_ID,
    });

    expect(result).toEqual({
      concurrencyRelease: null,
      finalized: false,
      idempotentReplay: false,
      ledgerEntry: null,
      reasonCode: "ai_usage_metering_unavailable",
    });
  });
});

function reservedLedgerEntry() {
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
    requestId: REQUEST_ID,
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

function deniedLedgerEntry(
  errorCategory: "policy_blocked" | "request_timeout",
): GatewayAiUsageMeteringReconciliationResult["ledgerEntry"] {
  return {
    ...reservedLedgerEntry(),
    errorCategory,
    ledgerStatus: "denied" as const,
    updatedAt: "2026-06-30T08:01:00.000Z",
  };
}
