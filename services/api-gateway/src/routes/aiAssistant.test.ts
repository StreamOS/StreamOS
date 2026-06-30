import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import {
  runGatewayAiAssistantRouteContract,
  type GatewayAiAssistantRouteContractResult,
} from "../lib/ai-assistant-route-contract.js";
import { createInMemoryGatewayAiAssistantObservabilityRecorder } from "../lib/ai-assistant-route-observability.js";
import { resolveGatewayAiUsageAdmissionPolicies } from "../lib/ai-usage-admission.js";
import { resolveGatewayAiUsageRedisGuardPolicies } from "../lib/ai-usage-redis-guard.js";
import { resolveAutomationEntitlementAssertionSigningConfig } from "../lib/automation-entitlement-signing.js";

const API_SECRET = "test-api-gateway-secret-123";
const REQUEST_ID = "req-123";
const TENANT_ID = "tenant-123";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const SIGNING_SECRET = "a".repeat(32);
const PRIVATE_PROMPT =
  "Summarize https://private.example.com/context and never expose sk-secret.";

describe("AI assistant router", () => {
  afterEach(() => {
    delete process.env.API_GATEWAY_SECRET;
  });

  it("mounts the route but keeps the product gate closed by default", async () => {
    let helperCalls = 0;
    const recorder = createInMemoryGatewayAiAssistantObservabilityRecorder();
    const app = createApp({
      aiAssistantRoute: {
        observabilitySink: recorder.sink,
        runRouteContract: async () => {
          helperCalls += 1;
          return unavailableResult("disabled");
        },
      },
      apiGatewaySecret: API_SECRET,
      nodeEnv: "test",
    });

    const response = await postAiAssistant(app, {
      headers: { authorization: `Bearer ${API_SECRET}` },
    });
    const body = await response.json();
    const serializedBody = JSON.stringify(body);

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      error: "ai_assistant_unavailable",
      feature: "ai_assistant",
      product_gate_status: "closed",
      reason_code: "ai_assistant_product_gate_closed",
      request_id: REQUEST_ID,
      route_mode: "disabled",
    });
    expect(serializedBody).not.toContain("private.example.com");
    expect(serializedBody).not.toContain("sk-secret");
    expect(helperCalls).toBe(0);
    expect(recorder.events).toHaveLength(1);
    expect(recorder.events[0]).toMatchObject({
      evidence_class: "product_gate_closed",
      outcome: "unavailable",
      phase: "route_contract_completed",
      product_gate_status: "closed",
      reason_code: "ai_assistant_product_gate_closed",
      request_id: REQUEST_ID,
      route_mode: "disabled",
      runtime_status: "not_yet_productive",
    });
    expect(JSON.stringify(recorder.events)).not.toContain(
      "private.example.com",
    );
    expect(JSON.stringify(recorder.events)).not.toContain("sk-secret");
  });

  it("rejects requests without the API gateway secret before the helper runs", async () => {
    let helperCalls = 0;
    const app = createApp({
      aiAssistantRoute: {
        productGateStatus: "open",
        runRouteContract: async () => {
          helperCalls += 1;
          return unavailableResult("disabled");
        },
      },
      apiGatewaySecret: API_SECRET,
      nodeEnv: "test",
    });

    const response = await postAiAssistant(app);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      error: "invalid_api_gateway_secret",
    });
    expect(helperCalls).toBe(0);
  });

  it("invokes the shared helper only after auth and product gate preconditions pass", async () => {
    const helperCalls: Array<
      Parameters<typeof runGatewayAiAssistantRouteContract>[0]
    > = [];
    const app = createApp({
      aiAssistantRoute: {
        productGateStatus: "open",
        runRouteContract: async (input) => {
          helperCalls.push(input);
          return runGatewayAiAssistantRouteContract(input);
        },
      },
      apiGatewaySecret: API_SECRET,
      nodeEnv: "test",
    });

    const response = await postAiAssistant(app, {
      headers: { authorization: `Bearer ${API_SECRET}` },
    });
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      error: "ai_assistant_unavailable",
      reason_code: "ai_assistant_route_unavailable",
      route_mode: "disabled",
    });
    expect(helperCalls).toHaveLength(1);
    expect(helperCalls[0]).toMatchObject({
      plan: "pro",
      planSource: "persisted_server_plan",
      request: {
        context: {
          tenant_id: TENANT_ID,
          user_id: USER_ID,
        },
        estimated_usage_units: 12,
        prompt: PRIVATE_PROMPT,
        request_classification: "assistant_prompt",
        request_id: REQUEST_ID,
      },
      routeMode: "disabled",
    });
    expect(helperCalls[0]?.request).not.toHaveProperty("plan");
    expect(helperCalls[0]?.request).not.toHaveProperty("plan_source");
  });

  it("keeps routeMode disabled observable without leaking route payload details", async () => {
    const recorder = createInMemoryGatewayAiAssistantObservabilityRecorder();
    const app = createApp({
      aiAssistantRoute: {
        observabilitySink: recorder.sink,
        productGateStatus: "open",
      },
      apiGatewaySecret: API_SECRET,
      nodeEnv: "test",
    });

    const response = await postAiAssistant(app, {
      headers: { authorization: `Bearer ${API_SECRET}` },
    });
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      error: "ai_assistant_unavailable",
      reason_code: "ai_assistant_route_unavailable",
      route_mode: "disabled",
    });
    expect(recorder.events.at(-1)).toMatchObject({
      evidence_class: "route_mode_disabled",
      outcome: "unavailable",
      phase: "route_contract_completed",
      product_gate_status: "open",
      reason_code: "ai_assistant_route_unavailable",
      request_id: REQUEST_ID,
      route_mode: "disabled",
      runtime_status: "not_yet_productive",
    });
    expect(JSON.stringify(recorder.events)).not.toContain(
      "private.example.com",
    );
    expect(JSON.stringify(recorder.events)).not.toContain("sk-secret");
  });

  it("denies missing trusted request context after the route gate opens", async () => {
    let downstreamCalls = 0;
    const app = createApp({
      aiAssistantRoute: {
        admissionPolicies: createActiveAdmissionPolicies(),
        downstreamOperation: async () => {
          downstreamCalls += 1;
          return {
            finalUsageUnits: 12,
            outcome: "success",
          };
        },
        limitPolicies: createEnabledLimitPolicies(),
        productGateStatus: "open",
        redisStore: createRedisStore(),
        routeMode: "test_only_mock",
        signingConfig: createSigningConfig(),
      },
      apiGatewaySecret: API_SECRET,
      nodeEnv: "test",
    });

    const response = await postAiAssistant(app, {
      body: {
        ...baseRequestBody(),
        context: {
          ...baseRequestBody().context,
          tenant_id: "",
        },
      },
      headers: { authorization: `Bearer ${API_SECRET}` },
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toMatchObject({
      admission_reason_code: "ai_usage_context_missing",
      error: "ai_assistant_forbidden",
      reason_code: "ai_assistant_admission_denied",
      usage_context_reason_code: "ai_usage_context_not_issued",
    });
    expect(downstreamCalls).toBe(0);
  });

  it.each(["free", "business"])(
    "denies non-pro plan %s before any downstream call",
    async (plan) => {
      let downstreamCalls = 0;
      const recorder = createInMemoryGatewayAiAssistantObservabilityRecorder();
      const app = createApp({
        aiAssistantRoute: {
          admissionPolicies: createActiveAdmissionPolicies(),
          downstreamOperation: async () => {
            downstreamCalls += 1;
            return {
              finalUsageUnits: 12,
              outcome: "success",
            };
          },
          limitPolicies: createEnabledLimitPolicies(),
          observabilitySink: recorder.sink,
          productGateStatus: "open",
          redisStore: createRedisStore(),
          routeMode: "test_only_mock",
          signingConfig: createSigningConfig(),
        },
        apiGatewaySecret: API_SECRET,
        nodeEnv: "test",
      });

      const response = await postAiAssistant(app, {
        body: {
          ...baseRequestBody(),
          plan,
        },
        headers: { authorization: `Bearer ${API_SECRET}` },
      });
      const body = await response.json();
      const serializedBody = JSON.stringify(body);
      const serializedEvents = JSON.stringify(recorder.events);

      expect(response.status).toBe(403);
      expect(body).toMatchObject({
        admission_reason_code: "ai_usage_plan_denied",
        error: "ai_assistant_forbidden",
        reason_code: "ai_assistant_admission_denied",
        usage_context_reason_code: "ai_usage_admission_denied",
      });
      expect(downstreamCalls).toBe(0);
      expect(recorder.events.map((event) => event.phase)).toEqual([
        "request_received",
        "admission_denied",
        "route_contract_completed",
      ]);
      expect(recorder.events.at(-2)).toMatchObject({
        evidence_class: "plan_denied",
        phase: "admission_denied",
        product_gate_status: "open",
        reason_code: "ai_usage_plan_denied",
        runtime_status: "active",
      });
      expect(serializedBody).not.toContain("private.example.com");
      expect(serializedBody).not.toContain("sk-secret");
      expect(serializedEvents).not.toContain("private.example.com");
      expect(serializedEvents).not.toContain("sk-secret");
    },
  );

  it("denies unsupported plan_source values before usage context issuance", async () => {
    let downstreamCalls = 0;
    const recorder = createInMemoryGatewayAiAssistantObservabilityRecorder();
    const app = createApp({
      aiAssistantRoute: {
        admissionPolicies: createActiveAdmissionPolicies(),
        downstreamOperation: async () => {
          downstreamCalls += 1;
          return {
            finalUsageUnits: 12,
            outcome: "success",
          };
        },
        limitPolicies: createEnabledLimitPolicies(),
        observabilitySink: recorder.sink,
        productGateStatus: "open",
        redisStore: createRedisStore(),
        routeMode: "test_only_mock",
        signingConfig: createSigningConfig(),
      },
      apiGatewaySecret: API_SECRET,
      nodeEnv: "test",
    });

    const response = await postAiAssistant(app, {
      body: {
        ...baseRequestBody(),
        plan_source: "signed_entitlement_assertion",
      },
      headers: { authorization: `Bearer ${API_SECRET}` },
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toMatchObject({
      admission_reason_code: "ai_usage_plan_required",
      error: "ai_assistant_forbidden",
      reason_code: "ai_assistant_admission_denied",
    });
    expect(downstreamCalls).toBe(0);
    expect(recorder.events.at(-2)).toMatchObject({
      evidence_class: "plan_source_untrusted",
      phase: "admission_denied",
      product_gate_status: "open",
      reason_code: "ai_usage_plan_required",
      runtime_status: "active",
    });
    expect(JSON.stringify(recorder.events)).not.toContain(
      "private.example.com",
    );
    expect(JSON.stringify(recorder.events)).not.toContain("sk-secret");
  });

  it("keeps runtimeStatus fail-closed while the feature is not yet productive", async () => {
    let downstreamCalls = 0;
    const recorder = createInMemoryGatewayAiAssistantObservabilityRecorder();
    const app = createApp({
      aiAssistantRoute: {
        downstreamOperation: async () => {
          downstreamCalls += 1;
          return {
            finalUsageUnits: 12,
            outcome: "success",
          };
        },
        observabilitySink: recorder.sink,
        productGateStatus: "open",
        redisStore: createRedisStore(),
        routeMode: "test_only_mock",
      },
      apiGatewaySecret: API_SECRET,
      nodeEnv: "test",
    });

    const response = await postAiAssistant(app, {
      headers: { authorization: `Bearer ${API_SECRET}` },
    });
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      admission_reason_code: "ai_usage_not_productive",
      error: "ai_assistant_unavailable",
      reason_code: "ai_assistant_not_productive",
      usage_context_reason_code: "ai_usage_admission_denied",
    });
    expect(downstreamCalls).toBe(0);
    expect(recorder.events.at(-2)).toMatchObject({
      evidence_class: "runtime_not_productive",
      phase: "admission_denied",
      product_gate_status: "open",
      reason_code: "ai_usage_not_productive",
      runtime_status: "not_yet_productive",
    });
    expect(JSON.stringify(recorder.events)).not.toContain(
      "private.example.com",
    );
    expect(JSON.stringify(recorder.events)).not.toContain("sk-secret");
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

function createEnabledLimitPolicies() {
  return resolveGatewayAiUsageRedisGuardPolicies({
    ai_assistant: {
      burstLimit: 3,
      concurrencyLimit: 1,
      mode: "enforced",
      runtimeStatus: "active",
    },
  });
}

function createRedisStore() {
  return {
    async del() {
      return 1;
    },
    async get() {
      return null;
    },
    async incr() {
      return 1;
    },
    async pexpire() {
      return 1;
    },
    async set() {
      return "OK";
    },
  };
}

function createSigningConfig() {
  return resolveAutomationEntitlementAssertionSigningConfig({
    mode: "hmac_sha256",
    secret: SIGNING_SECRET,
  });
}

function baseRequestBody() {
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
    plan: "pro",
    plan_source: "persisted_server_plan",
    prompt: PRIVATE_PROMPT,
    request_classification: "assistant_prompt",
    request_id: REQUEST_ID,
  };
}

async function postAiAssistant(
  app: ReturnType<typeof createApp>,
  input: {
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
  } = {},
) {
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected TCP server address.");
    }

    return await fetch(`http://127.0.0.1:${address.port}/api/ai-assistant`, {
      body: JSON.stringify(input.body ?? baseRequestBody()),
      headers: {
        "content-type": "application/json",
        ...(input.headers ?? {}),
      },
      method: "POST",
    });
  } finally {
    server.close();
  }
}

function unavailableResult(
  routeMode: "disabled" | "test_only_mock",
): GatewayAiAssistantRouteContractResult {
  return {
    allowed: false,
    body: {
      error: "ai_assistant_unavailable",
      feature: "ai_assistant",
      message: "AI assistant route contract is unavailable.",
      reason_code: "ai_assistant_route_unavailable",
      request_id: REQUEST_ID,
      route_mode: routeMode,
    },
    downstreamInvoked: false,
    issuanceResult: null,
    meteringResult: null,
    statusCode: 503,
  };
}
