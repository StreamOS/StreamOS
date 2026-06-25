import type { Tables } from "@streamos/database";
import {
  CONTENT_PERFORMANCE_ANALYTICS_FEED_LIMIT,
  type ContentPerformanceCoverage,
  type ContentPerformanceFeedMetadata,
  type ContentPerformanceItem,
  type ContentPerformanceLookupIssue,
  type ContentPerformanceMetricValue,
  type ContentPerformancePlatformComparison,
  type ContentPerformanceReadModel,
  type ContentPerformanceSummary,
  type StreamPlatform,
  isApprovedRepurposingPlanResult,
} from "@streamos/types";

type PublicationRow = Pick<
  Tables<"content_publications">,
  | "content_job_id"
  | "created_at"
  | "id"
  | "platform_connection_id"
  | "publication_status"
  | "published_at"
  | "requested_at"
  | "schedule_status"
  | "scheduled_at_utc"
  | "target_platform"
  | "updated_at"
>;

type PlatformConnectionRow = Pick<
  Tables<"platform_connections">,
  "channel_id" | "id" | "platform" | "status"
>;

type ChannelRow = Pick<Tables<"channels">, "display_name" | "id" | "platform">;

type ContentJobRow = Pick<Tables<"content_jobs">, "id" | "result">;

type MetricSnapshotRow = Pick<
  Tables<"metrics_snapshots">,
  | "captured_at"
  | "channel_id"
  | "engagement_rate"
  | "id"
  | "platform"
  | "viewer_count"
  | "watch_time_minutes"
>;

export type ContentPerformanceAnalyticsLookupTables = {
  channels: ChannelRow[];
  contentJobs: ContentJobRow[];
  metricsSnapshots: MetricSnapshotRow[];
  platformConnections: PlatformConnectionRow[];
};

export type ContentPerformanceAnalyticsDashboardModel =
  ContentPerformanceReadModel & {
    error: "load-failed" | null;
    userId: string | null;
  };

export function buildContentPerformanceAnalyticsDashboardModel({
  error,
  feed,
  lookupIssues,
  lookups,
  publications,
  userId,
}: {
  error: "load-failed" | null;
  feed: Omit<ContentPerformanceFeedMetadata, "returnedCount">;
  lookupIssues: ContentPerformanceLookupIssue[];
  lookups: ContentPerformanceAnalyticsLookupTables;
  publications: PublicationRow[];
  userId: string | null;
}): ContentPerformanceAnalyticsDashboardModel {
  const channelsById = new Map(lookups.channels.map((row) => [row.id, row]));
  const contentJobsById = new Map(
    lookups.contentJobs.map((row) => [row.id, row]),
  );
  const connectionsById = new Map(
    lookups.platformConnections.map((row) => [row.id, row]),
  );
  const metricsByChannelPlatform = groupMetricsByChannelAndPlatform(
    lookups.metricsSnapshots,
  );
  const matchedMetricIds = new Set<string>();

  const rawItems = publications
    .map((publication) => {
      const connection =
        connectionsById.get(publication.platform_connection_id) ?? null;
      const channel =
        connection?.channel_id != null
          ? (channelsById.get(connection.channel_id) ?? null)
          : null;
      const contentJob =
        contentJobsById.get(publication.content_job_id) ?? null;
      const metric = selectBestMetricSnapshot({
        candidates:
          connection?.channel_id != null
            ? (metricsByChannelPlatform.get(
                createMetricLookupKey(
                  connection.channel_id,
                  publication.target_platform,
                ),
              ) ?? [])
            : [],
        referenceAt:
          publication.published_at ??
          publication.scheduled_at_utc ??
          publication.requested_at,
      });

      if (metric) {
        matchedMetricIds.add(metric.id);
      }

      return buildPublicationItem({
        channel,
        contentJob,
        metric,
        publication,
      });
    })
    .concat(
      lookups.metricsSnapshots
        .filter((metric) => !matchedMetricIds.has(metric.id))
        .map((metric) =>
          buildMetricsOnlyItem({
            channel: channelsById.get(metric.channel_id) ?? null,
            metric,
          }),
        ),
    )
    .sort((left, right) =>
      compareDescending(left.primaryTimestamp, right.primaryTimestamp),
    );

  const hasMore = feed.hasMore || rawItems.length > feed.limit;
  const items = rawItems.slice(0, feed.limit);
  const platformComparison = buildPlatformComparison(items);
  const coverage = buildCoverage(items);
  const summary = buildSummary(items, platformComparison);

  return {
    coverage,
    error,
    feed: {
      ...feed,
      hasMore,
      returnedCount: items.length,
    },
    items,
    lookupIssues,
    platformComparison,
    summary,
    userId,
  };
}

export function createEmptyContentPerformanceAnalyticsDashboardModel(
  userId: string | null,
  error: "load-failed" | null = null,
  lookupIssues: ContentPerformanceLookupIssue[] = [],
): ContentPerformanceAnalyticsDashboardModel {
  return {
    coverage: {
      linkedItems: 0,
      metricsOnlyItems: 0,
      metricsSnapshots: 0,
      platforms: 0,
      publicationOnlyItems: 0,
      publications: 0,
      publishedPublications: 0,
      scheduledPublications: 0,
    },
    error,
    feed: {
      hasMore: false,
      limit: CONTENT_PERFORMANCE_ANALYTICS_FEED_LIMIT,
      returnedCount: 0,
    },
    items: [],
    lookupIssues,
    platformComparison: [],
    summary: {
      averageEngagementRate: unavailableMetric(),
      itemCount: 0,
      latestActivityAt: null,
      latestSnapshotAt: null,
      linkedCount: 0,
      metricsOnlyCount: 0,
      platformCount: 0,
      publicationCount: 0,
      publicationOnlyCount: 0,
      sampleMetricsCount: 0,
      totalViews: unavailableMetric(),
      totalWatchTimeMinutes: unavailableMetric(),
    },
    userId,
  };
}

export function getContentPerformancePlatformLabel(
  platform: StreamPlatform,
): string {
  switch (platform) {
    case "kick":
      return "Kick";
    case "tiktok":
      return "TikTok";
    case "twitch":
      return "Twitch";
    case "youtube":
      return "YouTube";
  }
}

export function getContentPerformanceCoverageLabel(
  coverageStatus: ContentPerformanceItem["coverageStatus"],
): string {
  switch (coverageStatus) {
    case "linked":
      return "Linked metrics";
    case "metrics_only":
      return "Metrics only";
    case "publication_only":
      return "Publication only";
  }
}

export function getContentPerformancePublicationStatusLabel(
  value: string | null,
): string {
  if (!value) {
    return "No publication";
  }

  switch (value) {
    case "canceled":
      return "Canceled";
    case "failed_permanent":
      return "Failed permanent";
    case "failed_retryable":
      return "Failed retryable";
    case "published":
      return "Published";
    case "publishing":
      return "Publishing";
    case "queued":
      return "Queued";
    case "rejected":
      return "Rejected";
    case "requested":
      return "Requested";
    case "validated":
      return "Validated";
    default:
      return value;
  }
}

export function getContentPerformanceScheduleStatusLabel(
  value: string | null,
): string {
  if (!value) {
    return "No schedule";
  }

  return value.replaceAll("_", " ");
}

export function formatContentPerformanceTimestamp(
  value: string | null,
): string {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(date);
}

export function formatContentPerformanceMetric(
  metric: ContentPerformanceMetricValue,
  kind: "count" | "minutes" | "percent",
): string {
  if (metric.availability === "not_tracked") {
    return "Not tracked";
  }

  if (metric.availability === "unavailable" || metric.value === null) {
    return "Unavailable";
  }

  if (kind === "percent") {
    return `${new Intl.NumberFormat("de-DE", {
      maximumFractionDigits: 1,
    }).format(metric.value)}%`;
  }

  if (kind === "minutes") {
    return `${new Intl.NumberFormat("de-DE", {
      maximumFractionDigits: 0,
    }).format(metric.value)} min`;
  }

  return new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: 0,
  }).format(metric.value);
}

function buildPublicationItem({
  channel,
  contentJob,
  metric,
  publication,
}: {
  channel: ChannelRow | null;
  contentJob: ContentJobRow | null;
  metric: MetricSnapshotRow | null;
  publication: PublicationRow;
}): ContentPerformanceItem {
  return {
    channelDisplayName: channel?.display_name ?? null,
    channelId: channel?.id ?? null,
    contentJobId: publication.content_job_id,
    contentTitle: resolveContentTitle(
      contentJob,
      channel?.display_name ?? null,
      publication.target_platform,
    ),
    coverageStatus: metric ? "linked" : "publication_only",
    ctr: notTrackedMetric(),
    engagementRate: metric
      ? createNumericMetric(metric.engagement_rate)
      : unavailableMetric(),
    id: `publication:${publication.id}`,
    kind: "publication",
    metricsSnapshotId: metric?.id ?? null,
    platform: publication.target_platform,
    primaryTimestamp:
      metric?.captured_at ??
      publication.published_at ??
      publication.scheduled_at_utc ??
      publication.requested_at ??
      publication.updated_at ??
      publication.created_at,
    publicationId: publication.id,
    publicationStatus: publication.publication_status,
    publishedAt: publication.published_at,
    requestedAt: publication.requested_at,
    scheduleStatus: publication.schedule_status,
    scheduledAt: publication.scheduled_at_utc,
    snapshotCapturedAt: metric?.captured_at ?? null,
    views: metric ? availableMetric(metric.viewer_count) : unavailableMetric(),
    watchTimeMinutes: metric
      ? availableMetric(metric.watch_time_minutes)
      : unavailableMetric(),
  };
}

function buildMetricsOnlyItem({
  channel,
  metric,
}: {
  channel: ChannelRow | null;
  metric: MetricSnapshotRow;
}): ContentPerformanceItem {
  return {
    channelDisplayName: channel?.display_name ?? null,
    channelId: metric.channel_id,
    contentJobId: null,
    contentTitle: channel?.display_name
      ? `${channel.display_name} metrics snapshot`
      : `${getContentPerformancePlatformLabel(metric.platform)} metrics snapshot`,
    coverageStatus: "metrics_only",
    ctr: notTrackedMetric(),
    engagementRate: createNumericMetric(metric.engagement_rate),
    id: `metrics:${metric.id}`,
    kind: "metrics_snapshot",
    metricsSnapshotId: metric.id,
    platform: metric.platform,
    primaryTimestamp: metric.captured_at,
    publicationId: null,
    publicationStatus: null,
    publishedAt: null,
    requestedAt: null,
    scheduleStatus: null,
    scheduledAt: null,
    snapshotCapturedAt: metric.captured_at,
    views: availableMetric(metric.viewer_count),
    watchTimeMinutes: availableMetric(metric.watch_time_minutes),
  };
}

function buildPlatformComparison(
  items: ContentPerformanceItem[],
): ContentPerformancePlatformComparison[] {
  const grouped = new Map<StreamPlatform, ContentPerformanceItem[]>();

  for (const item of items) {
    const current = grouped.get(item.platform) ?? [];
    current.push(item);
    grouped.set(item.platform, current);
  }

  return [...grouped.entries()]
    .map(([platform, platformItems]) => ({
      ctr: notTrackedMetric(),
      engagementRate: averageMetric(
        platformItems.map((item) => item.engagementRate),
      ),
      itemCount: platformItems.length,
      latestSnapshotAt: latestTimestamp(
        platformItems.map((item) => item.snapshotCapturedAt),
      ),
      linkedCount: platformItems.filter(
        (item) => item.coverageStatus === "linked",
      ).length,
      metricsOnlyCount: platformItems.filter(
        (item) => item.coverageStatus === "metrics_only",
      ).length,
      platform,
      publicationCount: platformItems.filter(
        (item) => item.publicationId !== null,
      ).length,
      publicationOnlyCount: platformItems.filter(
        (item) => item.coverageStatus === "publication_only",
      ).length,
      publishedCount: platformItems.filter(
        (item) => item.publicationStatus === "published",
      ).length,
      scheduledCount: platformItems.filter((item) => item.scheduledAt !== null)
        .length,
      views: sumMetrics(platformItems.map((item) => item.views)),
      watchTimeMinutes: sumMetrics(
        platformItems.map((item) => item.watchTimeMinutes),
      ),
    }))
    .sort((left, right) =>
      compareDescending(
        left.latestSnapshotAt ?? left.platform,
        right.latestSnapshotAt ?? right.platform,
      ),
    );
}

function buildCoverage(
  items: ContentPerformanceItem[],
): ContentPerformanceCoverage {
  return {
    linkedItems: items.filter((item) => item.coverageStatus === "linked")
      .length,
    metricsOnlyItems: items.filter(
      (item) => item.coverageStatus === "metrics_only",
    ).length,
    metricsSnapshots: countUnique(items.map((item) => item.metricsSnapshotId)),
    platforms: countUnique(items.map((item) => item.platform)),
    publicationOnlyItems: items.filter(
      (item) => item.coverageStatus === "publication_only",
    ).length,
    publications: countUnique(items.map((item) => item.publicationId)),
    publishedPublications: items.filter(
      (item) => item.publicationStatus === "published",
    ).length,
    scheduledPublications: items.filter((item) => item.scheduledAt !== null)
      .length,
  };
}

function buildSummary(
  items: ContentPerformanceItem[],
  platformComparison: ContentPerformancePlatformComparison[],
): ContentPerformanceSummary {
  return {
    averageEngagementRate: averageMetric(
      items.map((item) => item.engagementRate),
    ),
    itemCount: items.length,
    latestActivityAt: latestTimestamp(
      items.map((item) => item.primaryTimestamp),
    ),
    latestSnapshotAt: latestTimestamp(
      items.map((item) => item.snapshotCapturedAt),
    ),
    linkedCount: items.filter((item) => item.coverageStatus === "linked")
      .length,
    metricsOnlyCount: items.filter(
      (item) => item.coverageStatus === "metrics_only",
    ).length,
    platformCount: platformComparison.length,
    publicationCount: items.filter((item) => item.publicationId !== null)
      .length,
    publicationOnlyCount: items.filter(
      (item) => item.coverageStatus === "publication_only",
    ).length,
    sampleMetricsCount: countUnique(
      items.map((item) => item.metricsSnapshotId),
    ),
    totalViews: sumMetrics(items.map((item) => item.views)),
    totalWatchTimeMinutes: sumMetrics(
      items.map((item) => item.watchTimeMinutes),
    ),
  };
}

function resolveContentTitle(
  contentJob: ContentJobRow | null,
  channelDisplayName: string | null,
  platform: StreamPlatform,
): string | null {
  if (contentJob && isApprovedRepurposingPlanResult(contentJob.result)) {
    const firstTitle = contentJob.result.title_suggestions
      .map((value) => value.trim())
      .find((value) => value.length > 0);

    if (firstTitle) {
      return firstTitle;
    }

    if (contentJob.result.short_form_plan.trim().length > 0) {
      return contentJob.result.short_form_plan.trim();
    }
  }

  if (channelDisplayName) {
    return `${channelDisplayName} publication`;
  }

  return `${getContentPerformancePlatformLabel(platform)} publication`;
}

function groupMetricsByChannelAndPlatform(
  metrics: MetricSnapshotRow[],
): Map<string, MetricSnapshotRow[]> {
  const grouped = new Map<string, MetricSnapshotRow[]>();

  for (const metric of metrics) {
    const key = createMetricLookupKey(metric.channel_id, metric.platform);
    const current = grouped.get(key) ?? [];
    current.push(metric);
    grouped.set(key, current);
  }

  for (const [key, rows] of grouped.entries()) {
    grouped.set(
      key,
      [...rows].sort((left, right) =>
        compareDescending(left.captured_at, right.captured_at),
      ),
    );
  }

  return grouped;
}

function createMetricLookupKey(
  channelId: string,
  platform: StreamPlatform,
): string {
  return `${channelId}:${platform}`;
}

function selectBestMetricSnapshot({
  candidates,
  referenceAt,
}: {
  candidates: MetricSnapshotRow[];
  referenceAt: string | null;
}): MetricSnapshotRow | null {
  if (candidates.length === 0) {
    return null;
  }

  if (!referenceAt) {
    return candidates[0] ?? null;
  }

  const referenceTime = new Date(referenceAt).getTime();

  if (!Number.isFinite(referenceTime)) {
    return candidates[0] ?? null;
  }

  const capturedAfter = [...candidates]
    .filter(
      (candidate) => new Date(candidate.captured_at).getTime() >= referenceTime,
    )
    .sort(
      (left, right) =>
        new Date(left.captured_at).getTime() -
        new Date(right.captured_at).getTime(),
    );

  if (capturedAfter[0]) {
    return capturedAfter[0];
  }

  return candidates[0] ?? null;
}

function compareDescending(left: string, right: string): number {
  const leftTime = new Date(left).getTime();
  const rightTime = new Date(right).getTime();

  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) {
    return right.localeCompare(left);
  }

  return rightTime - leftTime;
}

function countUnique(values: Array<string | StreamPlatform | null>): number {
  return new Set(values.filter((value): value is string => value !== null))
    .size;
}

function latestTimestamp(values: Array<string | null>): string | null {
  return (
    values
      .filter((value): value is string => typeof value === "string")
      .sort(compareDescending)[0] ?? null
  );
}

function sumMetrics(
  metrics: ContentPerformanceMetricValue[],
): ContentPerformanceMetricValue {
  const values = metrics
    .filter((metric) => metric.availability === "available")
    .map((metric) => metric.value)
    .filter((value): value is number => typeof value === "number");

  if (values.length === 0) {
    return unavailableMetric();
  }

  return availableMetric(values.reduce((sum, value) => sum + value, 0));
}

function averageMetric(
  metrics: ContentPerformanceMetricValue[],
): ContentPerformanceMetricValue {
  const values = metrics
    .filter((metric) => metric.availability === "available")
    .map((metric) => metric.value)
    .filter((value): value is number => typeof value === "number");

  if (values.length === 0) {
    return unavailableMetric();
  }

  return {
    availability: "available",
    value:
      Math.round(
        (values.reduce((sum, value) => sum + value, 0) / values.length) * 10,
      ) / 10,
  };
}

function createNumericMetric(
  value: number | null,
): ContentPerformanceMetricValue {
  if (typeof value !== "number") {
    return unavailableMetric();
  }

  return availableMetric(value);
}

function availableMetric(value: number): ContentPerformanceMetricValue {
  return {
    availability: "available",
    value,
  };
}

function notTrackedMetric(): ContentPerformanceMetricValue {
  return {
    availability: "not_tracked",
    value: null,
  };
}

function unavailableMetric(): ContentPerformanceMetricValue {
  return {
    availability: "unavailable",
    value: null,
  };
}
