import {
  buildPublicationScheduleDashboardModel,
  type PublicationScheduleFilterStatus,
  type PublicationChannelRow,
  type PublicationConnectionRow,
  type PublicationFanoutRow,
  type PublicationFanoutTargetRow,
  type PublicationJobRow,
  type PublicationSchedulePeriod,
  type PublicationScheduleProvider,
  type PublicationScheduleType,
  type PublicationRow,
} from "@/components/modules/PublicationScheduleConsole.utils";
import { PublicationScheduleConsole } from "@/components/modules/PublicationScheduleConsole";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ensureCreatorForUser } from "@/lib/supabase/creator";
import { createClient } from "@/lib/supabase/server";

type PublicationSchedulePageProps = {
  searchParams?: Promise<{
    period?: string;
    provider?: string;
    scheduleItemId?: string;
    status?: string;
    type?: string;
  }>;
};

export const dynamic = "force-dynamic";

const SCHEDULE_PERIOD_VALUES = [
  "upcoming",
  "recent_7d",
  "recent_30d",
  "all",
] as const;

const SCHEDULE_PROVIDER_VALUES = [
  "all",
  "twitch",
  "youtube",
  "tiktok",
  "kick",
] as const;

const SCHEDULE_STATUS_VALUES = [
  "all",
  "scheduled",
  "schedule_ready",
  "schedule_blocked",
  "schedule_expired",
  "schedule_canceled",
  "schedule_replaced",
  "schedule_unknown",
] as const;

const SCHEDULE_TYPE_VALUES = ["all", "publication", "fanout"] as const;

export default async function PublicationSchedulePage({
  searchParams,
}: PublicationSchedulePageProps) {
  const params = await searchParams;
  const {
    channels,
    connections,
    contentJobs,
    fanoutTargets,
    fanouts,
    publications,
  } = await getPublicationScheduleData();

  const model = buildPublicationScheduleDashboardModel({
    channels,
    connections,
    contentJobs,
    fanoutTargets,
    fanouts,
    initialFilters: {
      period: toFilterValue<PublicationSchedulePeriod>(
        params?.period,
        SCHEDULE_PERIOD_VALUES,
      ),
      provider: toFilterValue<PublicationScheduleProvider>(
        params?.provider,
        SCHEDULE_PROVIDER_VALUES,
      ),
      status: toFilterValue<PublicationScheduleFilterStatus>(
        params?.status,
        SCHEDULE_STATUS_VALUES,
      ),
      type: toFilterValue<PublicationScheduleType>(
        params?.type,
        SCHEDULE_TYPE_VALUES,
      ),
    },
    initialSelectedItemId: params?.scheduleItemId ?? null,
    publications,
  });

  return <PublicationScheduleConsole model={model} />;
}

async function getPublicationScheduleData(): Promise<{
  channels: PublicationChannelRow[];
  connections: PublicationConnectionRow[];
  contentJobs: PublicationJobRow[];
  fanoutTargets: PublicationFanoutTargetRow[];
  fanouts: PublicationFanoutRow[];
  publications: PublicationRow[];
}> {
  if (!isSupabaseConfigured()) {
    return emptyScheduleData();
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return emptyScheduleData();
  }

  const creator = await ensureCreatorForUser(supabase, userData.user);

  const [publicationsResult, fanoutsResult] = await Promise.all([
    supabase
      .from("content_publications")
      .select("*")
      .eq("user_id", userData.user.id)
      .neq("schedule_status", "not_scheduled")
      .order("updated_at", { ascending: false })
      .limit(32),
    supabase
      .from("content_publication_fanouts")
      .select("*")
      .eq("user_id", userData.user.id)
      .neq("schedule_status", "not_scheduled")
      .order("updated_at", { ascending: false })
      .limit(32),
  ]);

  if (publicationsResult.error || fanoutsResult.error) {
    return emptyScheduleData();
  }

  const publications = (publicationsResult.data ?? []) as PublicationRow[];
  const fanouts = (fanoutsResult.data ?? []) as PublicationFanoutRow[];
  const contentJobIds = [
    ...new Set(
      [...publications, ...fanouts]
        .map((row) => row.content_job_id)
        .filter((value): value is string => typeof value === "string"),
    ),
  ];
  const fanoutIds = fanouts.map((fanout) => fanout.id);

  const [contentJobsResult, fanoutTargetsResult] = await Promise.all([
    contentJobIds.length > 0
      ? supabase
          .from("content_jobs")
          .select("*")
          .eq("user_id", userData.user.id)
          .in("id", contentJobIds)
      : emptyResult<PublicationJobRow>(),
    fanoutIds.length > 0
      ? supabase
          .from("content_publication_fanout_targets")
          .select("*")
          .eq("user_id", userData.user.id)
          .in("content_publication_fanout_id", fanoutIds)
      : emptyResult<PublicationFanoutTargetRow>(),
  ]);

  if (contentJobsResult.error || fanoutTargetsResult.error) {
    return emptyScheduleData();
  }

  const contentJobs = (contentJobsResult.data ?? []) as PublicationJobRow[];
  const fanoutTargets = (fanoutTargetsResult.data ??
    []) as PublicationFanoutTargetRow[];
  const connectionIds = [
    ...new Set(
      [
        ...publications.map(
          (publication) => publication.platform_connection_id,
        ),
        ...fanoutTargets.map((target) => target.platform_connection_id),
      ].filter((value): value is string => typeof value === "string"),
    ),
  ];

  const connectionsResult =
    connectionIds.length > 0
      ? await supabase
          .from("platform_connections")
          .select("*")
          .eq("user_id", userData.user.id)
          .eq("creator_id", creator.id)
          .in("id", connectionIds)
      : emptyResult<PublicationConnectionRow>();

  if (connectionsResult.error) {
    return emptyScheduleData();
  }

  const connections = (connectionsResult.data ??
    []) as PublicationConnectionRow[];
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
    return emptyScheduleData();
  }

  return {
    channels: (channelsResult.data ?? []) as PublicationChannelRow[],
    connections,
    contentJobs,
    fanoutTargets,
    fanouts,
    publications,
  };
}

function emptyScheduleData(): {
  channels: PublicationChannelRow[];
  connections: PublicationConnectionRow[];
  contentJobs: PublicationJobRow[];
  fanoutTargets: PublicationFanoutTargetRow[];
  fanouts: PublicationFanoutRow[];
  publications: PublicationRow[];
} {
  return {
    channels: [],
    connections: [],
    contentJobs: [],
    fanoutTargets: [],
    fanouts: [],
    publications: [],
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

function toFilterValue<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
): T | null {
  if (!value) {
    return null;
  }

  return allowed.includes(value as T) ? (value as T) : null;
}
