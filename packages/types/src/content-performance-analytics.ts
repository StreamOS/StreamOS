import type { StreamPlatform } from "./index.js";

export const CONTENT_PERFORMANCE_ANALYTICS_FEED_LIMIT = 12;

export const CONTENT_PERFORMANCE_LOOKUP_SOURCES = [
  "channels",
  "contentJobs",
  "metricsSnapshots",
  "platformConnections",
  "publications",
] as const;

export type ContentPerformanceLookupSource =
  (typeof CONTENT_PERFORMANCE_LOOKUP_SOURCES)[number];

export type ContentPerformanceLookupIssue = {
  code: "load-failed";
  source: ContentPerformanceLookupSource;
};

export const CONTENT_PERFORMANCE_METRIC_AVAILABILITIES = [
  "available",
  "not_tracked",
  "unavailable",
] as const;

export type ContentPerformanceMetricAvailability =
  (typeof CONTENT_PERFORMANCE_METRIC_AVAILABILITIES)[number];

export type ContentPerformanceMetricValue = {
  availability: ContentPerformanceMetricAvailability;
  value: number | null;
};

export const CONTENT_PERFORMANCE_COVERAGE_STATUSES = [
  "linked",
  "metrics_only",
  "publication_only",
] as const;

export type ContentPerformanceCoverageStatus =
  (typeof CONTENT_PERFORMANCE_COVERAGE_STATUSES)[number];

export type ContentPerformanceItem = {
  channelDisplayName: string | null;
  channelId: string | null;
  contentJobId: string | null;
  contentTitle: string | null;
  coverageStatus: ContentPerformanceCoverageStatus;
  ctr: ContentPerformanceMetricValue;
  engagementRate: ContentPerformanceMetricValue;
  id: string;
  kind: "metrics_snapshot" | "publication";
  metricsSnapshotId: string | null;
  platform: StreamPlatform;
  primaryTimestamp: string;
  publicationId: string | null;
  publicationStatus: string | null;
  publishedAt: string | null;
  requestedAt: string | null;
  scheduleStatus: string | null;
  scheduledAt: string | null;
  snapshotCapturedAt: string | null;
  views: ContentPerformanceMetricValue;
  watchTimeMinutes: ContentPerformanceMetricValue;
};

export type ContentPerformancePlatformComparison = {
  ctr: ContentPerformanceMetricValue;
  engagementRate: ContentPerformanceMetricValue;
  itemCount: number;
  latestSnapshotAt: string | null;
  linkedCount: number;
  metricsOnlyCount: number;
  platform: StreamPlatform;
  publicationCount: number;
  publicationOnlyCount: number;
  publishedCount: number;
  scheduledCount: number;
  views: ContentPerformanceMetricValue;
  watchTimeMinutes: ContentPerformanceMetricValue;
};

export type ContentPerformanceSummary = {
  averageEngagementRate: ContentPerformanceMetricValue;
  itemCount: number;
  latestActivityAt: string | null;
  latestSnapshotAt: string | null;
  linkedCount: number;
  metricsOnlyCount: number;
  platformCount: number;
  publicationCount: number;
  publicationOnlyCount: number;
  sampleMetricsCount: number;
  totalViews: ContentPerformanceMetricValue;
  totalWatchTimeMinutes: ContentPerformanceMetricValue;
};

export type ContentPerformanceCoverage = {
  linkedItems: number;
  metricsOnlyItems: number;
  metricsSnapshots: number;
  platforms: number;
  publicationOnlyItems: number;
  publications: number;
  publishedPublications: number;
  scheduledPublications: number;
};

export type ContentPerformanceFeedMetadata = {
  hasMore: boolean;
  limit: number;
  returnedCount: number;
  totalCount?: number;
};

export type ContentPerformanceReadModel = {
  coverage: ContentPerformanceCoverage;
  feed: ContentPerformanceFeedMetadata;
  items: ContentPerformanceItem[];
  lookupIssues: ContentPerformanceLookupIssue[];
  platformComparison: ContentPerformancePlatformComparison[];
  summary: ContentPerformanceSummary;
};
