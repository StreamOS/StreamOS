import { Cable, Globe, KeyRound, RadioTower } from "lucide-react";
import { refreshTwitchConnectionAction } from "@/app/dashboard/actions";
import { platforms } from "@/data/dashboard";
import type { PlatformSummary } from "@/data/dashboard";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ensureCreatorForUser } from "@/lib/supabase/creator";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@streamos/database";

export default async function PlatformsPage() {
  const platformSummaries = await getPlatformSummaries();
  const connectedCount = platformSummaries.filter(
    (platform) => platform.status === "Connected",
  ).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-signal-green">
            Platforms
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-white">
            Twitch, YouTube, TikTok und Kick verwalten
          </h1>
        </div>
        <a className="btn-primary" href="/api/platforms/twitch/connect">
          Twitch verbinden
        </a>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <PlatformStat
          icon={Globe}
          label="Supported Platforms"
          value={String(platformSummaries.length)}
        />
        <PlatformStat
          icon={RadioTower}
          label="Connected"
          value={String(connectedCount)}
        />
        <PlatformStat icon={KeyRound} label="OAuth Scope" value="Server-side" />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {platformSummaries.map((platform) => (
          <article className="card" key={platform.id}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-slate-400">{platform.name}</p>
                <h2 className="mt-3 text-2xl font-semibold text-white">
                  {platform.followers}
                </h2>
              </div>
              <span className={statusClassName(platform.status)}>
                {platform.status}
              </span>
            </div>
            <p className="mt-4 text-sm text-slate-400">{platform.reach}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {platform.actionHref && platform.actionLabel && (
                <a
                  className="btn-primary px-3 py-1.5 text-xs"
                  href={platform.actionHref}
                >
                  {platform.actionLabel}
                </a>
              )}
              {platform.canRefresh && (
                <form action={refreshTwitchConnectionAction}>
                  <button
                    className="btn-ghost px-3 py-1.5 text-xs"
                    type="submit"
                  >
                    Token erneuern
                  </button>
                </form>
              )}
            </div>
          </article>
        ))}
      </section>

      <section className="card">
        <div className="flex items-center gap-3">
          <span className="rounded-lg border border-signal-blue/20 bg-signal-blue/10 p-2 text-signal-blue">
            <Cable className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
              Integration Boundary
            </p>
            <h2 className="mt-1 text-lg font-semibold text-white">
              OAuth bleibt serverseitig
            </h2>
          </div>
        </div>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-400">
          Plattform-Verbindungen laufen ueber API-Gateway oder Server Actions.
          Browser-Komponenten erhalten keine Provider-Secrets und keine
          Service-Role-Zugriffe.
        </p>
      </section>
    </div>
  );
}

function PlatformStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Globe;
  label: string;
  value: string;
}) {
  return (
    <article className="card">
      <span className="inline-flex rounded-lg border border-brand-500/20 bg-brand-500/10 p-2 text-brand-500">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <p className="mt-4 text-sm text-slate-400">{label}</p>
      <strong className="mt-2 block text-3xl text-white">{value}</strong>
    </article>
  );
}

function statusClassName(status: PlatformSummary["status"]): string {
  if (status === "Connected") {
    return "rounded-full border border-signal-green/30 bg-signal-green/10 px-2.5 py-1 text-xs font-semibold text-signal-green";
  }

  if (status === "Expired" || status === "Setup required") {
    return "rounded-full border border-signal-red/30 bg-signal-red/10 px-2.5 py-1 text-xs font-semibold text-signal-red";
  }

  return "rounded-full border border-signal-gold/30 bg-signal-gold/10 px-2.5 py-1 text-xs font-semibold text-signal-gold";
}

async function getPlatformSummaries(): Promise<PlatformSummary[]> {
  if (!isSupabaseConfigured()) {
    return platforms;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return platforms;
  }

  const creator = await ensureCreatorForUser(supabase, data.user);
  const [connectionsResult, channelsResult] = await Promise.all([
    supabase
      .from("platform_connections")
      .select("platform, status, channel_id, expires_at")
      .eq("user_id", data.user.id)
      .eq("creator_id", creator.id),
    supabase
      .from("channels")
      .select("id, platform, display_name, follower_count, connected_at")
      .eq("user_id", data.user.id)
      .eq("creator_id", creator.id),
  ]);

  if (connectionsResult.error || channelsResult.error) {
    return platforms;
  }

  type ChannelSummary = Pick<
    Tables<"channels">,
    "display_name" | "follower_count" | "id"
  >;
  type ConnectionSummary = Pick<
    Tables<"platform_connections">,
    "channel_id" | "expires_at" | "platform" | "status"
  >;
  const channels = (channelsResult.data ?? []) as ChannelSummary[];
  const connections = (connectionsResult.data ?? []) as ConnectionSummary[];
  const channelsById = new Map(
    channels.map((channel) => [channel.id, channel]),
  );

  return platforms.map((platform) => {
    const connection = connections.find(
      (item) => item.platform === platform.id,
    );

    if (!connection) {
      return platform;
    }

    const channel = connection.channel_id
      ? channelsById.get(connection.channel_id)
      : undefined;
    const isConnected = connection.status === "connected";
    const expiresAt = connection.expires_at
      ? new Date(connection.expires_at).getTime()
      : null;
    const isExpired =
      connection.status === "expired" ||
      (expiresAt !== null && expiresAt <= Date.now());

    return {
      ...platform,
      actionHref: isConnected && !isExpired ? undefined : platform.actionHref,
      actionLabel: isConnected && !isExpired ? undefined : "Neu verbinden",
      canRefresh: platform.id === "twitch",
      followers: channel
        ? `${formatFollowers(channel.follower_count)} followers`
        : "Kanal verbunden",
      reach: isExpired
        ? "Token abgelaufen"
        : (channel?.display_name ?? "OAuth aktiv"),
      status: isExpired
        ? "Expired"
        : isConnected
          ? "Connected"
          : "OAuth pending",
    };
  });
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
