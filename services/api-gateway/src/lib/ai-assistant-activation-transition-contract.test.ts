import { describe, expect, it } from "vitest";

import {
  GATEWAY_AI_ASSISTANT_ACTIVATION_PREFLIGHT_GATE_CATEGORIES,
  type GatewayAiAssistantActivationPreflightEvidence,
  type GatewayAiAssistantActivationPreflightGateCategory,
} from "./ai-assistant-activation-preflight.js";
import {
  evaluateGatewayAiAssistantActivationTransitionContract,
  type GatewayAiAssistantActivationTransitionFoundationState,
} from "./ai-assistant-activation-transition-contract.js";

describe("AI assistant activation transition contract", () => {
  it("blocks transition review while preflight evidence is incomplete", () => {
    const result = evaluateGatewayAiAssistantActivationTransitionContract({
      evidence: omitEvidence("gateway_automation_signing_parity"),
      foundationState: buildFullFoundationState(),
      requestedTransition: "product_gate_controlled_opening",
    });

    expect(result.status).toBe("blocked");
    expect(result.blockingStage).toBe("activation_preflight");
    expect(result.preflightStatus).toBe("blocked");
    expect(result.reasonCodes).toEqual(["preflight_blocked"]);
    expect(result.nextTransitionCandidate).toBeNull();
    expect(result.transitionPermittedNow).toBe(false);
    expect(result.activationPermittedNow).toBe(false);
  });

  it("blocks transition review until downstream foundation exists", () => {
    const result = evaluateGatewayAiAssistantActivationTransitionContract({
      evidence: buildFullEvidence(),
      requestedTransition: "product_gate_controlled_opening",
    });

    expect(result.status).toBe("blocked");
    expect(result.blockingStage).toBe(
      "automation_downstream_contract_foundation",
    );
    expect(result.reasonCodes).toEqual([
      "downstream_contract_foundation_missing",
    ]);
    expect(result.nextTransitionCandidate).toBeNull();
    expect(result.transitionPermittedNow).toBe(false);
  });

  it("marks the product-gate slice as locally review-ready without permitting transition", () => {
    const result = evaluateGatewayAiAssistantActivationTransitionContract({
      evidence: buildFullEvidence(),
      foundationState: {
        downstreamContractFoundationReady: true,
      },
      requestedTransition: "product_gate_controlled_opening",
    });

    expect(result.status).toBe("ready_for_product_gate_controlled_opening");
    expect(result.blockingStage).toBeNull();
    expect(result.nextTransitionCandidate).toBe(
      "product_gate_controlled_opening",
    );
    expect(result.reasonCodes).toEqual([
      "activation_not_permitted_from_local_transition_contract",
    ]);
    expect(result.localOnly).toBe(true);
    expect(result.operatorProofRequired).toBe(true);
    expect(result.transitionPermittedNow).toBe(false);
    expect(result.activationPermittedNow).toBe(false);
    expect(result.preflightResult.currentStateFailClosed).toBe(true);
  });

  it("blocks route-mode transition review until product-gate opening is reviewed", () => {
    const result = evaluateGatewayAiAssistantActivationTransitionContract({
      evidence: buildFullEvidence(),
      foundationState: {
        downstreamContractFoundationReady: true,
      },
      requestedTransition: "route_mode_limited_transition",
    });

    expect(result.status).toBe("blocked");
    expect(result.blockingStage).toBe("product_gate_controlled_opening");
    expect(result.nextTransitionCandidate).toBe(
      "product_gate_controlled_opening",
    );
    expect(result.reasonCodes).toEqual([
      "product_gate_controlled_opening_not_reviewed",
    ]);
  });

  it("marks the route-mode slice as locally review-ready once product-gate review exists", () => {
    const result = evaluateGatewayAiAssistantActivationTransitionContract({
      evidence: buildFullEvidence(),
      foundationState: {
        downstreamContractFoundationReady: true,
        productGateControlledOpeningReviewed: true,
      },
      requestedTransition: "route_mode_limited_transition",
    });

    expect(result.status).toBe("ready_for_route_mode_limited_transition");
    expect(result.blockingStage).toBeNull();
    expect(result.nextTransitionCandidate).toBe(
      "route_mode_limited_transition",
    );
    expect(result.transitionPermittedNow).toBe(false);
    expect(result.activationPermittedNow).toBe(false);
  });

  it("blocks runtime-status transition review until route-mode review exists", () => {
    const result = evaluateGatewayAiAssistantActivationTransitionContract({
      evidence: buildFullEvidence(),
      foundationState: {
        downstreamContractFoundationReady: true,
        productGateControlledOpeningReviewed: true,
      },
      requestedTransition: "runtime_status_limited_internal_activation",
    });

    expect(result.status).toBe("blocked");
    expect(result.blockingStage).toBe("route_mode_limited_transition");
    expect(result.nextTransitionCandidate).toBe(
      "route_mode_limited_transition",
    );
    expect(result.reasonCodes).toEqual([
      "route_mode_limited_transition_not_reviewed",
    ]);
  });

  it("marks runtime-status transition as locally review-ready without permitting activation", () => {
    const result = evaluateGatewayAiAssistantActivationTransitionContract({
      evidence: buildFullEvidence(),
      foundationState: buildFullFoundationState(),
      requestedTransition: "runtime_status_limited_internal_activation",
    });

    expect(result.status).toBe(
      "ready_for_runtime_status_limited_internal_activation",
    );
    expect(result.blockingStage).toBeNull();
    expect(result.nextTransitionCandidate).toBe(
      "runtime_status_limited_internal_activation",
    );
    expect(result.transitionPermittedNow).toBe(false);
    expect(result.activationPermittedNow).toBe(false);
    expect(result.operatorProofRequired).toBe(true);
    expect(result.reasonCodes).toEqual([
      "activation_not_permitted_from_local_transition_contract",
    ]);
  });

  it("re-blocks all transition review if the current state drifts away from fail-closed defaults", () => {
    const result = evaluateGatewayAiAssistantActivationTransitionContract({
      currentState: {
        gatewayRuntimeStatus: "active",
        productGateStatus: "open",
        productiveDownstreamConfigured: true,
        routeMode: "test_only_mock",
      },
      evidence: buildFullEvidence(),
      foundationState: buildFullFoundationState(),
      requestedTransition: "runtime_status_limited_internal_activation",
    });

    expect(result.status).toBe("blocked");
    expect(result.blockingStage).toBe("activation_preflight");
    expect(result.preflightResult.reasonCodes).toEqual(
      expect.arrayContaining([
        "gateway_runtime_not_fail_closed",
        "product_gate_not_closed",
        "productive_downstream_configured",
        "route_mode_not_disabled",
      ]),
    );
    expect(result.transitionPermittedNow).toBe(false);
    expect(result.activationPermittedNow).toBe(false);
  });
});

function buildFullEvidence(): GatewayAiAssistantActivationPreflightEvidence {
  return Object.fromEntries(
    GATEWAY_AI_ASSISTANT_ACTIVATION_PREFLIGHT_GATE_CATEGORIES.map(
      (category) => [category, true],
    ),
  ) as GatewayAiAssistantActivationPreflightEvidence;
}

function buildFullFoundationState(): GatewayAiAssistantActivationTransitionFoundationState {
  return {
    downstreamContractFoundationReady: true,
    productGateControlledOpeningReviewed: true,
    routeModeLimitedTransitionReviewed: true,
  };
}

function omitEvidence(
  category: GatewayAiAssistantActivationPreflightGateCategory,
): GatewayAiAssistantActivationPreflightEvidence {
  const evidence = buildFullEvidence();
  delete evidence[category];
  return evidence;
}
