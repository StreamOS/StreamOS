import type { Job } from "bullmq";
import { z } from "zod";
import {
  getPublicationExecutionJobId,
  getPublicationReconciliationJobId,
} from "@streamos/queue";

import {
  decryptSecretWithKey,
  encryptSecretWithKey,
  getEncryptionKey,
} from "./encryption.js";
import {
  fetchTikTokPublicationState,
  publishTikTokVideo,
  refreshTikTokAccessToken,
  TikTokPublishError,
} from "./tiktokPublisher.js";
import {
  fetchYouTubePublicationState,
  publishYouTubeVideo,
  refreshYouTubeAccessToken,
  YouTubePublishError,
} from "./youtubePublisher.js";
import {
  publicationExecutionJobDataSchema,
  publicationReconciliationJobDataSchema,
} from "./jobSchema.js";
import type {
  PublicationStore,
  PublicationConnectionRow,
  PublicationRow,
  PublicationContentJobRow,
  PublicationVodAssetRow,
} from "./publicationStore.js";

export class PermanentPublicationReconciliationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentPublicationReconciliationError";
  }
}

const publicationSnapshotSchema = z.object({
  approvedBundle: z.object({
    content_job_id: z.string().uuid(),
    manual_review_required: z.literal(true),
    queue_job_id: z.string().trim().min(1),
    provider: z.string().trim().min(1),
    warnings: z.array(z.string()),
  }),
  capability: z.object({
    canonicalDraft: z.object({
      assetReference: z.object({
        contentJobId: z.string().uuid(),
        queueJobId: z.string().trim().min(1),
        sourcePlatform: z.string().trim().min(1),
        streamId: z.string().uuid().nullable(),
      }),
      audienceClassification: z.string().trim().min(1),
      description: z.string().trim().min(1),
      disclosureIntent: z.object({
        containsAffiliateLinks: z.boolean(),
        containsAIGeneratedAssets: z.boolean(),
        containsSponsoredContent: z.boolean(),
        manualReviewRequired: z.literal(true),
        warnings: z.array(z.string()),
      }),
      formatProfile: z.enum(["long_form", "short_form"]),
      hashtags: z.array(z.string()),
      publishKind: z.literal("video"),
      scheduledPublishAt: z.string().nullable(),
      title: z.string().trim().min(1),
      visibility: z.enum(["friends_only", "private", "public", "unlisted"]),
    }),
  }),
  contentJob: z.object({
    id: z.string().uuid(),
    queueJobId: z.string().trim().min(1),
    reviewStatus: z.enum([
      "needs_review",
      "approved",
      "rejected",
      "needs_changes",
    ]),
    status: z.enum([
      "pending",
      "running",
      "processing",
      "done",
      "completed",
      "failed",
      "cancelled",
    ]),
    streamId: z.string().uuid().nullable(),
  }),
  platformConnection: z.object({
    id: z.string().uuid(),
    platform: z.enum(["youtube", "tiktok"]),
    scopes: z.array(z.string()),
  }),
  providerOverrides: z
    .record(z.string(), z.record(z.string(), z.unknown()))
    .default({}),
  targetPlatform: z.enum(["youtube", "tiktok"]),
});

export type PublishingWorkerConfig = {
  appEncryptionKey: string;
  concurrency: number;
  publicationQueueName: string;
  redisUrl: string;
  supabaseServiceRoleKey: string;
  supabaseUrl: string;
  tiktokClientKey: string;
  tiktokClientSecret: string;
  youtubeClientId: string;
  youtubeClientSecret: string;
};

export type PublishingExecutionClient = {
  publishYouTubeVideo(
    payload: Parameters<typeof publishYouTubeVideo>[0],
  ): Promise<Awaited<ReturnType<typeof publishYouTubeVideo>>>;
  publishTikTokVideo(
    payload: Parameters<typeof publishTikTokVideo>[0],
  ): Promise<Awaited<ReturnType<typeof publishTikTokVideo>>>;
  refreshYouTubeAccessToken(
    payload: Parameters<typeof refreshYouTubeAccessToken>[0],
  ): Promise<Awaited<ReturnType<typeof refreshYouTubeAccessToken>>>;
  refreshTikTokAccessToken(
    payload: Parameters<typeof refreshTikTokAccessToken>[0],
  ): Promise<Awaited<ReturnType<typeof refreshTikTokAccessToken>>>;
  fetchYouTubePublicationState(
    payload: Parameters<typeof fetchYouTubePublicationState>[0],
  ): Promise<Awaited<ReturnType<typeof fetchYouTubePublicationState>>>;
  fetchTikTokPublicationState(
    payload: Parameters<typeof fetchTikTokPublicationState>[0],
  ): Promise<Awaited<ReturnType<typeof fetchTikTokPublicationState>>>;
};

export type ProcessPublicationJobOptions = {
  fetchFn?: typeof fetch;
  publicationStore: PublicationStore;
  workerConfig: PublishingWorkerConfig;
};

export class PermanentPublicationExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentPublicationExecutionError";
  }
}

export async function processPublicationExecutionJob(
  job: Pick<Job, "attemptsMade" | "data" | "discard" | "id" | "opts">,
  {
    fetchFn = fetch,
    publicationStore,
    workerConfig,
  }: ProcessPublicationJobOptions,
): Promise<{ externalPostId: string; externalUrl: string | null }> {
  const payload = publicationExecutionJobDataSchema.parse(job.data);
  const now = new Date();
  const maxRetries = getBullMqAttempts(job);
  const encryptionKey = getEncryptionKey(workerConfig.appEncryptionKey);
  const publication = await loadPublication({
    publicationStore,
    publicationId: payload.content_publication_id,
    userId: payload.user_id,
  });
  const initialPublicationStatus = publication?.publication_status ?? null;

  if (!publication) {
    throw new PermanentPublicationExecutionError(
      `Publication ${payload.content_publication_id} was not found for user_id=${payload.user_id}.`,
    );
  }

  let publishingStarted = false;

  try {
    if (publication.target_platform !== payload.target_platform) {
      throw new PermanentPublicationExecutionError(
        `Publication ${publication.id} target platform ${publication.target_platform} does not match the queued execution job.`,
      );
    }

    if (publication.publication_status === "published") {
      if (!publication.external_post_id || !publication.external_url) {
        throw new PermanentPublicationExecutionError(
          `Publication ${publication.id} is already published but missing an external post reference.`,
        );
      }

      return {
        externalPostId: publication.external_post_id,
        externalUrl: publication.external_url,
      };
    }

    if (
      !["validated", "queued", "publishing", "failed_retryable"].includes(
        publication.publication_status,
      )
    ) {
      throw new PermanentPublicationExecutionError(
        `Publication ${publication.id} is not ready for execution.`,
      );
    }

    const snapshot = publicationSnapshotSchema.parse(publication.snapshot);

    const loadedContentJob = await loadContentJob({
      publicationStore,
      contentJobId: publication.content_job_id,
      userId: publication.user_id,
    });
    if (!loadedContentJob) {
      throw new PermanentPublicationExecutionError(
        `Publication ${publication.id} references a missing repurposing job.`,
      );
    }

    validatePublicationContract({
      contentJob: loadedContentJob,
      publication,
      snapshot,
    });

    const loadedConnection = await loadPlatformConnection({
      publicationStore,
      userId: publication.user_id,
      connectionId: publication.platform_connection_id,
    });
    if (!loadedConnection) {
      throw new PermanentPublicationExecutionError(
        `Publication ${publication.id} references a missing platform connection.`,
      );
    }
    validateProviderConnectionForPublication({
      connection: loadedConnection,
      targetPlatform: publication.target_platform,
    });

    const vodAsset = await loadVodAsset({
      publicationStore,
      streamId: loadedContentJob.stream_id,
      userId: publication.user_id,
    });
    if (!vodAsset) {
      throw new PermanentPublicationExecutionError(
        `Publication ${publication.id} has no publishable asset.`,
      );
    }

    await publicationStore.patchPublicationById({
      payload: {
        max_retries: maxRetries,
        next_retry_at: null,
        provider_failure_code: null,
        provider_failure_metadata: {},
        provider_failure_reason: null,
        publication_status: "publishing",
        reconciliation_status: publication.reconciliation_status ?? "idle",
        retry_count: job.attemptsMade,
      },
      publicationId: publication.id,
      userId: publication.user_id,
    });
    await publicationStore.appendEvent({
      actorId: publication.requested_by,
      eventType: "publishing",
      metadata: {
        content_job_id: publication.content_job_id,
        queue_job_id: job.id ?? getPublicationExecutionJobId(publication.id),
        publish_kind: snapshot.capability.canonicalDraft.publishKind,
        publishable_asset_id: vodAsset.id,
        publication_snapshot_hash: publication.snapshot_hash,
        request_intent_hash: publication.request_intent_hash,
        target_platform: publication.target_platform,
      },
      previousPublicationStatus: initialPublicationStatus,
      publicationId: publication.id,
      publicationStatus: "publishing",
      source: "publishing-worker",
      userId: publication.user_id,
    });
    publishingStarted = true;

    const accessToken = await resolveProviderAccessToken({
      connection: loadedConnection,
      encryptionKey,
      fetchFn,
      publicationStore,
      userId: publication.user_id,
      workerConfig,
    });

    const draft = snapshot.capability.canonicalDraft;
    const result =
      publication.target_platform === "youtube"
        ? await publishYouTubeVideo({
            accessToken,
            assetUrl: vodAsset.source_url,
            description: draft.description,
            fetchFn,
            hashtags: draft.hashtags,
            signal: undefined,
            title: draft.title,
            visibility: draft.visibility,
          })
        : await publishTikTokVideo({
            accessToken,
            assetUrl: vodAsset.source_url,
            description: draft.description,
            fetchFn,
            hashtags: draft.hashtags,
            signal: undefined,
            title: draft.title,
            visibility: draft.visibility,
          });

    await publicationStore.patchPublicationById({
      payload: {
        external_post_id: result.externalPostId,
        external_url: result.externalUrl,
        max_retries: maxRetries,
        next_retry_at: null,
        publication_status: "published",
        provider_failure_code: null,
        provider_failure_metadata: {},
        provider_failure_reason: null,
        reconciliation_status: "idle",
        retry_count: job.attemptsMade,
      },
      publicationId: publication.id,
      userId: publication.user_id,
    });
    await publicationStore.appendEvent({
      actorId: publication.requested_by,
      eventType: "published",
      metadata: {
        content_job_id: publication.content_job_id,
        external_post_id: result.externalPostId,
        external_url: result.externalUrl,
        queue_job_id: job.id ?? getPublicationExecutionJobId(publication.id),
        publication_snapshot_hash: publication.snapshot_hash,
        request_intent_hash: publication.request_intent_hash,
        target_platform: publication.target_platform,
      },
      previousPublicationStatus: "publishing",
      publicationId: publication.id,
      publicationStatus: "published",
      source: "publishing-worker",
      userId: publication.user_id,
    });

    return result;
  } catch (error) {
    const classification = classifyExecutionFailure(error);
    const hasRemainingAttempts = hasRemainingBullMqAttempts(job);
    const retryable = classification.retryable && hasRemainingAttempts;
    const failureStatus = retryable ? "failed_retryable" : "failed_permanent";
    const retryCount = job.attemptsMade + 1;
    const nextAttemptInMs = retryable
      ? getBullMqBackoffDelayMs(job, retryCount)
      : null;

    await publicationStore.patchPublicationById({
      payload: {
        max_retries: maxRetries,
        next_retry_at: retryable
          ? new Date(now.getTime() + (nextAttemptInMs ?? 0)).toISOString()
          : null,
        provider_failure_code: classification.code,
        provider_failure_metadata: {
          error_message:
            error instanceof Error ? error.message : "Unknown publish error.",
          next_attempt_in_ms: nextAttemptInMs,
          retry_after_seconds: classification.retryAfterSeconds ?? null,
          retryable,
          upstream_status: classification.upstreamStatus ?? null,
        },
        provider_failure_reason:
          error instanceof Error ? error.message : "Unknown publish error.",
        publication_status: failureStatus,
        reconciliation_status: publication?.reconciliation_status ?? "idle",
        retry_count: retryCount,
      },
      publicationId: publication.id,
      userId: publication.user_id,
    });
    await publicationStore.appendEvent({
      actorId: publication.requested_by,
      eventType: failureStatus,
      metadata: {
        content_job_id: publication.content_job_id,
        error_code: classification.code,
        error_message:
          error instanceof Error ? error.message : "Unknown publish error.",
        next_attempt_in_ms: nextAttemptInMs,
        queue_job_id: job.id ?? getPublicationExecutionJobId(publication.id),
        retry_after_seconds: classification.retryAfterSeconds ?? null,
        retry_count: retryCount,
        retry_owner: retryable ? "bullmq" : null,
        retryable,
        target_platform: publication.target_platform,
        upstream_status: classification.upstreamStatus ?? null,
      },
      previousPublicationStatus: publishingStarted
        ? "publishing"
        : initialPublicationStatus,
      publicationId: publication.id,
      publicationStatus: failureStatus,
      source: "publishing-worker",
      userId: publication.user_id,
    });

    if (!retryable) {
      await job.discard();
    }

    throw error;
  }
}

export async function processPublicationReconciliationJob(
  job: Pick<Job, "attemptsMade" | "data" | "discard" | "id" | "opts">,
  {
    fetchFn = fetch,
    publicationStore,
    workerConfig,
  }: ProcessPublicationJobOptions,
): Promise<{
  effectiveVisibility: string | null;
  remotePostId: string;
  remoteProcessingStatus: string | null;
  remoteStatus: string;
  remoteUploadStatus: string | null;
  remoteUrl: string | null;
  rejectionReason: string | null;
}> {
  const payload = publicationReconciliationJobDataSchema.parse(job.data);
  const now = new Date();
  const maxRetries = getBullMqAttempts(job);
  const encryptionKey = getEncryptionKey(workerConfig.appEncryptionKey);
  const publication = await loadPublication({
    publicationStore,
    publicationId: payload.content_publication_id,
    userId: payload.user_id,
  });

  if (!publication) {
    throw new PermanentPublicationReconciliationError(
      `Publication ${payload.content_publication_id} was not found for user_id=${payload.user_id}.`,
    );
  }

  try {
    if (
      publication.target_platform !== "youtube" &&
      publication.target_platform !== "tiktok"
    ) {
      throw new PermanentPublicationReconciliationError(
        `Publication ${publication.id} target platform ${publication.target_platform} is not supported by publishing-worker reconciliation.`,
      );
    }

    const remotePublishId =
      publication.external_post_id ??
      getRemotePublishId(publication.remote_state);
    if (!remotePublishId) {
      throw new PermanentPublicationReconciliationError(
        `Publication ${publication.id} has no remote publish id to reconcile.`,
      );
    }

    if (
      !["queued", "publishing", "published", "failed_retryable"].includes(
        publication.publication_status,
      )
    ) {
      throw new PermanentPublicationReconciliationError(
        `Publication ${publication.id} is not ready for reconciliation.`,
      );
    }

    const loadedConnection = await loadPlatformConnection({
      publicationStore,
      userId: publication.user_id,
      connectionId: publication.platform_connection_id,
    });
    if (!loadedConnection) {
      throw new PermanentPublicationReconciliationError(
        `Publication ${publication.id} references a missing platform connection.`,
      );
    }
    validateProviderConnectionForReconciliation({
      connection: loadedConnection,
      targetPlatform: publication.target_platform,
    });

    const accessToken = await resolveProviderAccessToken({
      connection: loadedConnection,
      encryptionKey,
      fetchFn,
      publicationStore,
      userId: publication.user_id,
      workerConfig,
    });

    const remoteState =
      publication.target_platform === "youtube"
        ? await fetchYouTubePublicationState({
            accessToken,
            externalPostId: remotePublishId,
            fetchFn,
          })
        : await fetchTikTokPublicationState({
            accessToken,
            externalPostId: remotePublishId,
            fetchFn,
          });

    const reconciledAt = now.toISOString();
    const reconciliationSnapshot = buildPublicationRemoteState({
      publication,
      reconciledAt,
      remoteState,
    });
    await publicationStore.patchPublicationById({
      payload: {
        effective_visibility: remoteState.effectiveVisibility,
        last_reconciled_at: reconciledAt,
        max_retries: publication.max_retries,
        next_retry_at: null,
        provider_failure_code: null,
        provider_failure_metadata: {},
        provider_failure_reason: null,
        published_at: publication.published_at,
        publication_status: publication.publication_status,
        reconciliation_status: "reconciled",
        reconcile_max_retries: maxRetries,
        reconcile_next_retry_at: null,
        reconcile_retry_count: job.attemptsMade,
        remote_processing_status: remoteState.remoteProcessingStatus,
        remote_state: reconciliationSnapshot,
        remote_status: remoteState.remoteStatus,
        remote_upload_status: remoteState.remoteUploadStatus,
      },
      publicationId: publication.id,
      userId: publication.user_id,
    });
    await publicationStore.appendEvent({
      actorId: publication.requested_by,
      eventType: "reconciled",
      metadata: {
        content_job_id: publication.content_job_id,
        effective_visibility: remoteState.effectiveVisibility,
        external_post_id: remoteState.remotePostId,
        queue_job_id:
          job.id ?? getPublicationReconciliationJobId(publication.id),
        reconciled_at: reconciledAt,
        reconciliation_status: "reconciled",
        remote_processing_status: remoteState.remoteProcessingStatus,
        remote_status: remoteState.remoteStatus,
        remote_upload_status: remoteState.remoteUploadStatus,
        remote_url: remoteState.remoteUrl,
        snapshot_hash: publication.snapshot_hash,
        target_platform: publication.target_platform,
      },
      previousPublicationStatus: publication.publication_status,
      publicationId: publication.id,
      publicationStatus: publication.publication_status,
      source: "publishing-worker",
      userId: publication.user_id,
    });

    return remoteState;
  } catch (error) {
    const classification = classifyReconciliationFailure(error);
    const hasRemainingAttempts = hasRemainingBullMqAttempts(job);
    const retryable = classification.retryable && hasRemainingAttempts;
    const failureStatus = retryable ? "failed_retryable" : "failed_permanent";
    const retryCount = job.attemptsMade + 1;
    const nextAttemptInMs = retryable
      ? getBullMqBackoffDelayMs(job, retryCount)
      : null;
    const failureReason =
      error instanceof Error ? error.message : "Unknown reconciliation error.";

    await publicationStore.patchPublicationById({
      payload: {
        last_reconciled_at: now.toISOString(),
        max_retries: publication.max_retries,
        next_retry_at: null,
        provider_failure_code: classification.code,
        provider_failure_metadata: {
          error_message: failureReason,
          next_attempt_in_ms: nextAttemptInMs,
          retry_after_seconds: classification.retryAfterSeconds ?? null,
          retryable,
          upstream_status: classification.upstreamStatus ?? null,
        },
        provider_failure_reason: failureReason,
        publication_status: publication.publication_status,
        reconciliation_status: failureStatus,
        reconcile_max_retries: maxRetries,
        reconcile_next_retry_at: retryable
          ? new Date(now.getTime() + (nextAttemptInMs ?? 0)).toISOString()
          : null,
        reconcile_retry_count: retryCount,
        remote_processing_status: publication.remote_processing_status,
        remote_state: publication.remote_state,
        remote_status: publication.remote_status,
        remote_upload_status: publication.remote_upload_status,
      },
      publicationId: publication.id,
      userId: publication.user_id,
    });
    await publicationStore.appendEvent({
      actorId: publication.requested_by,
      eventType: failureStatus,
      metadata: {
        content_job_id: publication.content_job_id,
        error_code: classification.code,
        error_message: failureReason,
        next_attempt_in_ms: nextAttemptInMs,
        queue_job_id:
          job.id ?? getPublicationReconciliationJobId(publication.id),
        retry_after_seconds: classification.retryAfterSeconds ?? null,
        retry_count: retryCount,
        retry_owner: retryable ? "bullmq" : null,
        retryable,
        target_platform: publication.target_platform,
        upstream_status: classification.upstreamStatus ?? null,
      },
      previousPublicationStatus: publication.publication_status,
      publicationId: publication.id,
      publicationStatus: publication.publication_status,
      source: "publishing-worker",
      userId: publication.user_id,
    });

    if (!retryable) {
      await job.discard();
    }

    throw error;
  }
}

function validatePublicationContract({
  contentJob,
  publication,
  snapshot,
}: {
  contentJob: PublicationContentJobRow;
  publication: PublicationRow;
  snapshot: z.infer<typeof publicationSnapshotSchema>;
}): void {
  if (
    contentJob.job_type !== "repurposing" ||
    contentJob.type !== "repurposing"
  ) {
    throw new PermanentPublicationExecutionError(
      `Publication ${publication.id} references a non-repurposing job.`,
    );
  }

  if (contentJob.review_status !== "approved") {
    throw new PermanentPublicationExecutionError(
      `Publication ${publication.id} references a job that is not approved.`,
    );
  }

  if (!["done", "completed"].includes(contentJob.status)) {
    throw new PermanentPublicationExecutionError(
      `Publication ${publication.id} references a job that is not complete.`,
    );
  }

  if (snapshot.approvedBundle.manual_review_required !== true) {
    throw new PermanentPublicationExecutionError(
      `Publication ${publication.id} does not require manual review in the frozen snapshot.`,
    );
  }

  if (snapshot.approvedBundle.content_job_id !== contentJob.id) {
    throw new PermanentPublicationExecutionError(
      `Publication ${publication.id} snapshot content job does not match the loaded job.`,
    );
  }

  if (snapshot.approvedBundle.queue_job_id !== contentJob.queue_job_id) {
    throw new PermanentPublicationExecutionError(
      `Publication ${publication.id} snapshot queue job does not match the loaded job.`,
    );
  }

  if (snapshot.contentJob.id !== contentJob.id) {
    throw new PermanentPublicationExecutionError(
      `Publication ${publication.id} snapshot job id does not match the loaded job.`,
    );
  }

  if (snapshot.contentJob.queueJobId !== contentJob.queue_job_id) {
    throw new PermanentPublicationExecutionError(
      `Publication ${publication.id} snapshot queue id does not match the loaded job.`,
    );
  }

  if (snapshot.targetPlatform !== publication.target_platform) {
    throw new PermanentPublicationExecutionError(
      `Publication ${publication.id} snapshot target platform is unsupported.`,
    );
  }

  if (snapshot.platformConnection.id !== publication.platform_connection_id) {
    throw new PermanentPublicationExecutionError(
      `Publication ${publication.id} snapshot connection does not match the publication row.`,
    );
  }

  if (snapshot.contentJob.reviewStatus !== "approved") {
    throw new PermanentPublicationExecutionError(
      `Publication ${publication.id} snapshot review status is not approved.`,
    );
  }
}

function validateProviderConnectionForPublication({
  connection,
  targetPlatform,
}: {
  connection: PublicationConnectionRow;
  targetPlatform: "tiktok" | "youtube";
}): void {
  if (
    connection.platform !== targetPlatform ||
    !isRefreshableConnectionStatus(connection.status)
  ) {
    throw new PermanentPublicationExecutionError(
      "Platform connection is not valid for publication execution.",
    );
  }

  if (
    targetPlatform === "youtube" &&
    !hasAnyScope(connection.scopes, [
      "youtube.upload",
      "https://www.googleapis.com/auth/youtube.upload",
    ])
  ) {
    throw new PermanentPublicationExecutionError(
      "Platform connection is missing the required publication scope.",
    );
  }

  if (
    targetPlatform === "tiktok" &&
    !hasAnyScope(connection.scopes, [
      "video.publish",
      "video.upload",
      "tiktok.video.publish",
    ])
  ) {
    throw new PermanentPublicationExecutionError(
      "Platform connection is missing the required publication scope.",
    );
  }
}

function validateProviderConnectionForReconciliation({
  connection,
  targetPlatform,
}: {
  connection: PublicationConnectionRow;
  targetPlatform: "tiktok" | "youtube";
}): void {
  if (
    connection.platform !== targetPlatform ||
    !isRefreshableConnectionStatus(connection.status)
  ) {
    throw new PermanentPublicationReconciliationError(
      "Platform connection is not valid for publication reconciliation.",
    );
  }
}

function hasAnyScope(scopes: string[], acceptedScopes: string[]): boolean {
  const normalizedScopes = new Set(scopes.map((scope) => scope.trim()));
  return acceptedScopes.some((scope) => normalizedScopes.has(scope));
}

function isRefreshableConnectionStatus(
  status: PublicationConnectionRow["status"],
): boolean {
  return status === "connected" || status === "expired";
}

function classifyExecutionFailure(error: unknown): {
  code: string;
  retryAfterSeconds?: number;
  retryable: boolean;
  upstreamStatus?: number;
} {
  if (
    error instanceof YouTubePublishError ||
    error instanceof TikTokPublishError
  ) {
    return {
      code: error.code,
      retryAfterSeconds: error.retryAfterSeconds,
      retryable: error.retryable,
      upstreamStatus: error.upstreamStatus,
    };
  }

  if (error instanceof PermanentPublicationExecutionError) {
    return {
      code: "publication_not_ready",
      retryable: false,
    };
  }

  return {
    code: "publication_execution_failed",
    retryable: true,
  };
}

function classifyReconciliationFailure(error: unknown): {
  code: string;
  retryAfterSeconds?: number;
  retryable: boolean;
  upstreamStatus?: number;
} {
  if (
    error instanceof YouTubePublishError ||
    error instanceof TikTokPublishError
  ) {
    const code = normalizeReconciliationFailureCode(
      error.code,
      error.retryable,
    );
    return {
      code,
      retryAfterSeconds: error.retryAfterSeconds,
      retryable: normalizeReconciliationRetryable(error.code, error.retryable),
      upstreamStatus: error.upstreamStatus,
    };
  }

  if (error instanceof PermanentPublicationReconciliationError) {
    return {
      code: "remote_state_unavailable",
      retryable: false,
    };
  }

  return {
    code: "remote_state_unavailable",
    retryable: true,
  };
}

async function resolveProviderAccessToken({
  connection,
  encryptionKey,
  fetchFn,
  publicationStore,
  userId,
  workerConfig,
}: {
  connection: PublicationConnectionRow;
  encryptionKey: Buffer;
  fetchFn: typeof fetch;
  publicationStore: PublicationStore;
  userId: string;
  workerConfig: PublishingWorkerConfig;
}): Promise<string> {
  const expiresAtMs = parseIsoDateMs(connection.expires_at);
  const shouldRefresh =
    connection.status === "expired" ||
    !connection.access_token_ciphertext ||
    expiresAtMs <= Date.now() + 60_000;

  if (!shouldRefresh) {
    if (!connection.access_token_ciphertext) {
      throw new PermanentPublicationExecutionError(
        "Platform connection has no encrypted access token.",
      );
    }

    try {
      return decryptSecretWithKey(
        connection.access_token_ciphertext,
        encryptionKey,
      );
    } catch {
      throw new PermanentPublicationExecutionError(
        "Could not decrypt platform access token.",
      );
    }
  }

  if (!connection.refresh_token_ciphertext) {
    throw new PermanentPublicationExecutionError(
      "Platform connection has no refresh token.",
    );
  }

  const refreshToken = decryptSecretWithKey(
    connection.refresh_token_ciphertext,
    encryptionKey,
  );

  const refreshed =
    connection.platform === "tiktok"
      ? await refreshTikTokAccessToken({
          clientKey: workerConfig.tiktokClientKey,
          clientSecret: workerConfig.tiktokClientSecret,
          fetchFn,
          refreshToken,
        })
      : await refreshYouTubeAccessToken({
          fetchFn,
          refreshToken,
          workerConfig: {
            youtubeClientId: workerConfig.youtubeClientId,
            youtubeClientSecret: workerConfig.youtubeClientSecret,
          },
        });

  const nextAccessTokenCiphertext = encryptSecretWithKey(
    refreshed.accessToken,
    encryptionKey,
  );
  const nextRefreshTokenCiphertext = refreshed.refreshToken
    ? encryptSecretWithKey(refreshed.refreshToken, encryptionKey)
    : connection.refresh_token_ciphertext;

  await publicationStore.patchPlatformConnection({
    connectionId: connection.id,
    payload: {
      access_token_ciphertext: nextAccessTokenCiphertext,
      expires_at: refreshed.expiresAt,
      refresh_token_ciphertext: nextRefreshTokenCiphertext,
      scopes: refreshed.scopes ?? connection.scopes,
      status: "connected",
    },
    userId,
  });

  return refreshed.accessToken;
}

function buildPublicationRemoteState({
  publication,
  reconciledAt,
  remoteState,
}: {
  publication: PublicationRow;
  reconciledAt: string;
  remoteState: {
    effectiveVisibility: string | null;
    providerStatus?: string | null;
    providerUploadStatus?: string | null;
    remotePostId: string;
    remoteProcessingStatus: string | null;
    remoteStatus: string;
    remoteUploadStatus: string | null;
    remoteUrl: string | null;
    rejectionReason: string | null;
  };
}): Record<string, unknown> {
  return {
    desiredVisibility: publication.desired_visibility,
    effectiveVisibility: remoteState.effectiveVisibility,
    provider: publication.target_platform,
    providerMediaType: "video",
    providerMode: "direct_post",
    providerPostId: remoteState.remotePostId,
    providerPublishId: remoteState.remotePostId,
    providerStatus: remoteState.providerStatus ?? remoteState.remoteStatus,
    providerUploadStatus:
      remoteState.providerUploadStatus ?? remoteState.remoteUploadStatus,
    remotePostId: remoteState.remotePostId,
    remoteProcessingStatus: remoteState.remoteProcessingStatus,
    remoteStatus: remoteState.remoteStatus,
    remoteUploadStatus: remoteState.remoteUploadStatus,
    remoteUrl: remoteState.remoteUrl,
    reconciledAt,
    rejectionReason: remoteState.rejectionReason,
    snapshotHash: publication.snapshot_hash,
  };
}

function getRemotePublishId(
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
    remoteState.remotePostId,
    remoteState.post_id,
    remoteState.publish_id,
  ].find((value) => typeof value === "string" && value.trim().length > 0);

  return typeof candidate === "string" ? candidate.trim() : null;
}

async function loadPublication({
  publicationStore,
  publicationId,
  userId,
}: {
  publicationStore: PublicationStore;
  publicationId: string;
  userId: string;
}): Promise<PublicationRow | null> {
  return publicationStore.loadPublicationById({ publicationId, userId });
}

async function loadContentJob({
  publicationStore,
  contentJobId,
  userId,
}: {
  publicationStore: PublicationStore;
  contentJobId: string;
  userId: string;
}): Promise<PublicationContentJobRow | null> {
  return publicationStore.loadContentJobById({ contentJobId, userId });
}

async function loadPlatformConnection({
  publicationStore,
  connectionId,
  userId,
}: {
  publicationStore: PublicationStore;
  connectionId: string;
  userId: string;
}): Promise<PublicationConnectionRow | null> {
  return publicationStore.loadPlatformConnectionById({ connectionId, userId });
}

async function loadVodAsset({
  publicationStore,
  streamId,
  userId,
}: {
  publicationStore: PublicationStore;
  streamId: string | null;
  userId: string;
}): Promise<PublicationVodAssetRow | null> {
  return publicationStore.loadVodAssetByStreamId({ streamId, userId });
}

function getBullMqAttempts(job: Pick<Job, "opts">): number {
  return typeof job.opts.attempts === "number" && job.opts.attempts > 0
    ? job.opts.attempts
    : 1;
}

function getBullMqBackoffDelayMs(
  job: Pick<Job, "opts">,
  attemptNumber: number,
): number | null {
  const backoff = job.opts.backoff;

  if (typeof backoff === "number") {
    return backoff;
  }

  if (!backoff || typeof backoff !== "object") {
    return null;
  }

  const delay =
    typeof backoff.delay === "number" && backoff.delay >= 0
      ? backoff.delay
      : null;

  if (delay === null) {
    return null;
  }

  if (backoff.type === "exponential") {
    return delay * 2 ** Math.max(attemptNumber - 1, 0);
  }

  return delay;
}

function hasRemainingBullMqAttempts(
  job: Pick<Job, "attemptsMade" | "opts">,
): boolean {
  return job.attemptsMade + 1 < getBullMqAttempts(job);
}

function normalizeReconciliationFailureCode(
  code: string,
  retryable: boolean,
): string {
  if (
    code === "missing_remote_post_id" ||
    code === "remote_post_missing" ||
    code === "remote_post_rejected" ||
    code === "provider_fetch_failed" ||
    code === "provider_rate_limited" ||
    code === "provider_unauthorized" ||
    code === "provider_unavailable" ||
    code === "remote_state_unavailable"
  ) {
    return code;
  }

  if (code.includes("rate_limited")) {
    return "provider_rate_limited";
  }

  if (code.includes("unauthorized")) {
    return "provider_unauthorized";
  }

  if (code.includes("retryable") || retryable) {
    return "provider_unavailable";
  }

  if (code.includes("missing")) {
    return "remote_state_unavailable";
  }

  return "remote_state_unavailable";
}

function normalizeReconciliationRetryable(
  code: string,
  retryable: boolean,
): boolean {
  if (code === "provider_rate_limited") {
    return true;
  }

  if (code === "provider_unauthorized" || code === "remote_post_missing") {
    return false;
  }

  if (code === "remote_post_rejected" || code === "missing_remote_post_id") {
    return false;
  }

  if (code === "provider_fetch_failed") {
    return false;
  }

  return retryable;
}

function parseIsoDateMs(value: string | null | undefined): number {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}
