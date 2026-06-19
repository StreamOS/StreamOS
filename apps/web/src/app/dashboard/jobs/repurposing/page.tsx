import type { Tables } from "@streamos/database";
import { ClipboardList } from "lucide-react";

import { submitRepurposingReviewAction } from "./actions";
import { RepurposingReviewConsole } from "@/components/modules/RepurposingReviewConsole";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

type ContentJobRow = Tables<"content_jobs">;
type ReviewEventRow = Tables<"content_job_review_events">;

type RepurposingJobsPageProps = {
  searchParams?: Promise<{
    error?: string;
    jobId?: string;
    status?: string;
  }>;
};

export default async function RepurposingJobsPage({
  searchParams,
}: RepurposingJobsPageProps) {
  const params = await searchParams;
  const { auditEvents, jobs } = await getRepurposingJobs();

  return (
    <div className="space-y-6">
      <RepurposingJobsNotice error={params?.error} status={params?.status} />

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

      <RepurposingReviewConsole
        initialAuditEvents={auditEvents}
        initialJobs={jobs}
        initialSelectedJobId={params?.jobId ?? null}
        reviewAction={submitRepurposingReviewAction}
      />
    </div>
  );
}

async function getRepurposingJobs(): Promise<{
  auditEvents: ReviewEventRow[];
  jobs: ContentJobRow[];
}> {
  if (!isSupabaseConfigured()) {
    return { auditEvents: [], jobs: [] };
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return { auditEvents: [], jobs: [] };
  }

  const [jobsResult, auditEventsResult] = await Promise.all([
    supabase
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
      .limit(100),
    supabase
      .from("content_job_review_events")
      .select("*")
      .eq("user_id", userData.user.id)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  if (jobsResult.error || auditEventsResult.error) {
    return { auditEvents: [], jobs: [] };
  }

  return {
    auditEvents: auditEventsResult.data ?? [],
    jobs: jobsResult.data ?? [],
  };
}

function RepurposingJobsNotice({
  error,
  status,
}: {
  error?: string;
  status?: string;
}) {
  if (status === "review-saved") {
    return (
      <section className="rounded-lg border border-signal-green/30 bg-signal-green/10 p-4 text-sm text-signal-green">
        Review wurde gespeichert. Der Audit-Trail wurde serverseitig
        aktualisiert.
      </section>
    );
  }

  if (!error) {
    return null;
  }

  const messages: Record<string, string> = {
    "invalid-review-payload":
      "Die Review-Daten konnten nicht eindeutig gelesen werden.",
    "invalid-review-status":
      "Nur Approve, Reject und Needs changes sind gültige Review-Entscheidungen.",
    "review-job-not-found":
      "Der Repurposing-Job wurde nicht gefunden oder gehört nicht zu deinem Workspace.",
    "review-update-failed":
      "Die Review-Entscheidung konnte nicht gespeichert werden.",
    "supabase-not-configured":
      "Supabase ist noch nicht konfiguriert. Setze die benötigten Env Vars, bevor Reviews gespeichert werden.",
  };

  return (
    <section className="rounded-lg border border-signal-red/30 bg-signal-red/10 p-4 text-sm text-signal-red">
      {messages[error] ?? "Review konnte nicht ausgeführt werden."}
    </section>
  );
}
