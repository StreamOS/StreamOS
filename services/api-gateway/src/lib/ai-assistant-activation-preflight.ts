import { type GatewayAiAssistantRouteContractMode } from "./ai-assistant-route-contract.js";
import { type GatewayAiUsageAdmissionRuntimeStatus } from "./ai-usage-admission.js";

export const GATEWAY_AI_ASSISTANT_ACTIVATION_PREFLIGHT_STATUSES = [
  "blocked",
  "preflight_ready",
] as const;

export const GATEWAY_AI_ASSISTANT_ACTIVATION_PREFLIGHT_GATE_CATEGORIES = [
  "product_gate_operator_approval",
  "route_mode_transition_approval",
  "runtime_status_coordination",
  "gateway_automation_signing_parity",
  "private_gateway_to_automation_reachability",
  "budget_mode_productive_ready",
  "rate_guard_ready",
  "concurrency_guard_ready",
  "ledger_metering_ready",
  "rollback_switch_ready",
  "activation_evidence_secret_safe",
] as const;

export const GATEWAY_AI_ASSISTANT_ACTIVATION_PREFLIGHT_TRANSITIONS = [
  "product_gate_open",
  "route_mode_transition",
  "runtime_status_activation",
  "productive_downstream_enablement",
] as const;

export type GatewayAiAssistantActivationPreflightStatus =
  (typeof GATEWAY_AI_ASSISTANT_ACTIVATION_PREFLIGHT_STATUSES)[number];

export type GatewayAiAssistantActivationPreflightGateCategory =
  (typeof GATEWAY_AI_ASSISTANT_ACTIVATION_PREFLIGHT_GATE_CATEGORIES)[number];

export type GatewayAiAssistantActivationPreflightTransition =
  (typeof GATEWAY_AI_ASSISTANT_ACTIVATION_PREFLIGHT_TRANSITIONS)[number];

export type GatewayAiAssistantActivationPreflightCurrentState = {
  automationRuntimeStatus?: GatewayAiUsageAdmissionRuntimeStatus | null;
  gatewayRuntimeStatus?: GatewayAiUsageAdmissionRuntimeStatus | null;
  productGateStatus?: "open" | "closed" | null;
  productiveDownstreamConfigured?: boolean | null;
  routeMode?: GatewayAiAssistantRouteContractMode | null;
};

export type GatewayAiAssistantActivationPreflightEvidence = Partial<
  Record<GatewayAiAssistantActivationPreflightGateCategory, boolean>
>;

export type GatewayAiAssistantActivationPreflightGateResult = {
  category: GatewayAiAssistantActivationPreflightGateCategory;
  reasonCode:
    | "gate_evidence_missing"
    | "gate_evidence_present"
    | "gate_evidence_unsafe";
  satisfied: boolean;
};

export type GatewayAiAssistantActivationPreflightTransitionResult = {
  reasonCode:
    | "activation_not_permitted_from_local_preflight"
    | "preflight_evidence_missing"
    | "preflight_state_not_fail_closed"
    | "transition_preflight_ready";
  status: GatewayAiAssistantActivationPreflightStatus;
  transition: GatewayAiAssistantActivationPreflightTransition;
};

export type GatewayAiAssistantActivationPreflightResult = {
  activationPermittedNow: false;
  currentState: Required<GatewayAiAssistantActivationPreflightCurrentState>;
  currentStateFailClosed: boolean;
  gateResults: GatewayAiAssistantActivationPreflightGateResult[];
  localOnly: true;
  missingGateEvidence: GatewayAiAssistantActivationPreflightGateCategory[];
  operatorProofRequired: true;
  reasonCodes: (
    | GatewayAiAssistantActivationPreflightGateResult["reasonCode"]
    | GatewayAiAssistantActivationPreflightTransitionResult["reasonCode"]
    | "automation_runtime_not_fail_closed"
    | "gateway_runtime_not_fail_closed"
    | "product_gate_not_closed"
    | "productive_downstream_configured"
    | "route_mode_not_disabled"
  )[];
  status: GatewayAiAssistantActivationPreflightStatus;
  transitionResults: GatewayAiAssistantActivationPreflightTransitionResult[];
};

const DEFAULT_CURRENT_STATE: Required<GatewayAiAssistantActivationPreflightCurrentState> =
  {
    automationRuntimeStatus: "not_yet_productive",
    gatewayRuntimeStatus: "not_yet_productive",
    productGateStatus: "closed",
    productiveDownstreamConfigured: false,
    routeMode: "disabled",
  };

export function evaluateGatewayAiAssistantActivationPreflight(params: {
  currentState?: GatewayAiAssistantActivationPreflightCurrentState;
  evidence?: GatewayAiAssistantActivationPreflightEvidence;
}): GatewayAiAssistantActivationPreflightResult {
  const currentState = normalizeCurrentState(params.currentState);
  const gateResults =
    GATEWAY_AI_ASSISTANT_ACTIVATION_PREFLIGHT_GATE_CATEGORIES.map((category) =>
      buildGateResult(category, params.evidence),
    );
  const missingGateEvidence = gateResults
    .filter((gate) => !gate.satisfied)
    .map((gate) => gate.category);
  const currentStateReasonCodes = resolveCurrentStateReasonCodes(currentState);
  const currentStateFailClosed = currentStateReasonCodes.length === 0;
  const status: GatewayAiAssistantActivationPreflightStatus =
    currentStateFailClosed && missingGateEvidence.length === 0
      ? "preflight_ready"
      : "blocked";

  const transitionReasonCode: GatewayAiAssistantActivationPreflightTransitionResult["reasonCode"] =
    !currentStateFailClosed
      ? "preflight_state_not_fail_closed"
      : missingGateEvidence.length > 0
        ? "preflight_evidence_missing"
        : "transition_preflight_ready";
  const transitionStatus: GatewayAiAssistantActivationPreflightStatus =
    currentStateFailClosed && missingGateEvidence.length === 0
      ? "preflight_ready"
      : "blocked";
  const transitionResults =
    GATEWAY_AI_ASSISTANT_ACTIVATION_PREFLIGHT_TRANSITIONS.map((transition) => ({
      reasonCode: transitionReasonCode,
      status: transitionStatus,
      transition,
    }));

  const reasonCodes = [
    ...currentStateReasonCodes,
    ...gateResults.map((gate) => gate.reasonCode),
    ...transitionResults.map((transition) =>
      transition.status === "preflight_ready"
        ? "activation_not_permitted_from_local_preflight"
        : transition.reasonCode,
    ),
  ];

  return {
    activationPermittedNow: false,
    currentState,
    currentStateFailClosed,
    gateResults,
    localOnly: true,
    missingGateEvidence,
    operatorProofRequired: true,
    reasonCodes: dedupeReasonCodes(reasonCodes),
    status,
    transitionResults:
      status === "preflight_ready"
        ? transitionResults.map((transition) => ({
            ...transition,
            reasonCode: "activation_not_permitted_from_local_preflight",
          }))
        : transitionResults,
  };
}

function buildGateResult(
  category: GatewayAiAssistantActivationPreflightGateCategory,
  evidence: GatewayAiAssistantActivationPreflightEvidence | undefined,
): GatewayAiAssistantActivationPreflightGateResult {
  if (category === "activation_evidence_secret_safe") {
    return evidence?.[category] === true
      ? {
          category,
          reasonCode: "gate_evidence_present",
          satisfied: true,
        }
      : {
          category,
          reasonCode: "gate_evidence_unsafe",
          satisfied: false,
        };
  }

  return evidence?.[category] === true
    ? {
        category,
        reasonCode: "gate_evidence_present",
        satisfied: true,
      }
    : {
        category,
        reasonCode: "gate_evidence_missing",
        satisfied: false,
      };
}

function normalizeCurrentState(
  value: GatewayAiAssistantActivationPreflightCurrentState | undefined,
): Required<GatewayAiAssistantActivationPreflightCurrentState> {
  return {
    automationRuntimeStatus:
      value?.automationRuntimeStatus === "active"
        ? "active"
        : DEFAULT_CURRENT_STATE.automationRuntimeStatus,
    gatewayRuntimeStatus:
      value?.gatewayRuntimeStatus === "active"
        ? "active"
        : DEFAULT_CURRENT_STATE.gatewayRuntimeStatus,
    productGateStatus:
      value?.productGateStatus === "open"
        ? "open"
        : DEFAULT_CURRENT_STATE.productGateStatus,
    productiveDownstreamConfigured:
      value?.productiveDownstreamConfigured === true,
    routeMode:
      value?.routeMode === "test_only_mock"
        ? "test_only_mock"
        : DEFAULT_CURRENT_STATE.routeMode,
  };
}

function resolveCurrentStateReasonCodes(
  currentState: Required<GatewayAiAssistantActivationPreflightCurrentState>,
): GatewayAiAssistantActivationPreflightResult["reasonCodes"] {
  const reasonCodes: GatewayAiAssistantActivationPreflightResult["reasonCodes"] =
    [];

  if (currentState.productGateStatus !== "closed") {
    reasonCodes.push("product_gate_not_closed");
  }

  if (currentState.routeMode !== "disabled") {
    reasonCodes.push("route_mode_not_disabled");
  }

  if (currentState.gatewayRuntimeStatus !== "not_yet_productive") {
    reasonCodes.push("gateway_runtime_not_fail_closed");
  }

  if (currentState.automationRuntimeStatus !== "not_yet_productive") {
    reasonCodes.push("automation_runtime_not_fail_closed");
  }

  if (currentState.productiveDownstreamConfigured) {
    reasonCodes.push("productive_downstream_configured");
  }

  return reasonCodes;
}

function dedupeReasonCodes(
  value: GatewayAiAssistantActivationPreflightResult["reasonCodes"],
): GatewayAiAssistantActivationPreflightResult["reasonCodes"] {
  const deduped = new Set<
    GatewayAiAssistantActivationPreflightResult["reasonCodes"][number]
  >(value);

  return [...deduped];
}
