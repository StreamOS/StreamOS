import { describe, expect, it } from "vitest";

import {
  buildGatewayAiAssistantObservabilityEvent,
  createInMemoryGatewayAiAssistantObservabilityRecorder,
  emitGatewayAiAssistantObservabilityEvent,
} from "./ai-assistant-route-observability.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";

describe("AI assistant route observability contract", () => {
  it("builds a secret-safe event with only allowed fields", () => {
    const event = buildGatewayAiAssistantObservabilityEvent({
      durationMs: 42,
      estimatedUsageUnits: 12,
      finalUsageUnits: 9,
      occurredAt: "2026-06-30T09:00:00.000Z",
      outcome: "allow",
      phase: "route_contract_completed",
      planAtRequestTime: "pro",
      planSource: "persisted_server_plan",
      reasonCode:
        "allowed https://private.example.com?token=sk-secret bearer abc.def.ghi",
      requestClassification:
        "assistant_prompt https://private.example.com/path?token=sk-secret",
      requestId: "req-123",
      routeMode: "test_only_mock",
      safeErrorCategory: "unknown_failure",
      tenantId: "tenant-123",
      userId: USER_ID,
    });

    expect(event).toEqual({
      contract_version: "2026-06-30.ai-assistant-observability.v1",
      created_at: "2026-06-30T09:00:00.000Z",
      duration_ms: 42,
      estimated_usage_units: 12,
      feature: "ai_assistant",
      final_usage_units: 9,
      occurred_at: "2026-06-30T09:00:00.000Z",
      outcome: "allow",
      phase: "route_contract_completed",
      plan_at_request_time: "pro",
      plan_source: "persisted_server_plan",
      reason_code: "allowed [redacted-url] [redacted]",
      request_classification: "assistant_prompt [redacted-url]",
      request_id: "req-123",
      route_mode: "test_only_mock",
      safe_error_category: "unknown_failure",
      tenant_id: "tenant-123",
      user_id: USER_ID,
    });

    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain("messages");
    expect(serialized).not.toContain("private.example.com");
    expect(serialized).not.toContain("sk-secret");
    expect(serialized).not.toContain("abc.def.ghi");
  });

  it("records events in memory and ignores sink failures", async () => {
    const recorder = createInMemoryGatewayAiAssistantObservabilityRecorder();
    const event = buildGatewayAiAssistantObservabilityEvent({
      occurredAt: "2026-06-30T09:00:00.000Z",
      outcome: "completed",
      phase: "request_received",
      reasonCode: "request_received",
      requestId: "req-123",
      routeMode: "test_only_mock",
      tenantId: "tenant-123",
      userId: USER_ID,
    });

    await emitGatewayAiAssistantObservabilityEvent({
      event,
      sink: recorder.sink,
    });
    await emitGatewayAiAssistantObservabilityEvent({
      event,
      sink: async () => {
        throw new Error(
          "https://private.example.com/observability?token=sk-secret",
        );
      },
    });

    expect(recorder.events).toEqual([event]);
  });
});
