import {
  buildPublicationDashboardModel,
  type PublicationChannelRow,
  type PublicationConnectionRow,
  type PublicationEventRow,
  type PublicationJobRow,
  type PublicationRow,
  type PublicationVodAssetRow,
} from "@/components/modules/PublicationStatusConsole.utils";
import { CrosspostingSummaryConsole } from "@/components/modules/CrosspostingSummaryConsole";
import {
  buildCrosspostingSummaryDashboardModel,
  type PublicationFanoutRow,
  type PublicationFanoutTargetRow,
} from "@/components/modules/CrosspostingSummaryConsole.utils";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ensureCreatorForUser } from "@/lib/supabase/creator";
import { createClient } from "@/lib/supabase/server";

type CrosspostingSummaryPageProps = {
  searchParams?: Promise<{
    fanoutId?: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function CrosspostingSummaryPage({
  searchParams,
}: CrosspostingSummaryPageProps) {
  const params = await searchParams;
  const { channels, connections, fanoutTargets, fanouts, publications } =
    await getCrosspostingSummaryDashboardData();

  const publicationModel = buildPublicationDashboardModel({
    channels,
    connections,
    contentJobs: publications.contentJobs,
    publicationEvents: publications.publicationEvents,
    publications: publications.publications,
    vodAssets: publications.vodAssets,
  });

  const model = buildCrosspostingSummaryDashboardModel({
    channels,
    connections,
    fanoutTargets,
    fanouts,
    initialSelectedFanoutId: params?.fanoutId ?? null,
    publications: publicationModel.items,
    vodAssets: publications.vodAssets,
  });

  return <CrosspostingSummaryConsole model={model} />;
}

async function getCrosspostingSummaryDashboardData(): Promise<{
  channels: PublicationChannelRow[];
  connections: PublicationConnectionRow[];
  fanoutTargets: PublicationFanoutTargetRow[];
  fanouts: PublicationFanoutRow[];
  publications: {
    contentJobs: PublicationJobRow[];
    publicationEvents: PublicationEventRow[];
    publications: PublicationRow[];
    vodAssets: PublicationVodAssetRow[];
  };
}> {
  if (!isSupabaseConfigured()) {
    return {
      channels: [],
      connections: [],
      fanoutTargets: [],
      fanouts: [],
      publications: {
        contentJobs: [],
        publicationEvents: [],
        publications: [],
        vodAssets: [],
      },
    };
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return {
      channels: [],
      connections: [],
      fanoutTargets: [],
      fanouts: [],
      publications: {
        contentJobs: [],
        publicationEvents: [],
        publications: [],
        vodAssets: [],
      },
    };
  }

  const creator = await ensureCreatorForUser(supabase, userData.user);
  const fanoutsResult = await supabase
    .from("content_publication_fanouts")
    .select("*")
    .eq("user_id", userData.user.id)
    .order("updated_at", { ascending: false })
    .limit(12);

  if (fanoutsResult.error) {
    return {
      channels: [],
      connections: [],
      fanoutTargets: [],
      fanouts: [],
      publications: {
        contentJobs: [],
        publicationEvents: [],
        publications: [],
        vodAssets: [],
      },
    };
  }

  const fanouts = (fanoutsResult.data ?? []) as PublicationFanoutRow[];
  const fanoutIds = fanouts.map((fanout) => fanout.id);

  if (fanoutIds.length === 0) {
    return {
      channels: [],
      connections: [],
      fanoutTargets: [],
      fanouts,
      publications: {
        contentJobs: [],
        publicationEvents: [],
        publications: [],
        vodAssets: [],
      },
    };
  }

  const fanoutTargetsResult = await supabase
    .from("content_publication_fanout_targets")
    .select("*")
    .eq("user_id", userData.user.id)
    .in("content_publication_fanout_id", fanoutIds)
    .order("created_at", { ascending: false })
    .limit(300);

  if (fanoutTargetsResult.error) {
    return {
      channels: [],
      connections: [],
      fanoutTargets: [],
      fanouts: [],
      publications: {
        contentJobs: [],
        publicationEvents: [],
        publications: [],
        vodAssets: [],
      },
    };
  }

  const fanoutTargets = (fanoutTargetsResult.data ??
    []) as PublicationFanoutTargetRow[];
  const publicationIds = [
    ...new Set(
      fanoutTargets
        .map((target) => target.content_publication_id)
        .filter((value): value is string => typeof value === "string"),
    ),
  ];

  const publicationsResult =
    publicationIds.length > 0
      ? await supabase
          .from("content_publications")
          .select("*")
          .eq("user_id", userData.user.id)
          .in("id", publicationIds)
          .order("updated_at", { ascending: false })
          .limit(200)
      : emptyResult<PublicationRow>();

  if (publicationsResult.error) {
    return {
      channels: [],
      connections: [],
      fanoutTargets: [],
      fanouts: [],
      publications: {
        contentJobs: [],
        publicationEvents: [],
        publications: [],
        vodAssets: [],
      },
    };
  }

  const publicationRows = (publicationsResult.data ?? []) as PublicationRow[];
  const contentJobIds = [
    ...new Set(
      publicationRows
        .map((publication) => publication.content_job_id)
        .filter((value): value is string => typeof value === "string"),
    ),
  ];
  const connectionIds = [
    ...new Set([
      ...publicationRows.map(
        (publication) => publication.platform_connection_id,
      ),
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
      fanoutTargets: [],
      fanouts: [],
      publications: {
        contentJobs: [],
        publicationEvents: [],
        publications: [],
        vodAssets: [],
      },
    };
  }

  const connections = (connectionsResult.data ??
    []) as PublicationConnectionRow[];
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
      fanoutTargets: [],
      fanouts: [],
      publications: {
        contentJobs: [],
        publicationEvents: [],
        publications: [],
        vodAssets: [],
      },
    };
  }

  const channelIds = [
    ...new Set(
      connections
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
      fanoutTargets: [],
      fanouts: [],
      publications: {
        contentJobs: [],
        publicationEvents: [],
        publications: [],
        vodAssets: [],
      },
    };
  }

  return {
    channels: (channelsResult.data ?? []) as PublicationChannelRow[],
    connections,
    fanoutTargets,
    fanouts,
    publications: {
      contentJobs: (contentJobsResult.data ?? []) as PublicationJobRow[],
      publicationEvents: (publicationEventsResult.data ??
        []) as PublicationEventRow[],
      publications: publicationRows,
      vodAssets: (vodAssetsResult.data ?? []) as PublicationVodAssetRow[],
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
