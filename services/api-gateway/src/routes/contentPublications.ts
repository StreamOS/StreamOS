import { createHash } from "node:crypto";
import express from "express";
import type { Router } from "express";
import { z } from "zod";
import { STREAM_PLATFORMS } from "@streamos/types";
import type {
  ConnectionStatus,
  ContentPublicationFanoutActionKey,
  ContentPublicationManualActionPolicy,
  ContentJobReviewStatus,
  ContentJobStatus,
  ContentPublicationEventType,
  ContentPublicationStatus,
  PublicationProviderFailureCode,
  PublicationReconciliationStatus,
  PublicationRemoteStatus,
  StreamPlatform,
} from "@streamos/types";
import {
  buildCanonicalPublicationDraft,
  buildPublicationFanoutRequestIntentHash,
  buildPublicationFanoutChildRetryActionPolicy,
  buildPublicationFanoutParentRefreshActionPolicy,
  buildPublicationFanoutTargetRecheckActionPolicy,
  buildPublicationManualActionPolicy,
  extractPublicationAccountCapabilityOverlay,
  getPublicationCapabilityDefinition,
  PUBLICATION_CAPABILITY_VERSION,
  isApprovedRepurposingPlanResult,
  type ContentPublicationFanoutBlockReason,
  CONTENT_PUBLICATION_FANOUT_BLOCK_REASONS,
  type ContentPublicationFanoutSnapshot,
  type ContentPublicationFanoutTargetStatus,
  type ContentPublicationFanoutStatus,
  type PublicationFanoutPolicy,
  resolvePublicationCapabilities,
  type PublicationCapabilityResolution,
  type PublicationProviderOverrides,
} from "@streamos/types";
import { PUBLICATION_TARGET_PLATFORMS } from "@streamos/types/jobs";

import {
  callSupabaseRpc,
  createSupabaseRestClient,
  patchSupabaseRows,
  readSupabaseRows,
  upsertSupabaseRow,
  type SupabaseRestClient,
} from "../lib/supabaseRest.js";
import {
  enqueuePublicationExecutionJob,
  getPublicationExecutionJobId,
  enqueuePublicationReconciliationJob,
  type PublicationExecutionQueue,
} from "../jobs/publicationExecutionQueue.js";

const publicationRequestSchema = z.object({
  capability_version: z.string().trim().min(1).optional(),
  content_job_id: z.string().uuid(),
  platform_connection_id: z.string().uuid(),
  provider_overrides: z
    .record(z.string(), z.record(z.string(), z.unknown()))
    .default({}),
  target_platform: z.enum(STREAM_PLATFORMS),
  user_id: z.string().uuid(),
});

const publicationFanoutTargetRequestSchema = z.object({
  platform_connection_id: z.string().uuid(),
  provider_overrides: z.record(z.string(), z.unknown()).default({}),
  target_platform: z.enum(PUBLICATION_TARGET_PLATFORMS),
});

const publicationFanoutRequestSchema = z
  .object({
    capability_version: z.string().trim().min(1).optional(),
    content_job_id: z.string().uuid(),
    fanout_policy: z
      .literal("prepare_valid_targets")
      .default("prepare_valid_targets"),
    targets: z
      .array(publicationFanoutTargetRequestSchema)
      .min(1)
      .max(PUBLICATION_TARGET_PLATFORMS.length),
    user_id: z.string().uuid(),
  })
  .superRefine((input, context) => {
    const targetKeys = new Set<string>();

    for (const [index, target] of input.targets.entries()) {
      const targetKey = `${target.target_platform}:${target.platform_connection_id}`;

      if (targetKeys.has(targetKey)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Targets must be unique per platform connection.",
          path: ["targets", index],
        });
        continue;
      }

      targetKeys.add(targetKey);
    }
  });

const publicationExecutionRequestSchema = z.object({
  user_id: z.string().uuid(),
});

const publicationFanoutActionRequestSchema = z.object({
  user_id: z.string().uuid(),
});

const publicationManualActionRequestSchema = z.object({
  confirm: z.literal(true).optional(),
  user_id: z.string().uuid(),
});

const publicationObservabilityQuerySchema = z.object({
  user_id: z.string().uuid(),
});

const repurposingBundleSchema = z.object({
  captions: z.array(z.string()),
  confidence: z.number(),
  content_job_id: z.string().uuid(),
  descriptions: z.array(z.string()),
  hashtag_sets: z.array(z.array(z.string())),
  hook_ideas: z.array(z.string()),
  manual_review_required: z.literal(true),
  model: z.string().trim().min(1),
  provider: z.string().trim().min(1),
  queue_job_id: z.string().trim().min(1),
  review_notes: z.array(z.string()),
  short_form_plan: z.string().trim().min(1),
  title_suggestions: z.array(z.string()),
  warnings: z.array(z.string()),
});

type PublicationRequestPayload = z.infer<typeof publicationRequestSchema>;
type PublicationFanoutRequestPayload = z.infer<
  typeof publicationFanoutRequestSchema
>;
type PublicationFanoutTargetRequestPayload = z.infer<
  typeof publicationFanoutTargetRequestSchema
>;

type PublicationContentJobRow = {
  id: string;
  job_type: "repurposing";
  queue_job_id: string | null;
  result: Record<string, unknown> | null;
  review_status: ContentJobReviewStatus;
  status: ContentJobStatus;
  type: "repurposing";
  user_id: string;
  stream_id: string | null;
  channel_id: string | null;
};

type PublicationConnectionRow = {
  id: string;
  metadata: Record<string, unknown> | null;
  platform: StreamPlatform;
  provider_profile: Record<string, unknown> | null;
  scopes: string[] | null;
  status: string;
  user_id: string;
};

type PublicationRow = {
  capability_snapshot: Record<string, unknown>;
  capability_version: string;
  content_job_id: string;
  id: string;
  external_post_id: string | null;
  external_url: string | null;
  max_retries: number;
  next_retry_at: string | null;
  platform_connection_id: string;
  publication_status: ContentPublicationStatus;
  published_at: string | null;
  requested_by: string;
  request_intent_hash: string;
  requested_at: string;
  reconciliation_status: PublicationReconciliationStatus;
  reconcile_max_retries: number;
  reconcile_next_retry_at: string | null;
  reconcile_retry_count: number;
  provider_overrides: Record<string, Record<string, unknown>>;
  remote_state: Record<string, unknown> | null;
  retry_count: number;
  snapshot_hash: string;
  snapshot: Record<string, unknown>;
  target_platform: StreamPlatform;
  user_id: string;
  validated_at: string | null;
  validation_code: string | null;
  validation_message: string | null;
};

type PublicationMutationResult = {
  capability_snapshot: Record<string, unknown>;
  capability_status: string;
  capability_version: string;
  capability_warnings: PublicationCapabilityResolution["warnings"];
  content_job_id: string;
  content_publication_id: string;
  platform_connection_id: string;
  publication_status: ContentPublicationStatus;
  request_intent_hash: string;
  provider_overrides: PublicationProviderOverrides;
  snapshot_hash: string;
  status: "publication_validated";
  target_platform: StreamPlatform;
  validated_at: string | null;
};

type PublicationManualActionRequestPayload = z.infer<
  typeof publicationManualActionRequestSchema
>;

type PublicationExecutionMutationResult = {
  content_job_id: string;
  content_publication_id: string;
  external_post_id: string | null;
  external_url: string | null;
  max_retries: number;
  next_retry_at: string | null;
  publication_status: ContentPublicationStatus;
  queue_job_id: string;
  retry_count: number;
  status: "publication_queued";
  target_platform: StreamPlatform;
};

type PublicationFanoutTargetMutationResult = {
  block_message: string | null;
  block_reason: string | null;
  capability_snapshot: Record<string, unknown>;
  capability_version: string;
  content_publication_id: string | null;
  content_publication_status: ContentPublicationStatus | null;
  platform_connection_id: string;
  provider_overrides: Record<string, unknown>;
  request_intent_hash: string;
  target_platform: "tiktok" | "youtube";
  target_status: ContentPublicationFanoutTargetStatus;
  validated_at: string | null;
};

type PublicationFanoutMutationResult = {
  blocked_target_count: number;
  content_job_id: string;
  content_publication_fanout_id: string;
  fanout_policy: PublicationFanoutPolicy;
  fanout_status: ContentPublicationFanoutStatus;
  requested_by: string;
  request_intent_hash: string;
  snapshot_hash: string;
  status:
    | "publication_fanout_blocked"
    | "publication_fanout_partially_validated"
    | "publication_fanout_validated";
  target_count: number;
  targets: PublicationFanoutTargetMutationResult[];
  validated_target_count: number;
  user_id: string;
};

type PublicationFanoutTargetRecheckMutationResult = {
  block_reason: string | null;
  content_publication_fanout_id: string;
  content_publication_fanout_target_id: string;
  content_publication_id: string | null;
  fanout_status: ContentPublicationFanoutStatus;
  last_action_result: string | null;
  status:
    | "publication_fanout_target_recheck_blocked"
    | "publication_fanout_target_rechecked";
  target_status: ContentPublicationFanoutTargetStatus;
  user_id: string;
};

type PublicationFanoutChildRetryMutationResult = {
  block_reason: string | null;
  content_publication_fanout_id: string;
  content_publication_fanout_target_id: string | null;
  content_publication_id: string;
  fanout_status: ContentPublicationFanoutStatus;
  queue_job_id: string | null;
  message: string | null;
  status:
    | "publication_fanout_child_retry_blocked"
    | "publication_fanout_child_retry_queued";
  target_status: ContentPublicationFanoutTargetStatus | null;
  user_id: string;
};

type PublicationFanoutRefreshMutationResult = {
  blocked_target_count: number;
  content_publication_fanout_id: string;
  fanout_status: ContentPublicationFanoutStatus;
  last_aggregate_refreshed_at: string | null;
  status: "publication_fanout_refreshed";
  target_count: number;
  user_id: string;
  validated_target_count: number;
};

type PublicationManualActionResponse = {
  content_job_id: string;
  content_publication_id: string;
  publication_status: ContentPublicationStatus;
  queue_job_id: string | null;
  reconciliation_status: PublicationReconciliationStatus;
  status:
    | "publication_retry_queued"
    | "publication_reconcile_queued"
    | "publication_final_failed";
  target_platform: StreamPlatform;
};

type PublicationManualActionName =
  | "retry"
  | "reconcile-now"
  | "mark-final-failed";

type PublicationReconciliationRow = {
  content_job_id: string;
  external_post_id: string | null;
  publication_status: ContentPublicationStatus;
  reconciliation_status: PublicationReconciliationStatus;
  remote_status: PublicationRemoteStatus | null;
  requested_by: string;
  snapshot_hash: string;
  target_platform: StreamPlatform;
  user_id: string;
  id: string;
  last_reconciled_at: string | null;
  provider_failure_code: PublicationProviderFailureCode | null;
  provider_failure_metadata: Record<string, unknown>;
  provider_failure_reason: string | null;
  remote_processing_status: string | null;
  remote_state: Record<string, unknown>;
  remote_upload_status: string | null;
};

type PublicationObservabilityEventRow = {
  actor_id: string;
  content_publication_id: string;
  created_at: string;
  event_type: ContentPublicationEventType;
  id: string;
  metadata: Record<string, unknown>;
  previous_publication_status: ContentPublicationStatus | null;
  publication_status: ContentPublicationStatus;
  source: string;
  user_id: string;
};

type PublicationObservabilityRow = {
  content_job_id: string;
  desired_visibility: string;
  effective_visibility: string | null;
  external_post_id: string | null;
  external_url: string | null;
  id: string;
  last_reconciled_at: string | null;
  publication_status: ContentPublicationStatus;
  provider_failure_code: PublicationProviderFailureCode | null;
  provider_failure_metadata: Record<string, unknown>;
  provider_failure_reason: string | null;
  reconciliation_status: PublicationReconciliationStatus;
  reconcile_max_retries: number;
  reconcile_next_retry_at: string | null;
  reconcile_retry_count: number;
  remote_processing_status: string | null;
  remote_state: Record<string, unknown>;
  remote_status: PublicationRemoteStatus | null;
  remote_upload_status: string | null;
  snapshot_hash: string;
  target_platform: StreamPlatform;
  updated_at: string;
  user_id: string;
};

type PublicationFanoutRow = {
  blocked_target_count: number;
  content_job_id: string;
  created_at: string;
  last_action_at: string | null;
  last_action_key: ContentPublicationFanoutActionKey | null;
  last_action_result: string | null;
  last_aggregate_refreshed_at: string | null;
  fanout_policy: PublicationFanoutPolicy;
  fanout_status: ContentPublicationFanoutStatus;
  id: string;
  requested_at: string;
  requested_by: string;
  request_intent_hash: string;
  review_status_at_request: ContentJobReviewStatus;
  snapshot: Record<string, unknown>;
  snapshot_hash: string;
  target_count: number;
  updated_at: string;
  user_id: string;
  validated_at: string | null;
  validated_target_count: number;
};

type PublicationFanoutTargetRow = {
  block_message: string | null;
  block_reason: string | null;
  capability_snapshot: Record<string, unknown>;
  capability_version: string;
  content_publication_fanout_id: string;
  content_publication_id: string | null;
  created_at: string;
  last_action_at: string | null;
  last_action_key: ContentPublicationFanoutActionKey | null;
  last_action_result: string | null;
  last_block_reason: string | null;
  last_rechecked_at: string | null;
  id: string;
  platform_connection_id: string;
  provider_overrides: Record<string, unknown>;
  request_intent_hash: string;
  target_platform: PublicationFanoutTargetRequestPayload["target_platform"];
  target_status: ContentPublicationFanoutTargetStatus;
  updated_at: string;
  user_id: string;
  validated_at: string | null;
};

type PublicationFanoutEventRow = {
  action_key: ContentPublicationFanoutActionKey | null;
  action_result:
    | "blocked"
    | "partial"
    | "queued"
    | "rechecked"
    | "refreshed"
    | "validated";
  actor_id: string;
  content_publication_fanout_id: string;
  content_publication_fanout_target_id: string | null;
  content_publication_id: string | null;
  created_at: string;
  event_type:
    | "child_retry_queued"
    | "child_retry_requested"
    | "fanout_blocked"
    | "fanout_requested"
    | "fanout_validated"
    | "manual_action_blocked"
    | "parent_aggregate_refreshed"
    | "target_rechecked";
  fanout_status: ContentPublicationFanoutStatus;
  id: string;
  metadata: Record<string, unknown>;
  previous_fanout_status: ContentPublicationFanoutStatus | null;
  previous_target_status: ContentPublicationFanoutTargetStatus | null;
  source: string;
  target_status: ContentPublicationFanoutTargetStatus | null;
  user_id: string;
};

type PublicationReconciliationMutationResult = {
  content_job_id: string;
  content_publication_id: string;
  last_reconciled_at: string | null;
  queue_job_id: string | null;
  reconciliation_status: PublicationReconciliationStatus;
  remote_status: PublicationRemoteStatus | null;
  status: "publication_reconcile_queued" | "publication_reconcile_skipped";
  target_platform: StreamPlatform;
};

class PublicationCapabilityValidationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly resolution: PublicationCapabilityResolution,
  ) {
    super(message);
    this.name = "PublicationCapabilityValidationError";
  }
}

export function createContentPublicationsRouter({
  fetchImpl = fetch,
  publicationExecutionQueue,
}: {
  fetchImpl?: typeof fetch;
  publicationExecutionQueue?: PublicationExecutionQueue;
} = {}): Router {
  const router = express.Router();

  router.post("/", async (request, response) => {
    const parsedPayload = publicationRequestSchema.safeParse(request.body);

    if (!parsedPayload.success) {
      response.status(400).json({
        error: "invalid_publication_request_payload",
        issues: parsedPayload.error.issues,
      });
      return;
    }

    let supabase: SupabaseRestClient;

    try {
      supabase = createSupabaseRestClient({ fetchImpl });
    } catch (error) {
      response.status(503).json({
        error: "supabase_not_configured",
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    try {
      const publicationRequest = await createPublicationRequest({
        input: parsedPayload.data,
        supabase,
      });

      response.status(200).json({
        capability_snapshot: publicationRequest.publication.capability_snapshot,
        capability_status:
          publicationRequest.capabilityResolution.providerSupportStatus,
        capability_version: publicationRequest.publication.capability_version,
        capability_warnings: publicationRequest.capabilityResolution.warnings,
        content_job_id: publicationRequest.publication.content_job_id,
        content_publication_id: publicationRequest.publication.id,
        platform_connection_id:
          publicationRequest.publication.platform_connection_id,
        publication_status: publicationRequest.publication.publication_status,
        provider_overrides: publicationRequest.publication.provider_overrides,
        request_intent_hash: publicationRequest.publication.request_intent_hash,
        snapshot_hash: publicationRequest.publication.snapshot_hash,
        status: "publication_validated",
        target_platform: publicationRequest.publication.target_platform,
        validated_at: publicationRequest.publication.validated_at,
      } satisfies PublicationMutationResult);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (error instanceof PublicationCapabilityValidationError) {
        const statusCode = getPublicationCapabilityValidationStatus(error.code);

        response.status(statusCode).json({
          capability_snapshot: error.resolution,
          capability_status: error.resolution.providerSupportStatus,
          capability_version: error.resolution.capabilityVersion,
          capability_warnings: error.resolution.warnings,
          error: error.code,
          message,
          unsupported_fields: error.resolution.unsupportedFields,
          warnings: error.resolution.warnings,
        });
        return;
      }

      if (message === "content_job_not_found") {
        response.status(404).json({
          error: "content_job_not_found",
          message: "Approved repurposing job could not be found.",
        });
        return;
      }

      if (message === "publication_not_ready") {
        response.status(409).json({
          error: "publication_not_ready",
          message:
            "The selected repurposing job is not approved and ready for publishing.",
        });
        return;
      }

      if (message === "provider_override_mismatch") {
        response.status(409).json({
          error: "provider_override_mismatch",
          message:
            "Provider overrides must be namespaced to the selected target platform.",
        });
        return;
      }

      if (message === "provider_override_unsupported_field") {
        response.status(400).json({
          error: "provider_override_unsupported_field",
          message:
            "The selected provider override field is not allowed by the capability matrix.",
        });
        return;
      }

      if (message === "unsupported_capability_version") {
        response.status(400).json({
          error: "unsupported_capability_version",
          message:
            "The requested capability version is not supported by the gateway.",
        });
        return;
      }

      if (message === "publishable_bundle_missing") {
        response.status(409).json({
          error: "publishable_bundle_missing",
          message:
            "The approved repurposing result does not contain a publishable bundle.",
        });
        return;
      }

      if (message === "platform_connection_not_found") {
        response.status(404).json({
          error: "platform_connection_not_found",
          message: "No matching platform connection was found.",
        });
        return;
      }

      if (message === "platform_mismatch") {
        response.status(409).json({
          error: "platform_mismatch",
          message:
            "The selected platform connection does not match the target platform.",
        });
        return;
      }

      if (message === "missing_publish_scopes") {
        response.status(409).json({
          error: "missing_publish_scopes",
          message:
            "The selected platform connection is missing publish scopes.",
        });
        return;
      }

      if (message === "unsupported_target_platform") {
        response.status(400).json({
          error: "unsupported_target_platform",
          message: "The requested target platform is not supported.",
        });
        return;
      }

      response.status(502).json({
        error: "publication_request_failed",
        message:
          error instanceof Error
            ? error.message
            : "Publication request could not be validated.",
      });
    }
  });

  router.post("/fanout", async (request, response) => {
    const parsedPayload = publicationFanoutRequestSchema.safeParse(
      request.body,
    );

    if (!parsedPayload.success) {
      response.status(400).json({
        error: "invalid_publication_fanout_request_payload",
        issues: parsedPayload.error.issues,
      });
      return;
    }

    let supabase: SupabaseRestClient;

    try {
      supabase = createSupabaseRestClient({ fetchImpl });
    } catch (error) {
      response.status(503).json({
        error: "supabase_not_configured",
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    try {
      const publicationFanout = await createPublicationFanoutRequest({
        input: parsedPayload.data,
        supabase,
      });

      response
        .status(
          publicationFanout.status === "publication_fanout_blocked" ? 409 : 200,
        )
        .json(publicationFanout satisfies PublicationFanoutMutationResult);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message === "content_job_not_found") {
        response.status(404).json({
          error: "content_job_not_found",
          message: "Approved repurposing job could not be found.",
        });
        return;
      }

      if (message === "publication_not_ready") {
        response.status(409).json({
          error: "publication_not_ready",
          message:
            "The selected repurposing job is not approved and ready for fanout.",
        });
        return;
      }

      if (message === "publishable_bundle_missing") {
        response.status(409).json({
          error: "publishable_bundle_missing",
          message:
            "The approved repurposing result does not contain a publishable bundle.",
        });
        return;
      }

      response.status(502).json({
        error: "publication_fanout_failed",
        message:
          error instanceof Error
            ? error.message
            : "Publication fanout could not be validated.",
      });
    }
  });

  router.post(
    "/fanouts/:fanout_id/targets/:target_id/recheck",
    async (request, response) => {
      const fanoutId = z.string().uuid().safeParse(request.params.fanout_id);
      const targetId = z.string().uuid().safeParse(request.params.target_id);
      const parsedPayload = publicationFanoutActionRequestSchema.safeParse(
        request.body,
      );

      if (!fanoutId.success) {
        response.status(400).json({
          error: "invalid_publication_fanout_id",
          issues: fanoutId.error.issues,
        });
        return;
      }

      if (!targetId.success) {
        response.status(400).json({
          error: "invalid_publication_fanout_target_id",
          issues: targetId.error.issues,
        });
        return;
      }

      if (!parsedPayload.success) {
        response.status(400).json({
          error: "invalid_publication_fanout_action_request_payload",
          issues: parsedPayload.error.issues,
        });
        return;
      }

      let supabase: SupabaseRestClient;

      try {
        supabase = createSupabaseRestClient({ fetchImpl });
      } catch (error) {
        response.status(503).json({
          error: "supabase_not_configured",
          message: error instanceof Error ? error.message : String(error),
        });
        return;
      }

      try {
        const result = await recheckPublicationFanoutTarget({
          fanoutId: fanoutId.data,
          supabase,
          targetId: targetId.data,
          userId: parsedPayload.data.user_id,
        });

        response.status(result.statusCode).json(result.body);
      } catch (error) {
        response.status(502).json({
          error: "publication_fanout_target_recheck_failed",
          message:
            error instanceof Error
              ? error.message
              : "Publication fanout target recheck could not be completed.",
        });
      }
    },
  );

  router.post(
    "/fanouts/:fanout_id/children/:publication_id/retry",
    async (request, response) => {
      const fanoutId = z.string().uuid().safeParse(request.params.fanout_id);
      const publicationId = z
        .string()
        .uuid()
        .safeParse(request.params.publication_id);
      const parsedPayload = publicationFanoutActionRequestSchema.safeParse(
        request.body,
      );

      if (!fanoutId.success) {
        response.status(400).json({
          error: "invalid_publication_fanout_id",
          issues: fanoutId.error.issues,
        });
        return;
      }

      if (!publicationId.success) {
        response.status(400).json({
          error: "invalid_publication_id",
          issues: publicationId.error.issues,
        });
        return;
      }

      if (!parsedPayload.success) {
        response.status(400).json({
          error: "invalid_publication_fanout_action_request_payload",
          issues: parsedPayload.error.issues,
        });
        return;
      }

      let supabase: SupabaseRestClient;

      try {
        supabase = createSupabaseRestClient({ fetchImpl });
      } catch (error) {
        response.status(503).json({
          error: "supabase_not_configured",
          message: error instanceof Error ? error.message : String(error),
        });
        return;
      }

      try {
        const result = await retryPublicationFanoutChild({
          fanoutId: fanoutId.data,
          publicationId: publicationId.data,
          publicationExecutionQueue,
          supabase,
          userId: parsedPayload.data.user_id,
        });

        response.status(result.statusCode).json(result.body);
      } catch (error) {
        response.status(502).json({
          error: "publication_fanout_child_retry_failed",
          message:
            error instanceof Error
              ? error.message
              : "Publication fanout child retry could not be completed.",
        });
      }
    },
  );

  router.post("/fanouts/:fanout_id/refresh", async (request, response) => {
    const fanoutId = z.string().uuid().safeParse(request.params.fanout_id);
    const parsedPayload = publicationFanoutActionRequestSchema.safeParse(
      request.body,
    );

    if (!fanoutId.success) {
      response.status(400).json({
        error: "invalid_publication_fanout_id",
        issues: fanoutId.error.issues,
      });
      return;
    }

    if (!parsedPayload.success) {
      response.status(400).json({
        error: "invalid_publication_fanout_action_request_payload",
        issues: parsedPayload.error.issues,
      });
      return;
    }

    let supabase: SupabaseRestClient;

    try {
      supabase = createSupabaseRestClient({ fetchImpl });
    } catch (error) {
      response.status(503).json({
        error: "supabase_not_configured",
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    try {
      const result = await refreshPublicationFanoutAggregate({
        fanoutId: fanoutId.data,
        supabase,
        userId: parsedPayload.data.user_id,
      });

      if (!result.fanout) {
        response.status(404).json({
          error: "content_publication_fanout_not_found",
          message: "Approved fanout request could not be found.",
        });
        return;
      }

      response.status(200).json({
        blocked_target_count: result.blockedTargetCount,
        content_publication_fanout_id: result.fanout.id,
        fanout_status: result.fanoutStatus,
        last_aggregate_refreshed_at: result.lastAggregateRefreshedAt,
        status: "publication_fanout_refreshed",
        target_count: result.targetCount,
        user_id: result.fanout.user_id,
        validated_target_count: result.validatedTargetCount,
      } satisfies PublicationFanoutRefreshMutationResult);
    } catch (error) {
      response.status(502).json({
        error: "publication_fanout_refresh_failed",
        message:
          error instanceof Error
            ? error.message
            : "Publication fanout aggregate could not be refreshed.",
      });
    }
  });

  router.post("/:publication_id/publish", async (request, response) => {
    const publicationId = z
      .string()
      .uuid()
      .safeParse(request.params.publication_id);
    const parsedPayload = publicationExecutionRequestSchema.safeParse(
      request.body,
    );

    if (!publicationId.success) {
      response.status(400).json({
        error: "invalid_publication_id",
        issues: publicationId.error.issues,
      });
      return;
    }

    if (!parsedPayload.success) {
      response.status(400).json({
        error: "invalid_publication_execution_request_payload",
        issues: parsedPayload.error.issues,
      });
      return;
    }

    if (!publicationExecutionQueue) {
      response.status(503).json({
        error: "publication_execution_queue_unavailable",
        message:
          "REDIS_URL is required before publication-execution jobs can be queued.",
      });
      return;
    }

    let supabase: SupabaseRestClient;

    try {
      supabase = createSupabaseRestClient({ fetchImpl });
    } catch (error) {
      response.status(503).json({
        error: "supabase_not_configured",
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    try {
      const publication = await loadPublicationById({
        publicationId: publicationId.data,
        supabase,
        userId: parsedPayload.data.user_id,
      });

      if (!publication) {
        response.status(404).json({
          error: "content_publication_not_found",
          message: "Approved publication request could not be found.",
        });
        return;
      }

      if (
        publication.target_platform !== "youtube" &&
        publication.target_platform !== "tiktok"
      ) {
        response.status(400).json({
          error: "unsupported_target_platform",
          message:
            "Publishing execution is currently available for YouTube and TikTok only.",
        });
        return;
      }

      if (
        publication.publication_status === "published" ||
        publication.publication_status === "publishing" ||
        publication.publication_status === "queued"
      ) {
        response.status(200).json({
          content_job_id: publication.content_job_id,
          content_publication_id: publication.id,
          external_post_id: publication.external_post_id,
          external_url: publication.external_url,
          max_retries: publication.max_retries,
          next_retry_at: publication.next_retry_at,
          publication_status: publication.publication_status,
          queue_job_id: getPublicationExecutionJobId(publication.id),
          retry_count: publication.retry_count,
          status: "publication_queued",
          target_platform: publication.target_platform,
        } satisfies PublicationExecutionMutationResult);
        return;
      }

      if (
        publication.publication_status !== "validated" &&
        publication.publication_status !== "failed_retryable"
      ) {
        response.status(409).json({
          error: "publication_not_ready",
          message:
            "The selected publication request is not ready for execution.",
        });
        return;
      }

      const contentJob = await loadRepurposingContentJob({
        contentJobId: publication.content_job_id,
        supabase,
        userId: publication.user_id,
      });

      if (!contentJob) {
        response.status(404).json({
          error: "content_job_not_found",
          message: "Approved repurposing job could not be found.",
        });
        return;
      }

      if (
        contentJob.job_type !== "repurposing" ||
        contentJob.type !== "repurposing" ||
        contentJob.review_status !== "approved" ||
        !["done", "completed"].includes(contentJob.status)
      ) {
        response.status(409).json({
          error: "publication_not_ready",
          message:
            "The selected repurposing job is not approved and ready for publishing.",
        });
        return;
      }

      const approvedBundle = repurposingBundleSchema.safeParse(
        contentJob.result ?? {},
      );

      if (
        !approvedBundle.success ||
        approvedBundle.data.content_job_id !== contentJob.id
      ) {
        response.status(409).json({
          error: "publishable_bundle_missing",
          message:
            "The approved repurposing result does not contain a publishable bundle.",
        });
        return;
      }

      const connection = await loadPlatformConnection({
        platformConnectionId: publication.platform_connection_id,
        supabase,
        userId: publication.user_id,
      });

      if (!connection) {
        response.status(404).json({
          error: "platform_connection_not_found",
          message: "No matching platform connection was found.",
        });
        return;
      }

      if (connection.platform !== publication.target_platform) {
        response.status(409).json({
          error: "platform_mismatch",
          message:
            "The selected platform connection does not match the target platform.",
        });
        return;
      }

      if (connection.status !== "connected") {
        response.status(409).json({
          error: "publication_not_ready",
          message:
            "The selected platform connection is not connected for publishing.",
        });
        return;
      }

      const requiredScopes = getPublicationCapabilityDefinition(
        publication.target_platform,
      ).requiredScopes;
      const connectionScopes = connection.scopes ?? [];

      if (
        requiredScopes.length > 0 &&
        !requiredScopes.every((scope) => connectionScopes.includes(scope))
      ) {
        response.status(409).json({
          error: "missing_publish_scopes",
          message:
            "The selected platform connection is missing publish scopes.",
        });
        return;
      }

      const vodAsset = await loadVodAsset({
        supabase,
        streamId: contentJob.stream_id,
        userId: publication.user_id,
      });

      if (!vodAsset) {
        response.status(409).json({
          error: "publishable_asset_missing",
          message: "The approved publication request has no publishable asset.",
        });
        return;
      }

      const queuedJob = await enqueuePublicationExecutionJob(
        publicationExecutionQueue,
        {
          content_publication_id: publication.id,
          target_platform: publication.target_platform,
          user_id: publication.user_id,
        },
      );

      const now = new Date().toISOString();
      await patchSupabaseRows({
        client: supabase,
        params: {
          id: `eq.${publication.id}`,
          user_id: `eq.${publication.user_id}`,
        },
        payload: {
          max_retries: 5,
          next_retry_at: null,
          publication_status: "queued",
          retry_count: publication.retry_count,
          updated_at: now,
        },
        table: "content_publications",
      });

      await writePublicationEvent({
        actorId: publication.requested_by,
        eventType: "queued",
        metadata: {
          content_job_id: publication.content_job_id,
          queue_job_id: queuedJob.queueJobId,
          request_intent_hash: publication.request_intent_hash,
          snapshot_hash: publication.snapshot_hash,
          target_platform: publication.target_platform,
          publishable_asset_present: Boolean(vodAsset.source_url),
        },
        publicationId: publication.id,
        publicationStatus: "queued",
        source: "api-gateway",
        supabase,
        userId: publication.user_id,
        previousPublicationStatus: publication.publication_status,
      });

      response.status(200).json({
        content_job_id: publication.content_job_id,
        content_publication_id: publication.id,
        external_post_id: publication.external_post_id,
        external_url: publication.external_url,
        max_retries: 5,
        next_retry_at: null,
        publication_status: "queued",
        queue_job_id: queuedJob.queueJobId,
        retry_count: publication.retry_count,
        status: "publication_queued",
        target_platform: publication.target_platform,
      } satisfies PublicationExecutionMutationResult);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      response.status(502).json({
        error: "publication_execution_failed",
        message,
      });
    }
  });

  router.post("/:publication_id/retry", async (request, response) => {
    const publicationId = z
      .string()
      .uuid()
      .safeParse(request.params.publication_id);
    const parsedPayload = publicationManualActionRequestSchema.safeParse(
      request.body,
    );

    if (!publicationId.success) {
      response.status(400).json({
        error: "invalid_publication_id",
        issues: publicationId.error.issues,
      });
      return;
    }

    if (!parsedPayload.success) {
      response.status(400).json({
        error: "invalid_publication_manual_action_request_payload",
        issues: parsedPayload.error.issues,
      });
      return;
    }

    let supabase: SupabaseRestClient;

    try {
      supabase = createSupabaseRestClient({ fetchImpl });
    } catch (error) {
      response.status(503).json({
        error: "supabase_not_configured",
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    try {
      const result = await executePublicationManualAction({
        action: "retry",
        publicationExecutionQueue,
        publicationId: publicationId.data,
        requestPayload: parsedPayload.data,
        supabase,
      });

      response.status(result.statusCode).json(result.body);
    } catch (error) {
      response.status(502).json({
        error: "publication_manual_action_failed",
        message:
          error instanceof Error
            ? error.message
            : "Publication manual action could not be completed.",
      });
    }
  });

  router.post("/:publication_id/reconcile-now", async (request, response) => {
    const publicationId = z
      .string()
      .uuid()
      .safeParse(request.params.publication_id);
    const parsedPayload = publicationManualActionRequestSchema.safeParse(
      request.body,
    );

    if (!publicationId.success) {
      response.status(400).json({
        error: "invalid_publication_id",
        issues: publicationId.error.issues,
      });
      return;
    }

    if (!parsedPayload.success) {
      response.status(400).json({
        error: "invalid_publication_manual_action_request_payload",
        issues: parsedPayload.error.issues,
      });
      return;
    }

    let supabase: SupabaseRestClient;

    try {
      supabase = createSupabaseRestClient({ fetchImpl });
    } catch (error) {
      response.status(503).json({
        error: "supabase_not_configured",
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    try {
      const result = await executePublicationManualAction({
        action: "reconcile-now",
        publicationExecutionQueue,
        publicationId: publicationId.data,
        requestPayload: parsedPayload.data,
        supabase,
      });

      response.status(result.statusCode).json(result.body);
    } catch (error) {
      response.status(502).json({
        error: "publication_manual_action_failed",
        message:
          error instanceof Error
            ? error.message
            : "Publication manual action could not be completed.",
      });
    }
  });

  router.post(
    "/:publication_id/mark-final-failed",
    async (request, response) => {
      const publicationId = z
        .string()
        .uuid()
        .safeParse(request.params.publication_id);
      const parsedPayload = publicationManualActionRequestSchema.safeParse(
        request.body,
      );

      if (!publicationId.success) {
        response.status(400).json({
          error: "invalid_publication_id",
          issues: publicationId.error.issues,
        });
        return;
      }

      if (!parsedPayload.success) {
        response.status(400).json({
          error: "invalid_publication_manual_action_request_payload",
          issues: parsedPayload.error.issues,
        });
        return;
      }

      let supabase: SupabaseRestClient;

      try {
        supabase = createSupabaseRestClient({ fetchImpl });
      } catch (error) {
        response.status(503).json({
          error: "supabase_not_configured",
          message: error instanceof Error ? error.message : String(error),
        });
        return;
      }

      try {
        const result = await executePublicationManualAction({
          action: "mark-final-failed",
          publicationExecutionQueue,
          publicationId: publicationId.data,
          requestPayload: parsedPayload.data,
          supabase,
        });

        response.status(result.statusCode).json(result.body);
      } catch (error) {
        response.status(502).json({
          error: "publication_manual_action_failed",
          message:
            error instanceof Error
              ? error.message
              : "Publication manual action could not be completed.",
        });
      }
    },
  );

  router.get("/:publication_id/observability", async (request, response) => {
    const publicationId = z
      .string()
      .uuid()
      .safeParse(request.params.publication_id);
    const parsedQuery = publicationObservabilityQuerySchema.safeParse(
      request.query,
    );

    if (!publicationId.success) {
      response.status(400).json({
        error: "invalid_publication_id",
        issues: publicationId.error.issues,
      });
      return;
    }

    if (!parsedQuery.success) {
      response.status(400).json({
        error: "invalid_publication_observability_query",
        issues: parsedQuery.error.issues,
      });
      return;
    }

    let supabase: SupabaseRestClient;

    try {
      supabase = createSupabaseRestClient({ fetchImpl });
    } catch (error) {
      response.status(503).json({
        error: "supabase_not_configured",
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    try {
      const observability = await loadPublicationObservability({
        publicationId: publicationId.data,
        supabase,
        userId: parsedQuery.data.user_id,
      });

      if (!observability) {
        response.status(404).json({
          error: "content_publication_not_found",
          message: "Approved publication request could not be found.",
        });
        return;
      }

      response.status(200).json({
        content_job_id: observability.publication.content_job_id,
        content_publication_id: observability.publication.id,
        events: observability.events,
        last_reconciled_at: observability.publication.last_reconciled_at,
        publication_status: observability.publication.publication_status,
        provider_failure_code: observability.publication.provider_failure_code,
        provider_failure_metadata:
          observability.publication.provider_failure_metadata,
        provider_failure_reason:
          observability.publication.provider_failure_reason,
        reconciliation_status: observability.publication.reconciliation_status,
        remote_processing_status:
          observability.publication.remote_processing_status,
        remote_state: observability.publication.remote_state,
        remote_status: observability.publication.remote_status,
        remote_upload_status: observability.publication.remote_upload_status,
        snapshot_hash: observability.publication.snapshot_hash,
        status: "publication_observability_ready",
        target_platform: observability.publication.target_platform,
        updated_at: observability.publication.updated_at,
        user_id: observability.publication.user_id,
      });
    } catch (error) {
      response.status(502).json({
        error: "publication_observability_failed",
        message:
          error instanceof Error
            ? error.message
            : "Publication observability could not be loaded.",
      });
    }
  });

  router.post("/:publication_id/reconcile", async (request, response) => {
    const publicationId = z
      .string()
      .uuid()
      .safeParse(request.params.publication_id);
    const parsedPayload = publicationExecutionRequestSchema.safeParse(
      request.body,
    );

    if (!publicationId.success) {
      response.status(400).json({
        error: "invalid_publication_id",
        issues: publicationId.error.issues,
      });
      return;
    }

    if (!parsedPayload.success) {
      response.status(400).json({
        error: "invalid_publication_reconciliation_request_payload",
        issues: parsedPayload.error.issues,
      });
      return;
    }

    if (!publicationExecutionQueue) {
      response.status(503).json({
        error: "publication_execution_queue_unavailable",
        message:
          "REDIS_URL is required before publication-reconciliation jobs can be queued.",
      });
      return;
    }

    let supabase: SupabaseRestClient;

    try {
      supabase = createSupabaseRestClient({ fetchImpl });
    } catch (error) {
      response.status(503).json({
        error: "supabase_not_configured",
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    try {
      const publication = await loadPublicationForReconciliation({
        publicationId: publicationId.data,
        supabase,
        userId: parsedPayload.data.user_id,
      });

      if (!publication) {
        response.status(404).json({
          error: "content_publication_not_found",
          message: "Approved publication request could not be found.",
        });
        return;
      }

      if (
        publication.target_platform !== "youtube" &&
        publication.target_platform !== "tiktok"
      ) {
        response.status(400).json({
          error: "unsupported_target_platform",
          message:
            "Publication reconciliation is currently available for YouTube and TikTok only.",
        });
        return;
      }

      const remotePublishId = getPublicationRemotePublishId(
        publication.remote_state,
      );

      if (!remotePublishId) {
        const now = new Date().toISOString();
        await patchSupabaseRows({
          client: supabase,
          params: {
            id: `eq.${publication.id}`,
            user_id: `eq.${publication.user_id}`,
          },
          payload: {
            effective_visibility: null,
            last_reconciled_at: now,
            provider_failure_code: "missing_remote_post_id",
            provider_failure_metadata: {
              reason: "Publication has no remote post id yet.",
            },
            provider_failure_reason: "Publication has no remote post id yet.",
            reconciliation_status: "skipped",
            reconcile_max_retries: 0,
            reconcile_next_retry_at: null,
            reconcile_retry_count: 0,
            remote_processing_status: null,
            remote_state: {},
            remote_status: "missing",
            remote_upload_status: null,
            updated_at: now,
          },
          table: "content_publications",
        });

        await writePublicationEvent({
          actorId: publication.requested_by,
          eventType: "reconcile_skipped",
          metadata: {
            content_job_id: publication.content_job_id,
            reason: "missing_remote_post_id",
            target_platform: publication.target_platform,
          },
          previousPublicationStatus: publication.publication_status,
          publicationId: publication.id,
          publicationStatus: publication.publication_status,
          source: "api-gateway",
          supabase,
          userId: publication.user_id,
        });

        response.status(200).json({
          content_job_id: publication.content_job_id,
          content_publication_id: publication.id,
          last_reconciled_at: now,
          queue_job_id: null,
          reconciliation_status: "skipped",
          remote_status: "missing",
          status: "publication_reconcile_skipped",
          target_platform: publication.target_platform,
        } satisfies PublicationReconciliationMutationResult);
        return;
      }

      const queuedJob = await enqueuePublicationReconciliationJob(
        publicationExecutionQueue,
        {
          content_publication_id: publication.id,
          target_platform: publication.target_platform,
          user_id: publication.user_id,
        },
      );

      const now = new Date().toISOString();

      await patchSupabaseRows({
        client: supabase,
        params: {
          id: `eq.${publication.id}`,
          user_id: `eq.${publication.user_id}`,
        },
        payload: {
          last_reconciled_at: null,
          provider_failure_code: null,
          provider_failure_metadata: {},
          provider_failure_reason: null,
          reconciliation_status: "queued",
          reconcile_max_retries: 3,
          reconcile_next_retry_at: null,
          reconcile_retry_count: 0,
          updated_at: now,
        },
        table: "content_publications",
      });

      await writePublicationEvent({
        actorId: publication.requested_by,
        eventType: "reconcile_requested",
        metadata: {
          content_job_id: publication.content_job_id,
          external_post_id: publication.external_post_id,
          remote_publish_id: remotePublishId,
          queue_job_id: queuedJob.queueJobId,
          snapshot_hash: publication.snapshot_hash,
          target_platform: publication.target_platform,
        },
        previousPublicationStatus: publication.publication_status,
        publicationId: publication.id,
        publicationStatus: publication.publication_status,
        source: "api-gateway",
        supabase,
        userId: publication.user_id,
      });

      response.status(200).json({
        content_job_id: publication.content_job_id,
        content_publication_id: publication.id,
        last_reconciled_at: null,
        queue_job_id: queuedJob.queueJobId,
        reconciliation_status: "queued",
        remote_status: publication.remote_status ?? "unknown",
        status: "publication_reconcile_queued",
        target_platform: publication.target_platform,
      } satisfies PublicationReconciliationMutationResult);
    } catch (error) {
      response.status(502).json({
        error: "publication_reconciliation_failed",
        message:
          error instanceof Error
            ? error.message
            : "Publication reconciliation could not be queued.",
      });
    }
  });

  return router;
}

async function createPublicationRequest({
  input,
  supabase,
}: {
  input: PublicationRequestPayload;
  supabase: SupabaseRestClient;
}): Promise<{
  capabilityResolution: PublicationCapabilityResolution;
  publication: PublicationRow;
}> {
  const contentJob = await loadRepurposingContentJob({
    contentJobId: input.content_job_id,
    supabase,
    userId: input.user_id,
  });

  if (!contentJob) {
    throw new Error("content_job_not_found");
  }

  const approvedBundle = repurposingBundleSchema.safeParse(
    contentJob.result ?? {},
  );

  if (
    contentJob.job_type !== "repurposing" ||
    contentJob.type !== "repurposing" ||
    contentJob.review_status !== "approved" ||
    !["done", "completed"].includes(contentJob.status) ||
    !approvedBundle.success
  ) {
    throw new Error("publication_not_ready");
  }

  if (approvedBundle.data.content_job_id !== contentJob.id) {
    throw new Error("publishable_bundle_missing");
  }

  const connection = await loadPlatformConnection({
    platformConnectionId: input.platform_connection_id,
    supabase,
    userId: input.user_id,
  });

  if (!connection) {
    throw new Error("platform_connection_not_found");
  }

  if (connection.platform !== input.target_platform) {
    throw new Error("platform_mismatch");
  }

  if (connection.status !== "connected") {
    throw new Error("publication_not_ready");
  }

  const canonicalDraft = buildCanonicalPublicationDraft({
    approvedBundle: approvedBundle.data,
    contentJob: {
      id: contentJob.id,
      queueJobId: contentJob.queue_job_id,
      streamId: contentJob.stream_id,
    },
    targetPlatform: input.target_platform,
  });
  const capabilityVersion =
    input.capability_version?.trim() || PUBLICATION_CAPABILITY_VERSION;
  const providerOverrides = input.provider_overrides;
  const capabilityResolution = resolvePublicationCapabilities({
    accountCapabilities: extractPublicationAccountCapabilityOverlay(connection),
    capabilityVersion,
    canonicalDraft,
    policy: {
      allowedTargets: ["youtube", "tiktok"],
      forbidAutoPublish: true,
      requireManualReview: true,
    },
    providerOverrides,
    targetPlatform: input.target_platform,
  });

  if (capabilityResolution.providerSupportStatus === "unsupported") {
    throw new PublicationCapabilityValidationError(
      "Publishing to the selected target platform is unsupported.",
      "unsupported_target_platform",
      capabilityResolution,
    );
  }

  if (capabilityResolution.blockingErrors.length > 0) {
    const firstBlockingError = capabilityResolution.blockingErrors[0];

    if (!firstBlockingError) {
      throw new Error("publication_not_ready");
    }

    throw new PublicationCapabilityValidationError(
      firstBlockingError.message,
      firstBlockingError.code,
      capabilityResolution,
    );
  }

  const connectionScopes = connection.scopes ?? [];
  const requiredScopes = getPublicationCapabilityDefinition(
    input.target_platform,
  ).requiredScopes;

  if (
    requiredScopes.length > 0 &&
    !requiredScopes.every((scope) => connectionScopes.includes(scope))
  ) {
    throw new Error("missing_publish_scopes");
  }

  const snapshot = buildPublicationSnapshot({
    approvedBundle: approvedBundle.data,
    contentJob,
    connection,
    capabilityResolution,
    capabilityVersion: capabilityResolution.capabilityVersion,
    providerOverrides,
    targetPlatform: input.target_platform,
  });
  const snapshotHash = createHash("sha256")
    .update(JSON.stringify(snapshot), "utf8")
    .digest("hex");
  const requestIntentHash = createHash("sha256")
    .update(
      [
        input.user_id,
        contentJob.id,
        connection.id,
        input.target_platform,
        snapshotHash,
      ].join("|"),
      "utf8",
    )
    .digest("hex");

  const existingPublication = await loadExistingPublication({
    requestIntentHash,
    supabase,
    userId: input.user_id,
  });

  if (existingPublication) {
    return {
      capabilityResolution,
      publication: existingPublication,
    };
  }

  const publication = await callSupabaseRpc<PublicationRow>({
    args: {
      p_capability_snapshot: snapshot,
      p_capability_version: capabilityResolution.capabilityVersion,
      p_content_job_id: contentJob.id,
      p_platform_connection_id: connection.id,
      p_requested_by: input.user_id,
      p_requested_at: new Date().toISOString(),
      p_request_intent_hash: requestIntentHash,
      p_provider_overrides: providerOverrides,
      p_snapshot: snapshot,
      p_snapshot_hash: snapshotHash,
      p_target_platform: input.target_platform,
      p_user_id: input.user_id,
      p_validation_code: "validated",
      p_validation_message: "Publish request validated by the gateway.",
      p_validation_metadata: {
        approved_review_status: contentJob.review_status,
        content_job_status: contentJob.status,
        connection_scope_count: connectionScopes.length,
        manual_review_required: approvedBundle.data.manual_review_required,
        target_platform: input.target_platform,
      },
    },
    client: supabase,
    functionName: "record_content_publication_request",
  });

  return {
    capabilityResolution,
    publication,
  };
}

async function createPublicationFanoutRequest({
  input,
  supabase,
}: {
  input: PublicationFanoutRequestPayload;
  supabase: SupabaseRestClient;
}): Promise<PublicationFanoutMutationResult> {
  const contentJob = await loadRepurposingContentJob({
    contentJobId: input.content_job_id,
    supabase,
    userId: input.user_id,
  });

  if (!contentJob) {
    throw new Error("content_job_not_found");
  }

  const approvedBundle = repurposingBundleSchema.safeParse(
    contentJob.result ?? {},
  );

  if (
    contentJob.job_type !== "repurposing" ||
    contentJob.type !== "repurposing" ||
    contentJob.review_status !== "approved" ||
    !["done", "completed"].includes(contentJob.status)
  ) {
    throw new Error("publication_not_ready");
  }

  if (
    !approvedBundle.success ||
    approvedBundle.data.content_job_id !== contentJob.id
  ) {
    throw new Error("publishable_bundle_missing");
  }

  const fanoutPolicy = input.fanout_policy;
  const capabilityVersion =
    input.capability_version?.trim() || PUBLICATION_CAPABILITY_VERSION;
  const requestedTargets = sortPublicationFanoutTargets(input.targets);
  const requestIntentHash = buildPublicationFanoutRequestIntentHash({
    capabilityVersion,
    contentJobId: contentJob.id,
    fanoutPolicy,
    requestedBy: input.user_id,
    targets: requestedTargets.map((target) => ({
      platformConnectionId: target.platform_connection_id,
      providerOverrides: target.provider_overrides,
      targetPlatform: target.target_platform,
    })),
    userId: input.user_id,
  });

  const targetResults: PublicationFanoutTargetMutationResult[] = [];

  for (const target of requestedTargets) {
    const targetRequestIntentHash = createHash("sha256")
      .update(
        [
          requestIntentHash,
          target.target_platform,
          target.platform_connection_id,
        ].join("|"),
        "utf8",
      )
      .digest("hex");

    try {
      const publicationRequest = await createPublicationRequest({
        input: {
          capability_version: capabilityVersion,
          content_job_id: input.content_job_id,
          platform_connection_id: target.platform_connection_id,
          provider_overrides: {
            [target.target_platform]: target.provider_overrides,
          },
          target_platform: target.target_platform,
          user_id: input.user_id,
        },
        supabase,
      });

      targetResults.push({
        block_message: null,
        block_reason: null,
        capability_snapshot: publicationRequest.publication.capability_snapshot,
        capability_version: publicationRequest.publication.capability_version,
        content_publication_id: publicationRequest.publication.id,
        content_publication_status:
          publicationRequest.publication.publication_status,
        platform_connection_id: target.platform_connection_id,
        provider_overrides: target.provider_overrides,
        request_intent_hash: targetRequestIntentHash,
        target_platform: target.target_platform,
        target_status: "validated",
        validated_at: publicationRequest.publication.validated_at,
      });
    } catch (error) {
      const block = getPublicationFanoutTargetBlock(error);

      if (!block) {
        throw error;
      }

      targetResults.push({
        block_message: block.message,
        block_reason: block.reason,
        capability_snapshot: {},
        capability_version: capabilityVersion,
        content_publication_id: null,
        content_publication_status: null,
        platform_connection_id: target.platform_connection_id,
        provider_overrides: target.provider_overrides,
        request_intent_hash: targetRequestIntentHash,
        target_platform: target.target_platform,
        target_status: "blocked",
        validated_at: null,
      });
    }
  }

  const validatedTargetCount = targetResults.filter(
    (target) => target.target_status === "validated",
  ).length;
  const blockedTargetCount = targetResults.length - validatedTargetCount;
  const fanoutStatus: ContentPublicationFanoutStatus =
    blockedTargetCount === 0
      ? "validated"
      : validatedTargetCount === 0
        ? "blocked"
        : "partially_validated";
  const fanoutSnapshot: ContentPublicationFanoutSnapshot = {
    approvedBundle: approvedBundle.data,
    contentJob: {
      id: contentJob.id,
      queueJobId: contentJob.queue_job_id,
      reviewStatus: contentJob.review_status,
      status: contentJob.status,
      streamId: contentJob.stream_id,
    },
    capabilityVersion,
    fanoutPolicy,
    requestedTargets: requestedTargets.map((target) => ({
      platformConnectionId: target.platform_connection_id,
      providerOverrides: target.provider_overrides,
      targetPlatform: target.target_platform,
    })),
  };
  const snapshotHash = createHash("sha256")
    .update(JSON.stringify(fanoutSnapshot), "utf8")
    .digest("hex");
  const requestedAt = new Date().toISOString();

  const fanout = await upsertSupabaseRow<PublicationFanoutRow>({
    client: supabase,
    onConflict: "user_id,request_intent_hash",
    payload: {
      blocked_target_count: blockedTargetCount,
      content_job_id: contentJob.id,
      fanout_policy: fanoutPolicy,
      fanout_status: fanoutStatus,
      requested_at: requestedAt,
      requested_by: input.user_id,
      request_intent_hash: requestIntentHash,
      review_status_at_request: contentJob.review_status,
      snapshot: fanoutSnapshot,
      snapshot_hash: snapshotHash,
      target_count: requestedTargets.length,
      user_id: input.user_id,
      validated_at: requestedAt,
      validated_target_count: validatedTargetCount,
    },
    returnRepresentation: true,
    table: "content_publication_fanouts",
  });

  if (!fanout) {
    throw new Error("publication_fanout_request_failed");
  }

  for (const target of targetResults) {
    await upsertSupabaseRow<PublicationFanoutTargetRow>({
      client: supabase,
      onConflict: "user_id,request_intent_hash",
      payload: {
        block_message: target.block_message,
        block_reason: target.block_reason,
        capability_snapshot: target.capability_snapshot,
        capability_version: target.capability_version,
        content_publication_fanout_id: fanout.id,
        content_publication_id: target.content_publication_id,
        platform_connection_id: target.platform_connection_id,
        provider_overrides: target.provider_overrides,
        request_intent_hash: target.request_intent_hash,
        target_platform: target.target_platform,
        target_status: target.target_status,
        user_id: input.user_id,
        validated_at: target.validated_at,
      },
      returnRepresentation: true,
      table: "content_publication_fanout_targets",
    });
  }

  await writePublicationFanoutEvent({
    actionKey: null,
    actionResult:
      fanoutStatus === "blocked"
        ? "blocked"
        : fanoutStatus === "validated"
          ? "validated"
          : "partial",
    actorId: input.user_id,
    contentPublicationFanoutId: fanout.id,
    eventType:
      fanoutStatus === "blocked"
        ? "fanout_blocked"
        : fanoutStatus === "validated"
          ? "fanout_validated"
          : "fanout_requested",
    fanoutStatus,
    metadata: {
      blocked_target_count: blockedTargetCount,
      capability_version: capabilityVersion,
      content_job_id: contentJob.id,
      fanout_policy: fanoutPolicy,
      request_intent_hash: requestIntentHash,
      snapshot_hash: snapshotHash,
      target_count: requestedTargets.length,
      validated_target_count: validatedTargetCount,
    },
    previousFanoutStatus: null,
    source: "api-gateway",
    supabase,
    targetStatus: null,
    userId: input.user_id,
  });

  return {
    blocked_target_count: blockedTargetCount,
    content_job_id: contentJob.id,
    content_publication_fanout_id: fanout.id,
    fanout_policy: fanout.fanout_policy,
    fanout_status: fanoutStatus,
    requested_by: input.user_id,
    request_intent_hash: requestIntentHash,
    snapshot_hash: snapshotHash,
    status:
      fanoutStatus === "blocked"
        ? "publication_fanout_blocked"
        : fanoutStatus === "partially_validated"
          ? "publication_fanout_partially_validated"
          : "publication_fanout_validated",
    target_count: requestedTargets.length,
    targets: targetResults,
    validated_target_count: validatedTargetCount,
    user_id: input.user_id,
  };
}

function sortPublicationFanoutTargets(
  targets: PublicationFanoutTargetRequestPayload[],
): PublicationFanoutTargetRequestPayload[] {
  return [...targets].sort((left, right) => {
    if (left.target_platform !== right.target_platform) {
      return left.target_platform.localeCompare(right.target_platform);
    }

    return left.platform_connection_id.localeCompare(
      right.platform_connection_id,
    );
  });
}

function getPublicationFanoutTargetBlock(
  error: unknown,
): { message: string; reason: ContentPublicationFanoutBlockReason } | null {
  if (error instanceof PublicationCapabilityValidationError) {
    if (isPublicationFanoutBlockReason(error.code)) {
      return {
        message: error.message,
        reason: error.code,
      };
    }

    return {
      message: error.message,
      reason: "fanout_not_ready",
    };
  }

  if (error instanceof Error) {
    switch (error.message) {
      case "content_job_not_found":
      case "publication_not_ready":
      case "publishable_bundle_missing":
      case "platform_connection_not_found":
      case "platform_mismatch":
      case "missing_publish_scopes":
      case "fanout_not_ready":
        return {
          message: error.message,
          reason: error.message,
        };
      default:
        return null;
    }
  }

  return null;
}

function isPublicationFanoutBlockReason(
  value: string,
): value is ContentPublicationFanoutBlockReason {
  return CONTENT_PUBLICATION_FANOUT_BLOCK_REASONS.includes(
    value as ContentPublicationFanoutBlockReason,
  );
}

async function loadRepurposingContentJob({
  contentJobId,
  supabase,
  userId,
}: {
  contentJobId: string;
  supabase: SupabaseRestClient;
  userId: string;
}): Promise<PublicationContentJobRow | null> {
  const rows = await readSupabaseRows<PublicationContentJobRow>({
    client: supabase,
    params: {
      id: `eq.${contentJobId}`,
      job_type: "eq.repurposing",
      select:
        "id,job_type,queue_job_id,result,review_status,status,type,user_id,stream_id,channel_id",
      type: "eq.repurposing",
      user_id: `eq.${userId}`,
    },
    table: "content_jobs",
  });

  return rows[0] ?? null;
}

async function loadPlatformConnection({
  platformConnectionId,
  supabase,
  userId,
}: {
  platformConnectionId: string;
  supabase: SupabaseRestClient;
  userId: string;
}): Promise<PublicationConnectionRow | null> {
  const rows = await readSupabaseRows<PublicationConnectionRow>({
    client: supabase,
    params: {
      id: `eq.${platformConnectionId}`,
      select: "id,metadata,platform,provider_profile,scopes,status,user_id",
      user_id: `eq.${userId}`,
    },
    table: "platform_connections",
  });

  return rows[0] ?? null;
}

async function loadExistingPublication({
  requestIntentHash,
  supabase,
  userId,
}: {
  requestIntentHash: string;
  supabase: SupabaseRestClient;
  userId: string;
}): Promise<PublicationRow | null> {
  const rows = await readSupabaseRows<PublicationRow>({
    client: supabase,
    params: {
      request_intent_hash: `eq.${requestIntentHash}`,
      select:
        "capability_snapshot,capability_version,content_job_id,id,platform_connection_id,publication_status,provider_overrides,request_intent_hash,requested_at,snapshot,snapshot_hash,target_platform,user_id,validated_at,validation_code,validation_message",
      user_id: `eq.${userId}`,
    },
    table: "content_publications",
  });

  return rows[0] ?? null;
}

async function loadPublicationById({
  publicationId,
  supabase,
  userId,
}: {
  publicationId: string;
  supabase: SupabaseRestClient;
  userId: string;
}): Promise<PublicationRow | null> {
  const rows = await readSupabaseRows<PublicationRow>({
    client: supabase,
    params: {
      id: `eq.${publicationId}`,
      select:
        "capability_snapshot,capability_version,content_job_id,external_post_id,external_url,id,last_reconciled_at,max_retries,next_retry_at,platform_connection_id,publication_status,published_at,provider_failure_code,provider_failure_metadata,provider_failure_reason,provider_overrides,reconciliation_status,reconcile_max_retries,reconcile_next_retry_at,reconcile_retry_count,requested_by,request_intent_hash,requested_at,retry_count,remote_processing_status,remote_state,remote_status,remote_upload_status,snapshot,snapshot_hash,target_platform,user_id,validated_at,validation_code,validation_message",
      user_id: `eq.${userId}`,
    },
    table: "content_publications",
  });

  return rows[0] ?? null;
}

async function loadPublicationForReconciliation({
  publicationId,
  supabase,
  userId,
}: {
  publicationId: string;
  supabase: SupabaseRestClient;
  userId: string;
}): Promise<PublicationReconciliationRow | null> {
  const rows = await readSupabaseRows<PublicationReconciliationRow>({
    client: supabase,
    params: {
      id: `eq.${publicationId}`,
      select:
        "content_job_id,external_post_id,id,last_reconciled_at,publication_status,provider_failure_code,provider_failure_metadata,provider_failure_reason,reconciliation_status,remote_processing_status,remote_state,remote_status,remote_upload_status,snapshot_hash,target_platform,user_id,requested_by",
      user_id: `eq.${userId}`,
    },
    table: "content_publications",
  });

  return rows[0] ?? null;
}

async function loadPublicationObservability({
  publicationId,
  supabase,
  userId,
}: {
  publicationId: string;
  supabase: SupabaseRestClient;
  userId: string;
}): Promise<{
  events: PublicationObservabilityEventRow[];
  publication: PublicationObservabilityRow;
} | null> {
  const publicationRows = await readSupabaseRows<PublicationObservabilityRow>({
    client: supabase,
    params: {
      id: `eq.${publicationId}`,
      select:
        "content_job_id,desired_visibility,effective_visibility,external_post_id,external_url,id,last_reconciled_at,publication_status,provider_failure_code,provider_failure_metadata,provider_failure_reason,reconciliation_status,reconcile_max_retries,reconcile_next_retry_at,reconcile_retry_count,remote_processing_status,remote_state,remote_status,remote_upload_status,snapshot_hash,target_platform,updated_at,user_id",
      user_id: `eq.${userId}`,
    },
    table: "content_publications",
  });
  const publication = publicationRows[0];

  if (!publication) {
    return null;
  }

  const events = await readSupabaseRows<PublicationObservabilityEventRow>({
    client: supabase,
    params: {
      content_publication_id: `eq.${publicationId}`,
      order: "created_at.desc",
      select:
        "actor_id,content_publication_id,created_at,event_type,id,metadata,previous_publication_status,publication_status,source,user_id",
      user_id: `eq.${userId}`,
      limit: "25",
    },
    table: "content_publication_events",
  });

  return {
    events,
    publication,
  };
}

async function loadVodAsset({
  supabase,
  streamId,
  userId,
}: {
  supabase: SupabaseRestClient;
  streamId: string | null;
  userId: string;
}): Promise<{ id: string; source_url: string } | null> {
  if (!streamId) {
    return null;
  }

  const rows = await readSupabaseRows<{ id: string; source_url: string }>({
    client: supabase,
    params: {
      select: "id,source_url",
      stream_id: `eq.${streamId}`,
      user_id: `eq.${userId}`,
      order: "updated_at.desc",
      limit: "1",
    },
    table: "vod_assets",
  });

  return rows[0] ?? null;
}

async function writePublicationEvent({
  actorId,
  eventType,
  metadata,
  previousPublicationStatus,
  publicationId,
  publicationStatus,
  source,
  supabase,
  userId,
}: {
  actorId: string;
  eventType: ContentPublicationEventType;
  metadata: Record<string, unknown>;
  previousPublicationStatus: ContentPublicationStatus | null;
  publicationId: string;
  publicationStatus: ContentPublicationStatus;
  source: string;
  supabase: SupabaseRestClient;
  userId: string;
}) {
  const response = await supabase.fetchImpl(
    new URL("/rest/v1/content_publication_events", supabase.supabaseUrl),
    {
      body: JSON.stringify({
        actor_id: actorId,
        content_publication_id: publicationId,
        event_type: eventType,
        metadata,
        previous_publication_status: previousPublicationStatus,
        publication_status: publicationStatus,
        source,
        user_id: userId,
      }),
      headers: {
        apikey: supabase.serviceRoleKey,
        Authorization: `Bearer ${supabase.serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      method: "POST",
    },
  );

  if (!response.ok) {
    throw new Error(
      `Supabase content_publication_events write failed with status ${response.status}.`,
    );
  }
}

async function writePublicationFanoutEvent({
  actionKey,
  actionResult,
  actorId,
  contentPublicationFanoutId,
  contentPublicationFanoutTargetId = null,
  contentPublicationId = null,
  eventType,
  fanoutStatus,
  metadata,
  previousFanoutStatus = null,
  previousTargetStatus = null,
  source,
  supabase,
  targetStatus = null,
  userId,
}: {
  actionKey: ContentPublicationFanoutActionKey | null;
  actionResult: PublicationFanoutEventRow["action_result"];
  actorId: string;
  contentPublicationFanoutId: string;
  contentPublicationFanoutTargetId?: string | null;
  contentPublicationId?: string | null;
  eventType: PublicationFanoutEventRow["event_type"];
  fanoutStatus: ContentPublicationFanoutStatus;
  metadata: Record<string, unknown>;
  previousFanoutStatus?: ContentPublicationFanoutStatus | null;
  previousTargetStatus?: ContentPublicationFanoutTargetStatus | null;
  source: string;
  supabase: SupabaseRestClient;
  targetStatus?: ContentPublicationFanoutTargetStatus | null;
  userId: string;
}) {
  const response = await supabase.fetchImpl(
    new URL("/rest/v1/content_publication_fanout_events", supabase.supabaseUrl),
    {
      body: JSON.stringify({
        action_key: actionKey,
        action_result: actionResult,
        actor_id: actorId,
        content_publication_fanout_id: contentPublicationFanoutId,
        content_publication_fanout_target_id: contentPublicationFanoutTargetId,
        content_publication_id: contentPublicationId,
        event_type: eventType,
        fanout_status: fanoutStatus,
        metadata,
        previous_fanout_status: previousFanoutStatus,
        previous_target_status: previousTargetStatus,
        source,
        target_status: targetStatus,
        user_id: userId,
      }),
      headers: {
        apikey: supabase.serviceRoleKey,
        Authorization: `Bearer ${supabase.serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      method: "POST",
    },
  );

  if (!response.ok) {
    throw new Error(
      `Supabase content_publication_fanout_events write failed with status ${response.status}.`,
    );
  }
}

async function loadPublicationFanoutById({
  fanoutId,
  supabase,
  userId,
}: {
  fanoutId: string;
  supabase: SupabaseRestClient;
  userId: string;
}): Promise<PublicationFanoutRow | null> {
  const rows = await readSupabaseRows<PublicationFanoutRow>({
    client: supabase,
    params: {
      id: `eq.${fanoutId}`,
      select:
        "blocked_target_count,content_job_id,created_at,fanout_policy,fanout_status,id,last_action_at,last_action_key,last_action_result,last_aggregate_refreshed_at,requested_at,requested_by,request_intent_hash,review_status_at_request,snapshot,snapshot_hash,target_count,updated_at,user_id,validated_at,validated_target_count",
      user_id: `eq.${userId}`,
    },
    table: "content_publication_fanouts",
  });

  return rows[0] ?? null;
}

async function loadPublicationFanoutTargetById({
  fanoutId,
  targetId,
  supabase,
  userId,
}: {
  fanoutId: string;
  supabase: SupabaseRestClient;
  targetId: string;
  userId: string;
}): Promise<PublicationFanoutTargetRow | null> {
  const rows = await readSupabaseRows<PublicationFanoutTargetRow>({
    client: supabase,
    params: {
      content_publication_fanout_id: `eq.${fanoutId}`,
      id: `eq.${targetId}`,
      select:
        "block_message,block_reason,capability_snapshot,capability_version,content_publication_fanout_id,content_publication_id,created_at,last_action_at,last_action_key,last_action_result,last_block_reason,last_rechecked_at,id,platform_connection_id,provider_overrides,request_intent_hash,target_platform,target_status,updated_at,user_id,validated_at",
      user_id: `eq.${userId}`,
    },
    table: "content_publication_fanout_targets",
  });

  return rows[0] ?? null;
}

async function loadPublicationFanoutTargetByPublicationId({
  fanoutId,
  publicationId,
  supabase,
  userId,
}: {
  fanoutId: string;
  publicationId: string;
  supabase: SupabaseRestClient;
  userId: string;
}): Promise<PublicationFanoutTargetRow | null> {
  const rows = await readSupabaseRows<PublicationFanoutTargetRow>({
    client: supabase,
    params: {
      content_publication_fanout_id: `eq.${fanoutId}`,
      content_publication_id: `eq.${publicationId}`,
      select:
        "block_message,block_reason,capability_snapshot,capability_version,content_publication_fanout_id,content_publication_id,created_at,last_action_at,last_action_key,last_action_result,last_block_reason,last_rechecked_at,id,platform_connection_id,provider_overrides,request_intent_hash,target_platform,target_status,updated_at,user_id,validated_at",
      user_id: `eq.${userId}`,
    },
    table: "content_publication_fanout_targets",
  });

  return rows[0] ?? null;
}

async function loadPublicationFanoutTargets({
  fanoutId,
  supabase,
  userId,
}: {
  fanoutId: string;
  supabase: SupabaseRestClient;
  userId: string;
}): Promise<PublicationFanoutTargetRow[]> {
  return readSupabaseRows<PublicationFanoutTargetRow>({
    client: supabase,
    params: {
      content_publication_fanout_id: `eq.${fanoutId}`,
      order: "created_at.asc",
      select:
        "block_message,block_reason,capability_snapshot,capability_version,content_publication_fanout_id,content_publication_id,created_at,last_action_at,last_action_key,last_action_result,last_block_reason,last_rechecked_at,id,platform_connection_id,provider_overrides,request_intent_hash,target_platform,target_status,updated_at,user_id,validated_at",
      user_id: `eq.${userId}`,
    },
    table: "content_publication_fanout_targets",
  });
}

function summarizePublicationFanoutTargets(
  targets: PublicationFanoutTargetRow[],
): {
  blockedTargetCount: number;
  fanoutStatus: ContentPublicationFanoutStatus;
  targetCount: number;
  validatedTargetCount: number;
} {
  const validatedTargetCount = targets.filter(
    (target) => target.target_status === "validated",
  ).length;
  const blockedTargetCount = targets.filter(
    (target) => target.target_status === "blocked",
  ).length;
  const targetCount = targets.length;
  const fanoutStatus: ContentPublicationFanoutStatus =
    blockedTargetCount === 0
      ? "validated"
      : validatedTargetCount === 0
        ? "blocked"
        : "partially_validated";

  return {
    blockedTargetCount,
    fanoutStatus,
    targetCount,
    validatedTargetCount,
  };
}

async function refreshPublicationFanoutAggregate({
  actionKey = "refresh_parent_aggregate",
  actionResult = "refreshed",
  actorId,
  fanoutId,
  metadata = {},
  previousFanoutStatus,
  supabase,
  userId,
}: {
  actionKey?: ContentPublicationFanoutActionKey;
  actionResult?: PublicationFanoutEventRow["action_result"];
  actorId?: string;
  fanoutId: string;
  metadata?: Record<string, unknown>;
  previousFanoutStatus?: ContentPublicationFanoutStatus;
  supabase: SupabaseRestClient;
  userId: string;
}): Promise<{
  fanout: PublicationFanoutRow | null;
  fanoutStatus: ContentPublicationFanoutStatus;
  targetCount: number;
  validatedTargetCount: number;
  blockedTargetCount: number;
  lastAggregateRefreshedAt: string | null;
}> {
  const fanout = await loadPublicationFanoutById({
    fanoutId,
    supabase,
    userId,
  });

  const resolvedActorId = actorId ?? userId;
  const resolvedPreviousFanoutStatus =
    previousFanoutStatus ?? fanout?.fanout_status ?? "blocked";

  if (!fanout) {
    return {
      blockedTargetCount: 0,
      fanout: null,
      fanoutStatus: "blocked",
      lastAggregateRefreshedAt: null,
      targetCount: 0,
      validatedTargetCount: 0,
    };
  }

  const targets = await loadPublicationFanoutTargets({
    fanoutId: fanout.id,
    supabase,
    userId,
  });
  const aggregate = summarizePublicationFanoutTargets(targets);
  const now = new Date().toISOString();
  const nextFanoutStatus =
    fanout.fanout_status === "canceled" ? "canceled" : aggregate.fanoutStatus;

  await patchSupabaseRows({
    client: supabase,
    params: {
      id: `eq.${fanout.id}`,
      user_id: `eq.${userId}`,
    },
    payload: {
      blocked_target_count: aggregate.blockedTargetCount,
      last_action_at: now,
      last_action_key: actionKey,
      last_action_result: actionResult,
      last_aggregate_refreshed_at: now,
      fanout_status: nextFanoutStatus,
      target_count: aggregate.targetCount,
      updated_at: now,
      validated_at:
        nextFanoutStatus === "validated" && !fanout.validated_at
          ? now
          : fanout.validated_at,
      validated_target_count: aggregate.validatedTargetCount,
    },
    table: "content_publication_fanouts",
  });

  await writePublicationFanoutEvent({
    actionKey,
    actionResult,
    actorId: resolvedActorId,
    contentPublicationFanoutId: fanout.id,
    eventType: "parent_aggregate_refreshed",
    fanoutStatus: nextFanoutStatus,
    metadata: {
      ...metadata,
      blocked_target_count: aggregate.blockedTargetCount,
      fanout_status: nextFanoutStatus,
      target_count: aggregate.targetCount,
      validated_target_count: aggregate.validatedTargetCount,
    },
    previousFanoutStatus: resolvedPreviousFanoutStatus,
    source: "api-gateway",
    supabase,
    userId,
  });

  return {
    blockedTargetCount: aggregate.blockedTargetCount,
    fanout,
    fanoutStatus: nextFanoutStatus,
    lastAggregateRefreshedAt: now,
    targetCount: aggregate.targetCount,
    validatedTargetCount: aggregate.validatedTargetCount,
  };
}

async function recheckPublicationFanoutTarget({
  fanoutId,
  supabase,
  targetId,
  userId,
}: {
  fanoutId: string;
  supabase: SupabaseRestClient;
  targetId: string;
  userId: string;
}): Promise<{
  body: PublicationFanoutTargetRecheckMutationResult | Record<string, unknown>;
  statusCode: number;
}> {
  const fanout = await loadPublicationFanoutById({
    fanoutId,
    supabase,
    userId,
  });

  if (!fanout) {
    return {
      body: {
        error: "content_publication_fanout_not_found",
        message: "Approved fanout request could not be found.",
      },
      statusCode: 404,
    };
  }

  const target = await loadPublicationFanoutTargetById({
    fanoutId: fanout.id,
    supabase,
    targetId,
    userId,
  });

  if (!target) {
    return {
      body: {
        error: "content_publication_fanout_target_not_found",
        message: "Approved fanout target could not be found.",
      },
      statusCode: 404,
    };
  }

  const contentJob = await loadRepurposingContentJob({
    contentJobId: fanout.content_job_id,
    supabase,
    userId,
  });

  const connection = await loadPlatformConnection({
    platformConnectionId: target.platform_connection_id,
    supabase,
    userId,
  });

  const recheckPolicy = buildPublicationFanoutTargetRecheckActionPolicy({
    connection: connection
      ? {
          metadata: connection.metadata,
          platform: connection.platform,
          provider_profile: connection.provider_profile,
          scopes: connection.scopes,
          status: normalizeConnectionStatus(connection.status),
        }
      : null,
    contentJob: {
      id: contentJob?.id ?? fanout.content_job_id,
      queueJobId: contentJob?.queue_job_id ?? null,
      result: contentJob?.result ?? null,
      reviewStatus: contentJob?.review_status ?? null,
      status: contentJob?.status ?? null,
      streamId: contentJob?.stream_id ?? null,
    },
    fanoutStatus: fanout.fanout_status,
    providerOverrides: {
      [target.target_platform]: target.provider_overrides,
    },
    targetPlatform: target.target_platform,
    targetStatus: target.target_status,
  });

  const now = new Date().toISOString();

  if (!recheckPolicy.allowed) {
    const blockReason =
      target.block_reason ??
      target.last_block_reason ??
      recheckPolicy.blockReason;

    await patchSupabaseRows({
      client: supabase,
      params: {
        content_publication_fanout_id: `eq.${fanout.id}`,
        id: `eq.${target.id}`,
        user_id: `eq.${userId}`,
      },
      payload: {
        block_message: recheckPolicy.safeDescription,
        block_reason: blockReason,
        last_action_at: now,
        last_action_key: "recheck_target",
        last_action_result: "blocked",
        last_block_reason: blockReason,
        last_rechecked_at: now,
        updated_at: now,
      },
      table: "content_publication_fanout_targets",
    });

    await writePublicationFanoutEvent({
      actionKey: "recheck_target",
      actionResult: "blocked",
      actorId: userId,
      contentPublicationFanoutId: fanout.id,
      contentPublicationFanoutTargetId: target.id,
      eventType: "manual_action_blocked",
      fanoutStatus: fanout.fanout_status,
      metadata: {
        block_reason: blockReason,
        block_message: recheckPolicy.safeDescription,
        target_platform: target.target_platform,
      },
      previousFanoutStatus: fanout.fanout_status,
      previousTargetStatus: target.target_status,
      source: "api-gateway",
      supabase,
      targetStatus: target.target_status,
      userId,
    });

    return {
      body: {
        block_reason: blockReason,
        content_publication_fanout_id: fanout.id,
        content_publication_fanout_target_id: target.id,
        content_publication_id: target.content_publication_id,
        fanout_status: fanout.fanout_status,
        last_action_result: "blocked",
        status: "publication_fanout_target_recheck_blocked",
        target_status: target.target_status,
        user_id: userId,
      } satisfies PublicationFanoutTargetRecheckMutationResult,
      statusCode: 409,
    };
  }

  const publicationRequest = await createPublicationRequest({
    input: {
      capability_version: fanout.snapshot?.capabilityVersion as
        | string
        | undefined,
      content_job_id: fanout.content_job_id,
      platform_connection_id: target.platform_connection_id,
      provider_overrides: {
        [target.target_platform]: target.provider_overrides,
      },
      target_platform: target.target_platform,
      user_id: userId,
    },
    supabase,
  });

  await patchSupabaseRows({
    client: supabase,
    params: {
      content_publication_fanout_id: `eq.${fanout.id}`,
      id: `eq.${target.id}`,
      user_id: `eq.${userId}`,
    },
    payload: {
      block_message: null,
      block_reason: null,
      content_publication_id: publicationRequest.publication.id,
      last_action_at: now,
      last_action_key: "recheck_target",
      last_action_result: "validated",
      last_block_reason: target.block_reason ?? target.last_block_reason,
      last_rechecked_at: now,
      target_status: "validated",
      updated_at: now,
      validated_at: publicationRequest.publication.validated_at ?? now,
    },
    table: "content_publication_fanout_targets",
  });

  await writePublicationFanoutEvent({
    actionKey: "recheck_target",
    actionResult: "validated",
    actorId: userId,
    contentPublicationFanoutId: fanout.id,
    contentPublicationFanoutTargetId: target.id,
    contentPublicationId: publicationRequest.publication.id,
    eventType: "target_rechecked",
    fanoutStatus: fanout.fanout_status,
    metadata: {
      content_publication_id: publicationRequest.publication.id,
      target_platform: target.target_platform,
      validated_at: publicationRequest.publication.validated_at,
    },
    previousFanoutStatus: fanout.fanout_status,
    previousTargetStatus: target.target_status,
    source: "api-gateway",
    supabase,
    targetStatus: "validated",
    userId,
  });

  const refreshed = await refreshPublicationFanoutAggregate({
    actionKey: "recheck_target",
    actionResult: "validated",
    actorId: userId,
    fanoutId: fanout.id,
    metadata: {
      content_publication_id: publicationRequest.publication.id,
      target_platform: target.target_platform,
    },
    previousFanoutStatus: fanout.fanout_status,
    supabase,
    userId,
  });

  return {
    body: {
      block_reason: null,
      content_publication_fanout_id: fanout.id,
      content_publication_fanout_target_id: target.id,
      content_publication_id: publicationRequest.publication.id,
      fanout_status: refreshed.fanoutStatus,
      last_action_result: "validated",
      status: "publication_fanout_target_rechecked",
      target_status: "validated",
      user_id: userId,
    } satisfies PublicationFanoutTargetRecheckMutationResult,
    statusCode: 200,
  };
}

async function retryPublicationFanoutChild({
  fanoutId,
  publicationId,
  publicationExecutionQueue,
  supabase,
  userId,
}: {
  fanoutId: string;
  publicationId: string;
  publicationExecutionQueue: PublicationExecutionQueue | undefined;
  supabase: SupabaseRestClient;
  userId: string;
}): Promise<{
  body: PublicationFanoutChildRetryMutationResult | Record<string, unknown>;
  statusCode: number;
}> {
  const fanout = await loadPublicationFanoutById({
    fanoutId,
    supabase,
    userId,
  });

  if (!fanout) {
    return {
      body: {
        error: "content_publication_fanout_not_found",
        message: "Approved fanout request could not be found.",
      },
      statusCode: 404,
    };
  }

  const publication = await loadPublicationById({
    publicationId,
    supabase,
    userId,
  });

  if (!publication) {
    return {
      body: {
        error: "content_publication_not_found",
        message: "Approved publication request could not be found.",
      },
      statusCode: 404,
    };
  }

  const target = await loadPublicationFanoutTargetByPublicationId({
    fanoutId: fanout.id,
    supabase,
    publicationId: publication.id,
    userId,
  });

  if (!target || target.content_publication_id !== publication.id) {
    return {
      body: {
        error: "content_publication_fanout_target_not_found",
        message:
          "The selected child publication does not belong to this fanout.",
      },
      statusCode: 409,
    };
  }

  const contentJob = await loadRepurposingContentJob({
    contentJobId: publication.content_job_id,
    supabase,
    userId,
  });
  const connection = await loadPlatformConnection({
    platformConnectionId: publication.platform_connection_id,
    supabase,
    userId,
  });
  const vodAsset = await loadVodAsset({
    supabase,
    streamId: contentJob?.stream_id ?? null,
    userId,
  });
  const manualActionPolicy = buildPublicationManualActionPolicy({
    connectionScopes: connection?.scopes ?? [],
    connectionStatus: normalizeConnectionStatus(connection?.status ?? null),
    contentJobReviewStatus: contentJob?.review_status ?? null,
    contentJobStatus: contentJob?.status ?? null,
    externalPostId: publication.external_post_id,
    hasApprovedBundle: isApprovedRepurposingPlanResult(contentJob?.result),
    hasPublishableAsset: Boolean(vodAsset?.source_url),
    maxRetries: publication.max_retries,
    publicationStatus: publication.publication_status,
    reconcileMaxRetries: publication.reconcile_max_retries,
    reconcileRetryCount: publication.reconcile_retry_count,
    reconciliationStatus: publication.reconciliation_status,
    remotePublishId:
      publication.external_post_id ??
      getPublicationRemotePublishId(publication.remote_state),
    retryCount: publication.retry_count,
    targetPlatform: publication.target_platform,
  });
  const retryPolicy = buildPublicationFanoutChildRetryActionPolicy({
    belongsToFanout: target.content_publication_fanout_id === fanout.id,
    fanoutStatus: fanout.fanout_status,
    hasApprovedBundle: isApprovedRepurposingPlanResult(contentJob?.result),
    hasPublishableAsset: Boolean(vodAsset?.source_url),
    manualRetryPolicy: manualActionPolicy,
    publicationStatus: publication.publication_status,
    targetPlatform: target.target_platform,
  });

  if (!retryPolicy.allowed) {
    const now = new Date().toISOString();

    await patchSupabaseRows({
      client: supabase,
      params: {
        content_publication_fanout_id: `eq.${fanout.id}`,
        id: `eq.${target.id}`,
        user_id: `eq.${userId}`,
      },
      payload: {
        last_action_at: now,
        last_action_key: "retry_child",
        last_action_result: "blocked",
        updated_at: now,
      },
      table: "content_publication_fanout_targets",
    });

    await writePublicationFanoutEvent({
      actionKey: "retry_child",
      actionResult: "blocked",
      actorId: userId,
      contentPublicationFanoutId: fanout.id,
      contentPublicationFanoutTargetId: target.id,
      contentPublicationId: publication.id,
      eventType: "manual_action_blocked",
      fanoutStatus: fanout.fanout_status,
      metadata: {
        block_reason: retryPolicy.blockReason,
        target_platform: target.target_platform,
      },
      previousFanoutStatus: fanout.fanout_status,
      previousTargetStatus: target.target_status,
      source: "api-gateway",
      supabase,
      targetStatus: target.target_status,
      userId,
    });

    return {
      body: {
        block_reason: retryPolicy.blockReason,
        content_publication_fanout_id: fanout.id,
        content_publication_fanout_target_id: target.id,
        content_publication_id: publication.id,
        fanout_status: fanout.fanout_status,
        queue_job_id: null,
        message: retryPolicy.safeDescription,
        status: "publication_fanout_child_retry_blocked",
        target_status: target.target_status,
        user_id: userId,
      } satisfies PublicationFanoutChildRetryMutationResult,
      statusCode: 409,
    };
  }

  if (!publicationExecutionQueue) {
    return {
      body: {
        error: "publication_execution_queue_unavailable",
        message:
          "REDIS_URL is required before publication fanout child retries can be queued.",
      },
      statusCode: 503,
    };
  }

  const result = await executePublicationManualAction({
    action: "retry",
    publicationExecutionQueue,
    publicationId: publication.id,
    requestPayload: {
      user_id: userId,
    },
    supabase,
  });
  const queuedPublicationActionResult =
    result.body as PublicationManualActionResponse;

  if (result.statusCode !== 200) {
    return {
      body: {
        block_reason: null,
        content_publication_fanout_id: fanout.id,
        content_publication_fanout_target_id: target.id,
        content_publication_id: publication.id,
        fanout_status: fanout.fanout_status,
        queue_job_id: null,
        message:
          result.body &&
          typeof result.body === "object" &&
          "message" in result.body
            ? String((result.body as Record<string, unknown>).message ?? null)
            : null,
        status: "publication_fanout_child_retry_blocked",
        target_status: target.target_status,
        user_id: userId,
      } satisfies PublicationFanoutChildRetryMutationResult,
      statusCode: result.statusCode,
    };
  }

  const now = new Date().toISOString();

  await patchSupabaseRows({
    client: supabase,
    params: {
      content_publication_fanout_id: `eq.${fanout.id}`,
      id: `eq.${target.id}`,
      user_id: `eq.${userId}`,
    },
    payload: {
      last_action_at: now,
      last_action_key: "retry_child",
      last_action_result: "queued",
      updated_at: now,
    },
    table: "content_publication_fanout_targets",
  });

  await patchSupabaseRows({
    client: supabase,
    params: {
      id: `eq.${fanout.id}`,
      user_id: `eq.${userId}`,
    },
    payload: {
      last_action_at: now,
      last_action_key: "retry_child",
      last_action_result: "queued",
      updated_at: now,
    },
    table: "content_publication_fanouts",
  });

  await writePublicationFanoutEvent({
    actionKey: "retry_child",
    actionResult: "queued",
    actorId: userId,
    contentPublicationFanoutId: fanout.id,
    contentPublicationFanoutTargetId: target.id,
    contentPublicationId: publication.id,
    eventType: "child_retry_queued",
    fanoutStatus: fanout.fanout_status,
    metadata: {
      queue_job_id: queuedPublicationActionResult.queue_job_id,
      target_platform: target.target_platform,
    },
    previousFanoutStatus: fanout.fanout_status,
    previousTargetStatus: target.target_status,
    source: "api-gateway",
    supabase,
    targetStatus: target.target_status,
    userId,
  });

  return {
    body: {
      block_reason: null,
      content_publication_fanout_id: fanout.id,
      content_publication_fanout_target_id: target.id,
      content_publication_id: publication.id,
      fanout_status: fanout.fanout_status,
      queue_job_id: queuedPublicationActionResult.queue_job_id,
      message: null,
      status: "publication_fanout_child_retry_queued",
      target_status: target.target_status,
      user_id: userId,
    } satisfies PublicationFanoutChildRetryMutationResult,
    statusCode: 200,
  };
}

async function executePublicationManualAction({
  action,
  publicationExecutionQueue,
  publicationId,
  requestPayload,
  supabase,
}: {
  action: PublicationManualActionName;
  publicationExecutionQueue: PublicationExecutionQueue | undefined;
  publicationId: string;
  requestPayload: PublicationManualActionRequestPayload;
  supabase: SupabaseRestClient;
}): Promise<{
  body: PublicationManualActionResponse | Record<string, unknown>;
  statusCode: number;
}> {
  const publication = await loadPublicationById({
    publicationId,
    supabase,
    userId: requestPayload.user_id,
  });

  if (!publication) {
    return {
      body: {
        error: "content_publication_not_found",
        message: "Approved publication request could not be found.",
      },
      statusCode: 404,
    };
  }

  if (action === "mark-final-failed" && requestPayload.confirm !== true) {
    return {
      body: {
        error: "manual_action_confirmation_required",
        message: "Mark final failed requires an explicit confirmation.",
      },
      statusCode: 400,
    };
  }

  if (
    publication.target_platform !== "youtube" &&
    publication.target_platform !== "tiktok"
  ) {
    return {
      body: {
        error: "unsupported_target_platform",
        message:
          "Publish and reconcile manual actions are only supported for YouTube and TikTok publications.",
      },
      statusCode: 409,
    };
  }

  const publicationTargetPlatform = publication.target_platform;

  const contentJob = await loadRepurposingContentJob({
    contentJobId: publication.content_job_id,
    supabase,
    userId: publication.user_id,
  });
  const connection = await loadPlatformConnection({
    platformConnectionId: publication.platform_connection_id,
    supabase,
    userId: publication.user_id,
  });
  const vodAsset = await loadVodAsset({
    supabase,
    streamId: contentJob?.stream_id ?? null,
    userId: publication.user_id,
  });
  const manualActionPolicy = buildPublicationManualActionPolicy({
    connectionScopes: connection?.scopes ?? [],
    connectionStatus: normalizeConnectionStatus(connection?.status ?? null),
    contentJobReviewStatus: contentJob?.review_status ?? null,
    contentJobStatus: contentJob?.status ?? null,
    externalPostId: publication.external_post_id,
    hasApprovedBundle: isApprovedRepurposingPlanResult(contentJob?.result),
    hasPublishableAsset: Boolean(vodAsset?.source_url),
    maxRetries: publication.max_retries,
    publicationStatus: publication.publication_status,
    reconcileMaxRetries: publication.reconcile_max_retries,
    reconcileRetryCount: publication.reconcile_retry_count,
    reconciliationStatus: publication.reconciliation_status,
    remotePublishId:
      publication.external_post_id ??
      getPublicationRemotePublishId(publication.remote_state),
    retryCount: publication.retry_count,
    targetPlatform: publicationTargetPlatform,
  });
  const actionKey = getManualActionPolicyKey(action);
  const decision = manualActionPolicy.actions[actionKey];

  if (!decision.allowed) {
    return {
      body: {
        block_reason: decision.blockReason,
        error: "manual_action_not_allowed",
        manual_action: actionKey,
        message: decision.explanation,
      },
      statusCode: 409,
    };
  }

  if (action !== "mark-final-failed" && !publicationExecutionQueue) {
    return {
      body: {
        error: "publication_execution_queue_unavailable",
        message:
          "REDIS_URL is required before publication manual actions can be queued.",
      },
      statusCode: 503,
    };
  }

  if (action === "retry") {
    const queuedJob = await enqueuePublicationExecutionJob(
      publicationExecutionQueue as PublicationExecutionQueue,
      {
        content_publication_id: publication.id,
        target_platform: publicationTargetPlatform,
        user_id: publication.user_id,
      },
    );

    const now = new Date().toISOString();
    const nextRetryCount = publication.retry_count + 1;

    await patchSupabaseRows({
      client: supabase,
      params: {
        id: `eq.${publication.id}`,
        user_id: `eq.${publication.user_id}`,
      },
      payload: {
        next_retry_at: null,
        publication_status: "queued",
        retry_count: nextRetryCount,
        updated_at: now,
      },
      table: "content_publications",
    });

    await writePublicationEvent({
      actorId: publication.requested_by,
      eventType: "queued",
      metadata: {
        content_job_id: publication.content_job_id,
        manual_action: actionKey,
        queue_job_id: queuedJob.queueJobId,
        retry_budget_remaining: Math.max(
          publication.max_retries - nextRetryCount,
          0,
        ),
        retry_count: nextRetryCount,
        snapshot_hash: publication.snapshot_hash,
        target_platform: publication.target_platform,
      },
      previousPublicationStatus: publication.publication_status,
      publicationId: publication.id,
      publicationStatus: "queued",
      source: "api-gateway",
      supabase,
      userId: publication.user_id,
    });

    return {
      body: {
        content_job_id: publication.content_job_id,
        content_publication_id: publication.id,
        publication_status: "queued",
        queue_job_id: queuedJob.queueJobId,
        reconciliation_status: publication.reconciliation_status,
        status: "publication_retry_queued",
        target_platform: publication.target_platform,
      } satisfies PublicationManualActionResponse,
      statusCode: 200,
    };
  }

  if (action === "reconcile-now") {
    const queuedJob = await enqueuePublicationReconciliationJob(
      publicationExecutionQueue as PublicationExecutionQueue,
      {
        content_publication_id: publication.id,
        target_platform: publicationTargetPlatform,
        user_id: publication.user_id,
      },
    );

    const now = new Date().toISOString();
    const nextReconcileRetryCount = publication.reconcile_retry_count + 1;

    await patchSupabaseRows({
      client: supabase,
      params: {
        id: `eq.${publication.id}`,
        user_id: `eq.${publication.user_id}`,
      },
      payload: {
        last_reconciled_at: null,
        provider_failure_code: null,
        provider_failure_metadata: {},
        provider_failure_reason: null,
        reconciliation_status: "queued",
        reconcile_max_retries: publication.reconcile_max_retries,
        reconcile_next_retry_at: null,
        reconcile_retry_count: nextReconcileRetryCount,
        updated_at: now,
      },
      table: "content_publications",
    });

    await writePublicationEvent({
      actorId: publication.requested_by,
      eventType: "reconcile_requested",
      metadata: {
        content_job_id: publication.content_job_id,
        external_post_id: publication.external_post_id,
        manual_action: actionKey,
        queue_job_id: queuedJob.queueJobId,
        reconcile_retry_count: nextReconcileRetryCount,
        snapshot_hash: publication.snapshot_hash,
        target_platform: publication.target_platform,
      },
      previousPublicationStatus: publication.publication_status,
      publicationId: publication.id,
      publicationStatus: publication.publication_status,
      source: "api-gateway",
      supabase,
      userId: publication.user_id,
    });

    return {
      body: {
        content_job_id: publication.content_job_id,
        content_publication_id: publication.id,
        publication_status: publication.publication_status,
        queue_job_id: queuedJob.queueJobId,
        reconciliation_status: "queued",
        status: "publication_reconcile_queued",
        target_platform: publication.target_platform,
      } satisfies PublicationManualActionResponse,
      statusCode: 200,
    };
  }

  const now = new Date().toISOString();
  await patchSupabaseRows({
    client: supabase,
    params: {
      id: `eq.${publication.id}`,
      user_id: `eq.${publication.user_id}`,
    },
    payload: {
      next_retry_at: null,
      publication_status: "failed_permanent",
      updated_at: now,
    },
    table: "content_publications",
  });

  await writePublicationEvent({
    actorId: publication.requested_by,
    eventType: "failed_permanent",
    metadata: {
      content_job_id: publication.content_job_id,
      manual_action: actionKey,
      snapshot_hash: publication.snapshot_hash,
      target_platform: publication.target_platform,
    },
    previousPublicationStatus: publication.publication_status,
    publicationId: publication.id,
    publicationStatus: "failed_permanent",
    source: "api-gateway",
    supabase,
    userId: publication.user_id,
  });

  return {
    body: {
      content_job_id: publication.content_job_id,
      content_publication_id: publication.id,
      publication_status: "failed_permanent",
      queue_job_id: null,
      reconciliation_status: publication.reconciliation_status,
      status: "publication_final_failed",
      target_platform: publication.target_platform,
    } satisfies PublicationManualActionResponse,
    statusCode: 200,
  };
}

function normalizeConnectionStatus(
  value: string | null,
): ConnectionStatus | null {
  if (
    value === "connected" ||
    value === "expired" ||
    value === "pending" ||
    value === "revoked"
  ) {
    return value;
  }

  return null;
}

function getPublicationRemotePublishId(
  remoteState: Record<string, unknown> | null,
): string | null {
  if (!remoteState) {
    return null;
  }

  const candidate = [
    remoteState.provider_publish_id,
    remoteState.providerPublishId,
    remoteState.provider_post_id,
    remoteState.providerPostId,
    remoteState.publicaly_available_post_id,
    remoteState.publically_available_post_id,
    remoteState.publicly_available_post_id,
    remoteState.remotePostId,
    remoteState.post_id,
    remoteState.publish_id,
  ].find((value) => typeof value === "string" && value.trim().length > 0);

  return typeof candidate === "string" ? candidate.trim() : null;
}

function getManualActionPolicyKey(
  action: PublicationManualActionName,
): keyof ContentPublicationManualActionPolicy["actions"] {
  switch (action) {
    case "mark-final-failed":
      return "mark_final_failed";
    case "reconcile-now":
      return "reconcile_now";
    case "retry":
      return "retry_publish";
  }

  throw new Error("Unsupported publication manual action.");
}

function buildPublicationSnapshot({
  approvedBundle,
  capabilityResolution,
  capabilityVersion,
  contentJob,
  connection,
  providerOverrides,
  targetPlatform,
}: {
  approvedBundle: z.infer<typeof repurposingBundleSchema>;
  capabilityResolution: PublicationCapabilityResolution;
  capabilityVersion: string;
  contentJob: PublicationContentJobRow;
  connection: PublicationConnectionRow;
  providerOverrides: PublicationProviderOverrides;
  targetPlatform: StreamPlatform;
}): Record<string, unknown> {
  return {
    approvedBundle,
    capability: {
      accountCapabilities: capabilityResolution.accountCapabilities,
      capabilityVersion,
      canonicalDraft: capabilityResolution.canonicalDraft,
      dynamicCapabilityKeys: capabilityResolution.dynamicCapabilityKeys,
      providerOverrides,
      providerPayloadPreview: capabilityResolution.providerPayloadPreview,
      providerSupportStatus: capabilityResolution.providerSupportStatus,
      resolvedDefaults: capabilityResolution.resolvedDefaults,
      targetPlatform,
      unsupportedFields: capabilityResolution.unsupportedFields,
      warnings: capabilityResolution.warnings,
    },
    contentJob: {
      id: contentJob.id,
      queueJobId: contentJob.queue_job_id,
      reviewStatus: contentJob.review_status,
      status: contentJob.status,
      streamId: contentJob.stream_id,
    },
    platformConnection: {
      id: connection.id,
      platform: connection.platform,
      scopes: connection.scopes ?? [],
    },
    providerOverrides,
    targetPlatform,
  };
}

function getPublicationCapabilityValidationStatus(code: string): number {
  switch (code) {
    case "account_capability_missing":
    case "conditional_field_unresolved":
    case "missing_publish_scopes":
    case "platform_connection_not_found":
    case "platform_mismatch":
    case "publication_not_ready":
    case "publishable_bundle_missing":
      return 409;
    case "provider_override_mismatch":
      return 409;
    case "provider_override_unsupported_field":
    case "unsupported_capability_version":
    case "unsupported_target_platform":
      return 400;
    default:
      return 422;
  }
}
