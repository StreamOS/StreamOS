import { z } from "zod";

import { type SignedGatewayAiUsageContext } from "./ai-usage-context-issuance.js";

export const GATEWAY_AI_ASSISTANT_AUTOMATION_CONTEXT_BOUNDARY_VERSION =
  "2026-06-30.ai-assistant-context-boundary.v1" as const;
export const GATEWAY_AI_ASSISTANT_AUTOMATION_RUNTIME_STATUS =
  "not_yet_productive" as const;

export const gatewayAiAssistantAutomationContextSourceSchema = z
  .object({
    item_limit: z.number().int().positive().max(50),
    payload_bytes: z.number().int().positive().max(24_576),
    source: z.string().trim().min(1).max(64),
    time_window_days: z.number().int().positive().max(90),
  })
  .strict();

export const gatewayAiAssistantAutomationContextSchema = z
  .object({
    sources: z
      .array(gatewayAiAssistantAutomationContextSourceSchema)
      .min(1)
      .max(6),
    tenant_id: z.string().trim().min(1).max(200),
    transcript_excerpt_characters: z
      .number()
      .int()
      .min(0)
      .max(4_000)
      .default(0),
    user_id: z.string().uuid(),
  })
  .strict();

export const gatewayAiAssistantAutomationUsageContextSchema = z
  .object({
    admission_decision: z.literal("allow"),
    audience: z.literal("automation-service"),
    budget_status: z.literal("within_budget"),
    estimated_usage_units: z.number().int().positive().max(10_000),
    expires_at: z.string().datetime({ offset: true }),
    feature: z.literal("ai_assistant"),
    issued_at: z.string().datetime({ offset: true }),
    issuer: z.literal("api-gateway"),
    plan_at_request_time: z.enum(["free", "pro", "agency"]),
    plan_source: z.enum(["persisted_server_plan", "server_verified_billing"]),
    purpose: z.literal("ai_usage_budget_admission"),
    request_classification: z.string().trim().min(1).max(120),
    request_id: z.string().trim().min(1).max(120),
    tenant_id: z.string().trim().min(1).max(200),
    user_id: z.string().uuid(),
  })
  .strict();

export const gatewayAiAssistantAutomationDownstreamRequestSchema = z
  .object({
    context: gatewayAiAssistantAutomationContextSchema,
    context_boundary_version: z.literal(
      GATEWAY_AI_ASSISTANT_AUTOMATION_CONTEXT_BOUNDARY_VERSION,
    ),
    feature: z.literal("ai_assistant"),
    prompt: z.string().trim().min(1).max(4_000),
    request_classification: z.string().trim().min(1).max(120),
    request_id: z.string().trim().min(1).max(120),
    runtime_status: z.literal(GATEWAY_AI_ASSISTANT_AUTOMATION_RUNTIME_STATUS),
    usage_context: gatewayAiAssistantAutomationUsageContextSchema,
    usage_context_signature: z
      .string()
      .trim()
      .regex(/^[a-f0-9]{64}$/),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.context.tenant_id !== value.usage_context.tenant_id) {
      context.addIssue({
        code: "custom",
        message: "Context tenant_id must match usage_context.tenant_id.",
        path: ["context", "tenant_id"],
      });
    }

    if (value.context.user_id !== value.usage_context.user_id) {
      context.addIssue({
        code: "custom",
        message: "Context user_id must match usage_context.user_id.",
        path: ["context", "user_id"],
      });
    }

    if (value.request_id !== value.usage_context.request_id) {
      context.addIssue({
        code: "custom",
        message: "request_id must match usage_context.request_id.",
        path: ["request_id"],
      });
    }

    if (
      value.request_classification !==
      value.usage_context.request_classification
    ) {
      context.addIssue({
        code: "custom",
        message:
          "request_classification must match usage_context.request_classification.",
        path: ["request_classification"],
      });
    }
  });

export type GatewayAiAssistantAutomationDownstreamRequest = z.infer<
  typeof gatewayAiAssistantAutomationDownstreamRequestSchema
>;

export function buildGatewayAiAssistantAutomationDownstreamRequest(params: {
  context: GatewayAiAssistantAutomationDownstreamRequest["context"];
  prompt: string;
  requestClassification: string;
  requestId: string;
  signedContext: SignedGatewayAiUsageContext;
}): GatewayAiAssistantAutomationDownstreamRequest {
  const {
    signature,
    signing_mode: _signingMode,
    ...usageContext
  } = params.signedContext;

  return gatewayAiAssistantAutomationDownstreamRequestSchema.parse({
    context: params.context,
    context_boundary_version:
      GATEWAY_AI_ASSISTANT_AUTOMATION_CONTEXT_BOUNDARY_VERSION,
    feature: "ai_assistant",
    prompt: params.prompt,
    request_classification: params.requestClassification,
    request_id: params.requestId,
    runtime_status: GATEWAY_AI_ASSISTANT_AUTOMATION_RUNTIME_STATUS,
    usage_context: usageContext,
    usage_context_signature: signature,
  });
}

export function validateGatewayAiAssistantAutomationDownstreamRequest(
  value: unknown,
): GatewayAiAssistantAutomationDownstreamRequest {
  return gatewayAiAssistantAutomationDownstreamRequestSchema.parse(value);
}
