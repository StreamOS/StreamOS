import type { Tables } from "@streamos/database";
import { requestContentJobRetryAction } from "./actions";
import { ContentJobsLiveList } from "@/components/modules/ContentJobsLiveList";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

type ContentJobRow = Tables<"content_jobs">;

type JobsPageProps = {
  searchParams?: Promise<{
    error?: string;
    status?: string;
  }>;
};

export default async function JobsPage({ searchParams }: JobsPageProps) {
  const params = await searchParams;
  const { jobs, userId } = await getContentJobs();

  return (
    <div className="space-y-6">
      <JobsNotice error={params?.error} status={params?.status} />

      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-white">Content-Jobs</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Live-Status fuer Clip-, Transkriptions- und Wiederverwertungs-Jobs.
          </p>
        </div>
      </header>

      <ContentJobsLiveList
        initialJobs={jobs}
        retryAction={requestContentJobRetryAction}
        userId={userId}
      />
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
    .in("status", ["pending", "running", "failed", "done"])
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    return { jobs: [], userId: userData.user.id };
  }

  return { jobs: data ?? [], userId: userData.user.id };
}

function JobsNotice({ error, status }: { error?: string; status?: string }) {
  if (status === "retry-requested") {
    return (
      <section className="rounded-lg border border-signal-green/30 bg-signal-green/10 p-4 text-sm text-signal-green">
        Ein erneuter Versuch wurde angefordert. Der Wiederholungs-Worker nimmt
        den Job beim naechsten Abruf auf.
      </section>
    );
  }

  if (!error) {
    return null;
  }

  const messages: Record<string, string> = {
    "invalid-job": "Der Job konnte nicht eindeutig gelesen werden.",
    "job-not-failed":
      "Nur fehlgeschlagene Jobs koennen manuell erneut versucht werden.",
    "job-not-found":
      "Der Job wurde nicht gefunden oder gehoert nicht zu deinem Workspace.",
    "retry-load-failed":
      "Der Job konnte vor dem erneuten Versuch nicht geladen werden.",
    "retry-update-failed":
      "Der erneute Versuch konnte nicht vorgemerkt werden.",
    "supabase-not-configured":
      "Supabase ist noch nicht konfiguriert. Setze die Supabase-Umgebungsvariablen, bevor Jobs angezeigt werden.",
  };

  return (
    <section className="rounded-lg border border-signal-red/30 bg-signal-red/10 p-4 text-sm text-signal-red">
      {messages[error] ?? "Job-Aktion konnte nicht ausgefuehrt werden."}
    </section>
  );
}
