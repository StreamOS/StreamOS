import type { Tables } from "@streamos/database";
import { refreshTwitchConnectionAction } from "@/app/dashboard/actions";
import { platforms } from "@/data/dashboard";
import type { PlatformSummary } from "@/data/dashboard";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ensureCreatorForUser } from "@/lib/supabase/creator";
import { createClient } from "@/lib/supabase/server";

export async function PlatformOverview() {
  const platformSummaries = await getPlatformSummaries();

  return (
    <section className="card">
      <h2 className="text-base font-semibold text-white">Platform overview</h2>
      <div className="mt-4 space-y-3">
        {platformSummaries.map((platform) => (
          <div
            key={platform.name}
            className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/5 p-3"
          >
            <div>
              <div className="font-medium text-white">{platform.name}</div>
              <div className="text-sm text-slate-400">
                {platform.followers} / {platform.reach}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-slate-300">
                {platform.status}
              </span>
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
          </div>
        ))}
      </div>
    </section>
  );
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
    const canRefresh = platform.id === "twitch";

    return {
      ...platform,
      actionHref: isConnected && !isExpired ? undefined : platform.actionHref,
      actionLabel: isConnected && !isExpired ? undefined : "Neu verbinden",
      canRefresh,
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
