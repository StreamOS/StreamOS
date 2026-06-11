import {
  ArrowUpRight,
  Clapperboard,
  FileVideo,
  ListChecks,
} from "lucide-react";
import { ContentJobProgress } from "@/components/modules/ContentJobProgress";
import { RecentClips } from "@/components/modules/RecentClips";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@streamos/database";

type ContentJobRow = Tables<"content_jobs">;

const pipelineStages = [
  {
    title: "Import",
    description: "VODs, Streams und Rohclips fuer KI-Verarbeitung sammeln.",
    metric: "3 Quellen",
  },
  {
    title: "Analysieren",
    description: "Transkription, Highlight-Erkennung und Hook-Bewertung.",
    metric: "KI-bereit",
  },
  {
    title: "Wiederverwertung",
    description: "Shorts, TikToks und YouTube-Clips in Varianten planen.",
    metric: "12 in Warteschlange",
  },
] as const;

export default async function ContentPage() {
  const { jobs, userId } = await getContentJobs();

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-signal-green">
            Content-Automatisierung
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-white">
            Clip-Pipeline, Repurposing und KI-Jobs
          </h1>
        </div>
        <a className="btn-primary" href="/dashboard/clips">
          Clip Analyse starten
        </a>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        {pipelineStages.map((stage) => (
          <article className="card" key={stage.title}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-400">
                  {stage.title}
                </p>
                <h2 className="mt-3 text-2xl font-semibold text-white">
                  {stage.metric}
                </h2>
              </div>
              <span className="rounded-lg border border-brand-500/20 bg-brand-500/10 p-2 text-brand-500">
                <Clapperboard className="h-4 w-4" aria-hidden="true" />
              </span>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-400">
              {stage.description}
            </p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_360px]">
        <ContentJobProgress initialJobs={jobs} userId={userId} />
        <aside className="card">
          <div className="flex items-center gap-3">
            <span className="rounded-lg border border-signal-green/20 bg-signal-green/10 p-2 text-signal-green">
              <ListChecks className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
                Operations-Queue
              </p>
              <h2 className="mt-1 text-lg font-semibold text-white">
                Naechste Aktionen
              </h2>
            </div>
          </div>
          <ul className="mt-5 space-y-3 text-sm text-slate-300">
            <li className="rounded-lg border border-white/10 bg-white/5 p-3">
              Twitch-VODs fuer Transkription markieren.
            </li>
            <li className="rounded-lg border border-white/10 bg-white/5 p-3">
              Fertige Clips in Plattform-Varianten schneiden.
            </li>
            <li className="rounded-lg border border-white/10 bg-white/5 p-3">
              Sponsor-kompatible Highlights priorisieren.
            </li>
          </ul>
        </aside>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <RecentClips />
        <article className="card">
          <div className="flex items-center gap-3">
            <span className="rounded-lg border border-signal-blue/20 bg-signal-blue/10 p-2 text-signal-blue">
              <FileVideo className="h-4 w-4" aria-hidden="true" />
            </span>
            <h2 className="text-lg font-semibold text-white">
              Wiederverwertungs-Briefing
            </h2>
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-400">
            StreamOS priorisiert Clips mit starker Hook, hoher Chat-Velocity und
            klarer Plattform-Eignung fuer Shorts, TikTok und Reels.
          </p>
          <a
            className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-signal-green"
            href="/dashboard/jobs"
          >
            Job-Liste ansehen
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </article>
      </section>
    </div>
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
