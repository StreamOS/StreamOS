import { type ReactNode } from "react";
import { syncTwitchAnalyticsAction } from "@/app/dashboard/actions";
import { ViewerChart } from "@/components/modules/ViewerChart";
import { getAnalyticsSurfaceData } from "@/lib/dashboard/insights";

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
  const { platformComparison, viewerTrend } = await getAnalyticsSurfaceData();

  return (
    <div className="space-y-6">
      {params?.platform === "twitch" && (
        <TwitchSyncNotice error={params.error} status={params.status} />
      )}

      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-signal-green">
            StreamIQ-Analysen
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-white">
            Performance, Reichweite und Plattform-Fit
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            Die Plattformkarten unten zeigen die letzten Live-Signale aus den
            Snapshots. Twitch bleibt direkt synchronisierbar, waehrend YouTube,
            TikTok und Kick aus demselben Datenmodell mitlaufen.
          </p>
        </div>
        <form action={syncTwitchAnalyticsAction}>
          <button className="btn-primary" type="submit">
            Twitch synchronisieren
          </button>
        </form>
      </header>

      <ViewerChart data={viewerTrend} />

      <section className="card">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
              Plattform-Vergleich
            </p>
            <h2 className="mt-1 text-lg font-semibold text-white">
              Live-Signale nach Kanal
            </h2>
          </div>
          <p className="text-sm text-slate-400">
            Viewer, Follower-Wachstum, Engagement und Trend aus
            `metrics_snapshots`.
          </p>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {platformComparison.map((platform) => (
            <article
              className="rounded-lg border border-white/10 bg-white/5 p-4"
              key={platform.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">
                    {platform.title}
                  </p>
                  <span className="mt-1 inline-flex rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-slate-300">
                    {platform.status}
                  </span>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <MetricRow
                  label="Live-Zuschauer"
                  value={platform.liveViewersLabel}
                />
                <MetricRow label="Follower" value={platform.followersLabel} />
                <MetricRow
                  label="Viewer-Trend"
                  value={platform.viewerGrowthLabel}
                />
                <MetricRow
                  label="Follower-Trend"
                  value={platform.followerGrowthLabel}
                />
                <MetricRow
                  label="Engagement"
                  value={platform.engagementLabel}
                />
              </div>

              <p className="mt-4 text-sm leading-6 text-slate-400">
                {platform.note}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-slate-400">{label}</span>
      <span className="font-semibold text-white">{value}</span>
    </div>
  );
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
        Twitch-Analytics wurden synchronisiert.
      </section>
    );
  }

  if (error === "twitch-sync") {
    return (
      <section className="rounded-lg border border-signal-red/30 bg-signal-red/10 p-4 text-sm text-signal-red">
        Twitch-Analytics konnten nicht synchronisiert werden. Pruefe die
        Verbindung oder erneuere den Token.
      </section>
    );
  }

  return null;
}
