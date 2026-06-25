import type { Tables } from "@streamos/database";
import {
  CREATOR_GROWTH_INTELLIGENCE_FEED_LIMIT,
  type CreatorGrowthIntelligence,
  type CreatorGrowthIntelligenceCoverage,
  type CreatorGrowthIntelligenceFeedMetadata,
  type CreatorGrowthIntelligenceLookupIssue,
  type CreatorGrowthIntelligenceReadModel,
  type CreatorGrowthIntelligenceSummary,
  type CreatorGrowthIntelligenceCategory,
  type CreatorGrowthRecommendationStatus,
  type CreatorGrowthRecommendationType,
  type StreamPlatform,
} from "@streamos/types";

type CreatorRow = Pick<
  Tables<"creators">,
  "display_name" | "handle" | "id" | "niche"
>;

type ChannelRow = Pick<Tables<"channels">, "display_name" | "id" | "platform">;

type ContentJobRow = Pick<
  Tables<"content_jobs">,
  "created_at" | "id" | "job_type" | "review_status" | "status" | "updated_at"
>;

type ContentPublicationRow = Pick<
  Tables<"content_publications">,
  | "created_at"
  | "id"
  | "publication_status"
  | "published_at"
  | "requested_at"
  | "schedule_status"
  | "target_platform"
>;

type MetricSnapshotRow = Pick<
  Tables<"metrics_snapshots">,
  | "captured_at"
  | "channel_id"
  | "creator_id"
  | "follower_count"
  | "id"
  | "platform"
  | "viewer_count"
>;

export type CreatorGrowthIntelligenceDashboardSignal =
  CreatorGrowthIntelligence & {
    categoryLabel: string;
    confidenceLabel: string | null;
    createdAtLabel: string;
    platformLabel: string;
    recommendationStatusLabel: string;
    recommendationTypeLabel: string;
    scoreLabel: string | null;
    sourceDetail: string | null;
    sourceLabel: string;
    updatedAtLabel: string;
  };

export type CreatorGrowthIntelligenceDashboardModel =
  CreatorGrowthIntelligenceReadModel & {
    error: "load-failed" | null;
    signals: CreatorGrowthIntelligenceDashboardSignal[];
    userId: string | null;
  };

export type CreatorGrowthIntelligenceLookupTables = {
  channels: ChannelRow[];
  contentJobs: ContentJobRow[];
  contentPublications: ContentPublicationRow[];
  creators: CreatorRow[];
  metricsSnapshots: MetricSnapshotRow[];
};

type CreatorGrowthIntelligenceLookupMaps = {
  channels: Map<string, ChannelRow>;
  contentJobs: Map<string, ContentJobRow>;
  contentPublications: Map<string, ContentPublicationRow>;
  creators: Map<string, CreatorRow>;
  metricsSnapshots: Map<string, MetricSnapshotRow>;
};

const categoryLabels: Record<CreatorGrowthIntelligenceCategory, string> = {
  channel_seo: "Kanal-SEO",
  content_metadata: "Metadaten",
  engagement_opportunity: "Engagement",
  platform_fit: "Plattform-Fit",
  publish_timing: "Publish-Timing",
};

const recommendationTypeLabels: Record<
  CreatorGrowthRecommendationType,
  string
> = {
  description: "Beschreibung",
  hashtags: "Hashtags",
  platform_positioning: "Positionierung",
  schedule_hint: "Zeitfenster",
  tags: "Tags",
  thumbnail_prompt: "Thumbnail-Prompt",
  title: "Titel",
};

const recommendationStatusLabels: Record<
  CreatorGrowthRecommendationStatus,
  string
> = {
  approved: "Freigegeben",
  needs_changes: "Anpassungen noetig",
  needs_review: "Zur Pruefung",
  rejected: "Abgelehnt",
};

const platformLabels: Record<StreamPlatform, string> = {
  twitch: "Twitch",
  youtube: "YouTube",
  tiktok: "TikTok",
  kick: "Kick",
};

export function buildCreatorGrowthIntelligenceDashboardModel({
  error,
  feed,
  items,
  lookupIssues,
  lookups,
  userId,
}: {
  error: "load-failed" | null;
  feed: CreatorGrowthIntelligenceFeedMetadata;
  items: CreatorGrowthIntelligence[];
  lookupIssues: CreatorGrowthIntelligenceLookupIssue[];
  lookups: CreatorGrowthIntelligenceLookupTables;
  userId: string | null;
}): CreatorGrowthIntelligenceDashboardModel {
  const signalCoverage = createCoverage(items);
  const lookupMaps = createLookupMaps(lookups);
  const seoHealthScore = averageScore(
    items.filter(
      (item) =>
        item.intelligenceCategory === "channel_seo" ||
        item.intelligenceCategory === "content_metadata",
    ),
    "score",
  );
  const growthOpportunityCount = items.filter(
    (item) =>
      item.intelligenceCategory === "publish_timing" ||
      item.intelligenceCategory === "engagement_opportunity",
  ).length;
  const platformFitCount = items.filter(
    (item) => item.intelligenceCategory === "platform_fit",
  ).length;
  const reviewQueueCount = items.filter(
    (item) => item.recommendationStatus === "needs_review",
  ).length;

  const summary: CreatorGrowthIntelligenceSummary = {
    averageConfidence: averageScore(items, "confidence"),
    averageScore: averageScore(items, "score"),
    growthOpportunityCount,
    lastUpdatedAt: getLatestUpdatedAt(items),
    platformFitCount,
    reviewQueueCount,
    seoHealthScore,
    signalCount: items.length,
    sourceLinkedCount: items.filter(hasSourceLink).length,
  };

  return {
    coverage: signalCoverage,
    error,
    feed,
    items,
    lookupIssues,
    signals: items.map((item) =>
      buildDashboardSignal(item, lookupMaps, {
        categoryLabel: categoryLabels[item.intelligenceCategory],
        recommendationStatusLabel:
          recommendationStatusLabels[item.recommendationStatus],
        recommendationTypeLabel:
          recommendationTypeLabels[item.recommendationType],
      }),
    ),
    summary,
    userId,
  };
}

export function normalizeCreatorGrowthIntelligenceRow(
  row: Tables<"creator_growth_intelligence">,
): CreatorGrowthIntelligence {
  return {
    channelId: row.channel_id,
    confidence: row.confidence,
    contentJobId: row.content_job_id,
    contentPublicationId: row.content_publication_id,
    createdAt: row.created_at,
    creatorId: row.creator_id,
    evidence: toRecord(row.evidence),
    id: row.id,
    intelligenceCategory: row.intelligence_category,
    metadata: toRecord(row.metadata),
    metricsSnapshotId: row.metrics_snapshot_id,
    platform: row.platform,
    rationale: row.rationale,
    recommendationStatus: row.recommendation_status,
    recommendationType: row.recommendation_type,
    score: row.score,
    summary: row.summary,
    title: row.title,
    updatedAt: row.updated_at,
    userId: row.user_id,
  };
}

export function createEmptyCreatorGrowthIntelligenceDashboardModel(
  userId: string | null,
  error: "load-failed" | null = null,
): CreatorGrowthIntelligenceDashboardModel {
  return {
    coverage: {
      channels: 0,
      contentJobs: 0,
      contentPublications: 0,
      creators: 0,
      metricsSnapshots: 0,
    },
    error,
    feed: {
      hasMore: false,
      limit: CREATOR_GROWTH_INTELLIGENCE_FEED_LIMIT,
      returnedCount: 0,
    },
    items: [],
    lookupIssues: [],
    signals: [],
    summary: {
      averageConfidence: null,
      averageScore: null,
      growthOpportunityCount: 0,
      lastUpdatedAt: null,
      platformFitCount: 0,
      reviewQueueCount: 0,
      seoHealthScore: null,
      signalCount: 0,
      sourceLinkedCount: 0,
    },
    userId,
  };
}

function buildDashboardSignal(
  item: CreatorGrowthIntelligence,
  lookups: CreatorGrowthIntelligenceLookupMaps,
  labels: {
    categoryLabel: string;
    recommendationStatusLabel: string;
    recommendationTypeLabel: string;
  },
): CreatorGrowthIntelligenceDashboardSignal {
  const source = getSourceDescriptor(item, lookups);

  return {
    ...item,
    categoryLabel: labels.categoryLabel,
    confidenceLabel:
      item.confidence === null ? null : `${formatScore(item.confidence)}/100`,
    createdAtLabel: formatDateTime(item.createdAt),
    platformLabel: formatPlatformLabel(item.platform),
    recommendationStatusLabel: labels.recommendationStatusLabel,
    recommendationTypeLabel: labels.recommendationTypeLabel,
    scoreLabel: item.score === null ? null : `${formatScore(item.score)}/100`,
    sourceDetail: source.detail,
    sourceLabel: source.label,
    updatedAtLabel: formatDateTime(item.updatedAt),
  };
}

function createCoverage(
  items: CreatorGrowthIntelligence[],
): CreatorGrowthIntelligenceCoverage {
  return {
    channels: countUnique(items.map((item) => item.channelId)),
    contentJobs: countUnique(items.map((item) => item.contentJobId)),
    contentPublications: countUnique(
      items.map((item) => item.contentPublicationId),
    ),
    creators: countUnique(items.map((item) => item.creatorId)),
    metricsSnapshots: countUnique(items.map((item) => item.metricsSnapshotId)),
  };
}

function getSourceDescriptor(
  item: CreatorGrowthIntelligence,
  lookups: CreatorGrowthIntelligenceLookupMaps,
): { detail: string | null; label: string } {
  const metricsSnapshot = item.metricsSnapshotId
    ? lookups.metricsSnapshots.get(item.metricsSnapshotId)
    : null;

  if (metricsSnapshot) {
    return {
      detail: `${formatPlatformLabel(metricsSnapshot.platform)} - ${formatCompactNumber(metricsSnapshot.viewer_count)} Views - ${formatCompactNumber(metricsSnapshot.follower_count)} Followers`,
      label: "Metrik-Snapshot",
    };
  }

  const publication = item.contentPublicationId
    ? lookups.contentPublications.get(item.contentPublicationId)
    : null;

  if (publication) {
    return {
      detail: `${formatPlatformLabel(publication.target_platform)} - ${formatPublicationStatus(publication.publication_status)}`,
      label: "Publication",
    };
  }

  const contentJob = item.contentJobId
    ? lookups.contentJobs.get(item.contentJobId)
    : null;

  if (contentJob) {
    return {
      detail: `${formatContentJobType(contentJob.job_type)} - ${formatContentJobStatus(contentJob.review_status, contentJob.status)}`,
      label: "Content-Job",
    };
  }

  const channel = item.channelId ? lookups.channels.get(item.channelId) : null;

  if (channel) {
    return {
      detail: `${channel.display_name} - ${formatPlatformLabel(channel.platform)}`,
      label: "Kanal",
    };
  }

  const creator = item.creatorId ? lookups.creators.get(item.creatorId) : null;

  if (creator) {
    return {
      detail: creator.handle
        ? `@${creator.handle}${creator.niche ? ` - ${creator.niche}` : ""}`
        : creator.niche,
      label: "Creator",
    };
  }

  return {
    detail: null,
    label: "User-scoped signal",
  };
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatContentJobStatus(reviewStatus: string, status: string): string {
  return `${formatReviewStatus(reviewStatus)} - ${formatContentJobExecutionStatus(status)}`;
}

function formatContentJobType(value: string): string {
  if (value === "transcription") {
    return "Transkription";
  }

  if (value === "repurposing") {
    return "Repurposing";
  }

  if (value === "clip_scoring") {
    return "Clip Scoring";
  }

  if (value === "title_generation") {
    return "Title Generation";
  }

  return value;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatPlatformLabel(value: StreamPlatform | null): string {
  if (value === null) {
    return "Alle Plattformen";
  }

  return platformLabels[value];
}

function formatPublicationStatus(value: string): string {
  if (value === "published") {
    return "Veroeffentlicht";
  }

  if (value === "validated") {
    return "Validiert";
  }

  if (value === "queued") {
    return "In Queue";
  }

  if (value === "requested") {
    return "Angefragt";
  }

  if (value === "failed_retryable") {
    return "Retrybar";
  }

  if (value === "failed_permanent") {
    return "Permanent fehlgeschlagen";
  }

  if (value === "canceled") {
    return "Abgebrochen";
  }

  if (value === "rejected") {
    return "Abgelehnt";
  }

  return value;
}

function formatContentJobExecutionStatus(value: string): string {
  if (value === "completed" || value === "done") {
    return "Abgeschlossen";
  }

  if (value === "running" || value === "processing") {
    return "Laufend";
  }

  if (value === "pending") {
    return "Ausstehend";
  }

  if (value === "failed") {
    return "Fehlgeschlagen";
  }

  if (value === "cancelled") {
    return "Abgebrochen";
  }

  return value;
}

function formatReviewStatus(value: string): string {
  if (value === "approved") {
    return "Freigegeben";
  }

  if (value === "needs_changes") {
    return "Anpassungen noetig";
  }

  if (value === "rejected") {
    return "Abgelehnt";
  }

  return "Zur Pruefung";
}

function formatScore(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: 0,
  }).format(value);
}

function getLatestUpdatedAt(items: CreatorGrowthIntelligence[]): string | null {
  if (items.length === 0) {
    return null;
  }

  return (
    [...items].sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    )[0]?.updatedAt ?? null
  );
}

function averageScore(
  items: CreatorGrowthIntelligence[],
  key: "confidence" | "score",
): number | null {
  const values = items
    .map((item) => item[key])
    .filter((value): value is number => typeof value === "number");

  if (values.length === 0) {
    return null;
  }

  const average = values.reduce((sum, value) => sum + value, 0) / values.length;

  return Math.round(average);
}

function countUnique(values: Array<string | null>): number {
  return new Set(values.filter((value): value is string => value !== null))
    .size;
}

function createLookupMaps(
  lookups: CreatorGrowthIntelligenceLookupTables,
): CreatorGrowthIntelligenceLookupMaps {
  return {
    channels: createLookupMap(lookups.channels),
    contentJobs: createLookupMap(lookups.contentJobs),
    contentPublications: createLookupMap(lookups.contentPublications),
    creators: createLookupMap(lookups.creators),
    metricsSnapshots: createLookupMap(lookups.metricsSnapshots),
  };
}

function createLookupMap<T extends { id: string }>(
  rows: readonly T[],
): Map<string, T> {
  return new Map(rows.map((row) => [row.id, row]));
}

function hasSourceLink(item: CreatorGrowthIntelligence): boolean {
  return (
    item.channelId !== null ||
    item.contentJobId !== null ||
    item.contentPublicationId !== null ||
    item.creatorId !== null ||
    item.metricsSnapshotId !== null
  );
}

function toRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}
