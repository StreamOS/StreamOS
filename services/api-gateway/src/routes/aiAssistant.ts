import express from "express";
import type { Router } from "express";

import {
  runGatewayAiAssistantRouteContract,
  type GatewayAiAssistantDownstreamResult,
  type GatewayAiAssistantPreparedAutomationRequest,
  type GatewayAiAssistantRouteContractMode,
} from "../lib/ai-assistant-route-contract.js";
import {
  resolveGatewayAiUsageAdmissionPolicies,
  type GatewayAiUsageAdmissionPolicies,
} from "../lib/ai-usage-admission.js";
import { type GatewayAiAssistantObservabilitySink } from "../lib/ai-assistant-route-observability.js";
import {
  resolveGatewayAiUsageRedisGuardPolicies,
  type GatewayAiUsageRedisGuardPolicies,
  type GatewayAiUsageRedisStore,
} from "../lib/ai-usage-redis-guard.js";
import { type GatewayAutomationEntitlementSigningConfig } from "../lib/automation-entitlement-signing.js";

export type AiAssistantRouteProductGateStatus = "open" | "closed";

export type CreateAiAssistantRouterOptions = {
  admissionPolicies?: GatewayAiUsageAdmissionPolicies;
  downstreamOperation?:
    | ((
        input: GatewayAiAssistantPreparedAutomationRequest,
      ) => Promise<GatewayAiAssistantDownstreamResult>)
    | null;
  limitPolicies?: GatewayAiUsageRedisGuardPolicies;
  now?: Date | number | string;
  observabilitySink?: GatewayAiAssistantObservabilitySink | null;
  productGateStatus?: AiAssistantRouteProductGateStatus;
  redisStore?: GatewayAiUsageRedisStore | null;
  routeMode?: GatewayAiAssistantRouteContractMode;
  runRouteContract?: typeof runGatewayAiAssistantRouteContract;
  signingConfig?: GatewayAutomationEntitlementSigningConfig;
};

export function createAiAssistantRouter(
  options: CreateAiAssistantRouterOptions = {},
): Router {
  const router = express.Router();
  const routeMode = options.routeMode ?? "disabled";
  const productGateStatus = options.productGateStatus ?? "closed";
  const admissionPolicies =
    options.admissionPolicies ?? resolveGatewayAiUsageAdmissionPolicies();
  const limitPolicies =
    options.limitPolicies ?? resolveGatewayAiUsageRedisGuardPolicies();
  const runRouteContract =
    options.runRouteContract ?? runGatewayAiAssistantRouteContract;

  router.post("/", async (request, response) => {
    if (productGateStatus !== "open") {
      response.status(503).json({
        error: "ai_assistant_unavailable",
        feature: "ai_assistant",
        message:
          "AI assistant route is mounted but closed by the product gate.",
        product_gate_status: productGateStatus,
        reason_code: "ai_assistant_product_gate_closed",
        request_id: extractRequestId(request.body),
        route_mode: routeMode,
      });
      return;
    }

    const routeBody = toObject(request.body);
    const { plan, plan_source: planSource, ...helperRequest } = routeBody;

    const contractResult = await runRouteContract({
      admissionPolicies,
      downstreamOperation: options.downstreamOperation ?? null,
      limitPolicies,
      now: options.now,
      observabilitySink: options.observabilitySink ?? null,
      plan,
      planSource,
      redisStore: options.redisStore ?? null,
      request: helperRequest,
      routeMode,
      signingConfig: options.signingConfig,
    });

    response.status(contractResult.statusCode).json(contractResult.body);
  });

  return router;
}

function toObject(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function extractRequestId(value: unknown): string | null {
  const candidate = toObject(value).request_id;
  return typeof candidate === "string" && candidate.trim().length > 0
    ? candidate.trim().slice(0, 120)
    : null;
}
