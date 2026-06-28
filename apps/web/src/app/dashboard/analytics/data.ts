import type { Tables } from "@streamos/database";
import {
  CONTENT_PERFORMANCE_ANALYTICS_FEED_LIMIT,
  type ContentPerformanceLookupIssue,
} from "@streamos/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import {
  CONTENT_PERFORMANCE_ANALYTICS_PERIODS,
  buildContentPerformanceAnalyticsDashboardModel,
  createEmptyContentPerformanceAnalyticsDashboardModel,
  type ContentPerformanceAnalyticsDashboardModel,
  type ContentPerformanceAnalyticsPeriod,
  type ContentPerformanceAnalyticsLookupTables,
} from "@/components/modules/ContentPerformanceAnalyticsConsole.utils";

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

type MetricSnapshotRow =
  ContentPerformanceAnalyticsLookupTables["metricsSnapshots"][number];
type ChannelRow = ContentPerformanceAnalyticsLookupTables["channels"][number];
type ContentJobRow =
  ContentPerformanceAnalyticsLookupTables["contentJobs"][number];
type PlatformConnectionRow =
  ContentPerformanceAnalyticsLookupTables["platformConnections"][number];
type StreamRow = ContentPerformanceAnalyticsLookupTables["streams"][number];

export function parseContentPerformanceAnalyticsPeriod(
  value: string | undefined,
): ContentPerformanceAnalyticsPeriod {
  return CONTENT_PERFORMANCE_ANALYTICS_PERIODS.includes(
    value as ContentPerformanceAnalyticsPeriod,
  )
    ? (value as ContentPerformanceAnalyticsPeriod)
    : "30d";
}

export function parseContentPerformanceAnalyticsDetailId(
  value: string | undefined,
): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

export async function getContentPerformanceAnalyticsDashboardData(
  period: ContentPerformanceAnalyticsPeriod = "30d",
  selectedItemId: string | null = null,
): Promise<ContentPerformanceAnalyticsDashboardModel> {
  if (!isSupabaseConfigured()) {
    return createEmptyContentPerformanceAnalyticsDashboardModel(
      null,
      "disabled",
      [],
      period,
    );
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return createEmptyContentPerformanceAnalyticsDashboardModel(
      null,
      userError ? "auth-failed" : "unauthorized",
      [],
      period,
    );
  }

  const cutoffIso = resolveContentPerformancePeriodCutoff(period);

  const [publicationsResult, metricsSnapshotsResult] = await Promise.all([
    supabase
      .from("content_publications")
      .select(
        "content_job_id,created_at,id,platform_connection_id,publication_status,published_at,requested_at,schedule_status,scheduled_at_utc,target_platform,updated_at",
      )
      .eq("user_id", userData.user.id)
      .gte("updated_at", cutoffIso)
      .order("updated_at", { ascending: false })
      .limit(CONTENT_PERFORMANCE_ANALYTICS_FEED_LIMIT + 1),
    supabase
      .from("metrics_snapshots")
      .select(
        "captured_at,channel_id,engagement_rate,id,platform,viewer_count,watch_time_minutes",
      )
      .eq("user_id", userData.user.id)
      .gte("captured_at", cutoffIso)
      .order("captured_at", { ascending: false })
      .limit(CONTENT_PERFORMANCE_ANALYTICS_FEED_LIMIT + 1),
  ]);

  const publications = sanitizeRows(publicationsResult, "publications");
  const metricsSnapshots = sanitizeRows(
    metricsSnapshotsResult,
    "metricsSnapshots",
  );

  if (
    publications.issue &&
    metricsSnapshots.issue &&
    publications.rows.length === 0 &&
    metricsSnapshots.rows.length === 0
  ) {
    return createEmptyContentPerformanceAnalyticsDashboardModel(
      userData.user.id,
      "load-failed",
      [publications.issue, metricsSnapshots.issue],
      period,
    );
  }

  const lookupIssues: ContentPerformanceLookupIssue[] = [
    publications.issue,
    metricsSnapshots.issue,
  ].filter((issue): issue is ContentPerformanceLookupIssue => issue !== null);

  const lookups = await loadLookupTables({
    cutoffIso,
    metricsSnapshots: metricsSnapshots.rows,
    publications: publications.rows,
    selectedItemId,
    supabase,
    userId: userData.user.id,
  });

  return buildContentPerformanceAnalyticsDashboardModel({
    feed: {
      hasMore:
        publications.rows.length > CONTENT_PERFORMANCE_ANALYTICS_FEED_LIMIT ||
        metricsSnapshots.rows.length > CONTENT_PERFORMANCE_ANALYTICS_FEED_LIMIT,
      limit: CONTENT_PERFORMANCE_ANALYTICS_FEED_LIMIT,
    },
    lookupIssues: [...lookupIssues, ...lookups.issues],
    lookups: lookups.tables,
    period,
    publications: publications.rows,
    selectedItemId,
    state: "ready",
    streamLookupFailed: lookups.streamLookupFailed,
    userId: userData.user.id,
  });
}

function resolveContentPerformancePeriodCutoff(
  period: ContentPerformanceAnalyticsPeriod,
): string {
  const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  return cutoff.toISOString();
}

async function loadLookupTables({
  cutoffIso,
  metricsSnapshots,
  publications,
  selectedItemId,
  supabase,
  userId,
}: {
  cutoffIso: string;
  metricsSnapshots: MetricSnapshotRow[];
  publications: PublicationRow[];
  selectedItemId: string | null;
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
}): Promise<{
  issues: ContentPerformanceLookupIssue[];
  streamLookupFailed: boolean;
  tables: ContentPerformanceAnalyticsLookupTables;
}> {
  const visiblePublications = publications.slice(
    0,
    CONTENT_PERFORMANCE_ANALYTICS_FEED_LIMIT,
  );
  const visibleMetrics = metricsSnapshots.slice(
    0,
    CONTENT_PERFORMANCE_ANALYTICS_FEED_LIMIT,
  );
  const contentJobIds = uniqueIds(
    visiblePublications.map((publication) => publication.content_job_id),
  );
  const connectionIds = uniqueIds(
    visiblePublications.map(
      (publication) => publication.platform_connection_id,
    ),
  );

  const [contentJobsResult, platformConnectionsResult] = await Promise.all([
    contentJobIds.length > 0
      ? supabase
          .from("content_jobs")
          .select("id,result")
          .eq("user_id", userId)
          .in("id", contentJobIds)
      : emptyResult<ContentJobRow>(),
    connectionIds.length > 0
      ? supabase
          .from("platform_connections")
          .select("channel_id,id,platform,status")
          .eq("user_id", userId)
          .in("id", connectionIds)
      : emptyResult<PlatformConnectionRow>(),
  ]);

  const platformConnections = sanitizeRows(
    platformConnectionsResult,
    "platformConnections",
  );
  const channelIds = uniqueIds([
    ...visibleMetrics.map((metric) => metric.channel_id),
    ...platformConnections.rows.map((connection) => connection.channel_id),
  ]);
  const channelsResult =
    channelIds.length > 0
      ? await supabase
          .from("channels")
          .select("display_name,id,platform")
          .eq("user_id", userId)
          .in("id", channelIds)
      : emptyResult<ChannelRow>();
  const streamsResult =
    selectedItemId && channelIds.length > 0
      ? await supabase
          .from("streams")
          .select(
            "average_viewers,channel_id,ended_at,game_name,id,peak_viewers,provider,started_at,status,title,updated_at,viewer_peak",
          )
          .eq("user_id", userId)
          .in("channel_id", channelIds)
          .gte("updated_at", cutoffIso)
          .order("updated_at", { ascending: false })
          .limit(CONTENT_PERFORMANCE_ANALYTICS_FEED_LIMIT)
      : emptyResult<StreamRow>();

  const contentJobs = sanitizeRows(contentJobsResult, "contentJobs");
  const channels = sanitizeRows(channelsResult, "channels");
  const streamLookupFailed = Boolean(
    streamsResult.error || !streamsResult.data,
  );
  const streams: StreamRow[] = streamLookupFailed
    ? []
    : (streamsResult.data ?? []);

  return {
    issues: [
      contentJobs.issue,
      platformConnections.issue,
      channels.issue,
    ].filter((issue): issue is ContentPerformanceLookupIssue => issue !== null),
    streamLookupFailed,
    tables: {
      channels: channels.rows,
      contentJobs: contentJobs.rows,
      metricsSnapshots: visibleMetrics,
      platformConnections: platformConnections.rows,
      streams,
    },
  };
}

function emptyResult<T>(): {
  data: T[];
  error: null;
} {
  return {
    data: [] as T[],
    error: null,
  };
}

function sanitizeRows<T>(
  result: {
    data: T[] | null;
    error: unknown;
  },
  source: ContentPerformanceLookupIssue["source"],
): {
  issue: ContentPerformanceLookupIssue | null;
  rows: T[];
} {
  if (result.error || !result.data) {
    return {
      issue: {
        code: "load-failed",
        source,
      },
      rows: [],
    };
  }

  return {
    issue: null,
    rows: result.data,
  };
}

function uniqueIds(values: Array<string | null>): string[] {
  return [
    ...new Set(values.filter((value): value is string => value !== null)),
  ];
}
