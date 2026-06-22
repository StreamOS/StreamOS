import type { Tables } from "@streamos/database";
import {
  buildPublicationDashboardModel,
  type PublicationRow,
} from "@/components/modules/PublicationStatusConsole.utils";
import { PublicationStatusConsole } from "@/components/modules/PublicationStatusConsole";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ensureCreatorForUser } from "@/lib/supabase/creator";
import { createClient } from "@/lib/supabase/server";

type PublicationPageProps = {
  searchParams?: Promise<{
    publicationId?: string;
  }>;
};

type PublicationEventRow = Tables<"content_publication_events">;
type PublicationJobRow = Tables<"content_jobs">;
type PublicationConnectionRow = Tables<"platform_connections">;
type PublicationChannelRow = Tables<"channels">;
type PublicationVodAssetRow = Tables<"vod_assets">;

export const dynamic = "force-dynamic";

export default async function PublicationsPage({
  searchParams,
}: PublicationPageProps) {
  const params = await searchParams;
  const {
    channels,
    connections,
    contentJobs,
    publicationEvents,
    publications,
    vodAssets,
  } = await getPublicationDashboardData();

  const model = buildPublicationDashboardModel({
    channels,
    connections,
    contentJobs,
    initialSelectedPublicationId: params?.publicationId ?? null,
    publicationEvents,
    publications,
    vodAssets,
  });

  return <PublicationStatusConsole model={model} />;
}

async function getPublicationDashboardData(): Promise<{
  channels: PublicationChannelRow[];
  connections: PublicationConnectionRow[];
  contentJobs: PublicationJobRow[];
  publicationEvents: PublicationEventRow[];
  publications: PublicationRow[];
  vodAssets: PublicationVodAssetRow[];
}> {
  if (!isSupabaseConfigured()) {
    return {
      channels: [],
      connections: [],
      contentJobs: [],
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
    .limit(12);

  if (publicationsResult.error) {
    return {
      channels: [],
      connections: [],
      contentJobs: [],
      publicationEvents: [],
      publications: [],
      vodAssets: [],
    };
  }

  const publications = (publicationsResult.data ?? []) as PublicationRow[];
  const publicationIds = publications.map((publication) => publication.id);
  const contentJobIds = [
    ...new Set(publications.map((publication) => publication.content_job_id)),
  ];
  const connectionIds = [
    ...new Set(
      publications.map((publication) => publication.platform_connection_id),
    ),
  ];

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
            .limit(150)
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
      publicationEvents: [],
      publications: [],
      vodAssets: [],
    };
  }

  const connections = (connectionsResult.data ??
    []) as PublicationConnectionRow[];
  const contentJobs = (contentJobsResult.data ?? []) as PublicationJobRow[];
  const streamIds = [
    ...new Set(
      contentJobs
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
      publicationEvents: [],
      publications: [],
      vodAssets: [],
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
      contentJobs: [],
      publicationEvents: [],
      publications: [],
      vodAssets: [],
    };
  }

  return {
    channels: (channelsResult.data ?? []) as PublicationChannelRow[],
    connections,
    contentJobs,
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
