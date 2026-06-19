import { createHash } from "node:crypto";
import express from "express";
import type { Router } from "express";
import { z } from "zod";
import { STREAM_PLATFORMS } from "@streamos/types";
import type {
  ContentJobReviewStatus,
  ContentJobStatus,
  ContentPublicationStatus,
  StreamPlatform,
} from "@streamos/types";
import {
  buildCanonicalPublicationDraft,
  extractPublicationAccountCapabilityOverlay,
  PUBLICATION_CAPABILITY_VERSION,
  resolvePublicationCapabilities,
  type PublicationCapabilityResolution,
  type PublicationProviderOverrides,
} from "@streamos/types";

import {
  callSupabaseRpc,
  createSupabaseRestClient,
  readSupabaseRows,
  type SupabaseRestClient,
} from "../lib/supabaseRest.js";

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
  platform_connection_id: string;
  publication_status: ContentPublicationStatus;
  request_intent_hash: string;
  requested_at: string;
  provider_overrides: Record<string, Record<string, unknown>>;
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
}: {
  fetchImpl?: typeof fetch;
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

  if ((connection.scopes ?? []).length === 0) {
    throw new Error("missing_publish_scopes");
  }

  const connectionScopes = connection.scopes ?? [];
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
