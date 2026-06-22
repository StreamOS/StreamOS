import type { Tables } from "@streamos/database";
import type {
  ConnectionStatus,
  ContentJobStatus,
  ContentJobReviewStatus,
  ContentPublicationEventType,
  ContentPublicationStatus,
  PublicationProviderFailureCode,
  PublicationReconciliationStatus,
  PublicationRemoteStatus,
  StreamPlatform,
  ContentPublicationManualActionPolicy,
} from "@streamos/types";
import {
  buildPublicationManualActionPolicy,
  isApprovedRepurposingPlanResult,
} from "@streamos/types";

export type PublicationRow = Tables<"content_publications"> & {
  desired_visibility: string | null;
  effective_visibility: string | null;
  last_reconciled_at: string | null;
  provider_failure_code: PublicationProviderFailureCode | null;
  provider_failure_metadata: Record<string, unknown>;
  provider_failure_reason: string | null;
  reconcile_max_retries: number;
  reconcile_next_retry_at: string | null;
  reconcile_retry_count: number;
  reconciliation_status: PublicationReconciliationStatus;
  remote_processing_status: string | null;
  remote_state: Record<string, unknown>;
  remote_status: PublicationRemoteStatus | null;
  remote_upload_status: string | null;
  validation_metadata: Record<string, unknown>;
};
export type PublicationEventRow = Tables<"content_publication_events">;
export type PublicationJobRow = Tables<"content_jobs">;
export type PublicationConnectionRow = Tables<"platform_connections">;
export type PublicationChannelRow = Tables<"channels">;
export type PublicationVodAssetRow = Tables<"vod_assets">;

export type PublicationDeliveryStatus =
  | "queued"
  | "processing"
  | "published"
  | "failed"
  | "re-auth required";

export type PublicationStatusTone =
  | "emerald"
  | "amber"
  | "rose"
  | "slate"
  | "violet";

export type PublicationTimelineCategory =
  | "created"
  | "queued"
  | "execution_started"
  | "provider_result"
  | "reconciliation"
  | "retry_requested"
  | "retry_queued"
  | "retry_blocked"
  | "reauth_required"
  | "manual_action_blocked"
  | "final_failed"
  | "unknown";

export type PublicationDashboardModel = {
  items: PublicationDashboardItem[];
  selectedPublication: PublicationDashboardItem | null;
  selectedPublicationId: string | null;
  summary: PublicationDashboardSummary;
};

export type PublicationDashboardSummary = {
  failed: number;
  latestActivityAt: string | null;
  latestReconciledAt: string | null;
  latestPublishedAt: string | null;
  processing: number;
  published: number;
  queued: number;
  reauthRequired: number;
  total: number;
  historyEvents: number;
};

export type PublicationDashboardItem = {
  contentJobId: string;
  contentJobStatus: ContentJobStatus | null;
  connection: PublicationConnectionSummary;
  createdAt: string;
  deliveryStatus: PublicationDeliveryStatus;
  deliveryStatusDescription: string;
  deliveryStatusLabel: string;
  deliveryStatusTone: PublicationStatusTone;
  desiredVisibility: string | null;
  effectiveVisibility: string | null;
  externalPostId: string | null;
  externalUrl: string | null;
  failure: PublicationFailureSummary;
  history: PublicationEventSummary[];
  id: string;
  lastReconciledAt: string | null;
  latestSafeErrorHint: string | null;
  manualReviewRequired: boolean;
  manualActions: ContentPublicationManualActionPolicy;
  publicationStatus: ContentPublicationStatus;
  publicationStatusLabel: string;
  publishedAt: string | null;
  reconcileMaxRetries: number;
  reconcileNextRetryAt: string | null;
  reconcileRetryCount: number;
  reconciliationStatusLabel: string;
  requestedAt: string;
  reviewStatusAtRequest: ContentJobReviewStatus;
  reviewSnapshot: PublicationReviewSnapshot;
  snapshotHash: string;
  targetPlatform: StreamPlatform;
  targetPlatformLabel: string;
  remoteStatusLabel: string;
  updatedAt: string;
  validation: PublicationValidationSummary;
  workflowStatusLabel: string;
  debug: PublicationDebugSnapshot;
};

export type PublicationConnectionSummary = {
  channelDisplayName: string | null;
  connectedAt: string | null;
  platform: StreamPlatform;
  providerLabel: string;
  scopes: string[];
  status: ConnectionStatus;
  statusLabel: string;
  statusTone: "emerald" | "amber" | "rose" | "slate";
};

export type PublicationReviewSnapshot = {
  currentReviewStatus: ContentJobReviewStatus | null;
  confidence: string | null;
  manualReviewRequired: boolean;
  reviewerNotes: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  sourceReviewStatus: ContentJobReviewStatus;
  warnings: string[];
};

export type PublicationFailureSummary = {
  code: string | null;
  message: string | null;
  retryCount: number;
  retryable: boolean;
  retryBudget: string;
  retryEta: string | null;
};

export type PublicationValidationSummary = {
  code: string | null;
  message: string | null;
  validatedAt: string | null;
};

export type PublicationEventSummary = {
  actorLabel: string;
  createdAt: string;
  eventLabel: string;
  id: string;
  metadata: string;
  metadataSummary: string;
  timelineCategory: PublicationTimelineCategory;
  timelineDescription: string;
  timelineLabel: string;
  timelineTone: PublicationStatusTone;
  previousPublicationStatus: string | null;
  publicationStatus: string;
  source: string;
  isFallback: boolean;
};

export type PublicationDebugSnapshot = {
  connection: string | null;
  contentJob: string | null;
  events: string;
  publication: string;
};

export type PublicationDashboardInputs = {
  channels: PublicationChannelRow[];
  connections: PublicationConnectionRow[];
  contentJobs: PublicationJobRow[];
  initialSelectedPublicationId?: string | null;
  publicationEvents: PublicationEventRow[];
  publications: PublicationRow[];
  vodAssets: PublicationVodAssetRow[];
};

const STATUS_TONE: Record<PublicationDeliveryStatus, PublicationStatusTone> = {
  failed: "rose",
  processing: "amber",
  published: "emerald",
  queued: "violet",
  "re-auth required": "slate",
};

const DELIVERY_STATUS_META: Record<
  PublicationDeliveryStatus,
  { description: string; label: string }
> = {
  queued: {
    description:
      "Der Publish-Request ist akzeptiert und wartet auf die naechste serverseitige Aktion.",
    label: "Queued",
  },
  processing: {
    description: "Die Publikation oder Reconciliation laeuft gerade.",
    label: "Processing",
  },
  published: {
    description: "Der Beitrag ist live und mit StreamOS verknuepft.",
    label: "Published",
  },
  failed: {
    description:
      "Die Publikation ist an einem sicheren Fehlerzustand angekommen.",
    label: "Failed",
  },
  "re-auth required": {
    description:
      "Die Verbindung braucht eine erneuerte serverseitige Authentifizierung oder Scopes.",
    label: "Re-auth required",
  },
};

const CONNECTION_STATUS_META: Record<
  ConnectionStatus,
  { label: string; tone: "emerald" | "amber" | "rose" | "slate" }
> = {
  connected: { label: "Connected", tone: "emerald" },
  expired: { label: "Expired", tone: "rose" },
  pending: { label: "Pending", tone: "amber" },
  revoked: { label: "Revoked", tone: "rose" },
};

const PUBLICATION_STATUS_LABELS: Record<ContentPublicationStatus, string> = {
  canceled: "Canceled",
  failed_permanent: "Failed permanent",
  failed_retryable: "Failed retryable",
  published: "Published",
  publishing: "Publishing",
  queued: "Queued",
  rejected: "Rejected",
  requested: "Requested",
  validated: "Validated",
};

const PUBLICATION_EVENT_LABELS: Record<string, string> = {
  canceled: "Canceled",
  failed_permanent: "Failed permanent",
  failed_retryable: "Failed retryable",
  published: "Published",
  publishing: "Publishing",
  queued: "Queued",
  reconcile_failed_permanent: "Reconciliation failed permanently",
  reconcile_failed_retryable: "Reconciliation failed retryably",
  reconcile_requested: "Reconciliation requested",
  reconcile_skipped: "Reconciliation skipped",
  reconciled: "Reconciled",
  rejected: "Rejected",
  requested: "Requested",
  validated: "Validated",
};

const PUBLICATION_TIMELINE_META: Record<
  PublicationTimelineCategory,
  {
    description: string;
    label: string;
    tone: PublicationStatusTone;
  }
> = {
  created: {
    description: "The publication snapshot was created from an approved job.",
    label: "Publication requested",
    tone: "violet",
  },
  execution_started: {
    description:
      "The gateway handed the frozen publication contract to the worker queue.",
    label: "Publishing started",
    tone: "amber",
  },
  final_failed: {
    description: "The publication reached a terminal failure state.",
    label: "Final failure",
    tone: "rose",
  },
  manual_action_blocked: {
    description: "A manual action was blocked by policy or validation.",
    label: "Manual action blocked",
    tone: "slate",
  },
  provider_result: {
    description: "The provider returned a publication result.",
    label: "Provider result",
    tone: "emerald",
  },
  queued: {
    description:
      "The publication was accepted and queued for server-side execution.",
    label: "Queued for publishing",
    tone: "violet",
  },
  reconciliation: {
    description: "Remote state reconciliation was requested or recorded.",
    label: "Reconciliation",
    tone: "amber",
  },
  reauth_required: {
    description: "The connection requires re-authentication or fresh scopes.",
    label: "Re-auth required",
    tone: "amber",
  },
  retry_blocked: {
    description: "Retrying is blocked until the policy or contract changes.",
    label: "Retry blocked",
    tone: "rose",
  },
  retry_queued: {
    description: "A retry was queued for later server-side execution.",
    label: "Retry queued",
    tone: "violet",
  },
  retry_requested: {
    description: "The publication produced a retryable failure.",
    label: "Retry requested",
    tone: "amber",
  },
  unknown: {
    description: "The event was recorded with a safe fallback label.",
    label: "Unknown event",
    tone: "slate",
  },
};

const SENSITIVE_KEY_PATTERNS = [
  /token/i,
  /secret/i,
  /key/i,
  /authorization/i,
  /cookie/i,
  /redis/i,
  /service_role/i,
  /api_gateway_secret/i,
  /webhook_secret/i,
  /openai/i,
  /railway/i,
  /private_url/i,
  /access_token/i,
  /refresh_token/i,
  /client_secret/i,
  /password/i,
] as const;

const STRING_REDACTIONS: Array<[RegExp, string]> = [
  [/\bredis(?:s)?::?\/\/[^\s"'`]+/gi, "[REDACTED_REDIS_URL]"],
  [/\bpostgres(?:ql)?::?\/\/[^\s"'`]+/gi, "[REDACTED_DATABASE_URL]"],
  [
    /\bhttps?:\/\/[^\s"'`]*railway\.app[^\s"'`]*/gi,
    "[public hosted railway url]",
  ],
  [
    /\bhttps?:\/\/[^\s"'`]*railway\.internal(?::\d+)?[^\s"'`]*/gi,
    "[private railway.internal url]",
  ],
  [
    /\b(?:api_gateway_secret|stream_event_webhook_secret|twitch_eventsub_secret|youtube_websub_secret|kick_webhook_secret|supabase_service_role_key|openai_api_key|openai_key|client_secret|access_token|refresh_token|redis_url|database_url|password)\s*[:=]\s*[^\s"'`]+/gi,
    "[REDACTED]",
  ],
  [/\b(?:secret|token|key)\s*=\s*[^\s"'`]+/gi, "[REDACTED]"],
  [/\bsk-[A-Za-z0-9_-]+\b/g, "[REDACTED_OPENAI_KEY]"],
  [/\bBearer\s+[A-Za-z0-9._-]+\b/gi, "Bearer [REDACTED]"],
];

export function buildPublicationDashboardModel({
  channels,
  connections,
  contentJobs,
  initialSelectedPublicationId = null,
  publicationEvents,
  publications,
  vodAssets,
}: PublicationDashboardInputs): PublicationDashboardModel {
  const channelsById = new Map(
    channels.map((channel) => [channel.id, channel]),
  );
  const connectionsById = new Map(
    connections.map((connection) => [connection.id, connection]),
  );
  const contentJobsById = new Map(contentJobs.map((job) => [job.id, job]));
  const vodAssetsByStreamId = new Map<string, PublicationVodAssetRow>();
  for (const asset of [...vodAssets].sort((left, right) =>
    compareDescending(left.updated_at, right.updated_at),
  )) {
    if (!vodAssetsByStreamId.has(asset.stream_id)) {
      vodAssetsByStreamId.set(asset.stream_id, asset);
    }
  }
  const eventsByPublicationId = groupPublicationEvents(publicationEvents);

  const items = [...publications]
    .sort((left, right) => compareDescending(left.updated_at, right.updated_at))
    .map((publication) =>
      buildPublicationDashboardItem({
        channelsById,
        connectionsById,
        contentJobsById,
        eventsByPublicationId,
        publication,
        vodAssetsByStreamId,
      }),
    );

  const selectedPublication =
    items.find((item) => item.id === initialSelectedPublicationId) ??
    items[0] ??
    null;

  return {
    items,
    selectedPublication,
    selectedPublicationId: selectedPublication?.id ?? null,
    summary: buildPublicationSummary(items, publicationEvents),
  };
}

export function getPublicationDeliveryStatusMeta(
  publication: PublicationRow,
  connection: PublicationConnectionRow | null,
): {
  description: string;
  label: string;
  tone: PublicationStatusTone;
  value: PublicationDeliveryStatus;
} {
  const value = getPublicationDeliveryStatus(publication, connection);
  const meta = DELIVERY_STATUS_META[value];

  return {
    description: meta.description,
    label: meta.label,
    tone: STATUS_TONE[value],
    value,
  };
}

export function formatPublicationTimestamp(value: string | null): string {
  if (!value) {
    return "Not available";
  }

  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(timestamp);
}

export function formatPublicationDuration(value: string | null): string {
  if (!value) {
    return "Not available";
  }

  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return "Not available";
  }

  const diffMs = Date.now() - timestamp;

  if (diffMs < 0) {
    return "just now";
  }

  const diffMinutes = Math.floor(diffMs / 60_000);

  if (diffMinutes < 1) {
    return "just now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  return `${Math.floor(diffHours / 24)}d ago`;
}

export function formatPublicationRawBlock(value: unknown): string {
  if (value === null || value === undefined) {
    return "Not available";
  }

  try {
    return JSON.stringify(sanitizePublicationRawValue(value), null, 2);
  } catch {
    return "Not available";
  }
}

export function sanitizePublicationRawValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizePublicationRawValue(item));
  }

  if (!isRecord(value)) {
    if (typeof value === "string") {
      return sanitizePublicationString(value);
    }

    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry], index) => {
      const keyIsSensitive = isSensitiveKey(key);

      return [
        keyIsSensitive ? `[REDACTED_${index + 1}]` : key,
        keyIsSensitive ? "[REDACTED]" : sanitizePublicationRawValue(entry),
      ];
    }),
  );
}

export function sanitizePublicationFreeformText(value: string): string {
  return sanitizePublicationString(value);
}

export function getPublicationWorkflowStatusLabel(
  status: ContentPublicationStatus,
): string {
  return PUBLICATION_STATUS_LABELS[status];
}

export function getPublicationEventLabel(
  status: ContentPublicationEventType | string,
): string {
  return (
    PUBLICATION_EVENT_LABELS[status as ContentPublicationEventType] ??
    capitalizeLabel(status)
  );
}

export function getPublicationTimelineCategoryLabel(
  category: PublicationTimelineCategory,
): string {
  return PUBLICATION_TIMELINE_META[category].label;
}

export function getPublicationTimelineCategoryTone(
  category: PublicationTimelineCategory,
): PublicationStatusTone {
  return PUBLICATION_TIMELINE_META[category].tone;
}

export function getPublicationTimelineCategoryDescription(
  category: PublicationTimelineCategory,
): string {
  return PUBLICATION_TIMELINE_META[category].description;
}

export function getPublicationConnectionStatusLabel(
  status: ConnectionStatus,
): string {
  return CONNECTION_STATUS_META[status].label;
}

export function getPublicationConnectionStatusTone(
  status: ConnectionStatus,
): "emerald" | "amber" | "rose" | "slate" {
  return CONNECTION_STATUS_META[status].tone;
}

export function resolvePublicationSelection(
  items: PublicationDashboardItem[],
  selectedPublicationId: string | null,
): PublicationDashboardItem | null {
  if (selectedPublicationId) {
    const selected = items.find((item) => item.id === selectedPublicationId);

    if (selected) {
      return selected;
    }
  }

  return items[0] ?? null;
}

function buildPublicationDashboardItem({
  channelsById,
  connectionsById,
  contentJobsById,
  eventsByPublicationId,
  publication,
  vodAssetsByStreamId,
}: {
  channelsById: Map<string, PublicationChannelRow>;
  connectionsById: Map<string, PublicationConnectionRow>;
  contentJobsById: Map<string, PublicationJobRow>;
  eventsByPublicationId: Map<string, PublicationEventRow[]>;
  vodAssetsByStreamId: Map<string, PublicationVodAssetRow>;
  publication: PublicationRow;
}): PublicationDashboardItem {
  const connection =
    connectionsById.get(publication.platform_connection_id) ?? null;
  const contentJob = contentJobsById.get(publication.content_job_id) ?? null;
  const channel =
    connection?.channel_id !== null && connection?.channel_id !== undefined
      ? (channelsById.get(connection.channel_id) ?? null)
      : null;
  const deliveryMeta = getPublicationDeliveryStatusMeta(
    publication,
    connection,
  );
  const history = (eventsByPublicationId.get(publication.id) ?? []).map(
    (event) => ({
      actorLabel: getActorLabel(event.actor_id, event.source),
      createdAt: event.created_at,
      eventLabel: getPublicationEventLabel(event.event_type),
      isFallback: isPublicationTimelineFallback(event.event_type),
      id: event.id,
      metadata: formatPublicationRawBlock(event.metadata),
      metadataSummary: summarizePublicationTimelineMetadata(event.metadata),
      previousPublicationStatus: event.previous_publication_status,
      publicationStatus: event.publication_status,
      source: event.source,
      timelineCategory: getPublicationTimelineCategory(
        event,
        publication,
        contentJob,
      ),
      timelineDescription: getPublicationTimelineDescription(
        event,
        publication,
        contentJob,
      ),
      timelineLabel: getPublicationTimelineLabel(
        event,
        publication,
        contentJob,
      ),
      timelineTone: getPublicationTimelineTone(event, publication, contentJob),
    }),
  );
  const reviewSnapshot = buildReviewSnapshot(publication, contentJob);
  const failure = buildFailureSummary(publication);
  const latestSafeErrorHint = getLatestSafeErrorHint(history, failure);
  const normalizedConnectionStatus = normalizeConnectionStatus(
    connection?.status ?? null,
  );
  const hasApprovedBundle = isApprovedRepurposingPlanResult(contentJob?.result);
  const hasPublishableAsset = Boolean(
    contentJob?.stream_id &&
    vodAssetsByStreamId.get(contentJob.stream_id)?.source_url,
  );
  const manualActions = buildPublicationManualActionPolicy({
    connectionScopes: connection?.scopes ?? [],
    connectionStatus: normalizedConnectionStatus,
    contentJobReviewStatus: contentJob?.review_status ?? null,
    contentJobStatus: contentJob?.status ?? null,
    externalPostId: publication.external_post_id,
    hasApprovedBundle,
    hasPublishableAsset,
    maxRetries: publication.max_retries,
    publicationStatus: publication.publication_status,
    reconcileMaxRetries: publication.reconcile_max_retries,
    reconcileRetryCount: publication.reconcile_retry_count,
    reconciliationStatus: publication.reconciliation_status,
    remotePublishId: getPublicationRemotePublishId(publication.remote_state),
    retryCount: publication.retry_count,
    targetPlatform: publication.target_platform,
  });

  return {
    contentJobId: publication.content_job_id,
    contentJobStatus: contentJob?.status ?? null,
    connection: {
      channelDisplayName: channel?.display_name ?? null,
      connectedAt: connection?.connected_at ?? null,
      platform: connection?.platform ?? publication.target_platform,
      providerLabel: getPlatformLabel(
        connection?.platform ?? publication.target_platform,
      ),
      scopes: connection?.scopes ?? [],
      status: normalizedConnectionStatus,
      statusLabel: getPublicationConnectionStatusLabel(
        normalizedConnectionStatus,
      ),
      statusTone: getPublicationConnectionStatusTone(
        normalizedConnectionStatus,
      ),
    },
    createdAt: publication.created_at,
    debug: {
      connection: connection ? formatPublicationRawBlock(connection) : null,
      contentJob: contentJob ? formatPublicationRawBlock(contentJob) : null,
      events: formatPublicationRawBlock(history),
      publication: formatPublicationRawBlock(publication),
    },
    deliveryStatus: deliveryMeta.value,
    deliveryStatusDescription: deliveryMeta.description,
    deliveryStatusLabel: deliveryMeta.label,
    deliveryStatusTone: deliveryMeta.tone,
    desiredVisibility: publication.desired_visibility,
    effectiveVisibility: publication.effective_visibility,
    externalPostId: publication.external_post_id,
    externalUrl: publication.external_url,
    failure,
    history,
    id: publication.id,
    lastReconciledAt: publication.last_reconciled_at,
    latestSafeErrorHint,
    manualReviewRequired: reviewSnapshot.manualReviewRequired,
    manualActions,
    publicationStatus: publication.publication_status,
    publicationStatusLabel: getPublicationWorkflowStatusLabel(
      publication.publication_status,
    ),
    publishedAt: publication.published_at,
    reconcileMaxRetries: publication.reconcile_max_retries,
    reconcileNextRetryAt: publication.reconcile_next_retry_at,
    reconcileRetryCount: publication.reconcile_retry_count,
    reconciliationStatusLabel: getReconciliationStatusLabel(
      publication.reconciliation_status,
    ),
    requestedAt: publication.requested_at,
    reviewSnapshot,
    reviewStatusAtRequest: publication.review_status_at_request,
    snapshotHash: publication.snapshot_hash,
    targetPlatform: publication.target_platform,
    targetPlatformLabel: getPlatformLabel(publication.target_platform),
    remoteStatusLabel: getRemoteStatusLabel(publication.remote_status),
    updatedAt: publication.updated_at,
    validation: {
      code: publication.validation_code,
      message:
        publication.validation_message &&
        publication.validation_message.trim().length > 0
          ? sanitizePublicationFreeformText(publication.validation_message)
          : null,
      validatedAt: publication.validated_at,
    },
    workflowStatusLabel: getPublicationWorkflowStatusLabel(
      publication.publication_status,
    ),
  };
}

function buildPublicationSummary(
  items: PublicationDashboardItem[],
  publicationEvents: PublicationEventRow[],
): PublicationDashboardSummary {
  const latestActivityAt = latestTimestamp([
    ...items.map((item) => item.updatedAt),
    ...publicationEvents.map((event) => event.created_at),
  ]);
  const latestReconciledAt = latestTimestamp(
    items.map((item) => item.lastReconciledAt),
  );
  const latestPublishedAt = latestTimestamp(
    items.map((item) => item.publishedAt),
  );

  return {
    failed: items.filter((item) => item.deliveryStatus === "failed").length,
    historyEvents: publicationEvents.length,
    latestActivityAt,
    latestPublishedAt,
    latestReconciledAt,
    processing: items.filter((item) => item.deliveryStatus === "processing")
      .length,
    published: items.filter((item) => item.deliveryStatus === "published")
      .length,
    queued: items.filter((item) => item.deliveryStatus === "queued").length,
    reauthRequired: items.filter(
      (item) => item.deliveryStatus === "re-auth required",
    ).length,
    total: items.length,
  };
}

function buildFailureSummary(
  publication: PublicationRow,
): PublicationFailureSummary {
  const retryBudget = `${publication.retry_count}/${publication.max_retries}`;
  const nextRetryAt =
    publication.next_retry_at ??
    publication.reconcile_next_retry_at ??
    publication.last_reconciled_at;
  const retryable = publication.publication_status === "failed_retryable";
  const code = publication.provider_failure_code ?? publication.validation_code;

  return {
    code,
    message: sanitizePublicationFreeformText(
      publication.provider_failure_reason ??
        publication.validation_message ??
        "Not available",
    ),
    retryCount: publication.retry_count,
    retryable,
    retryBudget,
    retryEta: nextRetryAt,
  };
}

function getLatestSafeErrorHint(
  history: PublicationEventSummary[],
  failure: PublicationFailureSummary,
): string | null {
  const fallbackCategories: PublicationTimelineCategory[] = [
    "retry_blocked",
    "retry_requested",
    "retry_queued",
    "reauth_required",
    "manual_action_blocked",
    "final_failed",
  ];

  const matchingEvent = history.find((event) =>
    fallbackCategories.includes(event.timelineCategory),
  );

  if (matchingEvent?.timelineDescription) {
    return matchingEvent.timelineDescription;
  }

  if (failure.message && failure.message !== "Not available") {
    return failure.message;
  }

  return null;
}

function buildReviewSnapshot(
  publication: PublicationRow,
  contentJob: PublicationJobRow | null,
): PublicationReviewSnapshot {
  const result = isRecord(contentJob?.result) ? contentJob?.result : null;
  const currentReviewStatus =
    contentJob?.review_status ?? publication.review_status_at_request;
  const warnings = readStringArrayList(result, "warnings");
  const confidence = readNumber(result, "confidence");
  const manualReviewRequired = readBoolean(result, "manual_review_required");

  return {
    currentReviewStatus,
    confidence: typeof confidence === "number" ? `${confidence}/100` : null,
    manualReviewRequired,
    reviewerNotes: contentJob?.reviewer_notes
      ? sanitizePublicationFreeformText(contentJob.reviewer_notes)
      : null,
    reviewedAt: contentJob?.reviewed_at ?? publication.validated_at,
    reviewedBy: contentJob?.reviewed_by ?? publication.requested_by,
    sourceReviewStatus: publication.review_status_at_request,
    warnings: warnings.map((warning) =>
      sanitizePublicationFreeformText(warning),
    ),
  };
}

function getPublicationTimelineCategory(
  event: PublicationEventRow,
  publication: PublicationRow,
  contentJob: PublicationJobRow | null,
): PublicationTimelineCategory {
  const eventType = event.event_type as string;

  switch (eventType) {
    case "requested":
      return "created";
    case "validated":
    case "queued":
      return "queued";
    case "publishing":
      return "execution_started";
    case "published":
      return "provider_result";
    case "failed_retryable":
    case "reconcile_failed_retryable":
      return "retry_requested";
    case "failed_permanent":
    case "reconcile_failed_permanent":
      return "final_failed";
    case "rejected":
    case "canceled":
      return "manual_action_blocked";
    case "reconcile_requested":
      return "reconciliation";
    case "reconcile_skipped":
    case "reconciled":
      return "provider_result";
    default:
      if (event.source.includes("reconcile") || event.source === "worker") {
        return "reconciliation";
      }

      if (
        contentJob?.status === "failed" ||
        publication.publication_status === "failed_permanent"
      ) {
        return "final_failed";
      }

      return "unknown";
  }
}

function getPublicationTimelineTone(
  event: PublicationEventRow,
  publication: PublicationRow,
  contentJob: PublicationJobRow | null,
): PublicationStatusTone {
  return PUBLICATION_TIMELINE_META[
    getPublicationTimelineCategory(event, publication, contentJob)
  ].tone;
}

function getPublicationTimelineLabel(
  event: PublicationEventRow,
  publication: PublicationRow,
  contentJob: PublicationJobRow | null,
): string {
  const eventType = event.event_type as string;
  const category = getPublicationTimelineCategory(
    event,
    publication,
    contentJob,
  );

  if (category === "queued" && event.event_type === "queued") {
    const manualAction = readString(event.metadata, "manual_action");

    if (manualAction === "retry_publish") {
      return "Retry queued";
    }

    if (manualAction === "reconcile_now") {
      return "Reconciliation queued";
    }
  }

  if (eventType === "reconcile_requested") {
    return "Reconciliation requested";
  }

  if (eventType === "reconcile_skipped") {
    return "Reconciliation skipped";
  }

  if (eventType === "reconciled") {
    return "Reconciled";
  }

  if (eventType === "reconcile_failed_retryable") {
    return "Reconciliation retryable failure";
  }

  if (eventType === "reconcile_failed_permanent") {
    return "Reconciliation permanent failure";
  }

  if (
    category === "provider_result" &&
    publication.publication_status === "published"
  ) {
    return "Published";
  }

  if (category === "retry_requested") {
    return "Retry requested";
  }

  return getPublicationTimelineCategoryLabel(category);
}

function getPublicationTimelineDescription(
  event: PublicationEventRow,
  publication: PublicationRow,
  contentJob: PublicationJobRow | null,
): string {
  const category = getPublicationTimelineCategory(
    event,
    publication,
    contentJob,
  );
  const manualAction = readString(event.metadata, "manual_action");
  const reason = readString(event.metadata, "reason");
  const errorCode = readString(event.metadata, "error_code");
  const upstreamStatus = readNumber(event.metadata, "upstream_status");
  const retryOwner = readString(event.metadata, "retry_owner");
  const retryAfterSeconds = readNumber(event.metadata, "retry_after_seconds");
  const queueJobId = readString(event.metadata, "queue_job_id");
  const externalPostId = readString(event.metadata, "external_post_id");
  const reconcileRetryCount = readNumber(
    event.metadata,
    "reconcile_retry_count",
  );
  const retryCount = readNumber(event.metadata, "retry_count");
  const reviewStatus = readString(event.metadata, "review_status");
  const validationCode = readString(event.metadata, "validation_code");

  const contextualParts: string[] = [];

  if (manualAction) {
    contextualParts.push(
      `manual action ${formatPublicationContextValue(manualAction)}`,
    );
  }

  if (queueJobId) {
    contextualParts.push(`queue ${formatCompactId(queueJobId)}`);
  }

  if (externalPostId) {
    contextualParts.push(`remote ${formatCompactId(externalPostId)}`);
  }

  if (retryCount !== null) {
    contextualParts.push(`retry ${retryCount}`);
  }

  if (reconcileRetryCount !== null) {
    contextualParts.push(`reconcile retry ${reconcileRetryCount}`);
  }

  if (retryOwner) {
    contextualParts.push(
      `retry owner ${formatPublicationContextValue(retryOwner)}`,
    );
  }

  if (typeof retryAfterSeconds === "number") {
    contextualParts.push(`retry in ${retryAfterSeconds}s`);
  }

  if (typeof upstreamStatus === "number") {
    contextualParts.push(`upstream ${upstreamStatus}`);
  }

  if (reviewStatus) {
    contextualParts.push(
      `review ${formatPublicationContextValue(reviewStatus)}`,
    );
  }

  if (validationCode) {
    contextualParts.push(
      `validation ${formatPublicationContextValue(validationCode)}`,
    );
  }

  if (errorCode) {
    contextualParts.push(`error ${formatPublicationContextValue(errorCode)}`);
  }

  if (reason) {
    contextualParts.push(formatPublicationContextValue(reason));
  }

  switch (category) {
    case "created":
      return "The publication snapshot was captured from an approved repurposing job.";
    case "queued":
      return contextualParts.length > 0
        ? `The publication was queued for server-side execution. ${contextualParts.join(" · ")}.`
        : "The publication was queued for server-side execution.";
    case "execution_started":
      return contextualParts.length > 0
        ? `Publishing execution started server-side. ${contextualParts.join(" · ")}.`
        : "Publishing execution started server-side.";
    case "provider_result":
      return contextualParts.length > 0
        ? `The provider returned a publication result. ${contextualParts.join(" · ")}.`
        : "The provider returned a publication result.";
    case "reconciliation":
      return contextualParts.length > 0
        ? `Remote reconciliation was recorded server-side. ${contextualParts.join(" · ")}.`
        : "Remote reconciliation was recorded server-side.";
    case "retry_requested":
      return contextualParts.length > 0
        ? `The publication produced a retryable outcome. ${contextualParts.join(" · ")}.`
        : "The publication produced a retryable outcome.";
    case "retry_queued":
      return contextualParts.length > 0
        ? `A retry was queued server-side. ${contextualParts.join(" · ")}.`
        : "A retry was queued server-side.";
    case "retry_blocked":
      return contextualParts.length > 0
        ? `Retrying remains blocked. ${contextualParts.join(" · ")}.`
        : "Retrying remains blocked.";
    case "reauth_required":
      return contextualParts.length > 0
        ? `The connection requires re-authentication or fresh scopes. ${contextualParts.join(" · ")}.`
        : "The connection requires re-authentication or fresh scopes.";
    case "manual_action_blocked":
      return contextualParts.length > 0
        ? `A manual action was blocked by policy. ${contextualParts.join(" · ")}.`
        : "A manual action was blocked by policy.";
    case "final_failed":
      return contextualParts.length > 0
        ? `The publication reached a terminal failure state. ${contextualParts.join(" · ")}.`
        : "The publication reached a terminal failure state.";
    case "unknown":
    default:
      return contextualParts.length > 0
        ? `A safe fallback timeline event was recorded. ${contextualParts.join(" · ")}.`
        : "A safe fallback timeline event was recorded.";
  }
}

function isPublicationTimelineFallback(
  eventType: ContentPublicationEventType | string,
): boolean {
  return !(
    eventType === "requested" ||
    eventType === "validated" ||
    eventType === "rejected" ||
    eventType === "canceled" ||
    eventType === "queued" ||
    eventType === "publishing" ||
    eventType === "published" ||
    eventType === "failed_retryable" ||
    eventType === "failed_permanent" ||
    eventType === "reconcile_requested" ||
    eventType === "reconcile_skipped" ||
    eventType === "reconcile_failed_retryable" ||
    eventType === "reconcile_failed_permanent" ||
    eventType === "reconciled"
  );
}

function getActorLabel(actorId: string, source: string): string {
  if (source === "api-gateway") {
    return "API Gateway";
  }

  if (source === "automation-service") {
    return "Automation Service";
  }

  if (source === "worker" || source.includes("worker")) {
    return "Worker";
  }

  if (actorId === "system") {
    return "System";
  }

  return "Creator";
}

function getPlatformLabel(platform: StreamPlatform): string {
  switch (platform) {
    case "twitch":
      return "Twitch";
    case "youtube":
      return "YouTube";
    case "tiktok":
      return "TikTok";
    case "kick":
      return "Kick";
    default:
      return platform;
  }
}

function getReconciliationStatusLabel(
  status: PublicationRow["reconciliation_status"],
): string {
  switch (status) {
    case "failed_permanent":
      return "Reconciliation failed permanently";
    case "failed_retryable":
      return "Reconciliation failed retryably";
    case "queued":
      return "Queued";
    case "reconciled":
      return "Reconciled";
    case "reconciling":
      return "Reconciling";
    case "skipped":
      return "Skipped";
    case "idle":
    default:
      return "Idle";
  }
}

function getRemoteStatusLabel(status: PublicationRow["remote_status"]): string {
  switch (status) {
    case "missing":
      return "Missing";
    case "processing":
      return "Processing";
    case "published":
      return "Published";
    case "rejected":
      return "Rejected";
    case "unknown":
    case null:
    default:
      return "Unknown";
  }
}

function normalizeConnectionStatus(
  status: PublicationConnectionRow["status"] | null,
): ConnectionStatus {
  if (status === "connected") {
    return "connected";
  }

  if (status === "expired") {
    return "expired";
  }

  if (
    status === "revoked" ||
    status === "disconnected" ||
    status === "degraded"
  ) {
    return "revoked";
  }

  return "pending";
}

function getPublicationDeliveryStatus(
  publication: PublicationRow,
  connection: PublicationConnectionRow | null,
): PublicationDeliveryStatus {
  if (
    publication.publication_status === "published" ||
    publication.published_at ||
    publication.remote_status === "published"
  ) {
    return "published";
  }

  if (isReauthRequired(publication, connection)) {
    return "re-auth required";
  }

  if (isFailedPublication(publication)) {
    return "failed";
  }

  if (isProcessingPublication(publication)) {
    return "processing";
  }

  return "queued";
}

function isReauthRequired(
  publication: PublicationRow,
  connection: PublicationConnectionRow | null,
): boolean {
  const connectionStatus = normalizeConnectionStatus(
    connection?.status ?? null,
  );
  const requiresScopeRefresh =
    publication.validation_code === "missing_publish_scopes";
  const authFailureCode =
    publication.provider_failure_code === "provider_unauthorized";
  const missingConnection = !connection;
  const disconnectedConnection = connectionStatus !== "connected";
  const connectionExpired =
    connectionStatus === "expired" || connectionStatus === "revoked";

  return Boolean(
    !publication.published_at &&
    (requiresScopeRefresh ||
      authFailureCode ||
      missingConnection ||
      disconnectedConnection ||
      connectionExpired),
  );
}

function isFailedPublication(publication: PublicationRow): boolean {
  return (
    publication.publication_status === "failed_retryable" ||
    publication.publication_status === "failed_permanent" ||
    publication.publication_status === "rejected" ||
    publication.publication_status === "canceled" ||
    publication.remote_status === "rejected"
  );
}

function isProcessingPublication(publication: PublicationRow): boolean {
  return (
    publication.publication_status === "publishing" ||
    publication.remote_status === "processing" ||
    publication.reconciliation_status === "queued" ||
    publication.reconciliation_status === "reconciling"
  );
}

function groupPublicationEvents(
  publicationEvents: PublicationEventRow[],
): Map<string, PublicationEventRow[]> {
  const grouped = new Map<string, PublicationEventRow[]>();

  for (const event of [...publicationEvents].sort((left, right) =>
    compareDescending(left.created_at, right.created_at),
  )) {
    const existing = grouped.get(event.content_publication_id) ?? [];
    existing.push(event);
    grouped.set(event.content_publication_id, existing);
  }

  return grouped;
}

function compareDescending(left: string, right: string): number {
  return new Date(right).getTime() - new Date(left).getTime();
}

function latestTimestamp(values: Array<string | null>): string | null {
  const timestamps = values
    .filter((value): value is string => typeof value === "string")
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value));

  if (timestamps.length === 0) {
    return null;
  }

  return new Date(Math.max(...timestamps)).toISOString();
}

function getPublicationRemotePublishId(
  remoteState: Record<string, unknown> | null,
): string | null {
  if (!remoteState) {
    return null;
  }

  const candidateKeys = [
    "provider_publish_id",
    "providerPublishId",
    "provider_post_id",
    "providerPostId",
    "publicaly_available_post_id",
    "publically_available_post_id",
    "publicly_available_post_id",
    "remotePostId",
    "post_id",
    "publish_id",
  ] as const;

  for (const key of candidateKeys) {
    const value = remoteState[key];

    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }

    if (Array.isArray(value) && value.length > 0) {
      const first = value[0];

      if (typeof first === "string" && first.trim().length > 0) {
        return first.trim();
      }

      if (typeof first === "number" && Number.isFinite(first)) {
        return String(first);
      }
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return null;
}

function summarizePublicationTimelineMetadata(metadata: unknown): string {
  if (!isRecord(metadata)) {
    return "Not available";
  }

  const parts: string[] = [];
  const manualAction = readString(metadata, "manual_action");
  const queueJobId = readString(metadata, "queue_job_id");
  const retryOwner = readString(metadata, "retry_owner");
  const errorCode = readString(metadata, "error_code");
  const validationCode = readString(metadata, "validation_code");
  const reason = readString(metadata, "reason");
  const reviewStatus = readString(metadata, "review_status");
  const source = readString(metadata, "source");
  const targetPlatform = readString(metadata, "target_platform");
  const upstreamStatus = readNumber(metadata, "upstream_status");
  const retryCount = readNumber(metadata, "retry_count");
  const reconcileRetryCount = readNumber(metadata, "reconcile_retry_count");
  const retryAfterSeconds = readNumber(metadata, "retry_after_seconds");

  if (manualAction) {
    parts.push(`manual action ${formatPublicationContextValue(manualAction)}`);
  }

  if (queueJobId) {
    parts.push(`queue ${formatCompactId(queueJobId)}`);
  }

  if (retryOwner) {
    parts.push(`retry owner ${formatPublicationContextValue(retryOwner)}`);
  }

  if (retryCount !== null) {
    parts.push(`retry ${retryCount}`);
  }

  if (reconcileRetryCount !== null) {
    parts.push(`reconcile retry ${reconcileRetryCount}`);
  }

  if (typeof upstreamStatus === "number") {
    parts.push(`upstream ${upstreamStatus}`);
  }

  if (typeof retryAfterSeconds === "number") {
    parts.push(`retry in ${retryAfterSeconds}s`);
  }

  if (validationCode) {
    parts.push(`validation ${formatPublicationContextValue(validationCode)}`);
  }

  if (errorCode) {
    parts.push(`error ${formatPublicationContextValue(errorCode)}`);
  }

  if (reviewStatus) {
    parts.push(`review ${formatPublicationContextValue(reviewStatus)}`);
  }

  if (targetPlatform) {
    parts.push(`platform ${formatPublicationContextValue(targetPlatform)}`);
  }

  if (source) {
    parts.push(`source ${formatPublicationContextValue(source)}`);
  }

  if (reason) {
    parts.push(formatPublicationContextValue(reason));
  }

  return parts.length > 0 ? parts.join(" · ") : "Not available";
}

function sanitizePublicationString(value: string): string {
  return STRING_REDACTIONS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    value,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function readStringArrayList(value: unknown, key: string): string[] {
  if (!isRecord(value)) {
    return [];
  }

  const candidate = value[key];
  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function readNumber(value: unknown, ...keys: string[]): number | null {
  if (!isRecord(value)) {
    return null;
  }

  for (const key of keys) {
    const candidate = value[key];

    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
  }

  return null;
}

function readString(value: unknown, ...keys: string[]): string | null {
  if (!isRecord(value)) {
    return null;
  }

  for (const key of keys) {
    const candidate = value[key];

    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return sanitizePublicationFreeformText(candidate.trim());
    }
  }

  return null;
}

function readBoolean(value: unknown, ...keys: string[]): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return keys.some((key) => value[key] === true);
}

function capitalizeLabel(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/(^|\s)\S/g, (match) => match.toUpperCase());
}

function formatPublicationContextValue(value: string): string {
  return sanitizePublicationFreeformText(value)
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatCompactId(value: string): string {
  if (value.length <= 16) {
    return value;
  }

  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}
