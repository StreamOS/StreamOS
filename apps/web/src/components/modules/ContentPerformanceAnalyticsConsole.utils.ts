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

type StreamRow = Pick<
  Tables<"streams">,
  | "average_viewers"
  | "channel_id"
  | "ended_at"
  | "game_name"
  | "id"
  | "peak_viewers"
  | "provider"
  | "started_at"
  | "status"
  | "title"
  | "updated_at"
  | "viewer_peak"
>;

export type ContentPerformanceAnalyticsLookupTables = {
  channels: ChannelRow[];
  contentJobs: ContentJobRow[];
  metricsSnapshots: MetricSnapshotRow[];
  platformConnections: PlatformConnectionRow[];
  streams: StreamRow[];
};

export type ContentPerformanceAnalyticsDashboardState =
  | "auth-failed"
  | "disabled"
  | "load-failed"
  | "ready"
  | "unauthorized";

export const CONTENT_PERFORMANCE_ANALYTICS_PERIODS = [
  "7d",
  "30d",
  "90d",
] as const;

export type ContentPerformanceAnalyticsPeriod =
  (typeof CONTENT_PERFORMANCE_ANALYTICS_PERIODS)[number];

export const CONTENT_PERFORMANCE_ANALYTICS_PERIOD_OPTIONS = [
  {
    id: "7d",
    label: "Letzte 7 Tage",
  },
  {
    id: "30d",
    label: "Letzte 30 Tage",
  },
  {
    id: "90d",
    label: "Letzte 90 Tage",
  },
] as const;

export type ContentPerformanceAnalyticsPeriodContext = {
  periodCoverageNote: string;
  periodLabel: string;
  selectedPeriod: ContentPerformanceAnalyticsPeriod;
};

export type ContentPerformanceAnalyticsDetailState =
  | "idle"
  | "load-failed"
  | "not-found"
  | "ready";

export type ContentPerformanceAnalyticsDetailStream = {
  averageViewers: ContentPerformanceMetricValue;
  endedAt: string | null;
  gameName: string | null;
  id: string;
  peakViewers: ContentPerformanceMetricValue;
  provider: StreamPlatform;
  startedAt: string | null;
  status: string;
  title: string | null;
  updatedAt: string;
};

export type ContentPerformanceAnalyticsDetailModel = {
  evidenceNote: string;
  item: ContentPerformanceItem | null;
  relatedMetricsCount: number;
  selectedItemId: string | null;
  state: ContentPerformanceAnalyticsDetailState;
  stream: ContentPerformanceAnalyticsDetailStream | null;
};

export type ContentPerformanceAnalyticsDashboardModel =
  ContentPerformanceReadModel & {
    detail: ContentPerformanceAnalyticsDetailModel;
    periodContext: ContentPerformanceAnalyticsPeriodContext;
    state: ContentPerformanceAnalyticsDashboardState;
    userId: string | null;
  };

export function buildContentPerformanceAnalyticsDashboardModel({
  feed,
  lookupIssues,
  lookups,
  period = "30d",
  publications,
  selectedItemId = null,
  streamLookupFailed = false,
  state,
  userId,
}: {
  feed: Omit<ContentPerformanceFeedMetadata, "returnedCount">;
  lookupIssues: ContentPerformanceLookupIssue[];
  lookups: ContentPerformanceAnalyticsLookupTables;
  period?: ContentPerformanceAnalyticsPeriod;
  publications: PublicationRow[];
  selectedItemId?: string | null;
  state: ContentPerformanceAnalyticsDashboardState;
  streamLookupFailed?: boolean;
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
  const detail = buildDetailModel({
    items,
    selectedItemId,
    streamLookupFailed,
    streams: lookups.streams,
  });
  const summary = buildSummary(items, platformComparison);

  return {
    coverage,
    detail,
    feed: {
      ...feed,
      hasMore,
      returnedCount: items.length,
    },
    items,
    lookupIssues,
    periodContext: buildPeriodContext(period),
    platformComparison,
    state,
    summary,
    userId,
  };
}

export function createEmptyContentPerformanceAnalyticsDashboardModel(
  userId: string | null,
  state: ContentPerformanceAnalyticsDashboardState = "ready",
  lookupIssues: ContentPerformanceLookupIssue[] = [],
  period: ContentPerformanceAnalyticsPeriod = "30d",
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
    feed: {
      hasMore: false,
      limit: CONTENT_PERFORMANCE_ANALYTICS_FEED_LIMIT,
      returnedCount: 0,
    },
    detail: createEmptyDetailModel(),
    items: [],
    lookupIssues,
    periodContext: buildPeriodContext(period),
    platformComparison: [],
    state,
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

function createEmptyDetailModel(): ContentPerformanceAnalyticsDetailModel {
  return {
    evidenceNote:
      "Waehle ein Overview-Item aus, um vorhandene Stream-, Metric- und Publication-Signale ohne neue Reads ausserhalb des aktiven Fensters anzuzeigen.",
    item: null,
    relatedMetricsCount: 0,
    selectedItemId: null,
    state: "idle",
    stream: null,
  };
}

function buildPeriodContext(
  period: ContentPerformanceAnalyticsPeriod,
): ContentPerformanceAnalyticsPeriodContext {
  return {
    periodCoverageNote:
      "Metrics werden ueber captured_at und Publications ueber updated_at im aktiven Read-Window gefiltert.",
    periodLabel: getContentPerformanceAnalyticsPeriodLabel(period),
    selectedPeriod: period,
  };
}

export function getContentPerformanceAnalyticsPeriodLabel(
  period: ContentPerformanceAnalyticsPeriod,
): string {
  return (
    CONTENT_PERFORMANCE_ANALYTICS_PERIOD_OPTIONS.find(
      (option) => option.id === period,
    )?.label ?? "Letzte 30 Tage"
  );
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
    .sort(comparePlatformComparison);
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

function buildDetailModel({
  items,
  selectedItemId,
  streamLookupFailed,
  streams,
}: {
  items: ContentPerformanceItem[];
  selectedItemId: string | null;
  streamLookupFailed: boolean;
  streams: StreamRow[];
}): ContentPerformanceAnalyticsDetailModel {
  if (!selectedItemId) {
    return createEmptyDetailModel();
  }

  const item =
    items.find((candidate) => candidate.id === selectedItemId) ?? null;

  if (!item) {
    return {
      evidenceNote:
        "Das angeforderte Detail-Item ist nicht mehr im aktuellen Read-Window enthalten. Waehle ein Item aus der aktuellen Liste.",
      item: null,
      relatedMetricsCount: 0,
      selectedItemId,
      state: "not-found",
      stream: null,
    };
  }

  if (streamLookupFailed) {
    return {
      evidenceNote:
        "Die Overview-Daten bleiben sichtbar, aber die zusaetzliche Stream-Evidence konnte fuer dieses Detail nicht geladen werden.",
      item,
      relatedMetricsCount: countRelatedMetrics(items, item),
      selectedItemId,
      state: "load-failed",
      stream: null,
    };
  }

  const matchedStream = selectBestStream({
    candidates: streams.filter(
      (stream) =>
        stream.channel_id === item.channelId &&
        stream.provider === item.platform,
    ),
    referenceAt: item.primaryTimestamp,
  });

  return {
    evidenceNote: matchedStream
      ? "Das Detail verbindet das ausgewaehlte Overview-Item mit dem naechstpassenden Stream-Record im aktiven Read-Window."
      : "Fuer dieses Overview-Item ist aktuell kein passender Stream-Record im aktiven Read-Window vorhanden. Metrics- und Publication-Signale bleiben trotzdem sichtbar.",
    item,
    relatedMetricsCount: countRelatedMetrics(items, item),
    selectedItemId,
    state: "ready",
    stream: matchedStream
      ? {
          averageViewers: createNumericMetric(matchedStream.average_viewers),
          endedAt: matchedStream.ended_at,
          gameName: matchedStream.game_name,
          id: matchedStream.id,
          peakViewers: createNumericMetric(
            matchedStream.peak_viewers ?? matchedStream.viewer_peak,
          ),
          provider: matchedStream.provider,
          startedAt: matchedStream.started_at,
          status: matchedStream.status,
          title: matchedStream.title,
          updatedAt: matchedStream.updated_at,
        }
      : null,
  };
}

function countRelatedMetrics(
  items: ContentPerformanceItem[],
  targetItem: ContentPerformanceItem,
): number {
  return items.filter(
    (item) =>
      item.channelId === targetItem.channelId &&
      item.platform === targetItem.platform &&
      item.metricsSnapshotId !== null,
  ).length;
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

function selectBestStream({
  candidates,
  referenceAt,
}: {
  candidates: StreamRow[];
  referenceAt: string | null;
}): StreamRow | null {
  if (candidates.length === 0) {
    return null;
  }

  const referenceTime = referenceAt ? new Date(referenceAt).getTime() : NaN;

  if (!Number.isFinite(referenceTime)) {
    return (
      [...candidates].sort((left, right) =>
        compareDescending(left.updated_at, right.updated_at),
      )[0] ?? null
    );
  }

  const coveringStream = [...candidates]
    .filter((candidate) => {
      const startedAt = candidate.started_at
        ? new Date(candidate.started_at).getTime()
        : NaN;
      const endedAt = candidate.ended_at
        ? new Date(candidate.ended_at).getTime()
        : NaN;

      if (!Number.isFinite(startedAt)) {
        return false;
      }

      const effectiveEnd = Number.isFinite(endedAt)
        ? endedAt
        : new Date(candidate.updated_at).getTime();

      return referenceTime >= startedAt && referenceTime <= effectiveEnd;
    })
    .sort((left, right) =>
      compareDescending(left.updated_at, right.updated_at),
    );

  if (coveringStream[0]) {
    return coveringStream[0];
  }

  return (
    [...candidates].sort((left, right) => {
      const leftDistance = Math.abs(
        resolveStreamAnchorTime(left) - referenceTime,
      );
      const rightDistance = Math.abs(
        resolveStreamAnchorTime(right) - referenceTime,
      );

      if (leftDistance === rightDistance) {
        return compareDescending(left.updated_at, right.updated_at);
      }

      return leftDistance - rightDistance;
    })[0] ?? null
  );
}

function resolveStreamAnchorTime(stream: StreamRow): number {
  for (const value of [stream.started_at, stream.ended_at, stream.updated_at]) {
    if (!value) {
      continue;
    }

    const timestamp = new Date(value).getTime();

    if (Number.isFinite(timestamp)) {
      return timestamp;
    }
  }

  return 0;
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

function comparePlatformComparison(
  left: ContentPerformancePlatformComparison,
  right: ContentPerformancePlatformComparison,
): number {
  if (left.latestSnapshotAt && right.latestSnapshotAt) {
    return compareDescending(left.latestSnapshotAt, right.latestSnapshotAt);
  }

  if (left.latestSnapshotAt) {
    return -1;
  }

  if (right.latestSnapshotAt) {
    return 1;
  }

  return left.platform.localeCompare(right.platform);
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
