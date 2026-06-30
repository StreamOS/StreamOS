import {
  evaluateGatewayAiAssistantActivationPreflight,
  type GatewayAiAssistantActivationPreflightCurrentState,
  type GatewayAiAssistantActivationPreflightEvidence,
  type GatewayAiAssistantActivationPreflightResult,
  type GatewayAiAssistantActivationPreflightStatus,
} from "./ai-assistant-activation-preflight.js";

export const GATEWAY_AI_ASSISTANT_ACTIVATION_TRANSITIONS = [
  "product_gate_controlled_opening",
  "route_mode_limited_transition",
  "runtime_status_limited_internal_activation",
] as const;

export const GATEWAY_AI_ASSISTANT_ACTIVATION_TRANSITION_STATUSES = [
  "blocked",
  "ready_for_product_gate_controlled_opening",
  "ready_for_route_mode_limited_transition",
  "ready_for_runtime_status_limited_internal_activation",
] as const;

export type GatewayAiAssistantActivationTransition =
  (typeof GATEWAY_AI_ASSISTANT_ACTIVATION_TRANSITIONS)[number];

export type GatewayAiAssistantActivationTransitionStatus =
  (typeof GATEWAY_AI_ASSISTANT_ACTIVATION_TRANSITION_STATUSES)[number];

export type GatewayAiAssistantActivationTransitionFoundationState = {
  downstreamContractFoundationReady?: boolean | null;
  productGateControlledOpeningReviewed?: boolean | null;
  routeModeLimitedTransitionReviewed?: boolean | null;
};

export type GatewayAiAssistantActivationTransitionBlockingStage =
  | "activation_preflight"
  | "automation_downstream_contract_foundation"
  | "product_gate_controlled_opening"
  | "route_mode_limited_transition"
  | null;

export type GatewayAiAssistantActivationTransitionReasonCode =
  | "activation_not_permitted_from_local_transition_contract"
  | "downstream_contract_foundation_missing"
  | "preflight_blocked"
  | "product_gate_controlled_opening_not_reviewed"
  | "route_mode_limited_transition_not_reviewed";

export type GatewayAiAssistantActivationTransitionContractResult = {
  activationPermittedNow: false;
  blockingStage: GatewayAiAssistantActivationTransitionBlockingStage;
  foundationState: Required<GatewayAiAssistantActivationTransitionFoundationState>;
  localOnly: true;
  nextTransitionCandidate: GatewayAiAssistantActivationTransition | null;
  operatorProofRequired: true;
  preflightResult: GatewayAiAssistantActivationPreflightResult;
  preflightStatus: GatewayAiAssistantActivationPreflightStatus;
  reasonCodes: GatewayAiAssistantActivationTransitionReasonCode[];
  requestedTransition: GatewayAiAssistantActivationTransition;
  status: GatewayAiAssistantActivationTransitionStatus;
  transitionPermittedNow: false;
};

export function evaluateGatewayAiAssistantActivationTransitionContract(params: {
  currentState?: GatewayAiAssistantActivationPreflightCurrentState;
  evidence?: GatewayAiAssistantActivationPreflightEvidence;
  foundationState?: GatewayAiAssistantActivationTransitionFoundationState;
  requestedTransition: GatewayAiAssistantActivationTransition;
}): GatewayAiAssistantActivationTransitionContractResult {
  const preflightResult = evaluateGatewayAiAssistantActivationPreflight({
    currentState: params.currentState,
    evidence: params.evidence,
  });
  const foundationState = normalizeFoundationState(params.foundationState);

  if (preflightResult.status !== "preflight_ready") {
    return {
      activationPermittedNow: false,
      blockingStage: "activation_preflight",
      foundationState,
      localOnly: true,
      nextTransitionCandidate: null,
      operatorProofRequired: true,
      preflightResult,
      preflightStatus: preflightResult.status,
      reasonCodes: ["preflight_blocked"],
      requestedTransition: params.requestedTransition,
      status: "blocked",
      transitionPermittedNow: false,
    };
  }

  if (!foundationState.downstreamContractFoundationReady) {
    return {
      activationPermittedNow: false,
      blockingStage: "automation_downstream_contract_foundation",
      foundationState,
      localOnly: true,
      nextTransitionCandidate: null,
      operatorProofRequired: true,
      preflightResult,
      preflightStatus: preflightResult.status,
      reasonCodes: ["downstream_contract_foundation_missing"],
      requestedTransition: params.requestedTransition,
      status: "blocked",
      transitionPermittedNow: false,
    };
  }

  if (params.requestedTransition === "product_gate_controlled_opening") {
    return buildReadyResult({
      foundationState,
      preflightResult,
      requestedTransition: params.requestedTransition,
      status: "ready_for_product_gate_controlled_opening",
    });
  }

  if (!foundationState.productGateControlledOpeningReviewed) {
    return {
      activationPermittedNow: false,
      blockingStage: "product_gate_controlled_opening",
      foundationState,
      localOnly: true,
      nextTransitionCandidate: "product_gate_controlled_opening",
      operatorProofRequired: true,
      preflightResult,
      preflightStatus: preflightResult.status,
      reasonCodes: ["product_gate_controlled_opening_not_reviewed"],
      requestedTransition: params.requestedTransition,
      status: "blocked",
      transitionPermittedNow: false,
    };
  }

  if (params.requestedTransition === "route_mode_limited_transition") {
    return buildReadyResult({
      foundationState,
      preflightResult,
      requestedTransition: params.requestedTransition,
      status: "ready_for_route_mode_limited_transition",
    });
  }

  if (!foundationState.routeModeLimitedTransitionReviewed) {
    return {
      activationPermittedNow: false,
      blockingStage: "route_mode_limited_transition",
      foundationState,
      localOnly: true,
      nextTransitionCandidate: "route_mode_limited_transition",
      operatorProofRequired: true,
      preflightResult,
      preflightStatus: preflightResult.status,
      reasonCodes: ["route_mode_limited_transition_not_reviewed"],
      requestedTransition: params.requestedTransition,
      status: "blocked",
      transitionPermittedNow: false,
    };
  }

  return buildReadyResult({
    foundationState,
    preflightResult,
    requestedTransition: params.requestedTransition,
    status: "ready_for_runtime_status_limited_internal_activation",
  });
}

function buildReadyResult(params: {
  foundationState: Required<GatewayAiAssistantActivationTransitionFoundationState>;
  preflightResult: GatewayAiAssistantActivationPreflightResult;
  requestedTransition: GatewayAiAssistantActivationTransition;
  status: Exclude<GatewayAiAssistantActivationTransitionStatus, "blocked">;
}): GatewayAiAssistantActivationTransitionContractResult {
  return {
    activationPermittedNow: false,
    blockingStage: null,
    foundationState: params.foundationState,
    localOnly: true,
    nextTransitionCandidate: params.requestedTransition,
    operatorProofRequired: true,
    preflightResult: params.preflightResult,
    preflightStatus: params.preflightResult.status,
    reasonCodes: ["activation_not_permitted_from_local_transition_contract"],
    requestedTransition: params.requestedTransition,
    status: params.status,
    transitionPermittedNow: false,
  };
}

function normalizeFoundationState(
  value: GatewayAiAssistantActivationTransitionFoundationState | undefined,
): Required<GatewayAiAssistantActivationTransitionFoundationState> {
  return {
    downstreamContractFoundationReady:
      value?.downstreamContractFoundationReady === true,
    productGateControlledOpeningReviewed:
      value?.productGateControlledOpeningReviewed === true,
    routeModeLimitedTransitionReviewed:
      value?.routeModeLimitedTransitionReviewed === true,
  };
}
