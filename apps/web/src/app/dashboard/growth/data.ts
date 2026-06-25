import type { Tables } from "@streamos/database";
import {
  CREATOR_GROWTH_INTELLIGENCE_FEED_LIMIT,
  type CreatorGrowthIntelligenceLookupIssue,
} from "@streamos/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import {
  buildCreatorGrowthIntelligenceDashboardModel,
  createEmptyCreatorGrowthIntelligenceDashboardModel,
  normalizeCreatorGrowthIntelligenceRow,
  type CreatorGrowthIntelligenceDashboardModel,
  type CreatorGrowthIntelligenceLookupTables,
} from "@/components/modules/CreatorGrowthIntelligenceConsole.utils";

type GrowthIntelligenceRow = Pick<
  Tables<"creator_growth_intelligence">,
  | "channel_id"
  | "confidence"
  | "content_job_id"
  | "content_publication_id"
  | "created_at"
  | "creator_id"
  | "evidence"
  | "id"
  | "intelligence_category"
  | "metadata"
  | "metrics_snapshot_id"
  | "platform"
  | "rationale"
  | "recommendation_status"
  | "recommendation_type"
  | "score"
  | "summary"
  | "title"
  | "updated_at"
  | "user_id"
>;

type CreatorRow = CreatorGrowthIntelligenceLookupTables["creators"][number];
type ChannelRow = CreatorGrowthIntelligenceLookupTables["channels"][number];
type ContentJobRow =
  CreatorGrowthIntelligenceLookupTables["contentJobs"][number];
type ContentPublicationRow =
  CreatorGrowthIntelligenceLookupTables["contentPublications"][number];
type MetricSnapshotRow =
  CreatorGrowthIntelligenceLookupTables["metricsSnapshots"][number];

export async function getCreatorGrowthIntelligenceDashboardData(): Promise<CreatorGrowthIntelligenceDashboardModel> {
  if (!isSupabaseConfigured()) {
    return createEmptyCreatorGrowthIntelligenceDashboardModel(null);
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return createEmptyCreatorGrowthIntelligenceDashboardModel(null);
  }

  const mainResult = await supabase
    .from("creator_growth_intelligence")
    .select(
      "channel_id,confidence,content_job_id,content_publication_id,created_at,creator_id,evidence,id,intelligence_category,metadata,metrics_snapshot_id,platform,rationale,recommendation_status,recommendation_type,score,summary,title,updated_at,user_id",
    )
    .eq("user_id", userData.user.id)
    .order("created_at", { ascending: false })
    .limit(CREATOR_GROWTH_INTELLIGENCE_FEED_LIMIT + 1);

  if (mainResult.error) {
    return createEmptyCreatorGrowthIntelligenceDashboardModel(
      userData.user.id,
      "load-failed",
    );
  }

  const rows = (mainResult.data ?? []) as GrowthIntelligenceRow[];
  const hasMore = rows.length > CREATOR_GROWTH_INTELLIGENCE_FEED_LIMIT;
  const visibleRows = rows.slice(0, CREATOR_GROWTH_INTELLIGENCE_FEED_LIMIT);

  if (visibleRows.length === 0) {
    return createEmptyCreatorGrowthIntelligenceDashboardModel(userData.user.id);
  }

  const normalizedItems = visibleRows.map(
    normalizeCreatorGrowthIntelligenceRow,
  );
  const { issues: lookupIssues, tables: lookupTables } = await loadLookupTables(
    supabase,
    userData.user.id,
    visibleRows,
  );

  return buildCreatorGrowthIntelligenceDashboardModel({
    error: null,
    feed: {
      hasMore,
      limit: CREATOR_GROWTH_INTELLIGENCE_FEED_LIMIT,
      returnedCount: visibleRows.length,
    },
    items: normalizedItems,
    lookupIssues,
    lookups: lookupTables,
    userId: userData.user.id,
  });
}

async function loadLookupTables(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  rows: GrowthIntelligenceRow[],
): Promise<{
  issues: CreatorGrowthIntelligenceLookupIssue[];
  tables: CreatorGrowthIntelligenceLookupTables;
}> {
  const creatorIds = uniqueIds(rows.map((row) => row.creator_id));
  const channelIds = uniqueIds(rows.map((row) => row.channel_id));
  const contentJobIds = uniqueIds(rows.map((row) => row.content_job_id));
  const contentPublicationIds = uniqueIds(
    rows.map((row) => row.content_publication_id),
  );
  const metricSnapshotIds = uniqueIds(
    rows.map((row) => row.metrics_snapshot_id),
  );

  const [
    creatorsResult,
    channelsResult,
    contentJobsResult,
    publicationsResult,
    metricsSnapshotsResult,
  ] = await Promise.all([
    creatorIds.length > 0
      ? supabase
          .from("creators")
          .select("display_name,handle,id,niche")
          .eq("user_id", userId)
          .in("id", creatorIds)
      : emptyResult<CreatorRow>(),
    channelIds.length > 0
      ? supabase
          .from("channels")
          .select("display_name,id,platform")
          .eq("user_id", userId)
          .in("id", channelIds)
      : emptyResult<ChannelRow>(),
    contentJobIds.length > 0
      ? supabase
          .from("content_jobs")
          .select("created_at,id,job_type,review_status,status,updated_at")
          .eq("user_id", userId)
          .in("id", contentJobIds)
      : emptyResult<ContentJobRow>(),
    contentPublicationIds.length > 0
      ? supabase
          .from("content_publications")
          .select(
            "created_at,id,publication_status,published_at,requested_at,schedule_status,target_platform",
          )
          .eq("user_id", userId)
          .in("id", contentPublicationIds)
      : emptyResult<ContentPublicationRow>(),
    metricSnapshotIds.length > 0
      ? supabase
          .from("metrics_snapshots")
          .select(
            "captured_at,channel_id,creator_id,follower_count,id,platform,viewer_count",
          )
          .eq("user_id", userId)
          .in("id", metricSnapshotIds)
      : emptyResult<MetricSnapshotRow>(),
  ]);

  const creators = sanitizeLookupRows(creatorsResult, "creators");
  const channels = sanitizeLookupRows(channelsResult, "channels");
  const contentJobs = sanitizeLookupRows(contentJobsResult, "contentJobs");
  const contentPublications = sanitizeLookupRows(
    publicationsResult,
    "contentPublications",
  );
  const metricsSnapshots = sanitizeLookupRows(
    metricsSnapshotsResult,
    "metricsSnapshots",
  );

  return {
    issues: [
      creators.issue,
      channels.issue,
      contentJobs.issue,
      contentPublications.issue,
      metricsSnapshots.issue,
    ].filter(
      (issue): issue is CreatorGrowthIntelligenceLookupIssue => issue !== null,
    ),
    tables: {
      channels: channels.rows,
      contentJobs: contentJobs.rows,
      contentPublications: contentPublications.rows,
      creators: creators.rows,
      metricsSnapshots: metricsSnapshots.rows,
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

function sanitizeLookupRows<T>(
  result: {
    data: T[] | null;
    error: unknown;
  },
  source: CreatorGrowthIntelligenceLookupIssue["source"],
): {
  issue: CreatorGrowthIntelligenceLookupIssue | null;
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
