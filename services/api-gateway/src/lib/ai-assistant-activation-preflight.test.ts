import { describe, expect, it } from "vitest";

import {
  GATEWAY_AI_ASSISTANT_ACTIVATION_PREFLIGHT_GATE_CATEGORIES,
  evaluateGatewayAiAssistantActivationPreflight,
  type GatewayAiAssistantActivationPreflightEvidence,
  type GatewayAiAssistantActivationPreflightGateCategory,
} from "./ai-assistant-activation-preflight.js";

describe("AI assistant activation preflight", () => {
  it("blocks activation when operator product-gate approval evidence is missing", () => {
    const result = evaluateGatewayAiAssistantActivationPreflight({
      evidence: omitEvidence("product_gate_operator_approval"),
    });

    expect(result.status).toBe("blocked");
    expect(result.activationPermittedNow).toBe(false);
    expect(result.missingGateEvidence).toContain(
      "product_gate_operator_approval",
    );
    expect(
      result.transitionResults.every(
        (transition) => transition.status === "blocked",
      ),
    ).toBe(true);
  });

  it("blocks activation when signing parity evidence is missing", () => {
    const result = evaluateGatewayAiAssistantActivationPreflight({
      evidence: omitEvidence("gateway_automation_signing_parity"),
    });

    expect(result.status).toBe("blocked");
    expect(result.activationPermittedNow).toBe(false);
    expect(result.missingGateEvidence).toContain(
      "gateway_automation_signing_parity",
    );
  });

  it("blocks activation when private reachability evidence is missing", () => {
    const result = evaluateGatewayAiAssistantActivationPreflight({
      evidence: omitEvidence("private_gateway_to_automation_reachability"),
    });

    expect(result.status).toBe("blocked");
    expect(result.activationPermittedNow).toBe(false);
    expect(result.missingGateEvidence).toContain(
      "private_gateway_to_automation_reachability",
    );
  });

  it.each([
    "budget_mode_productive_ready",
    "rate_guard_ready",
    "concurrency_guard_ready",
    "ledger_metering_ready",
  ] satisfies GatewayAiAssistantActivationPreflightGateCategory[])(
    "blocks activation when usage proof %s is missing",
    (category) => {
      const result = evaluateGatewayAiAssistantActivationPreflight({
        evidence: omitEvidence(category),
      });

      expect(result.status).toBe("blocked");
      expect(result.activationPermittedNow).toBe(false);
      expect(result.missingGateEvidence).toContain(category);
    },
  );

  it("blocks activation when rollback evidence is missing", () => {
    const result = evaluateGatewayAiAssistantActivationPreflight({
      evidence: omitEvidence("rollback_switch_ready"),
    });

    expect(result.status).toBe("blocked");
    expect(result.activationPermittedNow).toBe(false);
    expect(result.missingGateEvidence).toContain("rollback_switch_ready");
  });

  it("blocks activation when secret-safe activation evidence is missing", () => {
    const result = evaluateGatewayAiAssistantActivationPreflight({
      evidence: omitEvidence("activation_evidence_secret_safe"),
    });

    expect(result.status).toBe("blocked");
    expect(result.activationPermittedNow).toBe(false);
    expect(result.missingGateEvidence).toContain(
      "activation_evidence_secret_safe",
    );
    expect(
      result.gateResults.find(
        (gate) => gate.category === "activation_evidence_secret_safe",
      ),
    ).toMatchObject({
      reasonCode: "gate_evidence_unsafe",
      satisfied: false,
    });
  });

  it("remains blocked when fail-closed current state drifts even if all local evidence is present", () => {
    const result = evaluateGatewayAiAssistantActivationPreflight({
      currentState: {
        gatewayRuntimeStatus: "active",
        productGateStatus: "open",
        productiveDownstreamConfigured: true,
        routeMode: "test_only_mock",
      },
      evidence: buildFullEvidence(),
    });

    expect(result.status).toBe("blocked");
    expect(result.currentStateFailClosed).toBe(false);
    expect(result.activationPermittedNow).toBe(false);
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining([
        "gateway_runtime_not_fail_closed",
        "product_gate_not_closed",
        "productive_downstream_configured",
        "route_mode_not_disabled",
      ]),
    );
  });

  it("marks complete local evidence as preflight_ready without permitting activation", () => {
    const result = evaluateGatewayAiAssistantActivationPreflight({
      evidence: buildFullEvidence(),
    });

    expect(result.status).toBe("preflight_ready");
    expect(result.currentStateFailClosed).toBe(true);
    expect(result.missingGateEvidence).toEqual([]);
    expect(result.activationPermittedNow).toBe(false);
    expect(result.localOnly).toBe(true);
    expect(result.operatorProofRequired).toBe(true);
    expect(
      result.transitionResults.every(
        (transition) => transition.status === "preflight_ready",
      ),
    ).toBe(true);
    expect(
      result.transitionResults.every(
        (transition) =>
          transition.reasonCode ===
          "activation_not_permitted_from_local_preflight",
      ),
    ).toBe(true);
  });
});

function buildFullEvidence(): GatewayAiAssistantActivationPreflightEvidence {
  return Object.fromEntries(
    GATEWAY_AI_ASSISTANT_ACTIVATION_PREFLIGHT_GATE_CATEGORIES.map(
      (category) => [category, true],
    ),
  ) as GatewayAiAssistantActivationPreflightEvidence;
}

function omitEvidence(
  category: GatewayAiAssistantActivationPreflightGateCategory,
): GatewayAiAssistantActivationPreflightEvidence {
  const evidence = buildFullEvidence();
  delete evidence[category];
  return evidence;
}
