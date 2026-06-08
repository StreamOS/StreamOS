import type { Tables } from "@streamos/database";
import { syncTwitchAnalyticsAction } from "@/app/dashboard/actions";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ensureCreatorForUser } from "@/lib/supabase/creator";
import { createClient } from "@/lib/supabase/server";

type TwitchDashboardSnapshot = Pick<
  Tables<"metrics_snapshots">,
  "captured_at" | "follower_count" | "viewer_count"
> & {
  channels: Pick<Tables<"channels">, "display_name"> | null;
};

export async function TwitchAnalyticsSnapshotCard() {
  const snapshot = await getLatestTwitchSnapshot();

  return (
    <section className="card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-signal-green">
            Twitch Analytics
          </p>
          <h2 className="mt-2 text-lg font-semibold text-white">
            {snapshot?.channels?.display_name ?? "Noch kein Snapshot"}
          </h2>
        </div>
        <form action={syncTwitchAnalyticsAction}>
          <button className="btn-primary px-3 py-1.5 text-xs" type="submit">
            Sync
          </button>
        </form>
      </div>

      {snapshot ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Metric
            label="Live viewers"
            value={formatNumber(snapshot.viewer_count)}
          />
          <Metric
            label="Followers"
            value={formatNumber(snapshot.follower_count)}
          />
          <Metric label="Last sync" value={formatDate(snapshot.captured_at)} />
        </div>
      ) : (
        <p className="mt-5 text-sm leading-6 text-slate-400">
          Verbinde Twitch, damit StreamOS den ersten Analytics-Snapshot in
          `metrics_snapshots` schreibt und hier anzeigt.
        </p>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <span className="block text-xs uppercase tracking-[0.08em] text-slate-500">
        {label}
      </span>
      <strong className="mt-2 block text-xl text-white">{value}</strong>
    </div>
  );
}

async function getLatestTwitchSnapshot(): Promise<TwitchDashboardSnapshot | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return null;
  }

  const creator = await ensureCreatorForUser(supabase, data.user);
  const result = await supabase
    .from("metrics_snapshots")
    .select("captured_at, follower_count, viewer_count, channels(display_name)")
    .eq("user_id", data.user.id)
    .eq("creator_id", creator.id)
    .eq("platform", "twitch")
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error || !result.data) {
    return null;
  }

  return result.data as TwitchDashboardSnapshot;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en", {
    compactDisplay: "short",
    notation: "compact",
  }).format(value);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("de", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  }).format(new Date(value));
}
