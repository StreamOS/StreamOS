import type { Tables } from "@streamos/database";
import { buildCrosspostingSummaryDashboardModel } from "@/components/modules/CrosspostingSummaryConsole.utils";
import { buildPublicationDashboardModel } from "@/components/modules/PublicationStatusConsole.utils";
import {
  buildPublishingAnalyticsDashboardModel,
  parsePublishingAnalyticsPeriod,
  parsePublishingAnalyticsProviderFilter,
} from "@/components/modules/PublishingAnalyticsConsole.utils";
import { PublishingAnalyticsConsole } from "@/components/modules/PublishingAnalyticsConsole";
import { type PublicationRow } from "@/components/modules/PublicationStatusConsole.utils";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ensureCreatorForUser } from "@/lib/supabase/creator";
import { createClient } from "@/lib/supabase/server";

type PublishingAnalyticsPageProps = {
  searchParams?: Promise<{
    period?: string;
    provider?: string;
  }>;
};

type PublicationEventRow = Tables<"content_publication_events">;
type PublicationJobRow = Tables<"content_jobs">;
type PublicationConnectionRow = Tables<"platform_connections">;
type PublicationChannelRow = Tables<"channels">;
type PublicationVodAssetRow = Tables<"vod_assets">;
type PublicationFanoutRow = Tables<"content_publication_fanouts">;
type PublicationFanoutTargetRow = Tables<"content_publication_fanout_targets">;

export const dynamic = "force-dynamic";

export default async function PublishingAnalyticsPage({
  searchParams,
}: PublishingAnalyticsPageProps) {
  const params = await searchParams;
  const data = await getPublishingAnalyticsDashboardData();

  const publicationModel = buildPublicationDashboardModel({
    channels: data.channels,
    connections: data.connections,
    contentJobs: data.contentJobs,
    publicationEvents: data.publicationEvents,
    publications: data.publications,
    vodAssets: data.vodAssets,
  });

  const crosspostingModel = buildCrosspostingSummaryDashboardModel({
    channels: data.channels,
    connections: data.connections,
    fanoutTargets: data.fanoutTargets,
    fanouts: data.fanouts,
    publications: publicationModel.items,
    vodAssets: data.vodAssets,
  });

  const model = buildPublishingAnalyticsDashboardModel({
    fanouts: crosspostingModel.items,
    initialPeriod: parsePublishingAnalyticsPeriod(params?.period ?? null),
    initialProvider: parsePublishingAnalyticsProviderFilter(
      params?.provider ?? null,
    ),
    publications: publicationModel.items,
  });

  return <PublishingAnalyticsConsole model={model} />;
}

async function getPublishingAnalyticsDashboardData(): Promise<{
  channels: PublicationChannelRow[];
  connections: PublicationConnectionRow[];
  contentJobs: PublicationJobRow[];
  fanoutTargets: PublicationFanoutTargetRow[];
  fanouts: PublicationFanoutRow[];
  publicationEvents: PublicationEventRow[];
  publications: PublicationRow[];
  vodAssets: PublicationVodAssetRow[];
}> {
  if (!isSupabaseConfigured()) {
    return {
      channels: [],
      connections: [],
      contentJobs: [],
      fanoutTargets: [],
      fanouts: [],
      publicationEvents: [],
      publications: [],
      vodAssets: [],
    };
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return {
      channels: [],
      connections: [],
      contentJobs: [],
      fanoutTargets: [],
      fanouts: [],
      publicationEvents: [],
      publications: [],
      vodAssets: [],
    };
  }

  const creator = await ensureCreatorForUser(supabase, userData.user);
  const publicationsResult = await supabase
    .from("content_publications")
    .select("*")
    .eq("user_id", userData.user.id)
    .order("updated_at", { ascending: false })
    .limit(24);

  if (publicationsResult.error) {
    return {
      channels: [],
      connections: [],
      contentJobs: [],
      fanoutTargets: [],
      fanouts: [],
      publicationEvents: [],
      publications: [],
      vodAssets: [],
    };
  }

  const publications = (publicationsResult.data ?? []) as PublicationRow[];
  const publicationIds = publications.map((publication) => publication.id);
  const contentJobIds = [
    ...new Set(publications.map((publication) => publication.content_job_id)),
  ].filter((value): value is string => typeof value === "string");

  const fanoutsResult = await supabase
    .from("content_publication_fanouts")
    .select("*")
    .eq("user_id", userData.user.id)
    .order("updated_at", { ascending: false })
    .limit(24);

  if (fanoutsResult.error) {
    return {
      channels: [],
      connections: [],
      contentJobs: [],
      fanoutTargets: [],
      fanouts: [],
      publicationEvents: [],
      publications: [],
      vodAssets: [],
    };
  }

  const fanouts = (fanoutsResult.data ?? []) as PublicationFanoutRow[];
  const fanoutIds = fanouts.map((fanout) => fanout.id);

  const fanoutTargetsResult =
    fanoutIds.length > 0
      ? await supabase
          .from("content_publication_fanout_targets")
          .select("*")
          .eq("user_id", userData.user.id)
          .in("content_publication_fanout_id", fanoutIds)
          .order("created_at", { ascending: false })
          .limit(300)
      : emptyResult<PublicationFanoutTargetRow>();

  if (fanoutTargetsResult.error) {
    return {
      channels: [],
      connections: [],
      contentJobs: [],
      fanoutTargets: [],
      fanouts: [],
      publicationEvents: [],
      publications: [],
      vodAssets: [],
    };
  }

  const fanoutTargets = (fanoutTargetsResult.data ??
    []) as PublicationFanoutTargetRow[];
  const connectionIds = [
    ...new Set([
      ...publications.map((publication) => publication.platform_connection_id),
      ...fanoutTargets.map((target) => target.platform_connection_id),
    ]),
  ].filter((value): value is string => typeof value === "string");

  const [contentJobsResult, publicationEventsResult, connectionsResult] =
    await Promise.all([
      contentJobIds.length > 0
        ? supabase
            .from("content_jobs")
            .select("*")
            .eq("user_id", userData.user.id)
            .in("id", contentJobIds)
        : emptyResult<PublicationJobRow>(),
      publicationIds.length > 0
        ? supabase
            .from("content_publication_events")
            .select("*")
            .eq("user_id", userData.user.id)
            .in("content_publication_id", publicationIds)
            .order("created_at", { ascending: false })
            .limit(200)
        : emptyResult<PublicationEventRow>(),
      connectionIds.length > 0
        ? supabase
            .from("platform_connections")
            .select("*")
            .eq("user_id", userData.user.id)
            .eq("creator_id", creator.id)
            .in("id", connectionIds)
        : emptyResult<PublicationConnectionRow>(),
    ]);

  if (
    contentJobsResult.error ||
    publicationEventsResult.error ||
    connectionsResult.error
  ) {
    return {
      channels: [],
      connections: [],
      contentJobs: [],
      fanoutTargets: [],
      fanouts: [],
      publicationEvents: [],
      publications: [],
      vodAssets: [],
    };
  }

  const streamIds = [
    ...new Set(
      (contentJobsResult.data ?? [])
        .map((job) => job.stream_id)
        .filter((value): value is string => typeof value === "string"),
    ),
  ];

  const vodAssetsResult =
    streamIds.length > 0
      ? await supabase
          .from("vod_assets")
          .select("*")
          .eq("user_id", userData.user.id)
          .in("stream_id", streamIds)
          .order("updated_at", { ascending: false })
      : emptyResult<PublicationVodAssetRow>();

  if (vodAssetsResult.error) {
    return {
      channels: [],
      connections: [],
      contentJobs: [],
      fanoutTargets: [],
      fanouts: [],
      publicationEvents: [],
      publications: [],
      vodAssets: [],
    };
  }

  const channelIds = [
    ...new Set(
      (connectionsResult.data ?? [])
        .map((connection) => connection.channel_id)
        .filter((value): value is string => typeof value === "string"),
    ),
  ];
  const channelsResult =
    channelIds.length > 0
      ? await supabase
          .from("channels")
          .select("*")
          .eq("user_id", userData.user.id)
          .eq("creator_id", creator.id)
          .in("id", channelIds)
      : emptyResult<PublicationChannelRow>();

  if (channelsResult.error) {
    return {
      channels: [],
      connections: [],
      contentJobs: [],
      fanoutTargets: [],
      fanouts: [],
      publicationEvents: [],
      publications: [],
      vodAssets: [],
    };
  }

  return {
    channels: (channelsResult.data ?? []) as PublicationChannelRow[],
    connections: (connectionsResult.data ?? []) as PublicationConnectionRow[],
    contentJobs: (contentJobsResult.data ?? []) as PublicationJobRow[],
    fanoutTargets,
    fanouts,
    publicationEvents: (publicationEventsResult.data ??
      []) as PublicationEventRow[],
    publications,
    vodAssets: (vodAssetsResult.data ?? []) as PublicationVodAssetRow[],
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
