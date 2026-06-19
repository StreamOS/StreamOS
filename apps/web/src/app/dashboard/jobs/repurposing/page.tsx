import type { Tables } from "@streamos/database";
import { ClipboardList } from "lucide-react";
import { RepurposingReviewConsole } from "@/components/modules/RepurposingReviewConsole";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

type ContentJobRow = Tables<"content_jobs">;

export default async function RepurposingJobsPage() {
  const { jobs } = await getRepurposingJobs();

  return (
    <div className="space-y-6">
      <header className="grid gap-6 rounded-lg border border-white/10 bg-surface-900/85 p-6 shadow-[0_22px_70px_rgba(0,0,0,0.42)] xl:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-signal-green">
            Repurposing Review
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-normal text-white md:text-5xl">
            Manual-review-only briefs fuer Video Repurposing.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-400">
            Diese Ansicht zeigt nur bestehende `content_jobs`-Daten fuer den
            Repurposing-Flow. Es gibt hier keine Publishing-, Export- oder
            Rendering-Aktion.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="/dashboard/jobs" className="btn-primary">
              All Jobs
            </a>
            <a href="/dashboard/content" className="btn-ghost">
              Content Overview
            </a>
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
          <div className="grid min-h-52 place-items-center rounded-lg border border-white/10 bg-[linear-gradient(120deg,rgba(0,212,170,.22),rgba(155,92,255,.18)),repeating-linear-gradient(90deg,rgba(255,255,255,.06)_0_1px,transparent_1px_38px)]">
            <ClipboardList className="h-14 w-14 text-white/90 drop-shadow-[0_0_24px_rgba(0,212,170,.4)]" />
          </div>
          <div className="mt-3 rounded-lg border border-white/10 bg-surface-800 p-4 text-sm leading-6 text-slate-300">
            Review cards stay read-only. Use the existing Jobs view for retry
            orchestration; use this view to inspect the proposal bundle.
          </div>
        </div>
      </header>

      <RepurposingReviewConsole initialJobs={jobs} />
    </div>
  );
}

async function getRepurposingJobs(): Promise<{
  jobs: ContentJobRow[];
}> {
  if (!isSupabaseConfigured()) {
    return { jobs: [] };
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return { jobs: [] };
  }

  const { data, error } = await supabase
    .from("content_jobs")
    .select("*")
    .eq("user_id", userData.user.id)
    .eq("job_type", "repurposing")
    .eq("type", "repurposing")
    .in("status", [
      "pending",
      "running",
      "failed",
      "done",
      "processing",
      "completed",
      "cancelled",
    ])
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    return { jobs: [] };
  }

  return { jobs: data ?? [] };
}
