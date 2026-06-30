import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  validateGatewayAiAssistantAutomationDownstreamRequest,
  type GatewayAiAssistantAutomationDownstreamRequest,
} from "./ai-assistant-automation-downstream-contract.js";

const FIXTURE = loadFixture();

describe("AI assistant automation downstream contract", () => {
  it("accepts the shared safe fixture shape", () => {
    for (const testCase of FIXTURE.cases) {
      expect(
        validateGatewayAiAssistantAutomationDownstreamRequest(
          testCase.expected_prepared_automation_request,
        ),
      ).toEqual(testCase.expected_prepared_automation_request);
    }
  });

  it("rejects secret-bearing top-level fields fail-closed", () => {
    const request = structuredClone(
      FIXTURE.cases[0].expected_prepared_automation_request,
    ) as Record<string, unknown>;
    request.provider_token = "sk-secret";

    expect(() =>
      validateGatewayAiAssistantAutomationDownstreamRequest(request),
    ).toThrow();
  });

  it("rejects parity drift between trusted context and usage context", () => {
    const request = structuredClone(
      FIXTURE.cases[0].expected_prepared_automation_request,
    ) as GatewayAiAssistantAutomationDownstreamRequest;
    request.request_classification = "other_classification";

    expect(() =>
      validateGatewayAiAssistantAutomationDownstreamRequest(request),
    ).toThrow();
  });

  it("rejects productive runtime markers", () => {
    const request = structuredClone(
      FIXTURE.cases[0].expected_prepared_automation_request,
    ) as Record<string, unknown>;
    request.runtime_status = "active";

    expect(() =>
      validateGatewayAiAssistantAutomationDownstreamRequest(request),
    ).toThrow();
  });
});

type GatewayAutomationContractFixture = {
  cases: Array<{
    expected_prepared_automation_request: GatewayAiAssistantAutomationDownstreamRequest;
  }>;
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
