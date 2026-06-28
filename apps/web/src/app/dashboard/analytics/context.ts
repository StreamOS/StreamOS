import "server-only";

import type {
  ContentPerformanceCoverage,
  ContentPerformanceLookupIssue,
  ContentPerformanceMetricValue,
  ContentPerformancePlatformComparison,
  ContentPerformanceItem,
} from "@streamos/types";
import type {
  ContentPerformanceAnalyticsDashboardModel,
  ContentPerformanceAnalyticsPeriod,
} from "@/components/modules/ContentPerformanceAnalyticsConsole.utils";
import { getContentPerformanceAnalyticsDashboardData } from "./data";

export const AI_READY_ANALYTICS_CONTEXT_SCHEMA_VERSION = "2026-06-28";
export const AI_READY_ANALYTICS_CONTEXT_DEFAULT_PERIOD = "30d";
export const AI_READY_ANALYTICS_CONTEXT_MAX_PERIOD_DAYS = 90;
export const AI_READY_ANALYTICS_CONTEXT_MAX_ITEMS = 6;
export const AI_READY_ANALYTICS_CONTEXT_MAX_PLATFORMS = 4;
const AI_READY_ANALYTICS_CONTEXT_TEXT_MAX_LENGTH = 160;

export type AIReadyAnalyticsContextLimitationCode =
  | "ctr_not_tracked"
  | "dashboard_state_not_ready"
  | "heuristic_stream_matching"
  | "lookup_sources_partial"
  | "period_window_publication_updated_at"
  | "sample_scoped_feed"
  | "selected_detail_not_found"
  | "stream_evidence_unavailable";

export type AIReadyAnalyticsContextLimitation = {
  code: AIReadyAnalyticsContextLimitationCode;
  detail: string;
};

export type AIReadyAnalyticsContextItem = {
  channelLabel: string | null;
  contentTitle: string | null;
  coverageStatus: ContentPerformanceItem["coverageStatus"];
  kind: ContentPerformanceItem["kind"];
  metrics: {
    ctr: ContentPerformanceMetricValue;
    engagementRate: ContentPerformanceMetricValue;
    views: ContentPerformanceMetricValue;
    watchTimeMinutes: ContentPerformanceMetricValue;
  };
  platform: ContentPerformanceItem["platform"];
  primaryTimestamp: string;
  publicationStatus: string | null;
  referenceId: string;
  scheduleStatus: string | null;
  snapshotCapturedAt: string | null;
};

export type AIReadyAnalyticsContextPlatform = {
  counts: {
    itemCount: number;
    linkedCount: number;
    metricsOnlyCount: number;
    publicationCount: number;
    publicationOnlyCount: number;
    publishedCount: number;
    scheduledCount: number;
  };
  latestSnapshotAt: string | null;
  metrics: {
    ctr: ContentPerformanceMetricValue;
    engagementRate: ContentPerformanceMetricValue;
    views: ContentPerformanceMetricValue;
    watchTimeMinutes: ContentPerformanceMetricValue;
  };
  platform: ContentPerformancePlatformComparison["platform"];
};

export type AIReadyAnalyticsContextSelectedStream = {
  averageViewers: ContentPerformanceMetricValue;
  endedAt: string | null;
  gameName: string | null;
  peakViewers: ContentPerformanceMetricValue;
  provider: string;
  startedAt: string | null;
  status: string;
  title: string | null;
  updatedAt: string;
};

export type AIReadyAnalyticsContext = {
  evidence: {
    coverage: ContentPerformanceCoverage;
    dashboardState: ContentPerformanceAnalyticsDashboardModel["state"];
    excludedData: string[];
    feed: {
      hasMore: boolean;
      returnedCount: number;
      sourceLimit: number;
    };
    latestActivityAt: string | null;
    latestSnapshotAt: string | null;
    lookupIssueSources: ContentPerformanceLookupIssue["source"][];
    ownerScope: "user_id";
    readOnly: true;
    sampleScoped: true;
    streamMatchingStrategy: "heuristic_channel_platform_time_window";
  };
  generatedAt: string;
  items: AIReadyAnalyticsContextItem[];
  limitations: AIReadyAnalyticsContextLimitation[];
  period: {
    coverageNote: string;
    default: typeof AI_READY_ANALYTICS_CONTEXT_DEFAULT_PERIOD;
    filteredBy: [
      "metrics_snapshots.captured_at",
      "content_publications.updated_at",
    ];
    label: string;
    maxWindowDays: typeof AI_READY_ANALYTICS_CONTEXT_MAX_PERIOD_DAYS;
    selected: ContentPerformanceAnalyticsPeriod;
  };
  platforms: AIReadyAnalyticsContextPlatform[];
  schemaVersion: typeof AI_READY_ANALYTICS_CONTEXT_SCHEMA_VERSION;
  selectedDetail: {
    evidenceNote: string;
    item: AIReadyAnalyticsContextItem | null;
    relatedMetricsCount: number;
    requestedId: string | null;
    state:
      | "idle"
      | "load-failed"
      | "not-found"
      | "ready"
      | "ready_without_stream";
    stream: AIReadyAnalyticsContextSelectedStream | null;
  };
  summary: {
    averageEngagementRate: ContentPerformanceMetricValue;
    itemCount: number;
    linkedCount: number;
    latestActivityAt: string | null;
    latestSnapshotAt: string | null;
    metricsOnlyCount: number;
    platformCount: number;
    publicationCount: number;
    publicationOnlyCount: number;
    sampleMetricsCount: number;
    totalViews: ContentPerformanceMetricValue;
    totalWatchTimeMinutes: ContentPerformanceMetricValue;
  };
};

export async function getAIReadyAnalyticsContext({
  period = AI_READY_ANALYTICS_CONTEXT_DEFAULT_PERIOD,
  selectedItemId = null,
}: {
  period?: ContentPerformanceAnalyticsPeriod;
  selectedItemId?: string | null;
} = {}): Promise<AIReadyAnalyticsContext> {
  const model = await getContentPerformanceAnalyticsDashboardData(
    period,
    selectedItemId,
  );

  return buildAIReadyAnalyticsContext(model);
}

export function buildAIReadyAnalyticsContext(
  model: ContentPerformanceAnalyticsDashboardModel,
  generatedAt: string = new Date().toISOString(),
): AIReadyAnalyticsContext {
  return {
    evidence: {
      coverage: model.coverage,
      dashboardState: model.state,
      excludedData: [
        "provider_raw_payloads",
        "private_urls",
        "signed_urls",
        "monetization_data",
        "ai_provider_calls",
        "provider_writes",
        "database_mutations",
        "cross_tenant_aggregation",
      ],
      feed: {
        hasMore: model.feed.hasMore,
        returnedCount: model.feed.returnedCount,
        sourceLimit: model.feed.limit,
      },
      latestActivityAt: model.summary.latestActivityAt,
      latestSnapshotAt: model.summary.latestSnapshotAt,
      lookupIssueSources: uniqueLookupIssueSources(model.lookupIssues),
      ownerScope: "user_id",
      readOnly: true,
      sampleScoped: true,
      streamMatchingStrategy: "heuristic_channel_platform_time_window",
    },
    generatedAt,
    items: model.items
      .slice(0, AI_READY_ANALYTICS_CONTEXT_MAX_ITEMS)
      .map(toContextItem),
    limitations: buildLimitations(model),
    period: {
      coverageNote: model.periodContext.periodCoverageNote,
      default: AI_READY_ANALYTICS_CONTEXT_DEFAULT_PERIOD,
      filteredBy: [
        "metrics_snapshots.captured_at",
        "content_publications.updated_at",
      ],
      label: model.periodContext.periodLabel,
      maxWindowDays: AI_READY_ANALYTICS_CONTEXT_MAX_PERIOD_DAYS,
      selected: model.periodContext.selectedPeriod,
    },
    platforms: model.platformComparison
      .slice(0, AI_READY_ANALYTICS_CONTEXT_MAX_PLATFORMS)
      .map(toContextPlatform),
    schemaVersion: AI_READY_ANALYTICS_CONTEXT_SCHEMA_VERSION,
    selectedDetail: {
      evidenceNote: model.detail.evidenceNote,
      item: model.detail.item ? toContextItem(model.detail.item) : null,
      relatedMetricsCount: model.detail.relatedMetricsCount,
      requestedId: model.detail.selectedItemId,
      state: resolveSelectedDetailState(model),
      stream: model.detail.stream
        ? {
            averageViewers: model.detail.stream.averageViewers,
            endedAt: model.detail.stream.endedAt,
            gameName: sanitizeContextText(model.detail.stream.gameName),
            peakViewers: model.detail.stream.peakViewers,
            provider: model.detail.stream.provider,
            startedAt: model.detail.stream.startedAt,
            status: model.detail.stream.status,
            title: sanitizeContextText(model.detail.stream.title),
            updatedAt: model.detail.stream.updatedAt,
          }
        : null,
    },
    summary: {
      averageEngagementRate: model.summary.averageEngagementRate,
      itemCount: model.summary.itemCount,
      linkedCount: model.summary.linkedCount,
      latestActivityAt: model.summary.latestActivityAt,
      latestSnapshotAt: model.summary.latestSnapshotAt,
      metricsOnlyCount: model.summary.metricsOnlyCount,
      platformCount: model.summary.platformCount,
      publicationCount: model.summary.publicationCount,
      publicationOnlyCount: model.summary.publicationOnlyCount,
      sampleMetricsCount: model.summary.sampleMetricsCount,
      totalViews: model.summary.totalViews,
      totalWatchTimeMinutes: model.summary.totalWatchTimeMinutes,
    },
  };
}

function toContextItem(
  item: ContentPerformanceItem,
): AIReadyAnalyticsContextItem {
  return {
    channelLabel: sanitizeContextText(item.channelDisplayName),
    contentTitle: sanitizeContextText(item.contentTitle),
    coverageStatus: item.coverageStatus,
    kind: item.kind,
    metrics: {
      ctr: item.ctr,
      engagementRate: item.engagementRate,
      views: item.views,
      watchTimeMinutes: item.watchTimeMinutes,
    },
    platform: item.platform,
    primaryTimestamp: item.primaryTimestamp,
    publicationStatus: item.publicationStatus,
    referenceId: item.id,
    scheduleStatus: item.scheduleStatus,
    snapshotCapturedAt: item.snapshotCapturedAt,
  };
}

function toContextPlatform(
  platform: ContentPerformancePlatformComparison,
): AIReadyAnalyticsContextPlatform {
  return {
    counts: {
      itemCount: platform.itemCount,
      linkedCount: platform.linkedCount,
      metricsOnlyCount: platform.metricsOnlyCount,
      publicationCount: platform.publicationCount,
      publicationOnlyCount: platform.publicationOnlyCount,
      publishedCount: platform.publishedCount,
      scheduledCount: platform.scheduledCount,
    },
    latestSnapshotAt: platform.latestSnapshotAt,
    metrics: {
      ctr: platform.ctr,
      engagementRate: platform.engagementRate,
      views: platform.views,
      watchTimeMinutes: platform.watchTimeMinutes,
    },
    platform: platform.platform,
  };
}

function resolveSelectedDetailState(
  model: ContentPerformanceAnalyticsDashboardModel,
): AIReadyAnalyticsContext["selectedDetail"]["state"] {
  if (model.detail.state !== "ready") {
    return model.detail.state;
  }

  return model.detail.stream ? "ready" : "ready_without_stream";
}

function buildLimitations(
  model: ContentPerformanceAnalyticsDashboardModel,
): AIReadyAnalyticsContextLimitation[] {
  const limitations: AIReadyAnalyticsContextLimitation[] = [
    {
      code: "sample_scoped_feed",
      detail:
        "The analytics feed remains sample-scoped to the bounded dashboard read window and feed limit.",
    },
    {
      code: "ctr_not_tracked",
      detail:
        "CTR is intentionally absent because the active analytics contract does not expose a safe tracked CTR field.",
    },
    {
      code: "period_window_publication_updated_at",
      detail:
        "Publication freshness is currently anchored to content_publications.updated_at for the active period window.",
    },
    {
      code: "heuristic_stream_matching",
      detail:
        "Stream detail matching remains heuristic across channel, platform, and time proximity within the active read window.",
    },
  ];

  if (model.state !== "ready") {
    limitations.push({
      code: "dashboard_state_not_ready",
      detail:
        "The dashboard read model is not in a ready state, so downstream AI use must treat the context as incomplete evidence.",
    });
  }

  if (model.lookupIssues.length > 0) {
    limitations.push({
      code: "lookup_sources_partial",
      detail:
        "One or more lookup sources failed during the read-only join, so linked item coverage may be incomplete.",
    });
  }

  if (
    model.detail.state === "load-failed" ||
    model.detail.state === "not-found"
  ) {
    limitations.push({
      code:
        model.detail.state === "load-failed"
          ? "stream_evidence_unavailable"
          : "selected_detail_not_found",
      detail:
        model.detail.state === "load-failed"
          ? "Requested stream evidence could not be loaded for the selected item during this run."
          : "The requested detail item is outside the current bounded dashboard sample window.",
    });
  }

  if (model.detail.state === "ready" && model.detail.stream === null) {
    limitations.push({
      code: "stream_evidence_unavailable",
      detail:
        "The selected detail item is valid, but no matching stream record was found in the active bounded read window.",
    });
  }

  return limitations;
}

function uniqueLookupIssueSources(
  issues: ContentPerformanceLookupIssue[],
): ContentPerformanceLookupIssue["source"][] {
  return [...new Set(issues.map((issue) => issue.source))];
}

function sanitizeContextText(value: string | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length === 0) {
    return null;
  }

  if (containsUrlLikeText(normalized)) {
    return null;
  }

  return normalized.slice(0, AI_READY_ANALYTICS_CONTEXT_TEXT_MAX_LENGTH);
}

function containsUrlLikeText(value: string): boolean {
  return /(https?:\/\/|www\.)/i.test(value);
}
