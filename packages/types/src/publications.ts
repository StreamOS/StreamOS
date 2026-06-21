import { createHash } from "node:crypto";
import type {
  ConnectionStatus,
  ContentJobReviewStatus,
  ContentJobStatus,
  ContentPublicationStatus,
  RepurposingPlanResult,
  StreamPlatform,
} from "./index.js";
import type {
  ContentPublicationScheduleBlockReason,
  ContentPublicationScheduleSource,
  ContentPublicationScheduleStatus,
  ContentPublicationScheduleSummary,
} from "./publication-scheduling.js";

export const PUBLICATION_CAPABILITY_VERSION = "2026.06.p3.2.v1" as const;

export const PUBLICATION_CAPABILITY_SUPPORT_STATUSES = [
  "supported",
  "conditional",
  "unsupported",
  "experimental",
] as const;

export type PublicationCapabilitySupportStatus =
  (typeof PUBLICATION_CAPABILITY_SUPPORT_STATUSES)[number];

export const PUBLICATION_CANONICAL_FIELD_KEYS = [
  "publishKind",
  "formatProfile",
  "title",
  "description",
  "hashtags",
  "visibility",
  "scheduledPublishAt",
  "disclosureIntent",
  "audienceClassification",
  "assetReference",
] as const;

export type PublicationCanonicalFieldKey =
  (typeof PUBLICATION_CANONICAL_FIELD_KEYS)[number];

export type PublicationFieldGroup =
  | "canonical"
  | "provider_mapped"
  | "provider_specific";

export type PublicationCapabilityIssueSeverity = "blocking" | "warning";

export const PUBLICATION_CAPABILITY_ISSUE_CODES = [
  "account_capability_missing",
  "conditional_field_unresolved",
  "invalid_provider_override_value",
  "missing_required_canonical_field",
  "policy_blocked",
  "provider_override_mismatch",
  "provider_override_unsupported_field",
  "unsupported_capability_version",
  "unsupported_target_platform",
] as const;

export type PublicationCapabilityIssueCode =
  (typeof PUBLICATION_CAPABILITY_ISSUE_CODES)[number];

export type PublicationCapabilityIssue = {
  code: PublicationCapabilityIssueCode;
  field?: string;
  message: string;
  provider: StreamPlatform;
  severity: PublicationCapabilityIssueSeverity;
};

export type PublicationCapabilityFieldRule = {
  allowedValues?: readonly string[];
  canonicalKey?: PublicationCanonicalFieldKey;
  defaultValue?: unknown;
  dynamic?: boolean;
  group: PublicationFieldGroup;
  key: string;
  label: string;
  notes?: string[];
  required: boolean;
  supportStatus: PublicationCapabilitySupportStatus;
};

export type PublicationAccountCapabilityOverlay = {
  allowedCommentControls?: string[];
  allowedDuetControls?: string[];
  allowedStitchControls?: string[];
  allowedVisibility?: string[];
  capabilityStatus?: PublicationCapabilitySupportStatus;
  notes?: string[];
  maxVideoDurationSeconds?: number;
  schedulingAllowed?: boolean;
};

export type PublicationCapabilityPolicy = {
  allowedTargets?: StreamPlatform[];
  blockedTargets?: StreamPlatform[];
  forbidAutoPublish?: boolean;
  requireManualReview?: boolean;
};

export type PublicationCanonicalAssetReference = {
  contentJobId: string;
  queueJobId: string;
  sourcePlatform: StreamPlatform;
  streamId: string | null;
};

export type PublicationCanonicalDraft = {
  assetReference: PublicationCanonicalAssetReference;
  audienceClassification: "adult" | "all_audiences" | "general" | "teen";
  description: string;
  disclosureIntent: {
    containsAffiliateLinks: boolean;
    containsAIGeneratedAssets: boolean;
    containsSponsoredContent: boolean;
    manualReviewRequired: true;
    warnings: string[];
  };
  formatProfile: "long_form" | "short_form";
  hashtags: string[];
  publishKind: "video";
  scheduledPublishAt: string | null;
  title: string;
  visibility: "friends_only" | "private" | "public" | "unlisted";
};

export type PublicationProviderOverrides = Partial<
  Record<StreamPlatform, Record<string, unknown>>
>;

export type PublicationCapabilityDefinition = {
  canonicalFields: PublicationCapabilityFieldRule[];
  capabilityVersion: string;
  dynamicCapabilityKeys: string[];
  notes: string[];
  providerMappedFields: PublicationCapabilityFieldRule[];
  providerSpecificFields: PublicationCapabilityFieldRule[];
  providerSupportStatus: PublicationCapabilitySupportStatus;
  requiredScopes: string[];
  targetPlatform: StreamPlatform;
};

export type PublicationCapabilityResolution = {
  accountCapabilities: PublicationAccountCapabilityOverlay;
  blockingErrors: PublicationCapabilityIssue[];
  capabilityVersion: string;
  canonicalDraft: PublicationCanonicalDraft;
  canonicalFields: PublicationCapabilityFieldRule[];
  dynamicCapabilityKeys: string[];
  ignoredFields: string[];
  providerMappedFields: PublicationCapabilityFieldRule[];
  providerOverrides: PublicationProviderOverrides;
  providerPayloadPreview: Record<string, unknown>;
  providerSpecificFields: PublicationCapabilityFieldRule[];
  providerSupportStatus: PublicationCapabilitySupportStatus;
  resolvedDefaults: Record<string, unknown>;
  targetPlatform: StreamPlatform;
  unsupportedFields: string[];
  warnings: PublicationCapabilityIssue[];
};

export const PUBLICATION_RECONCILIATION_STATUSES = [
  "idle",
  "queued",
  "reconciling",
  "reconciled",
  "failed_retryable",
  "failed_permanent",
  "skipped",
] as const;

export type PublicationReconciliationStatus =
  (typeof PUBLICATION_RECONCILIATION_STATUSES)[number];

export const PUBLICATION_REMOTE_STATUSES = [
  "missing",
  "processing",
  "published",
  "rejected",
  "unknown",
] as const;

export type PublicationRemoteStatus =
  (typeof PUBLICATION_REMOTE_STATUSES)[number];

export const PUBLICATION_PROVIDER_FAILURE_CODES = [
  "missing_remote_post_id",
  "remote_post_missing",
  "remote_post_rejected",
  "provider_fetch_failed",
  "provider_rate_limited",
  "provider_unauthorized",
  "provider_unavailable",
  "remote_state_unavailable",
] as const;

export type PublicationProviderFailureCode =
  (typeof PUBLICATION_PROVIDER_FAILURE_CODES)[number];

export type PublicationRemoteVisibility =
  | "private"
  | "public"
  | "unknown"
  | "unlisted";

export type PublicationRemoteState = {
  desiredVisibility: PublicationCanonicalDraft["visibility"];
  effectiveVisibility: PublicationRemoteVisibility;
  provider: "youtube" | "tiktok";
  providerMediaType?: "video";
  providerMode?: "direct_post";
  providerPostId?: string | null;
  providerPublishId?: string | null;
  providerPublicPostIds?: string[];
  providerStatus?: string | null;
  providerUploadStatus?: string | null;
  remotePostId: string;
  remoteProcessingStatus: string | null;
  remoteStatus: PublicationRemoteStatus;
  remoteUploadStatus: string | null;
  remoteUrl: string | null;
  reconciledAt: string;
  rejectionReason: string | null;
  snapshotHash: string;
  creatorInfoSnapshot?: Record<string, unknown>;
};

const CANONICAL_VISIBILITY_VALUES = [
  "friends_only",
  "private",
  "public",
  "unlisted",
] as const;

const CANONICAL_AUDIENCE_CLASSIFICATIONS = [
  "adult",
  "all_audiences",
  "general",
  "teen",
] as const;

const YOUTUBE_SUPPORT: PublicationCapabilityDefinition = {
  canonicalFields: [
    field({
      group: "canonical",
      key: "publishKind",
      label: "Publish kind",
      required: true,
      supportStatus: "supported",
    }),
    field({
      allowedValues: ["long_form", "short_form"],
      group: "canonical",
      key: "formatProfile",
      label: "Format profile",
      notes: [
        "Shorts are modeled as a format profile on the canonical YouTube video publish contract.",
      ],
      required: true,
      supportStatus: "supported",
    }),
    field({
      group: "canonical",
      key: "title",
      label: "Title",
      required: true,
      supportStatus: "supported",
    }),
    field({
      group: "canonical",
      key: "description",
      label: "Description",
      required: true,
      supportStatus: "supported",
    }),
    field({
      group: "canonical",
      key: "hashtags",
      label: "Hashtags",
      required: true,
      supportStatus: "supported",
    }),
    field({
      allowedValues: CANONICAL_VISIBILITY_VALUES,
      group: "canonical",
      key: "visibility",
      label: "Visibility",
      required: true,
      supportStatus: "supported",
    }),
    field({
      group: "canonical",
      key: "scheduledPublishAt",
      label: "Scheduled publish time",
      notes: ["Scheduling is resolved server-side before execution."],
      required: false,
      supportStatus: "conditional",
    }),
    field({
      group: "canonical",
      key: "disclosureIntent",
      label: "Disclosure intent",
      required: true,
      supportStatus: "supported",
    }),
    field({
      allowedValues: CANONICAL_AUDIENCE_CLASSIFICATIONS,
      group: "canonical",
      key: "audienceClassification",
      label: "Audience classification",
      required: true,
      supportStatus: "supported",
    }),
    field({
      group: "canonical",
      key: "assetReference",
      label: "Asset reference",
      required: true,
      supportStatus: "supported",
    }),
  ],
  capabilityVersion: PUBLICATION_CAPABILITY_VERSION,
  dynamicCapabilityKeys: ["allowedVisibility", "schedulingAllowed"],
  notes: [
    "YouTube publishing stays on the canonical YouTube video contract.",
    "Provider-specific fields are namespaced and stay separate from the canonical core.",
  ],
  providerMappedFields: [
    field({
      allowedValues: ["private", "public", "unlisted"],
      canonicalKey: "visibility",
      group: "provider_mapped",
      key: "privacy_status",
      label: "Privacy status",
      required: true,
      supportStatus: "supported",
    }),
    field({
      canonicalKey: "hashtags",
      group: "provider_mapped",
      key: "tags",
      label: "Tags",
      required: false,
      supportStatus: "supported",
    }),
    field({
      canonicalKey: "audienceClassification",
      group: "provider_mapped",
      key: "made_for_kids",
      label: "Made for kids",
      required: false,
      supportStatus: "conditional",
    }),
    field({
      canonicalKey: "audienceClassification",
      group: "provider_mapped",
      key: "self_declared_made_for_kids",
      label: "Self-declared made for kids",
      required: false,
      supportStatus: "conditional",
    }),
  ],
  providerSpecificFields: [
    field({
      group: "provider_specific",
      key: "category_id",
      label: "Category ID",
      required: false,
      supportStatus: "conditional",
    }),
    field({
      defaultValue: true,
      group: "provider_specific",
      key: "notify_subscribers",
      label: "Notify subscribers",
      required: false,
      supportStatus: "supported",
    }),
    field({
      defaultValue: "youtube",
      group: "provider_specific",
      key: "license",
      label: "License",
      required: false,
      supportStatus: "supported",
    }),
    field({
      group: "provider_specific",
      key: "playlist_id",
      label: "Playlist ID",
      required: false,
      supportStatus: "conditional",
    }),
    field({
      group: "provider_specific",
      key: "thumbnail_url",
      label: "Thumbnail URL",
      required: false,
      supportStatus: "conditional",
    }),
  ],
  providerSupportStatus: "supported",
  requiredScopes: ["https://www.googleapis.com/auth/youtube.upload"],
  targetPlatform: "youtube",
};

const TIKTOK_SUPPORT: PublicationCapabilityDefinition = {
  canonicalFields: [
    field({
      group: "canonical",
      key: "publishKind",
      label: "Publish kind",
      required: true,
      supportStatus: "supported",
    }),
    field({
      allowedValues: ["short_form"],
      group: "canonical",
      key: "formatProfile",
      label: "Format profile",
      notes: ["TikTok is modeled as a dynamic short-form publish target."],
      required: true,
      supportStatus: "conditional",
    }),
    field({
      group: "canonical",
      key: "title",
      label: "Title",
      required: true,
      supportStatus: "supported",
    }),
    field({
      group: "canonical",
      key: "description",
      label: "Description",
      required: true,
      supportStatus: "supported",
    }),
    field({
      group: "canonical",
      key: "hashtags",
      label: "Hashtags",
      required: true,
      supportStatus: "supported",
    }),
    field({
      allowedValues: CANONICAL_VISIBILITY_VALUES,
      group: "canonical",
      key: "visibility",
      label: "Visibility",
      required: true,
      supportStatus: "conditional",
    }),
    field({
      group: "canonical",
      key: "scheduledPublishAt",
      label: "Scheduled publish time",
      notes: ["TikTok scheduling is resolved dynamically against the account."],
      required: false,
      supportStatus: "conditional",
    }),
    field({
      group: "canonical",
      key: "disclosureIntent",
      label: "Disclosure intent",
      required: true,
      supportStatus: "supported",
    }),
    field({
      allowedValues: CANONICAL_AUDIENCE_CLASSIFICATIONS,
      group: "canonical",
      key: "audienceClassification",
      label: "Audience classification",
      required: true,
      supportStatus: "conditional",
    }),
    field({
      group: "canonical",
      key: "assetReference",
      label: "Asset reference",
      required: true,
      supportStatus: "supported",
    }),
  ],
  capabilityVersion: PUBLICATION_CAPABILITY_VERSION,
  dynamicCapabilityKeys: [
    "allowedCommentControls",
    "allowedDuetControls",
    "allowedStitchControls",
    "allowedVisibility",
    "maxVideoDurationSeconds",
    "schedulingAllowed",
  ],
  notes: [
    "TikTok remains supported, but target-account capabilities can narrow the usable publish surface.",
    "Dynamic account capabilities are read from the linked platform connection when available.",
  ],
  providerMappedFields: [
    field({
      canonicalKey: "description",
      group: "provider_mapped",
      key: "caption",
      label: "Caption",
      required: true,
      supportStatus: "supported",
    }),
    field({
      allowedValues: [
        "PUBLIC_TO_EVERYONE",
        "FOLLOWER_OF_CREATOR",
        "MUTUAL_FOLLOW_FRIENDS",
        "SELF_ONLY",
      ],
      canonicalKey: "visibility",
      group: "provider_mapped",
      key: "privacy_level",
      label: "Privacy level",
      required: true,
      supportStatus: "conditional",
      dynamic: true,
    }),
    field({
      canonicalKey: "visibility",
      group: "provider_mapped",
      key: "comment_control",
      label: "Comment control",
      required: false,
      supportStatus: "conditional",
      dynamic: true,
    }),
    field({
      canonicalKey: "visibility",
      group: "provider_mapped",
      key: "duet_control",
      label: "Duet control",
      required: false,
      supportStatus: "conditional",
      dynamic: true,
    }),
    field({
      canonicalKey: "visibility",
      group: "provider_mapped",
      key: "stitch_control",
      label: "Stitch control",
      required: false,
      supportStatus: "conditional",
      dynamic: true,
    }),
  ],
  providerSpecificFields: [
    field({
      group: "provider_specific",
      key: "allow_comments",
      label: "Allow comments",
      required: false,
      supportStatus: "conditional",
    }),
    field({
      group: "provider_specific",
      key: "allow_duet",
      label: "Allow duet",
      required: false,
      supportStatus: "conditional",
    }),
    field({
      group: "provider_specific",
      key: "allow_stitch",
      label: "Allow stitch",
      required: false,
      supportStatus: "conditional",
    }),
    field({
      group: "provider_specific",
      key: "max_video_duration_seconds",
      label: "Maximum video duration",
      required: false,
      supportStatus: "conditional",
      dynamic: true,
    }),
  ],
  providerSupportStatus: "conditional",
  requiredScopes: ["video.publish"],
  targetPlatform: "tiktok",
};

const UNSUPPORTED_PROVIDER_NOTES = {
  kick: [
    "Kick publishing is currently unsupported by the publishing contract.",
  ],
  twitch: [
    "Twitch generic publishing is currently unsupported by the publishing contract.",
  ],
} satisfies Record<"kick" | "twitch", string[]>;

const UNSUPPORTED_MATRIX: Record<
  "kick" | "twitch",
  PublicationCapabilityDefinition
> = {
  kick: buildUnsupportedDefinition("kick", UNSUPPORTED_PROVIDER_NOTES.kick),
  twitch: buildUnsupportedDefinition(
    "twitch",
    UNSUPPORTED_PROVIDER_NOTES.twitch,
  ),
};

const PUBLISHING_MATRIX: Record<
  StreamPlatform,
  PublicationCapabilityDefinition
> = {
  kick: UNSUPPORTED_MATRIX.kick,
  tiktok: TIKTOK_SUPPORT,
  twitch: UNSUPPORTED_MATRIX.twitch,
  youtube: YOUTUBE_SUPPORT,
};

export function getPublicationCapabilityDefinition(
  targetPlatform: StreamPlatform,
): PublicationCapabilityDefinition {
  return PUBLISHING_MATRIX[targetPlatform];
}

export function buildCanonicalPublicationDraft({
  approvedBundle,
  contentJob,
  targetPlatform,
}: {
  approvedBundle: RepurposingPlanResult;
  contentJob: {
    id: string;
    queueJobId: string | null;
    streamId: string | null;
  };
  targetPlatform: StreamPlatform;
}): PublicationCanonicalDraft {
  const title = (firstNonEmpty(approvedBundle.title_suggestions) ??
    firstNonEmpty([approvedBundle.short_form_plan]) ??
    targetPlatform) as string;
  const description = (firstNonEmpty(approvedBundle.descriptions) ??
    firstNonEmpty([approvedBundle.short_form_plan]) ??
    title) as string;
  const hashtags = (firstNonEmpty(approvedBundle.hashtag_sets) ??
    []) as string[];

  return {
    assetReference: {
      contentJobId: approvedBundle.content_job_id,
      queueJobId: approvedBundle.queue_job_id,
      sourcePlatform: targetPlatform,
      streamId: contentJob.streamId,
    },
    audienceClassification: "general",
    description,
    disclosureIntent: {
      containsAffiliateLinks: false,
      containsAIGeneratedAssets: approvedBundle.provider === "openai",
      containsSponsoredContent: false,
      manualReviewRequired: true,
      warnings: [...approvedBundle.warnings],
    },
    formatProfile: targetPlatform === "tiktok" ? "short_form" : "long_form",
    hashtags,
    publishKind: "video",
    scheduledPublishAt: null,
    title,
    visibility: "public",
  };
}

export const CONTENT_PUBLICATION_MANUAL_ACTIONS = [
  "retry_publish",
  "reconcile_now",
  "mark_final_failed",
] as const;

export type ContentPublicationManualActionId =
  (typeof CONTENT_PUBLICATION_MANUAL_ACTIONS)[number];

export const CONTENT_PUBLICATION_MANUAL_ACTION_BLOCK_REASONS = [
  "missing_publish_scopes",
  "platform_connection_missing",
  "platform_connection_not_connected",
  "publication_already_final",
  "publication_in_progress",
  "publication_not_finalizable",
  "publication_not_reconcilable",
  "publication_not_retryable",
  "publishable_asset_missing",
  "publishable_bundle_missing",
  "reconciliation_in_progress",
  "repurposing_job_missing",
  "repurposing_job_not_approved",
  "repurposing_job_not_complete",
  "remote_post_missing",
  "target_platform_unsupported",
] as const;

export type ContentPublicationManualActionBlockReason =
  (typeof CONTENT_PUBLICATION_MANUAL_ACTION_BLOCK_REASONS)[number];

export type ContentPublicationManualActionDecision = {
  allowed: boolean;
  blockReason: ContentPublicationManualActionBlockReason | null;
  explanation: string;
};

export type ContentPublicationManualActionPolicy = {
  actions: Record<
    ContentPublicationManualActionId,
    ContentPublicationManualActionDecision
  >;
  blockReason: ContentPublicationManualActionBlockReason | null;
  canMarkFinalFailed: boolean;
  canReconcile: boolean;
  canRetry: boolean;
  explanation: string;
  nextAction: ContentPublicationManualActionId | null;
};

export type ContentPublicationManualActionInput = {
  connectionScopes: string[];
  connectionStatus: ConnectionStatus | null;
  contentJobReviewStatus: ContentJobReviewStatus | null;
  contentJobStatus: ContentJobStatus | null;
  externalPostId: string | null;
  hasApprovedBundle: boolean;
  hasPublishableAsset: boolean;
  publicationStatus: ContentPublicationStatus;
  reconcileMaxRetries: number;
  reconcileRetryCount: number;
  reconciliationStatus: PublicationReconciliationStatus;
  remotePublishId: string | null;
  maxRetries: number;
  retryCount: number;
  targetPlatform: StreamPlatform;
};

export function buildPublicationManualActionPolicy(
  input: ContentPublicationManualActionInput,
): ContentPublicationManualActionPolicy {
  const retryDecision = buildRetryDecision(input);
  const reconcileDecision = buildReconcileDecision(input);
  const finalFailDecision = buildFinalFailDecision(input);
  const nextAction = retryDecision.allowed
    ? "retry_publish"
    : reconcileDecision.allowed
      ? "reconcile_now"
      : finalFailDecision.allowed
        ? "mark_final_failed"
        : null;
  const blockReason =
    nextAction === null
      ? (retryDecision.blockReason ??
        reconcileDecision.blockReason ??
        finalFailDecision.blockReason ??
        null)
      : null;
  const explanation =
    nextAction === "retry_publish"
      ? retryDecision.explanation
      : nextAction === "reconcile_now"
        ? reconcileDecision.explanation
        : nextAction === "mark_final_failed"
          ? finalFailDecision.explanation
          : retryDecision.explanation;

  return {
    actions: {
      mark_final_failed: finalFailDecision,
      reconcile_now: reconcileDecision,
      retry_publish: retryDecision,
    },
    blockReason,
    canMarkFinalFailed: finalFailDecision.allowed,
    canReconcile: reconcileDecision.allowed,
    canRetry: retryDecision.allowed,
    explanation:
      nextAction === null
        ? "No manual publication action is currently available for this item."
        : explanation,
    nextAction,
  };
}

export const PUBLICATION_FANOUT_POLICIES = [
  "all_or_nothing_preflight",
  "prepare_valid_targets",
] as const;

export type PublicationFanoutPolicy =
  (typeof PUBLICATION_FANOUT_POLICIES)[number];

export const CONTENT_PUBLICATION_FANOUT_STATUSES = [
  "requested",
  "validated",
  "partially_validated",
  "blocked",
  "canceled",
] as const;

export type ContentPublicationFanoutStatus =
  (typeof CONTENT_PUBLICATION_FANOUT_STATUSES)[number];

export const CONTENT_PUBLICATION_FANOUT_TARGET_STATUSES = [
  "blocked",
  "validated",
] as const;

export type ContentPublicationFanoutTargetStatus =
  (typeof CONTENT_PUBLICATION_FANOUT_TARGET_STATUSES)[number];

export const CONTENT_PUBLICATION_FANOUT_BLOCK_REASONS = [
  "account_capability_missing",
  "content_job_not_found",
  "conditional_field_unresolved",
  "fanout_not_ready",
  "invalid_provider_override_value",
  "missing_publish_scopes",
  "missing_required_canonical_field",
  "platform_connection_not_found",
  "platform_mismatch",
  "policy_blocked",
  "publication_not_ready",
  "publishable_bundle_missing",
  "provider_override_mismatch",
  "provider_override_unsupported_field",
  "unsupported_capability_version",
  "unsupported_target_platform",
] as const;

export type ContentPublicationFanoutBlockReason =
  (typeof CONTENT_PUBLICATION_FANOUT_BLOCK_REASONS)[number];

export type PublicationFanoutTargetPlatform = Extract<
  StreamPlatform,
  "tiktok" | "youtube"
>;

export type PublicationFanoutRequestTarget = {
  platformConnectionId: string;
  providerOverrides: Record<string, unknown>;
  targetPlatform: PublicationFanoutTargetPlatform;
};

export type ContentPublicationFanoutSnapshot = {
  approvedBundle: RepurposingPlanResult;
  contentJob: {
    id: string;
    queueJobId: string | null;
    reviewStatus: ContentJobReviewStatus;
    status: ContentJobStatus;
    streamId: string | null;
  };
  capabilityVersion: string;
  fanoutPolicy: PublicationFanoutPolicy;
  schedule: ContentPublicationScheduleSummary;
  requestedTargets: PublicationFanoutRequestTarget[];
};

export type ContentPublicationFanoutTarget = {
  blockMessage: string | null;
  blockReason: ContentPublicationFanoutBlockReason | null;
  contentPublicationId: string | null;
  contentPublicationStatus: ContentPublicationStatus | null;
  createdAt: string;
  id: string;
  lastActionAt: string | null;
  lastActionKey: ContentPublicationFanoutActionKey | null;
  lastActionResult: string | null;
  lastBlockReason: ContentPublicationFanoutBlockReason | null;
  lastRecheckedAt: string | null;
  platformConnectionId: string;
  providerOverrides: Record<string, unknown>;
  requestIntentHash: string;
  targetPlatform: PublicationFanoutTargetPlatform;
  targetStatus: ContentPublicationFanoutTargetStatus;
  updatedAt: string;
  userId: string;
  validatedAt: string | null;
};

export type ContentPublicationFanout = {
  blockedTargetCount: number;
  contentJobId: string;
  createdAt: string;
  lastActionAt: string | null;
  lastActionKey: ContentPublicationFanoutActionKey | null;
  lastActionResult: string | null;
  lastAggregateRefreshedAt: string | null;
  fanoutPolicy: PublicationFanoutPolicy;
  fanoutStatus: ContentPublicationFanoutStatus;
  id: string;
  scheduledAtUtc: string | null;
  scheduledTimezone: string | null;
  scheduleBlockMessage: string | null;
  scheduleBlockReason: ContentPublicationScheduleBlockReason | null;
  scheduleCanceledAt: string | null;
  scheduleCanceledReason: string | null;
  scheduleCapabilitySnapshot: Record<string, unknown>;
  scheduleCreatedAt: string | null;
  scheduleExpiredAt: string | null;
  scheduleReplacedAt: string | null;
  scheduleSource: ContentPublicationScheduleSource | null;
  scheduleStatus: ContentPublicationScheduleStatus;
  scheduleUpdatedAt: string | null;
  scheduleValidationMetadata: Record<string, unknown>;
  requestedAt: string;
  requestedBy: string;
  requestIntentHash: string;
  reviewStatusAtRequest: ContentJobReviewStatus;
  snapshot: ContentPublicationFanoutSnapshot;
  snapshotHash: string;
  targetCount: number;
  updatedAt: string;
  userId: string;
  validatedTargetCount: number;
};

export type ContentPublicationFanoutRequest = {
  capabilityVersion?: string;
  contentJobId: string;
  fanoutPolicy?: PublicationFanoutPolicy;
  requestedBy?: string;
  targets: PublicationFanoutRequestTarget[];
  userId: string;
};

export type ContentPublicationFanoutResponse = {
  blockedTargetCount: number;
  contentJobId: string;
  contentPublicationFanoutId: string;
  fanoutPolicy: PublicationFanoutPolicy;
  fanoutStatus: ContentPublicationFanoutStatus;
  requestedBy: string;
  requestIntentHash: string;
  snapshotHash: string;
  status:
    | "publication_fanout_blocked"
    | "publication_fanout_partially_validated"
    | "publication_fanout_validated";
  targetCount: number;
  targets: ContentPublicationFanoutTarget[];
  validatedTargetCount: number;
  userId: string;
};

export const CONTENT_PUBLICATION_FANOUT_ACTION_KEYS = [
  "recheck_target",
  "refresh_parent_aggregate",
  "retry_child",
] as const;

export type ContentPublicationFanoutActionKey =
  (typeof CONTENT_PUBLICATION_FANOUT_ACTION_KEYS)[number];

export type ContentPublicationFanoutActionIntent =
  | "preflight"
  | "recompute"
  | "retry";

export type ContentPublicationFanoutActionSeverity = "low" | "medium";

export type ContentPublicationFanoutActionDecision = {
  actionKey: ContentPublicationFanoutActionKey;
  allowed: boolean;
  blockReason: string | null;
  expectedResult: string;
  intent: ContentPublicationFanoutActionIntent;
  requiresConfirmation: boolean;
  safeDescription: string;
  safeLabel: string;
  severity: ContentPublicationFanoutActionSeverity;
};

export type PublicationFanoutTargetRecheckActionInput = {
  connection: {
    metadata?: unknown;
    platform: StreamPlatform;
    provider_profile?: unknown;
    scopes?: string[] | null;
    status: ConnectionStatus | null;
  } | null;
  contentJob: {
    id: string;
    queueJobId: string | null;
    result: unknown;
    reviewStatus: ContentJobReviewStatus | null;
    status: ContentJobStatus | null;
    streamId: string | null;
  };
  fanoutStatus: ContentPublicationFanoutStatus | null;
  providerOverrides?: PublicationProviderOverrides;
  targetPlatform: PublicationFanoutTargetPlatform;
  targetStatus: ContentPublicationFanoutTargetStatus | null;
};

export type PublicationFanoutChildRetryActionInput = {
  belongsToFanout: boolean;
  fanoutStatus: ContentPublicationFanoutStatus | null;
  hasApprovedBundle: boolean;
  hasPublishableAsset: boolean;
  manualRetryPolicy: ContentPublicationManualActionPolicy;
  publicationStatus: ContentPublicationStatus;
  targetPlatform: PublicationFanoutTargetPlatform;
};

export type PublicationFanoutParentRefreshActionInput = {
  fanoutStatus: ContentPublicationFanoutStatus | null;
};

export function buildPublicationFanoutRequestIntentHash({
  capabilityVersion,
  contentJobId,
  fanoutPolicy = "prepare_valid_targets",
  requestedBy,
  targets,
  userId,
}: {
  capabilityVersion?: string;
  contentJobId: string;
  fanoutPolicy?: PublicationFanoutPolicy;
  requestedBy: string;
  targets: PublicationFanoutRequestTarget[];
  userId: string;
}): string {
  const normalizedTargets = targets
    .map((target) => ({
      platformConnectionId: target.platformConnectionId,
      providerOverrides: sortJsonValue(target.providerOverrides),
      targetPlatform: target.targetPlatform,
    }))
    .sort((left, right) => {
      if (left.targetPlatform !== right.targetPlatform) {
        return left.targetPlatform.localeCompare(right.targetPlatform);
      }

      if (left.platformConnectionId !== right.platformConnectionId) {
        return left.platformConnectionId.localeCompare(
          right.platformConnectionId,
        );
      }

      return JSON.stringify(left.providerOverrides).localeCompare(
        JSON.stringify(right.providerOverrides),
      );
    });

  return createSha256Digest({
    capabilityVersion:
      capabilityVersion?.trim() || PUBLICATION_CAPABILITY_VERSION,
    contentJobId,
    fanoutPolicy,
    requestedBy,
    targets: normalizedTargets,
    userId,
  });
}

export function buildPublicationFanoutTargetRecheckActionPolicy(
  input: PublicationFanoutTargetRecheckActionInput,
): ContentPublicationFanoutActionDecision {
  if (input.targetStatus !== "blocked") {
    return blockedFanoutActionDecision(
      "recheck_target",
      "target_not_blocked",
      "Erneut prüfen",
      "Only blocked targets can be rechecked.",
      "The target is already available and does not need a blocked-target recheck.",
      "preflight",
    );
  }

  if (input.fanoutStatus === "canceled") {
    return blockedFanoutActionDecision(
      "recheck_target",
      "fanout_already_final",
      "Erneut prüfen",
      "The parent fanout is final and cannot be changed anymore.",
      "The parent fanout is already closed and cannot be rechecked.",
      "preflight",
    );
  }

  if (
    !input.contentJob.result ||
    !isApprovedRepurposingPlanResult(input.contentJob.result)
  ) {
    return blockedFanoutActionDecision(
      "recheck_target",
      "publishable_bundle_missing",
      "Erneut prüfen",
      "The approved repurposing bundle is missing or incomplete.",
      "The blocked target cannot be rechecked until the frozen approved bundle is available.",
      "preflight",
    );
  }

  if (input.contentJob.reviewStatus !== "approved") {
    return blockedFanoutActionDecision(
      "recheck_target",
      "repurposing_job_not_approved",
      "Erneut prüfen",
      "The parent repurposing job is no longer approved.",
      "The blocked target cannot be rechecked until the parent repurposing job is approved again.",
      "preflight",
    );
  }

  if (
    input.contentJob.status !== "done" &&
    input.contentJob.status !== "completed"
  ) {
    return blockedFanoutActionDecision(
      "recheck_target",
      "repurposing_job_not_complete",
      "Erneut prüfen",
      "The parent repurposing job is not complete yet.",
      "The blocked target cannot be rechecked until the approved repurposing job is complete.",
      "preflight",
    );
  }

  if (!input.connection) {
    return blockedFanoutActionDecision(
      "recheck_target",
      "platform_connection_missing",
      "Erneut prüfen",
      "A tenant-scoped platform connection is required.",
      "The blocked target cannot be rechecked without a tenant-scoped platform connection.",
      "preflight",
    );
  }

  if (input.connection.status !== "connected") {
    return blockedFanoutActionDecision(
      "recheck_target",
      "platform_connection_not_connected",
      "Erneut prüfen",
      "The platform connection must be connected before a recheck can pass.",
      "The blocked target cannot be rechecked until the platform connection is connected.",
      "preflight",
    );
  }

  if (input.connection.platform !== input.targetPlatform) {
    return blockedFanoutActionDecision(
      "recheck_target",
      "platform_mismatch",
      "Erneut prüfen",
      "The platform connection does not match the selected target platform.",
      "The blocked target cannot be rechecked until the target platform and connection match.",
      "preflight",
    );
  }

  const capabilityResolution = resolvePublicationCapabilities({
    accountCapabilities: extractPublicationAccountCapabilityOverlay(
      input.connection,
    ),
    canonicalDraft: buildCanonicalPublicationDraft({
      approvedBundle: input.contentJob.result,
      contentJob: {
        id: input.contentJob.id,
        queueJobId: input.contentJob.queueJobId,
        streamId: input.contentJob.streamId,
      },
      targetPlatform: input.targetPlatform,
    }),
    providerOverrides: {
      [input.targetPlatform]:
        input.providerOverrides?.[input.targetPlatform] ?? {},
    },
    targetPlatform: input.targetPlatform,
  });

  if (capabilityResolution.blockingErrors.length > 0) {
    const firstError = capabilityResolution.blockingErrors[0];
    if (!firstError) {
      return allowedFanoutActionDecision(
        "recheck_target",
        "Erneut prüfen",
        "Revalidates one blocked target against the current connection, scopes, and approved repurposing bundle.",
        "The target will be rechecked server-side and can materialize or refresh the child publication without creating duplicates.",
        "preflight",
      );
    }

    return blockedFanoutActionDecision(
      "recheck_target",
      firstError.code,
      "Erneut prüfen",
      firstError.message,
      "The blocked target cannot be rechecked until the capability checks pass again.",
      "preflight",
    );
  }

  return allowedFanoutActionDecision(
    "recheck_target",
    "Erneut prüfen",
    "Revalidates one blocked target against the current connection, scopes, and approved repurposing bundle.",
    "The target will be rechecked server-side and can materialize or refresh the child publication without creating duplicates.",
    "preflight",
  );
}

export function buildPublicationFanoutChildRetryActionPolicy(
  input: PublicationFanoutChildRetryActionInput,
): ContentPublicationFanoutActionDecision {
  if (!input.belongsToFanout) {
    return blockedFanoutActionDecision(
      "retry_child",
      "child_not_part_of_parent",
      "Erneut versuchen",
      "The child publication does not belong to the selected parent fanout.",
      "This retry is blocked because the child publication is not part of the selected parent fanout.",
      "retry",
    );
  }

  if (input.fanoutStatus === "canceled") {
    return blockedFanoutActionDecision(
      "retry_child",
      "fanout_already_final",
      "Erneut versuchen",
      "The parent fanout is final and cannot be retried.",
      "This retry is blocked because the parent fanout is already closed.",
      "retry",
    );
  }

  const retryDecision = input.manualRetryPolicy.actions.retry_publish;

  if (!retryDecision.allowed) {
    return blockedFanoutActionDecision(
      "retry_child",
      retryDecision.blockReason ?? "publication_not_retryable",
      "Erneut versuchen",
      retryDecision.explanation,
      "The child publication cannot be retried until the publication guard allows it.",
      "retry",
    );
  }

  if (!input.hasApprovedBundle) {
    return blockedFanoutActionDecision(
      "retry_child",
      "publishable_bundle_missing",
      "Erneut versuchen",
      "The approved repurposing bundle is missing or incomplete.",
      "The child publication cannot be retried until the frozen approved bundle is available.",
      "retry",
    );
  }

  if (!input.hasPublishableAsset) {
    return blockedFanoutActionDecision(
      "retry_child",
      "publishable_asset_missing",
      "Erneut versuchen",
      "A publishable asset is required before the child can be retried.",
      "The child publication cannot be retried until a publishable asset is available.",
      "retry",
    );
  }

  return allowedFanoutActionDecision(
    "retry_child",
    "Erneut versuchen",
    "Retries exactly one child publication through the existing safe retry guard.",
    "The child publication will be re-enqueued through the existing publication execution path, and the parent aggregate can be refreshed afterward.",
    "retry",
  );
}

export function buildPublicationFanoutParentRefreshActionPolicy(
  input: PublicationFanoutParentRefreshActionInput,
): ContentPublicationFanoutActionDecision {
  if (!input.fanoutStatus) {
    return blockedFanoutActionDecision(
      "refresh_parent_aggregate",
      "fanout_not_found",
      "Status aktualisieren",
      "The parent fanout could not be loaded.",
      "The parent aggregate cannot be refreshed until the parent fanout exists.",
      "recompute",
    );
  }

  return allowedFanoutActionDecision(
    "refresh_parent_aggregate",
    "Status aktualisieren",
    "Recomputes the parent aggregate from the current child target states and stored publication rows.",
    "The parent summary will be recalculated from the current database state without triggering any provider or queue work.",
    "recompute",
  );
}

export function isApprovedRepurposingPlanResult(
  value: unknown,
): value is RepurposingPlanResult {
  if (!isRecord(value)) {
    return false;
  }

  return (
    Array.isArray(value.captions) &&
    Array.isArray(value.descriptions) &&
    Array.isArray(value.hashtag_sets) &&
    Array.isArray(value.hook_ideas) &&
    Array.isArray(value.review_notes) &&
    Array.isArray(value.title_suggestions) &&
    Array.isArray(value.warnings) &&
    value.manual_review_required === true &&
    typeof value.confidence === "number" &&
    typeof value.content_job_id === "string" &&
    typeof value.model === "string" &&
    typeof value.provider === "string" &&
    typeof value.queue_job_id === "string" &&
    typeof value.short_form_plan === "string"
  );
}

function buildRetryDecision(
  input: ContentPublicationManualActionInput,
): ContentPublicationManualActionDecision {
  if (input.targetPlatform !== "youtube" && input.targetPlatform !== "tiktok") {
    return blockedDecision(
      "target_platform_unsupported",
      "Retry publish is available for the current publication contract only.",
    );
  }

  if (
    input.publicationStatus === "queued" ||
    input.publicationStatus === "publishing" ||
    input.publicationStatus === "published"
  ) {
    return blockedDecision(
      "publication_in_progress",
      "Retry publish is not available while the publication is already queued, publishing, or published.",
    );
  }

  if (input.publicationStatus !== "failed_retryable") {
    return blockedDecision(
      "publication_not_retryable",
      "Retry publish is available only for retryable publication failures.",
    );
  }

  if (input.maxRetries <= 0 || input.retryCount >= input.maxRetries) {
    return blockedDecision(
      "publication_not_retryable",
      "Retry publish is unavailable because the retry budget has been exhausted.",
    );
  }

  if (input.contentJobReviewStatus === null) {
    return blockedDecision(
      "repurposing_job_missing",
      "Retry publish requires the approved repurposing job to still be present.",
    );
  }

  if (input.contentJobReviewStatus !== "approved") {
    return blockedDecision(
      "repurposing_job_not_approved",
      "Retry publish is available only for approved repurposing jobs.",
    );
  }

  if (
    input.contentJobStatus !== "done" &&
    input.contentJobStatus !== "completed"
  ) {
    return blockedDecision(
      "repurposing_job_not_complete",
      "Retry publish requires the approved repurposing job to be complete.",
    );
  }

  if (!input.hasApprovedBundle) {
    return blockedDecision(
      "publishable_bundle_missing",
      "Retry publish requires the frozen approved repurposing bundle to still be present.",
    );
  }

  if (!input.hasPublishableAsset) {
    return blockedDecision(
      "publishable_asset_missing",
      "Retry publish requires a publishable asset to be available on the stream record.",
    );
  }

  if (!input.connectionStatus) {
    return blockedDecision(
      "platform_connection_missing",
      "Retry publish requires a tenant-scoped platform connection.",
    );
  }

  if (input.connectionStatus !== "connected") {
    return blockedDecision(
      "platform_connection_not_connected",
      "Retry publish requires the platform connection to be connected.",
    );
  }

  const requiredScopes = getPublicationCapabilityDefinition(
    input.targetPlatform,
  ).requiredScopes;
  const connectionScopes = new Set(input.connectionScopes);

  if (!requiredScopes.every((scope) => connectionScopes.has(scope))) {
    return blockedDecision(
      "missing_publish_scopes",
      `Retry publish requires the ${input.targetPlatform} publish scope to still be granted.`,
    );
  }

  return allowedDecision(
    "Retry publish is allowed and will re-enqueue the frozen publication contract.",
  );
}

function buildReconcileDecision(
  input: ContentPublicationManualActionInput,
): ContentPublicationManualActionDecision {
  if (input.targetPlatform !== "youtube" && input.targetPlatform !== "tiktok") {
    return blockedDecision(
      "target_platform_unsupported",
      "Reconcile now is available for the current publication contract only.",
    );
  }

  if (input.contentJobReviewStatus === null) {
    return blockedDecision(
      "repurposing_job_missing",
      "Reconcile now requires the approved repurposing job to still be present.",
    );
  }

  if (input.contentJobReviewStatus !== "approved") {
    return blockedDecision(
      "repurposing_job_not_approved",
      "Reconcile now is available only for approved repurposing jobs.",
    );
  }

  if (
    input.contentJobStatus !== "done" &&
    input.contentJobStatus !== "completed"
  ) {
    return blockedDecision(
      "repurposing_job_not_complete",
      "Reconcile now requires the approved repurposing job to be complete.",
    );
  }

  if (!input.hasApprovedBundle) {
    return blockedDecision(
      "publishable_bundle_missing",
      "Reconcile now requires the frozen approved repurposing bundle to still be present.",
    );
  }

  if (
    input.publicationStatus === "canceled" ||
    input.publicationStatus === "rejected"
  ) {
    return blockedDecision(
      "publication_not_reconcilable",
      "Reconcile now is not available for canceled or rejected publications.",
    );
  }

  if (
    input.reconciliationStatus === "queued" ||
    input.reconciliationStatus === "reconciling"
  ) {
    return blockedDecision(
      "reconciliation_in_progress",
      "Reconcile now is already in progress for this publication.",
    );
  }

  const remotePublishId = input.remotePublishId ?? input.externalPostId;

  if (!remotePublishId) {
    return blockedDecision(
      "remote_post_missing",
      "Reconcile now requires an existing remote publish id.",
    );
  }

  if (
    input.reconcileMaxRetries > 0 &&
    input.reconcileRetryCount >= input.reconcileMaxRetries
  ) {
    return blockedDecision(
      "publication_not_reconcilable",
      "Reconcile now is unavailable because the retry budget has been exhausted.",
    );
  }

  if (!input.connectionStatus) {
    return blockedDecision(
      "platform_connection_missing",
      "Reconcile now requires the tenant-scoped platform connection.",
    );
  }

  if (input.connectionStatus !== "connected") {
    return blockedDecision(
      "platform_connection_not_connected",
      "Reconcile now requires the platform connection to be connected.",
    );
  }

  return allowedDecision(
    "Reconcile now is allowed and will refresh the remote publication state.",
  );
}

function buildFinalFailDecision(
  input: ContentPublicationManualActionInput,
): ContentPublicationManualActionDecision {
  if (input.targetPlatform !== "youtube" && input.targetPlatform !== "tiktok") {
    return blockedDecision(
      "target_platform_unsupported",
      "Mark final failed is available for the current publication contract only.",
    );
  }

  if (input.contentJobReviewStatus === null) {
    return blockedDecision(
      "repurposing_job_missing",
      "Mark final failed requires the approved repurposing job to still be present.",
    );
  }

  if (input.contentJobReviewStatus !== "approved") {
    return blockedDecision(
      "repurposing_job_not_approved",
      "Mark final failed is available only for approved repurposing jobs.",
    );
  }

  if (
    input.contentJobStatus !== "done" &&
    input.contentJobStatus !== "completed"
  ) {
    return blockedDecision(
      "repurposing_job_not_complete",
      "Mark final failed requires the approved repurposing job to be complete.",
    );
  }

  if (!input.hasApprovedBundle) {
    return blockedDecision(
      "publishable_bundle_missing",
      "Mark final failed requires the frozen approved repurposing bundle to still be present.",
    );
  }

  if (input.publicationStatus === "failed_permanent") {
    return blockedDecision(
      "publication_already_final",
      "Mark final failed is already applied to this publication.",
    );
  }

  if (input.publicationStatus !== "failed_retryable") {
    return blockedDecision(
      "publication_not_finalizable",
      "Mark final failed is available only after a retryable publication failure.",
    );
  }

  if (
    input.reconciliationStatus === "queued" ||
    input.reconciliationStatus === "reconciling"
  ) {
    return blockedDecision(
      "publication_in_progress",
      "Mark final failed is unavailable while reconciliation is in progress.",
    );
  }

  return allowedDecision(
    "Mark final failed is allowed and will close the publication permanently.",
  );
}

function allowedDecision(
  explanation: string,
): ContentPublicationManualActionDecision {
  return {
    allowed: true,
    blockReason: null,
    explanation,
  };
}

function blockedDecision(
  blockReason: ContentPublicationManualActionBlockReason,
  explanation: string,
): ContentPublicationManualActionDecision {
  return {
    allowed: false,
    blockReason,
    explanation,
  };
}

function allowedFanoutActionDecision(
  actionKey: ContentPublicationFanoutActionKey,
  safeLabel: string,
  safeDescription: string,
  expectedResult: string,
  intent: ContentPublicationFanoutActionIntent,
): ContentPublicationFanoutActionDecision {
  return {
    actionKey,
    allowed: true,
    blockReason: null,
    expectedResult,
    intent,
    requiresConfirmation: actionKey === "retry_child",
    safeDescription,
    safeLabel,
    severity: actionKey === "refresh_parent_aggregate" ? "low" : "medium",
  };
}

function blockedFanoutActionDecision(
  actionKey: ContentPublicationFanoutActionKey,
  blockReason: string,
  safeLabel: string,
  safeDescription: string,
  expectedResult: string,
  intent: ContentPublicationFanoutActionIntent,
): ContentPublicationFanoutActionDecision {
  return {
    actionKey,
    allowed: false,
    blockReason,
    expectedResult,
    intent,
    requiresConfirmation: false,
    safeDescription,
    safeLabel,
    severity: actionKey === "refresh_parent_aggregate" ? "low" : "medium",
  };
}

export function extractPublicationAccountCapabilityOverlay(connection: {
  metadata?: unknown;
  platform: StreamPlatform;
  provider_profile?: unknown;
  scopes?: string[] | null;
}): PublicationAccountCapabilityOverlay {
  const rootMetadata = toRecord(connection.metadata);
  const providerProfile = toRecord(connection.provider_profile);
  const candidateSources = [
    rootMetadata.publish_capabilities,
    rootMetadata.publication_capabilities,
    rootMetadata.capabilities,
    providerProfile.publish_capabilities,
    providerProfile.publication_capabilities,
    providerProfile.capabilities,
  ];

  let candidate = candidateSources.find(isRecord);
  if (!candidate) {
    const platformCandidate = rootMetadata[connection.platform];
    candidate = isRecord(platformCandidate) ? platformCandidate : undefined;
  }
  if (!candidate) {
    const providerCandidate = providerProfile[connection.platform];
    candidate = isRecord(providerCandidate) ? providerCandidate : undefined;
  }

  const nestedCandidate =
    candidate && isRecord(candidate) && isRecord(candidate[connection.platform])
      ? candidate[connection.platform]
      : candidate;
  const normalized = toRecord(nestedCandidate);
  const supportStatus = parseSupportStatus(normalized.support_status);
  const allowedVisibility = parseStringArray(
    normalized.allowed_visibility ??
      normalized.allowedVisibility ??
      normalized.visibility_options ??
      normalized.privacy_options ??
      normalized.privacy_levels ??
      normalized.privacy_level_options ??
      normalized.privacyLevelOptions,
  );
  const allowedCommentControls = parseStringArray(
    normalized.allowed_comment_controls ??
      normalized.allowedCommentControls ??
      normalized.comment_controls ??
      normalized.comment_options,
  );
  const allowedDuetControls = parseStringArray(
    normalized.allowed_duet_controls ??
      normalized.allowedDuetControls ??
      normalized.duet_controls ??
      normalized.duet_options,
  );
  const allowedStitchControls = parseStringArray(
    normalized.allowed_stitch_controls ??
      normalized.allowedStitchControls ??
      normalized.stitch_controls ??
      normalized.stitch_options,
  );
  const maxVideoDurationSeconds = parsePositiveInteger(
    normalized.max_video_duration_seconds ??
      normalized.maxVideoDurationSeconds ??
      normalized.max_duration_seconds ??
      normalized.maxDurationSeconds,
  );
  const schedulingAllowed = parseBoolean(
    normalized.scheduling_allowed ??
      normalized.schedulingAllowed ??
      normalized.allow_scheduling ??
      normalized.allowScheduling,
  );
  const notes = parseStringArray(normalized.notes ?? normalized.warnings);

  const overlay: PublicationAccountCapabilityOverlay = {};

  if (supportStatus) {
    overlay.capabilityStatus = supportStatus;
  }
  if (allowedVisibility.length > 0) {
    overlay.allowedVisibility = allowedVisibility;
  }
  if (allowedCommentControls.length > 0) {
    overlay.allowedCommentControls = allowedCommentControls;
  }
  if (allowedDuetControls.length > 0) {
    overlay.allowedDuetControls = allowedDuetControls;
  }
  if (allowedStitchControls.length > 0) {
    overlay.allowedStitchControls = allowedStitchControls;
  }
  if (maxVideoDurationSeconds !== undefined) {
    overlay.maxVideoDurationSeconds = maxVideoDurationSeconds;
  }
  if (schedulingAllowed !== undefined) {
    overlay.schedulingAllowed = schedulingAllowed;
  }
  if (notes.length > 0) {
    overlay.notes = notes;
  }

  return overlay;
}

export function resolvePublicationCapabilities({
  accountCapabilities,
  canonicalDraft,
  capabilityVersion = PUBLICATION_CAPABILITY_VERSION,
  policy,
  providerOverrides = {},
  targetPlatform,
}: {
  accountCapabilities?: PublicationAccountCapabilityOverlay | null;
  canonicalDraft: PublicationCanonicalDraft;
  capabilityVersion?: string;
  policy?: PublicationCapabilityPolicy;
  providerOverrides?: PublicationProviderOverrides;
  targetPlatform: StreamPlatform;
}): PublicationCapabilityResolution {
  const definition = getPublicationCapabilityDefinition(targetPlatform);
  const blockingErrors: PublicationCapabilityIssue[] = [];
  const warnings: PublicationCapabilityIssue[] = [];
  const ignoredFields: string[] = [];
  const unsupportedFields: string[] = [];
  const resolvedDefaults: Record<string, unknown> = {};
  const normalizedAccountCapabilities = accountCapabilities ?? {};
  const normalizedCapabilityVersion =
    capabilityVersion.trim() || PUBLICATION_CAPABILITY_VERSION;
  const targetNamespaceOverrides = toRecord(providerOverrides[targetPlatform]);

  if (normalizedCapabilityVersion !== PUBLICATION_CAPABILITY_VERSION) {
    blockingErrors.push({
      code: "unsupported_capability_version",
      message: `Capability version ${normalizedCapabilityVersion} is not supported.`,
      provider: targetPlatform,
      severity: "blocking",
    });
  }

  if (policy?.blockedTargets?.includes(targetPlatform)) {
    blockingErrors.push({
      code: "policy_blocked",
      message: `Publishing to ${targetPlatform} is blocked by policy.`,
      provider: targetPlatform,
      severity: "blocking",
    });
  }

  if (
    policy?.allowedTargets &&
    policy.allowedTargets.length > 0 &&
    !policy.allowedTargets.includes(targetPlatform)
  ) {
    blockingErrors.push({
      code: "policy_blocked",
      message: `Publishing to ${targetPlatform} is not allowed by policy.`,
      provider: targetPlatform,
      severity: "blocking",
    });
  }

  if (definition.providerSupportStatus === "unsupported") {
    blockingErrors.push({
      code: "unsupported_target_platform",
      message: `Publishing to ${targetPlatform} is unsupported.`,
      provider: targetPlatform,
      severity: "blocking",
    });
  }

  const canonicalFieldRules = definition.canonicalFields.map((rule) =>
    cloneRule(rule),
  );
  const providerMappedFieldRules = definition.providerMappedFields.map((rule) =>
    cloneRule(rule),
  );
  const providerSpecificFieldRules = definition.providerSpecificFields.map(
    (rule) => cloneRule(rule),
  );

  applyOverlayToRules({
    accountCapabilities: normalizedAccountCapabilities,
    canonicalFieldRules,
    providerMappedFieldRules,
    providerSpecificFieldRules,
    targetPlatform,
  });

  const providerOverrideKeys = Object.keys(providerOverrides);

  for (const namespace of providerOverrideKeys) {
    if (namespace !== targetPlatform) {
      blockingErrors.push({
        code: "provider_override_mismatch",
        field: namespace,
        message: `Provider overrides must be namespaced to ${targetPlatform}.`,
        provider: targetPlatform,
        severity: "blocking",
      });
    }
  }

  const allowedOverrideKeys = new Set([
    ...providerMappedFieldRules.map((rule) => rule.key),
    ...providerSpecificFieldRules.map((rule) => rule.key),
  ]);
  const overrideEntries = Object.entries(targetNamespaceOverrides);
  const normalizedOverrides: Record<string, unknown> = {};

  for (const [key, value] of overrideEntries) {
    if (!allowedOverrideKeys.has(key)) {
      blockingErrors.push({
        code: "provider_override_unsupported_field",
        field: key,
        message: `Provider override field ${key} is not allowed for ${targetPlatform}.`,
        provider: targetPlatform,
        severity: "blocking",
      });
      continue;
    }

    const allowedValues = findAllowedValues(key, [
      ...providerMappedFieldRules,
      ...providerSpecificFieldRules,
    ]);

    if (
      allowedValues &&
      typeof value === "string" &&
      !allowedValues.includes(value)
    ) {
      blockingErrors.push({
        code: "invalid_provider_override_value",
        field: key,
        message: `Provider override field ${key} does not accept value ${value}.`,
        provider: targetPlatform,
        severity: "blocking",
      });
      continue;
    }

    normalizedOverrides[key] = value;
  }

  validateCanonicalDraft({
    blockingErrors,
    canonicalDraft,
    canonicalFieldRules,
    targetPlatform,
  });

  const providerPayloadPreview = buildProviderPayloadPreview({
    canonicalDraft,
    providerMappedFieldRules,
    providerSpecificFieldRules,
    providerOverrides: normalizedOverrides,
    targetPlatform,
  });

  if (definition.providerSupportStatus === "conditional") {
    if (normalizedAccountCapabilities.capabilityStatus === "unsupported") {
      blockingErrors.push({
        code: "account_capability_missing",
        message: `The ${targetPlatform} account currently reports the target as unsupported.`,
        provider: targetPlatform,
        severity: "blocking",
      });
    } else if (
      !normalizedAccountCapabilities.capabilityStatus &&
      targetPlatform === "tiktok"
    ) {
      warnings.push({
        code: "account_capability_missing",
        message:
          "TikTok target-account capabilities were not resolved; execution remains conditional.",
        provider: targetPlatform,
        severity: "warning",
      });
    }
  }

  if (normalizedAccountCapabilities.notes?.length) {
    warnings.push(
      ...normalizedAccountCapabilities.notes.map((note) => ({
        code: "conditional_field_unresolved" as const,
        message: note,
        provider: targetPlatform,
        severity: "warning" as const,
      })),
    );
  }

  if (!policy?.forbidAutoPublish) {
    warnings.push({
      code: "policy_blocked",
      message:
        "Publishing remains server-validated only; no auto-publish execution is enabled.",
      provider: targetPlatform,
      severity: "warning",
    });
  }

  for (const rule of canonicalFieldRules) {
    if (rule.supportStatus === "unsupported") {
      unsupportedFields.push(rule.key);
    }
    if (rule.supportStatus === "conditional") {
      resolvedDefaults[rule.key] ??= null;
    }
    if (rule.defaultValue !== undefined) {
      resolvedDefaults[rule.key] = rule.defaultValue;
    }
  }

  return {
    accountCapabilities: normalizedAccountCapabilities,
    blockingErrors,
    capabilityVersion: normalizedCapabilityVersion,
    canonicalDraft,
    canonicalFields: canonicalFieldRules,
    dynamicCapabilityKeys: definition.dynamicCapabilityKeys,
    ignoredFields,
    providerMappedFields: providerMappedFieldRules,
    providerOverrides: normalizedOverrides as PublicationProviderOverrides,
    providerPayloadPreview,
    providerSpecificFields: providerSpecificFieldRules,
    providerSupportStatus: definition.providerSupportStatus,
    resolvedDefaults,
    targetPlatform,
    unsupportedFields,
    warnings,
  };
}

function applyOverlayToRules({
  accountCapabilities,
  canonicalFieldRules,
  providerMappedFieldRules,
  providerSpecificFieldRules,
  targetPlatform,
}: {
  accountCapabilities: PublicationAccountCapabilityOverlay;
  canonicalFieldRules: PublicationCapabilityFieldRule[];
  providerMappedFieldRules: PublicationCapabilityFieldRule[];
  providerSpecificFieldRules: PublicationCapabilityFieldRule[];
  targetPlatform: StreamPlatform;
}) {
  if (accountCapabilities.capabilityStatus) {
    const status = accountCapabilities.capabilityStatus;
    for (const rule of [
      ...canonicalFieldRules,
      ...providerMappedFieldRules,
      ...providerSpecificFieldRules,
    ]) {
      if (status === "conditional" && rule.supportStatus === "supported") {
        rule.supportStatus = "conditional";
      }
      if (status === "experimental" && rule.supportStatus === "supported") {
        rule.supportStatus = "experimental";
      }
    }
  }

  if (targetPlatform === "tiktok") {
    const visibilityRule = providerMappedFieldRules.find(
      (rule) => rule.key === "privacy_level",
    );
    if (visibilityRule && accountCapabilities.allowedVisibility?.length) {
      visibilityRule.allowedValues = accountCapabilities.allowedVisibility;
    }

    const commentRule = providerMappedFieldRules.find(
      (rule) => rule.key === "comment_control",
    );
    if (commentRule && accountCapabilities.allowedCommentControls?.length) {
      commentRule.allowedValues = accountCapabilities.allowedCommentControls;
    }

    const duetRule = providerMappedFieldRules.find(
      (rule) => rule.key === "duet_control",
    );
    if (duetRule && accountCapabilities.allowedDuetControls?.length) {
      duetRule.allowedValues = accountCapabilities.allowedDuetControls;
    }

    const stitchRule = providerMappedFieldRules.find(
      (rule) => rule.key === "stitch_control",
    );
    if (stitchRule && accountCapabilities.allowedStitchControls?.length) {
      stitchRule.allowedValues = accountCapabilities.allowedStitchControls;
    }

    const durationRule = providerSpecificFieldRules.find(
      (rule) => rule.key === "max_video_duration_seconds",
    );
    if (durationRule && accountCapabilities.maxVideoDurationSeconds) {
      durationRule.defaultValue = accountCapabilities.maxVideoDurationSeconds;
    }
  }

  if (targetPlatform === "youtube") {
    const visibilityRule = providerMappedFieldRules.find(
      (rule) => rule.key === "privacy_status",
    );
    if (visibilityRule && accountCapabilities.allowedVisibility?.length) {
      visibilityRule.allowedValues = accountCapabilities.allowedVisibility;
    }
  }

  if (
    accountCapabilities.schedulingAllowed === false &&
    targetPlatform !== "kick" &&
    targetPlatform !== "twitch"
  ) {
    const scheduledRule = canonicalFieldRules.find(
      (rule) => rule.key === "scheduledPublishAt",
    );
    if (scheduledRule) {
      scheduledRule.supportStatus = "unsupported";
    }
  }
}

function buildProviderPayloadPreview({
  canonicalDraft,
  providerMappedFieldRules,
  providerOverrides,
  providerSpecificFieldRules,
  targetPlatform,
}: {
  canonicalDraft: PublicationCanonicalDraft;
  providerMappedFieldRules: PublicationCapabilityFieldRule[];
  providerOverrides: Record<string, unknown>;
  providerSpecificFieldRules: PublicationCapabilityFieldRule[];
  targetPlatform: StreamPlatform;
}): Record<string, unknown> {
  const preview: Record<string, unknown> = {
    asset_reference: canonicalDraft.assetReference,
    audience_classification: canonicalDraft.audienceClassification,
    disclosure_intent: canonicalDraft.disclosureIntent,
    format_profile: canonicalDraft.formatProfile,
    hashtags: canonicalDraft.hashtags,
    publish_kind: canonicalDraft.publishKind,
    scheduled_publish_at: canonicalDraft.scheduledPublishAt,
    target_platform: targetPlatform,
    title: canonicalDraft.title,
    visibility: canonicalDraft.visibility,
  };

  if (targetPlatform === "youtube") {
    preview.description = canonicalDraft.description;
    preview.privacy_status = canonicalDraft.visibility;
    preview.tags = canonicalDraft.hashtags;
    preview.notify_subscribers = true;
    preview.license = "youtube";
    preview.made_for_kids = false;
  }

  if (targetPlatform === "tiktok") {
    preview.caption = [canonicalDraft.title, canonicalDraft.description]
      .map((value) => value.trim())
      .filter(Boolean)
      .join("\n\n");
    preview.privacy_level = toTikTokPrivacyLevel(canonicalDraft.visibility);
    preview.comment_control = providerOverrides.comment_control ?? "allowed";
    preview.duet_control = providerOverrides.duet_control ?? "allowed";
    preview.stitch_control = providerOverrides.stitch_control ?? "allowed";
  }

  for (const rule of providerMappedFieldRules) {
    if (Object.hasOwn(providerOverrides, rule.key)) {
      preview[rule.key] = providerOverrides[rule.key];
      continue;
    }

    if (rule.defaultValue !== undefined) {
      preview[rule.key] = rule.defaultValue;
    }
  }

  for (const rule of providerSpecificFieldRules) {
    if (Object.hasOwn(providerOverrides, rule.key)) {
      preview[rule.key] = providerOverrides[rule.key];
      continue;
    }

    if (rule.defaultValue !== undefined) {
      preview[rule.key] = rule.defaultValue;
    }
  }

  return preview;
}

function validateCanonicalDraft({
  blockingErrors,
  canonicalDraft,
  canonicalFieldRules,
  targetPlatform,
}: {
  blockingErrors: PublicationCapabilityIssue[];
  canonicalDraft: PublicationCanonicalDraft;
  canonicalFieldRules: PublicationCapabilityFieldRule[];
  targetPlatform: StreamPlatform;
}) {
  for (const rule of canonicalFieldRules) {
    const value = canonicalDraft[rule.key as keyof PublicationCanonicalDraft];

    if (rule.required && isCanonicalValueEmpty(value)) {
      blockingErrors.push({
        code: "missing_required_canonical_field",
        field: rule.key,
        message: `Canonical field ${rule.key} is required for ${targetPlatform}.`,
        provider: targetPlatform,
        severity: "blocking",
      });
    }

    if (
      rule.allowedValues &&
      typeof value === "string" &&
      !rule.allowedValues.includes(value)
    ) {
      blockingErrors.push({
        code: "conditional_field_unresolved",
        field: rule.key,
        message: `Canonical field ${rule.key} does not accept value ${value} for ${targetPlatform}.`,
        provider: targetPlatform,
        severity: "blocking",
      });
    }
  }
}

function cloneRule(
  rule: PublicationCapabilityFieldRule,
): PublicationCapabilityFieldRule {
  return {
    ...rule,
    allowedValues: rule.allowedValues ? [...rule.allowedValues] : undefined,
    notes: rule.notes ? [...rule.notes] : undefined,
  };
}

function field(
  definition: Omit<PublicationCapabilityFieldRule, "allowedValues"> & {
    allowedValues?: readonly string[];
  },
): PublicationCapabilityFieldRule {
  return {
    ...definition,
    allowedValues: definition.allowedValues
      ? [...definition.allowedValues]
      : undefined,
    notes: definition.notes ? [...definition.notes] : undefined,
  };
}

function buildUnsupportedDefinition(
  targetPlatform: "kick" | "twitch",
  notes: string[],
): PublicationCapabilityDefinition {
  return {
    canonicalFields: PUBLICATION_CANONICAL_FIELD_KEYS.map((key) =>
      field({
        group: "canonical",
        key,
        label: key,
        required:
          key === "publishKind" ||
          key === "formatProfile" ||
          key === "title" ||
          key === "description" ||
          key === "hashtags" ||
          key === "visibility" ||
          key === "disclosureIntent" ||
          key === "audienceClassification" ||
          key === "assetReference",
        supportStatus: "unsupported",
      }),
    ),
    capabilityVersion: PUBLICATION_CAPABILITY_VERSION,
    dynamicCapabilityKeys: [],
    notes,
    providerMappedFields: [],
    providerSpecificFields: [],
    providerSupportStatus: "unsupported",
    requiredScopes: [],
    targetPlatform,
  };
}

function findAllowedValues(
  key: string,
  rules: PublicationCapabilityFieldRule[],
): readonly string[] | undefined {
  return rules.find((rule) => rule.key === key)?.allowedValues;
}

function firstNonEmpty(
  values: Array<string | string[]>,
): string | string[] | undefined {
  for (const value of values) {
    if (Array.isArray(value)) {
      const filtered = value.map((item) => item.trim()).filter(Boolean);
      if (filtered.length > 0) {
        return filtered;
      }
      continue;
    }

    if (value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

function toTikTokPrivacyLevel(
  visibility: PublicationCanonicalDraft["visibility"],
): string {
  switch (visibility) {
    case "friends_only":
      return "MUTUAL_FOLLOW_FRIENDS";
    case "private":
      return "SELF_ONLY";
    case "public":
      return "PUBLIC_TO_EVERYONE";
    case "unlisted":
      return "SELF_ONLY";
  }
}

function isCanonicalValueEmpty(value: unknown): boolean {
  if (typeof value === "string") {
    return value.trim().length === 0;
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  if (value === null || value === undefined) {
    return true;
  }

  if (typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).length === 0;
  }

  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createSha256Digest(value: Record<string, unknown>): string {
  return createHash("sha256")
    .update(JSON.stringify(sortJsonValue(value)), "utf8")
    .digest("hex");
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortJsonValue(item));
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortJsonValue(value[key])]),
  );
}

function toRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function parseSupportStatus(
  value: unknown,
): PublicationCapabilitySupportStatus | undefined {
  if (
    value === "supported" ||
    value === "conditional" ||
    value === "unsupported" ||
    value === "experimental"
  ) {
    return value;
  }

  return undefined;
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  return undefined;
}

function parsePositiveInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  return undefined;
}
