import { Activity, BadgeDollarSign, Clapperboard, Search } from "lucide-react";
import { StatCard } from "@streamos/ui";
import { dashboardStats, operatingPlan } from "@/data/dashboard";
import { PlatformOverview } from "@/components/modules/PlatformOverview";
import { RecentClips } from "@/components/modules/RecentClips";
import { TwitchAnalyticsSnapshotCard } from "@/components/modules/TwitchAnalyticsSnapshotCard";
import { ViewerChart } from "@/components/modules/ViewerChart";
import { GatewayConnectButton } from "./components/GatewayConnectButton";

const statIcons = [Search, BadgeDollarSign, Clapperboard, Activity];

type DashboardPageProps = {
  searchParams?: Promise<{
    error?: string;
    platform?: string;
    status?: string;
  }>;
};

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const params = await searchParams;

  return (
    <div className="space-y-6">
      {params?.platform === "twitch" && (
        <TwitchConnectionNotice error={params.error} status={params.status} />
      )}

      <header className="grid gap-6 rounded-lg border border-white/10 bg-surface-900/85 p-6 shadow-[0_22px_70px_rgba(0,0,0,0.42)] xl:grid-cols-[minmax(0,1.1fr)_360px]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-signal-green">
            Creator command center
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-normal text-white md:text-5xl">
            Aus deinem Stream wird ein kompletter Content- und Umsatz-Funnel.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-400">
            StreamOS buendelt Discoverability, Clip-Automatisierung,
            Monetarisierung, Branding, Multi-Plattform-Management und Analytics
            in einer operativen Creator-Oberflaeche.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="/dashboard/clips" className="btn-primary">
              VOD analysieren
            </a>
            <a href="/dashboard/analytics" className="btn-ghost">
              Analytics pruefen
            </a>
            <GatewayConnectButton />
          </div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
          <div className="grid min-h-52 place-items-center rounded-lg border border-white/10 bg-[linear-gradient(120deg,rgba(155,92,255,.24),rgba(0,212,170,.12)),repeating-linear-gradient(90deg,rgba(255,255,255,.06)_0_1px,transparent_1px_38px)]">
            <div className="h-0 w-0 border-y-[30px] border-l-[48px] border-y-transparent border-l-white/90 drop-shadow-[0_0_24px_rgba(155,92,255,.7)]" />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg border border-white/10 bg-surface-800 p-3">
              <strong className="block text-xl text-white">36</strong>
              <span className="text-xs text-slate-400">Clips</span>
            </div>
            <div className="rounded-lg border border-white/10 bg-surface-800 p-3">
              <strong className="block text-xl text-white">12</strong>
              <span className="text-xs text-slate-400">Posts</span>
            </div>
            <div className="rounded-lg border border-white/10 bg-surface-800 p-3">
              <strong className="block text-xl text-white">4</strong>
              <span className="text-xs text-slate-400">Sponsors</span>
            </div>
          </div>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {dashboardStats.map((stat, index) => (
          <StatCard
            key={stat.label}
            {...stat}
            icon={statIcons[index] ?? Search}
          />
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
        <ViewerChart />
        <PlatformOverview />
      </section>

      <TwitchAnalyticsSnapshotCard />

      <section className="card">
        <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
          AI Operating Plan
        </p>
        <h2 className="mt-2 text-lg font-semibold text-white">
          Naechste Schritte
        </h2>
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {operatingPlan.map((task) => (
            <li
              key={task}
              className="flex gap-3 rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-slate-300"
            >
              <span className="mt-1 h-2 w-2 rounded-full bg-signal-green shadow-[0_0_18px_rgba(0,212,170,.8)]" />
              {task}
            </li>
          ))}
        </ul>
      </section>

      <RecentClips />
    </div>
  );
}

function TwitchConnectionNotice({
  error,
  status,
}: {
  error?: string;
  status?: string;
}) {
  if (status === "connected" || status === "connected-synced") {
    return (
      <section className="rounded-lg border border-signal-green/30 bg-signal-green/10 p-4 text-sm text-signal-green">
        {status === "connected-synced"
          ? "Twitch wurde verbunden und der erste Analytics-Snapshot wurde gespeichert."
          : "Twitch wurde verbunden. StreamOS kann den Kanal jetzt fuer Analytics und Automatisierung nutzen."}
      </section>
    );
  }

  if (status === "connected-sync-pending") {
    return (
      <section className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-200">
        Twitch wurde verbunden. Der erste Analytics-Sync konnte noch nicht
        abgeschlossen werden; starte ihn im Dashboard erneut.
      </section>
    );
  }

  if (status === "refreshed") {
    return (
      <section className="rounded-lg border border-signal-green/30 bg-signal-green/10 p-4 text-sm text-signal-green">
        Twitch Token wurde erneuert. Die Verbindung ist wieder aktiv.
      </section>
    );
  }

  const message =
    error === "twitch-setup"
      ? "Twitch OAuth ist noch nicht vollstaendig konfiguriert. Setze TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, TWITCH_REDIRECT_URI und APP_ENCRYPTION_KEY."
      : error === "twitch-state"
        ? "Twitch OAuth wurde aus Sicherheitsgruenden abgebrochen. Starte die Verbindung erneut."
        : error === "twitch-refresh"
          ? "Twitch Token konnte nicht erneuert werden. Verbinde Twitch erneut, falls der Refresh Token abgelaufen oder widerrufen wurde."
          : "Twitch konnte nicht verbunden werden. Pruefe OAuth-App, Redirect URI und Twitch-Konfiguration.";

  return (
    <section className="rounded-lg border border-signal-red/30 bg-signal-red/10 p-4 text-sm text-signal-red">
      {message}
    </section>
  );
}
