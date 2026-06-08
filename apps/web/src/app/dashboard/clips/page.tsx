import type { Tables } from "@streamos/database";
import { startClipAnalysisAction } from "./actions";
import { ContentJobProgress } from "@/components/modules/ContentJobProgress";
import { RecentClips } from "@/components/modules/RecentClips";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

type ContentJobRow = Tables<"content_jobs">;

type ClipsPageProps = {
  searchParams?: Promise<{
    error?: string;
    status?: string;
  }>;
};

export default async function ClipsPage({ searchParams }: ClipsPageProps) {
  const params = await searchParams;
  const { jobs, userId } = await getContentJobs();

  return (
    <div className="space-y-6">
      <ClipAnalysisNotice error={params?.error} status={params?.status} />

      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-signal-green">
            AI Clip Engine
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-white">
            VODs analysieren und Shortform-Pipeline steuern
          </h1>
        </div>
        <button className="btn-primary" form="clip-analysis-form" type="submit">
          Clip Analyse starten
        </button>
      </header>

      <form
        action={startClipAnalysisAction}
        className="card"
        id="clip-analysis-form"
      >
        <div className="grid gap-4 md:grid-cols-4">
          <label className="grid gap-2 text-sm font-semibold text-slate-300">
            VOD URL
            <input
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-signal-green"
              name="vodUrl"
              placeholder="https://www.twitch.tv/videos/..."
              required
              type="url"
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-300">
            Plattform
            <select
              className="rounded-lg border border-white/10 bg-surface-900 px-3 py-2 text-white outline-none focus:border-signal-green"
              defaultValue="twitch"
              name="sourcePlatform"
            >
              <option value="twitch">Twitch</option>
              <option value="youtube">YouTube</option>
              <option value="tiktok">TikTok</option>
              <option value="kick">Kick</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-300">
            Kategorie
            <input
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-signal-green"
              maxLength={80}
              name="category"
              placeholder="Valorant, Just Chatting, Minecraft"
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-300">
            Chat Aktivitaet
            <select
              className="rounded-lg border border-white/10 bg-surface-900 px-3 py-2 text-white outline-none focus:border-signal-green"
              defaultValue="medium"
              name="chatActivity"
            >
              <option value="high">hoch</option>
              <option value="medium">mittel</option>
              <option value="low">niedrig</option>
            </select>
          </label>
        </div>
        <label className="mt-4 grid gap-2 text-sm font-semibold text-slate-300">
          Transcript oder Highlight-Kontext
          <textarea
            className="min-h-36 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-signal-green"
            maxLength={60000}
            name="transcript"
            placeholder="Paste den VOD-Transcript oder den relevanten Highlight-Abschnitt fuer die Clip-Analyse."
            required
          />
        </label>
      </form>

      <ContentJobProgress initialJobs={jobs} userId={userId} />

      <RecentClips />
    </div>
  );
}

function ClipAnalysisNotice({
  error,
  status,
}: {
  error?: string;
  status?: string;
}) {
  if (status === "clip-queued") {
    return (
      <section className="rounded-lg border border-signal-green/30 bg-signal-green/10 p-4 text-sm text-signal-green">
        Clip-Analyse wurde gestartet. Der Job erscheint in der Content Pipeline.
      </section>
    );
  }

  if (!error) {
    return null;
  }

  const messages: Record<string, string> = {
    "api-gateway-not-configured":
      "API_GATEWAY_URL ist nicht gesetzt. Ohne API-Gateway kann StreamOS keine Clip-Jobs queuen.",
    "clip-queue-failed":
      "Clip-Analyse konnte nicht in die Queue geschrieben werden. Pruefe API-Gateway und Redis.",
    "invalid-vod-url":
      "Die VOD URL ist ungueltig. Nutze eine erreichbare HTTP- oder HTTPS-URL.",
    "no-channel":
      "Verbinde zuerst einen Kanal, damit StreamOS den VOD einem Workspace-Channel zuordnen kann.",
    "supabase-not-configured":
      "Supabase ist noch nicht konfiguriert. Setze die Supabase Env Vars, bevor Clip-Jobs gestartet werden.",
  };

  return (
    <section className="rounded-lg border border-signal-red/30 bg-signal-red/10 p-4 text-sm text-signal-red">
      {messages[error] ?? "Clip-Analyse konnte nicht gestartet werden."}
    </section>
  );
}

async function getContentJobs(): Promise<{
  jobs: ContentJobRow[];
  userId: string | null;
}> {
  if (!isSupabaseConfigured()) {
    return { jobs: [], userId: null };
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return { jobs: [], userId: null };
  }

  const { data, error } = await supabase
    .from("content_jobs")
    .select("*")
    .eq("user_id", userData.user.id)
    .order("updated_at", { ascending: false })
    .limit(10);

  if (error) {
    return { jobs: [], userId: userData.user.id };
  }

  return { jobs: data ?? [], userId: userData.user.id };
}
