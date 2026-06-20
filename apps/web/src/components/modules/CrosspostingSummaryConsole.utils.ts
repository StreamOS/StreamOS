import type { Tables } from "@streamos/database";
import type {
  ConnectionStatus,
  ContentJobReviewStatus,
  ContentJobStatus,
  ContentPublicationFanoutActionDecision,
  PublicationFanoutPolicy,
  PublicationFanoutTargetPlatform,
} from "@streamos/types";
import {
  buildPublicationFanoutChildRetryActionPolicy,
  buildPublicationFanoutParentRefreshActionPolicy,
  buildPublicationFanoutTargetRecheckActionPolicy,
  isApprovedRepurposingPlanResult,
} from "@streamos/types";
import type {
  PublicationChannelRow,
  PublicationConnectionRow,
  PublicationDashboardItem,
} from "./PublicationStatusConsole.utils";
import { sanitizePublicationFreeformText } from "./PublicationStatusConsole.utils";

export type PublicationFanoutRow = Tables<"content_publication_fanouts">;
export type PublicationFanoutTargetRow =
  Tables<"content_publication_fanout_targets">;

export type CrosspostingSummaryDashboardInputs = {
  channels: PublicationChannelRow[];
  connections: PublicationConnectionRow[];
  fanoutTargets: PublicationFanoutTargetRow[];
  fanouts: PublicationFanoutRow[];
  initialSelectedFanoutId?: string | null;
  publications: PublicationDashboardItem[];
};

export type CrosspostingSummaryDashboardModel = {
  items: CrosspostingSummaryFanoutItem[];
  selectedFanout: CrosspostingSummaryFanoutItem | null;
  selectedFanoutId: string | null;
  summary: CrosspostingSummaryDashboardSummary;
};

export type CrosspostingSummaryDashboardSummary = {
  blockedCount: number;
  failedCount: number;
  fanoutCount: number;
  latestActivityAt: string | null;
  processingCount: number;
  publishedCount: number;
  queuedCount: number;
  requiresActionCount: number;
  targetCount: number;
};

export type CrosspostingSummaryFanoutItem = {
  blockedCount: number;
  createdAt: string;
  failedCount: number;
  lastActionAt: string | null;
  lastActionResult: string | null;
  lastAggregateRefreshedAt: string | null;
  fanoutPolicy: PublicationFanoutPolicy;
  id: string;
  latestActivityAt: string | null;
  actions: CrosspostingSummaryFanoutActions;
  overallSafeMessage: string;
  processingCount: number;
  publishedCount: number;
  queuedCount: number;
  requiresActionCount: number;
  requestedAt: string;
  requestIntentHash: string;
  selectedTargetCount: number;
  snapshotHash: string;
  sourceContentLabel: string;
  sourceTitle: string;
  status: CrosspostingParentStatus;
  statusLabel: string;
  statusTone: CrosspostingStatusTone;
  targetCount: number;
  targets: CrosspostingSummaryTargetItem[];
  updatedAt: string;
};

export type CrosspostingSummaryTargetItem = {
  blockMessage: string | null;
  blockReason: string | null;
  childRetryAction: ContentPublicationFanoutActionDecision | null;
  childHistoryHref: string | null;
  childPublicationId: string | null;
  childPublicationStatusLabel: string;
  connectionLabel: string;
  connectionStatusLabel: string;
  connectionStatusTone: CrosspostingStatusTone;
  effectiveVisibilityLabel: string;
  id: string;
  lastEventAt: string | null;
  lastActionAt: string | null;
  lastActionResult: string | null;
  lastBlockReason: string | null;
  lastRecheckedAt: string | null;
  lastReconciledAt: string | null;
  manualInterventionRequired: boolean;
  providerLabel: string;
  recheckAction: ContentPublicationFanoutActionDecision;
  reauthRequired: boolean;
  remoteUrl: string | null;
  requestedVisibilityLabel: string;
  safeErrorHint: string | null;
  targetPlatform: PublicationFanoutTargetRow["target_platform"];
  targetPlatformLabel: string;
  targetStatus: CrosspostingTargetStatus;
  targetStatusLabel: string;
  targetStatusTone: CrosspostingStatusTone;
};

export type CrosspostingSummaryFanoutActions = {
  refreshParentAggregate: ContentPublicationFanoutActionDecision;
};

export type CrosspostingTargetStatus =
  | "blocked"
  | "failed"
  | "processing"
  | "published"
  | "queued"
  | "ready"
  | "re-auth required"
  | "unsupported"
  | "unknown";

export type CrosspostingParentStatus =
  | "prepared"
  | "ready"
  | "queued"
  | "processing"
  | "partially_published"
  | "published"
  | "partially_failed"
  | "failed"
  | "blocked"
  | "partially_blocked"
  | "requires_action"
  | "final_failed"
  | "unknown_fallback";

export type CrosspostingStatusTone =
  | "emerald"
  | "amber"
  | "rose"
  | "slate"
  | "violet";

const TARGET_PLATFORM_LABELS: Record<PublicationFanoutTargetPlatform, string> =
  {
    tiktok: "TikTok",
    youtube: "YouTube",
  };

const CROSSPOSTING_PARENT_META: Record<
  CrosspostingParentStatus,
  { description: string; label: string; tone: CrosspostingStatusTone }
> = {
  prepared: {
    description:
      "The parent fanout has been prepared and is awaiting execution.",
    label: "Prepared",
    tone: "slate",
  },
  ready: {
    description: "The parent fanout is validated and ready for execution.",
    label: "Ready",
    tone: "violet",
  },
  queued: {
    description: "At least one target is queued for server-side execution.",
    label: "Queued",
    tone: "violet",
  },
  processing: {
    description: "One or more targets are processing server-side.",
    label: "Processing",
    tone: "amber",
  },
  partially_published: {
    description:
      "Some targets are live while others still need safe follow-up.",
    label: "Partially published",
    tone: "amber",
  },
  published: {
    description: "All child publications are live.",
    label: "Published",
    tone: "emerald",
  },
  partially_failed: {
    description:
      "Some targets failed while others remain valid, queued, or published.",
    label: "Partially failed",
    tone: "rose",
  },
  failed: {
    description: "The child publications reached a terminal failure state.",
    label: "Failed",
    tone: "rose",
  },
  blocked: {
    description: "All targets are blocked and the fanout cannot continue.",
    label: "Blocked",
    tone: "rose",
  },
  partially_blocked: {
    description:
      "Some targets are blocked while others are still valid or active.",
    label: "Partially blocked",
    tone: "amber",
  },
  requires_action: {
    description:
      "At least one target needs re-auth or manual follow-up before it can continue.",
    label: "Requires action",
    tone: "amber",
  },
  final_failed: {
    description:
      "Every target reached a terminal failure or blocked state and the fanout is closed.",
    label: "Final failed",
    tone: "rose",
  },
  unknown_fallback: {
    description:
      "The fanout state could not be classified safely from the available data.",
    label: "Unknown fallback",
    tone: "slate",
  },
};

const TARGET_STATUS_META: Record<
  CrosspostingTargetStatus,
  { label: string; tone: CrosspostingStatusTone }
> = {
  blocked: { label: "Blocked", tone: "rose" },
  failed: { label: "Failed", tone: "rose" },
  processing: { label: "Processing", tone: "amber" },
  published: { label: "Published", tone: "emerald" },
  queued: { label: "Queued", tone: "violet" },
  ready: { label: "Ready", tone: "violet" },
  "re-auth required": { label: "Re-auth required", tone: "amber" },
  unsupported: { label: "Unsupported", tone: "slate" },
  unknown: { label: "Unknown", tone: "slate" },
};

type FanoutSnapshot = {
  approvedBundle?: unknown;
  contentJob?: {
    id?: string | null;
    queueJobId?: string | null;
    reviewStatus?: string | null;
    status?: string | null;
    streamId?: string | null;
  } | null;
};

export function buildCrosspostingSummaryDashboardModel({
  channels,
  connections,
  fanoutTargets,
  fanouts,
  initialSelectedFanoutId = null,
  publications,
}: CrosspostingSummaryDashboardInputs): CrosspostingSummaryDashboardModel {
  const publicationById = new Map(publications.map((item) => [item.id, item]));
  const connectionById = new Map(connections.map((item) => [item.id, item]));
  const channelById = new Map(channels.map((item) => [item.id, item]));
  const targetsByFanoutId = groupTargetsByFanoutId(fanoutTargets);

  const items = [...fanouts]
    .sort((left, right) => compareDescending(left.updated_at, right.updated_at))
    .map((fanout) =>
      buildCrosspostingFanoutItem({
        channelById,
        connectionById,
        fanout,
        publicationById,
        targets: targetsByFanoutId.get(fanout.id) ?? [],
      }),
    );

  const selectedFanout =
    items.find((item) => item.id === initialSelectedFanoutId) ??
    items[0] ??
    null;

  return {
    items,
    selectedFanout,
    selectedFanoutId: selectedFanout?.id ?? null,
    summary: buildCrosspostingSummary(items),
  };
}

export function getCrosspostingParentStatusMeta(
  status: CrosspostingParentStatus,
): { description: string; label: string; tone: CrosspostingStatusTone } {
  return CROSSPOSTING_PARENT_META[status];
}

export function getCrosspostingTargetStatusMeta(
  status: CrosspostingTargetStatus,
): { label: string; tone: CrosspostingStatusTone } {
  return TARGET_STATUS_META[status];
}

export function formatCrosspostingSafeVisibility(value: string | null): string {
  if (!value) {
    return "Not available";
  }

  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function formatCrosspostingSafeUrl(value: string | null): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();

    if (url.protocol !== "https:") {
      return null;
    }

    if (url.username || url.password) {
      return null;
    }

    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.endsWith(".local") ||
      hostname.includes("railway.app") ||
      hostname.includes("railway.internal")
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function compareDescending(left: string, right: string): number {
  return new Date(right).getTime() - new Date(left).getTime();
}

function buildCrosspostingFanoutItem({
  channelById,
  connectionById,
  fanout,
  publicationById,
  targets,
}: {
  channelById: Map<string, PublicationChannelRow>;
  connectionById: Map<string, PublicationConnectionRow>;
  fanout: PublicationFanoutRow;
  publicationById: Map<string, PublicationDashboardItem>;
  targets: PublicationFanoutTargetRow[];
}): CrosspostingSummaryFanoutItem {
  const sortedTargets = [...targets].sort(compareTargets);
  const resolvedTargets = sortedTargets.map((target) =>
    buildCrosspostingTargetItem({
      channelById,
      connectionById,
      fanout,
      publicationById,
      target,
    }),
  );
  const childPublications = resolvedTargets
    .map((target) =>
      target.childPublicationId
        ? (publicationById.get(target.childPublicationId) ?? null)
        : null,
    )
    .filter(
      (publication): publication is PublicationDashboardItem =>
        publication !== null,
    );
  const counts = summarizeChildCounts(resolvedTargets, childPublications);
  const status = resolveCrosspostingParentStatus(fanout, counts);
  const statusMeta = getCrosspostingParentStatusMeta(status);
  const sourceSnapshot = readFanoutSnapshot(fanout.snapshot);
  const approvedBundle = isApprovedRepurposingPlanResult(
    sourceSnapshot.approvedBundle,
  )
    ? sourceSnapshot.approvedBundle
    : null;
  const sourceTitle =
    approvedBundle?.title_suggestions?.[0] ??
    approvedBundle?.short_form_plan ??
    "Approved repurposing bundle";
  const sourceContentLabel = sourceSnapshot.contentJob?.streamId
    ? `Stream ${formatCompactId(sourceSnapshot.contentJob.streamId)}`
    : "Approved repurposing bundle";

  return {
    blockedCount: counts.blockedCount,
    createdAt: fanout.created_at,
    lastActionAt: fanout.last_action_at,
    lastActionResult: fanout.last_action_result,
    lastAggregateRefreshedAt: fanout.last_aggregate_refreshed_at,
    failedCount: counts.failedCount,
    actions: {
      refreshParentAggregate: buildPublicationFanoutParentRefreshActionPolicy({
        fanoutStatus: fanout.fanout_status,
      }),
    },
    fanoutPolicy: fanout.fanout_policy,
    id: fanout.id,
    latestActivityAt: latestTimestamp([
      fanout.updated_at,
      ...resolvedTargets.map((target) => target.lastEventAt),
    ]),
    overallSafeMessage: buildOverallSafeMessage(status, counts),
    processingCount: counts.processingCount,
    publishedCount: counts.publishedCount,
    queuedCount: counts.queuedCount,
    requiresActionCount: counts.requiresActionCount,
    requestedAt: fanout.requested_at,
    requestIntentHash: fanout.request_intent_hash,
    selectedTargetCount: resolvedTargets.filter(
      (target) => target.targetStatus !== "blocked",
    ).length,
    snapshotHash: fanout.snapshot_hash,
    sourceContentLabel,
    sourceTitle,
    status,
    statusLabel: statusMeta.label,
    statusTone: statusMeta.tone,
    targetCount: fanout.target_count,
    targets: resolvedTargets,
    updatedAt: fanout.updated_at,
  };
}

function buildCrosspostingTargetItem({
  channelById,
  connectionById,
  fanout,
  publicationById,
  target,
}: {
  channelById: Map<string, PublicationChannelRow>;
  connectionById: Map<string, PublicationConnectionRow>;
  fanout: PublicationFanoutRow;
  publicationById: Map<string, PublicationDashboardItem>;
  target: PublicationFanoutTargetRow;
}): CrosspostingSummaryTargetItem {
  const publication = target.content_publication_id
    ? (publicationById.get(target.content_publication_id) ?? null)
    : null;
  const connection = connectionById.get(target.platform_connection_id) ?? null;
  const normalizedConnectionStatus = normalizeConnectionStatus(
    connection?.status ?? null,
  );
  const channel =
    connection?.channel_id !== null && connection?.channel_id !== undefined
      ? (channelById.get(connection.channel_id) ?? null)
      : null;
  const connectionLabel =
    publication?.connection.channelDisplayName ??
    channel?.display_name ??
    "Not linked";
  const providerLabel =
    publication?.connection.providerLabel ?? getTargetProviderLabel(target);
  const connectionStatusLabel =
    publication?.connection.statusLabel ??
    getConnectionStatusLabel(normalizedConnectionStatus);
  const connectionStatusTone =
    publication?.connection.statusTone ??
    getConnectionStatusTone(normalizedConnectionStatus);
  const targetStatus = resolveCrosspostingTargetStatus(target, publication);
  const targetStatusMeta = getCrosspostingTargetStatusMeta(targetStatus);
  const safeErrorHint =
    publication?.latestSafeErrorHint ??
    formatCrosspostingBlockReason(target.block_reason, target.block_message);
  const manualInterventionRequired = Boolean(
    publication?.manualActions.nextAction &&
    publication.deliveryStatus !== "published",
  );
  const sourceSnapshot = readFanoutSnapshot(fanout.snapshot);
  const approvedBundle = isApprovedRepurposingPlanResult(
    sourceSnapshot.approvedBundle,
  )
    ? sourceSnapshot.approvedBundle
    : null;
  const sourceContentJob = sourceSnapshot.contentJob ?? null;
  const safeTargetPlatform = normalizePublicationFanoutTargetPlatform(
    target.target_platform,
  );
  const recheckAction = buildPublicationFanoutTargetRecheckActionPolicy({
    connection: connection
      ? {
          metadata: connection.metadata,
          platform: connection.platform,
          provider_profile: connection.provider_profile,
          scopes: connection.scopes,
          status: normalizedConnectionStatus,
        }
      : null,
    contentJob: {
      id:
        sourceContentJob?.id ??
        target.content_publication_id ??
        publication?.id ??
        "unknown",
      queueJobId: sourceContentJob?.queueJobId ?? null,
      result: approvedBundle,
      reviewStatus: normalizeContentJobReviewStatus(
        sourceContentJob?.reviewStatus ?? null,
      ),
      status: normalizeContentJobStatus(sourceContentJob?.status ?? null),
      streamId: sourceContentJob?.streamId ?? null,
    },
    fanoutStatus: fanout.fanout_status,
    providerOverrides: {
      [safeTargetPlatform]: normalizeObject(target.provider_overrides),
    },
    targetPlatform: safeTargetPlatform,
    targetStatus: target.target_status,
  });
  const childRetryAction = publication
    ? buildPublicationFanoutChildRetryActionPolicy({
        belongsToFanout: target.content_publication_fanout_id === fanout.id,
        fanoutStatus: fanout.fanout_status,
        hasApprovedBundle: Boolean(approvedBundle),
        hasPublishableAsset: Boolean(publication.externalUrl),
        manualRetryPolicy: publication.manualActions,
        publicationStatus: publication.publicationStatus,
        targetPlatform: safeTargetPlatform,
      })
    : null;
  const reauthRequired =
    targetStatus === "re-auth required" ||
    connectionStatusLabel === "Expired" ||
    connectionStatusLabel === "Revoked";
  const childHistoryHref = publication
    ? `/dashboard/publications?publicationId=${publication.id}`
    : null;

  return {
    blockMessage: target.block_message
      ? sanitizePublicationFreeformText(target.block_message)
      : null,
    blockReason: target.block_reason,
    childRetryAction,
    childHistoryHref,
    childPublicationId: publication?.id ?? null,
    childPublicationStatusLabel:
      publication?.publicationStatusLabel ?? "Not created yet",
    connectionLabel,
    connectionStatusLabel,
    connectionStatusTone,
    effectiveVisibilityLabel: publication
      ? formatCrosspostingSafeVisibility(publication.effectiveVisibility)
      : "Not available",
    id: target.id,
    lastEventAt:
      publication?.history[0]?.createdAt ?? publication?.updatedAt ?? null,
    lastActionAt: target.last_action_at,
    lastActionResult: target.last_action_result,
    lastBlockReason: target.last_block_reason,
    lastRecheckedAt: target.last_rechecked_at,
    lastReconciledAt: publication?.lastReconciledAt ?? null,
    manualInterventionRequired,
    providerLabel,
    recheckAction,
    reauthRequired,
    remoteUrl: formatCrosspostingSafeUrl(publication?.externalUrl ?? null),
    requestedVisibilityLabel: publication
      ? formatCrosspostingSafeVisibility(publication.desiredVisibility)
      : "Not available",
    safeErrorHint,
    targetPlatform: target.target_platform,
    targetPlatformLabel: getTargetPlatformLabel(target.target_platform),
    targetStatus,
    targetStatusLabel: targetStatusMeta.label,
    targetStatusTone: targetStatusMeta.tone,
  };
}

function buildCrosspostingSummary(
  items: CrosspostingSummaryFanoutItem[],
): CrosspostingSummaryDashboardSummary {
  return {
    blockedCount: items.reduce((total, item) => total + item.blockedCount, 0),
    failedCount: items.reduce((total, item) => total + item.failedCount, 0),
    fanoutCount: items.length,
    latestActivityAt: latestTimestamp(
      items.map((item) => item.latestActivityAt),
    ),
    processingCount: items.reduce(
      (total, item) => total + item.processingCount,
      0,
    ),
    publishedCount: items.reduce(
      (total, item) => total + item.publishedCount,
      0,
    ),
    queuedCount: items.reduce((total, item) => total + item.queuedCount, 0),
    requiresActionCount: items.reduce(
      (total, item) => total + item.requiresActionCount,
      0,
    ),
    targetCount: items.reduce((total, item) => total + item.targetCount, 0),
  };
}

function buildOverallSafeMessage(
  status: CrosspostingParentStatus,
  counts: {
    blockedCount: number;
    failedCount: number;
    processingCount: number;
    publishedCount: number;
    queuedCount: number;
    requiresActionCount: number;
    totalCount: number;
  },
): string {
  if (counts.totalCount === 0) {
    return "No child publications were prepared for this fanout yet.";
  }

  if (status === "published") {
    return "All child publications are live and linked back to the approved repurposing job.";
  }

  if (status === "partially_published") {
    return "Some targets are live while others still need safe follow-up.";
  }

  if (status === "partially_failed") {
    return "Some targets failed while others still have a valid publication path.";
  }

  if (status === "partially_blocked") {
    return "At least one target is blocked while others remain available.";
  }

  if (status === "requires_action") {
    return "At least one target needs reconnect or manual follow-up before it can continue.";
  }

  if (status === "failed" || status === "final_failed") {
    return "The fanout reached a terminal failure state and will not continue automatically.";
  }

  if (status === "queued") {
    return "One or more targets are queued for server-side publication execution.";
  }

  if (status === "processing") {
    return "One or more targets are processing through the server-side publication flow.";
  }

  if (status === "ready") {
    return "The parent fanout is validated and ready for execution.";
  }

  if (status === "prepared") {
    return "The parent fanout has been prepared and is awaiting downstream execution.";
  }

  return "The fanout summary is available, but the safe state could not be classified fully.";
}

function summarizeChildCounts(
  targets: CrosspostingSummaryTargetItem[],
  publications: PublicationDashboardItem[],
): {
  blockedCount: number;
  failedCount: number;
  processingCount: number;
  publishedCount: number;
  queuedCount: number;
  requiresActionCount: number;
  totalCount: number;
} {
  return {
    blockedCount: targets.filter((target) => target.targetStatus === "blocked")
      .length,
    failedCount: publications.filter(
      (publication) => publication.deliveryStatus === "failed",
    ).length,
    processingCount: publications.filter(
      (publication) => publication.deliveryStatus === "processing",
    ).length,
    publishedCount: publications.filter(
      (publication) => publication.deliveryStatus === "published",
    ).length,
    queuedCount: publications.filter(
      (publication) => publication.deliveryStatus === "queued",
    ).length,
    requiresActionCount: targets.filter(
      (target) =>
        target.targetStatus === "blocked" ||
        target.manualInterventionRequired ||
        target.reauthRequired,
    ).length,
    totalCount: targets.length,
  };
}

function resolveCrosspostingParentStatus(
  fanout: PublicationFanoutRow,
  counts: {
    blockedCount: number;
    failedCount: number;
    processingCount: number;
    publishedCount: number;
    queuedCount: number;
    requiresActionCount: number;
    totalCount: number;
  },
): CrosspostingParentStatus {
  if (counts.totalCount === 0) {
    return "prepared";
  }

  if (counts.publishedCount === counts.totalCount) {
    return "published";
  }

  if (counts.publishedCount > 0) {
    if (counts.failedCount > 0) {
      return "partially_failed";
    }

    if (counts.blockedCount > 0) {
      return "partially_blocked";
    }

    if (counts.processingCount > 0 || counts.queuedCount > 0) {
      return "partially_published";
    }

    if (counts.requiresActionCount > 0) {
      return "partially_published";
    }

    return "partially_published";
  }

  if (counts.blockedCount === counts.totalCount) {
    return fanout.fanout_status === "canceled" ? "final_failed" : "blocked";
  }

  if (counts.failedCount === counts.totalCount) {
    return "final_failed";
  }

  if (counts.failedCount > 0) {
    return "partially_failed";
  }

  if (counts.blockedCount > 0) {
    return "partially_blocked";
  }

  if (counts.requiresActionCount > 0) {
    return "requires_action";
  }

  if (counts.processingCount > 0) {
    return "processing";
  }

  if (counts.queuedCount > 0) {
    return "queued";
  }

  if (fanout.fanout_status === "validated") {
    return "ready";
  }

  if (fanout.fanout_status === "requested") {
    return "prepared";
  }

  if (fanout.fanout_status === "partially_validated") {
    return counts.blockedCount > 0 ? "partially_blocked" : "ready";
  }

  if (fanout.fanout_status === "blocked") {
    return "blocked";
  }

  if (fanout.fanout_status === "canceled") {
    return "final_failed";
  }

  return "unknown_fallback";
}

function resolveCrosspostingTargetStatus(
  target: PublicationFanoutTargetRow,
  publication: PublicationDashboardItem | null,
): CrosspostingTargetStatus {
  if (target.target_status === "blocked") {
    return "blocked";
  }

  if (!publication) {
    return target.target_status === "validated" ? "ready" : "unknown";
  }

  if (publication.deliveryStatus === "published") {
    return "published";
  }

  if (publication.deliveryStatus === "processing") {
    return "processing";
  }

  if (publication.deliveryStatus === "queued") {
    return "queued";
  }

  if (publication.deliveryStatus === "re-auth required") {
    return "re-auth required";
  }

  if (publication.deliveryStatus === "failed") {
    return "failed";
  }

  if (publication.publicationStatus === "validated") {
    return "ready";
  }

  if (publication.publicationStatus === "requested") {
    return "ready";
  }

  return "unknown";
}

function getTargetProviderLabel(target: PublicationFanoutTargetRow): string {
  switch (target.target_platform) {
    case "youtube":
      return "YouTube";
    case "tiktok":
      return "TikTok";
    default:
      return "Unknown provider";
  }
}

function getTargetPlatformLabel(
  platform: PublicationFanoutTargetRow["target_platform"],
): string {
  switch (platform) {
    case "youtube":
      return TARGET_PLATFORM_LABELS.youtube;
    case "tiktok":
      return TARGET_PLATFORM_LABELS.tiktok;
    default:
      return "Unsupported";
  }
}

function getConnectionStatusLabel(
  status: PublicationConnectionRow["status"] | null,
): string {
  switch (status) {
    case "connected":
      return "Connected";
    case "expired":
      return "Expired";
    case "pending":
      return "Pending";
    case "revoked":
      return "Revoked";
    default:
      return "Not available";
  }
}

function getConnectionStatusTone(
  status: PublicationConnectionRow["status"] | null,
): CrosspostingStatusTone {
  switch (status) {
    case "connected":
      return "emerald";
    case "expired":
    case "revoked":
      return "rose";
    case "pending":
      return "amber";
    default:
      return "slate";
  }
}

function compareTargets(
  left: PublicationFanoutTargetRow,
  right: PublicationFanoutTargetRow,
): number {
  if (left.target_platform !== right.target_platform) {
    return left.target_platform.localeCompare(right.target_platform);
  }

  return left.platform_connection_id.localeCompare(
    right.platform_connection_id,
  );
}

function groupTargetsByFanoutId(
  targets: PublicationFanoutTargetRow[],
): Map<string, PublicationFanoutTargetRow[]> {
  const grouped = new Map<string, PublicationFanoutTargetRow[]>();

  for (const target of targets) {
    const existing = grouped.get(target.content_publication_fanout_id) ?? [];
    existing.push(target);
    grouped.set(target.content_publication_fanout_id, existing);
  }

  return grouped;
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

function formatCompactId(value: string): string {
  if (value.length <= 16) {
    return value;
  }

  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function readFanoutSnapshot(value: unknown): FanoutSnapshot {
  if (!value || typeof value !== "object") {
    return {};
  }

  return value as FanoutSnapshot;
}

function normalizeObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
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

function normalizeContentJobReviewStatus(
  status: string | null,
): ContentJobReviewStatus | null {
  if (
    status === "needs_review" ||
    status === "approved" ||
    status === "rejected" ||
    status === "needs_changes"
  ) {
    return status;
  }

  return null;
}

function normalizeContentJobStatus(
  status: string | null,
): ContentJobStatus | null {
  if (
    status === "pending" ||
    status === "running" ||
    status === "processing" ||
    status === "done" ||
    status === "completed" ||
    status === "failed" ||
    status === "cancelled"
  ) {
    return status;
  }

  return null;
}

function normalizePublicationFanoutTargetPlatform(
  platform: PublicationFanoutTargetRow["target_platform"],
): PublicationFanoutTargetPlatform {
  return platform === "tiktok" ? "tiktok" : "youtube";
}

function formatCrosspostingBlockReason(
  reason: PublicationFanoutTargetRow["block_reason"],
  message: string | null,
): string | null {
  if (!reason && !message) {
    return null;
  }

  if (message && message.trim().length > 0) {
    return sanitizePublicationFreeformText(message);
  }

  if (!reason) {
    return null;
  }

  switch (reason) {
    case "account_capability_missing":
      return "The selected account is missing a required capability.";
    case "conditional_field_unresolved":
      return "A conditional field required for publication is unresolved.";
    case "content_job_not_found":
      return "The approved repurposing job could not be found.";
    case "fanout_not_ready":
      return "The fanout is not ready yet.";
    case "invalid_provider_override_value":
      return "A provider override value is invalid.";
    case "missing_publish_scopes":
      return "The connection is missing required publish scopes.";
    case "missing_required_canonical_field":
      return "A required canonical field is missing.";
    case "platform_connection_not_found":
      return "The platform connection could not be found.";
    case "platform_mismatch":
      return "The selected connection does not match the target platform.";
    case "policy_blocked":
      return "The request was blocked by policy.";
    case "publication_not_ready":
      return "The publication is not ready for execution.";
    case "publishable_bundle_missing":
      return "The approved bundle is missing or incomplete.";
    case "provider_override_mismatch":
      return "The provider override namespace does not match the target.";
    case "provider_override_unsupported_field":
      return "The provider override uses an unsupported field.";
    case "unsupported_capability_version":
      return "The selected capability version is unsupported.";
    case "unsupported_target_platform":
      return "The selected target platform is unsupported.";
    default:
      return "The target is blocked.";
  }
}
