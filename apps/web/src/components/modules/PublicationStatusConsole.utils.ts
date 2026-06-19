import type { Tables } from "@streamos/database";
import type {
  ConnectionStatus,
  ContentJobStatus,
  ContentJobReviewStatus,
  ContentPublicationEventType,
  ContentPublicationStatus,
  StreamPlatform,
  ContentPublicationManualActionPolicy,
} from "@streamos/types";
import {
  buildPublicationManualActionPolicy,
  isApprovedRepurposingPlanResult,
} from "@streamos/types";

export type PublicationRow = Tables<"content_publications">;
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
  desiredVisibility: string;
  effectiveVisibility: string | null;
  externalPostId: string | null;
  externalUrl: string | null;
  failure: PublicationFailureSummary;
  history: PublicationEventSummary[];
  id: string;
  lastReconciledAt: string | null;
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
  previousPublicationStatus: string | null;
  publicationStatus: string;
  source: string;
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

const PUBLICATION_EVENT_LABELS: Partial<
  Record<ContentPublicationEventType, string>
> = {
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
  status: ContentPublicationEventType,
): string {
  return PUBLICATION_EVENT_LABELS[status] ?? capitalizeLabel(status);
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
      id: event.id,
      metadata: formatPublicationRawBlock(event.metadata),
      previousPublicationStatus: event.previous_publication_status,
      publicationStatus: event.publication_status,
      source: event.source,
    }),
  );
  const reviewSnapshot = buildReviewSnapshot(publication, contentJob);
  const failure = buildFailureSummary(publication);
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
