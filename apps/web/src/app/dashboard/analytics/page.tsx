import type { Tables } from "@streamos/database";
import { syncTwitchAnalyticsAction } from "@/app/dashboard/actions";
import { ViewerChart } from "@/components/modules/ViewerChart";
import { platforms } from "@/data/dashboard";
import type { PlatformSummary } from "@/data/dashboard";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ensureCreatorForUser } from "@/lib/supabase/creator";
import { createClient } from "@/lib/supabase/server";

type AnalyticsPageProps = {
  searchParams?: Promise<{
    error?: string;
    platform?: string;
    status?: string;
  }>;
};

export default async function AnalyticsPage({
  searchParams,
}: AnalyticsPageProps) {
  const params = await searchParams;
  const analyticsPlatforms = await getAnalyticsPlatforms();

  return (
    <div className="space-y-6">
      {params?.platform === "twitch" && (
        <TwitchSyncNotice error={params.error} status={params.status} />
      )}

      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-signal-green">
            StreamIQ Analytics
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-white">
            Performance, Reichweite und Plattform-Fit
          </h1>
        </div>
        <form action={syncTwitchAnalyticsAction}>
          <button className="btn-primary" type="submit">
            Twitch syncen
          </button>
        </form>
      </header>

      <ViewerChart />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {analyticsPlatforms.map((platform) => (
          <article className="card" key={platform.id}>
            <p className="text-sm text-slate-400">{platform.name}</p>
            <strong className="mt-3 block text-3xl text-white">
              {platform.reach}
            </strong>
            <span className="mt-1 block text-sm text-slate-400">
              {platform.followers} followers
            </span>
          </article>
        ))}
      </section>
    </div>
  );
}

async function getAnalyticsPlatforms(): Promise<PlatformSummary[]> {
  if (!isSupabaseConfigured()) {
    return platforms;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return platforms;
  }

  const creator = await ensureCreatorForUser(supabase, data.user);
  const metricsResult = await supabase
    .from("metrics_snapshots")
    .select("platform, viewer_count, follower_count, captured_at")
    .eq("user_id", data.user.id)
    .eq("creator_id", creator.id)
    .eq("platform", "twitch")
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (metricsResult.error || !metricsResult.data) {
    return platforms;
  }

  const twitchMetrics = metricsResult.data as Pick<
    Tables<"metrics_snapshots">,
    "captured_at" | "follower_count" | "platform" | "viewer_count"
  >;

  return platforms.map((platform) => {
    if (platform.id !== "twitch") {
      return platform;
    }

    return {
      ...platform,
      followers: formatFollowers(twitchMetrics.follower_count),
      reach: `${formatFollowers(twitchMetrics.viewer_count)} live`,
      status: "Connected",
    };
  });
}

function TwitchSyncNotice({
  error,
  status,
}: {
  error?: string;
  status?: string;
}) {
  if (status === "synced") {
    return (
      <section className="rounded-lg border border-signal-green/30 bg-signal-green/10 p-4 text-sm text-signal-green">
        Twitch Analytics wurden synchronisiert.
      </section>
    );
  }

  if (error === "twitch-sync") {
    return (
      <section className="rounded-lg border border-signal-red/30 bg-signal-red/10 p-4 text-sm text-signal-red">
        Twitch Analytics konnten nicht synchronisiert werden. Pruefe die
        Verbindung oder erneuere den Token.
      </section>
    );
  }

  return null;
}

function formatFollowers(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}m`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }

  return String(value);
}
