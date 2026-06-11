"use client";

import { AlertTriangle, CheckCircle2, Clock3, Loader2 } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import {
  type ContentJobRow,
  subscribeToContentJobs,
} from "@/lib/supabase/realtime";

type ContentJobProgressProps = {
  initialJobs: ContentJobRow[];
  userId: string | null;
};

const statusMeta = {
  pending: {
    className: "border-slate-500/30 bg-slate-500/10 text-slate-300",
    icon: Clock3,
    label: "Ausstehend",
  },
  running: {
    className: "border-signal-gold/30 bg-signal-gold/10 text-signal-gold",
    icon: Loader2,
    label: "Laeuft",
  },
  processing: {
    className: "border-signal-gold/30 bg-signal-gold/10 text-signal-gold",
    icon: Loader2,
    label: "Wird verarbeitet",
  },
  done: {
    className: "border-signal-green/30 bg-signal-green/10 text-signal-green",
    icon: CheckCircle2,
    label: "Fertig",
  },
  completed: {
    className: "border-signal-green/30 bg-signal-green/10 text-signal-green",
    icon: CheckCircle2,
    label: "Abgeschlossen",
  },
  failed: {
    className: "border-signal-red/30 bg-signal-red/10 text-signal-red",
    icon: AlertTriangle,
    label: "Fehlgeschlagen",
  },
  cancelled: {
    className: "border-slate-500/30 bg-slate-500/10 text-slate-300",
    icon: AlertTriangle,
    label: "Abgebrochen",
  },
} as const satisfies Record<
  ContentJobRow["status"],
  {
    className: string;
    icon: typeof Clock3;
    label: string;
  }
>;

export function ContentJobProgress({
  initialJobs,
  userId,
}: ContentJobProgressProps) {
  const [jobs, setJobs] = useState(initialJobs);

  useEffect(() => {
    setJobs(initialJobs);
  }, [initialJobs]);

  useEffect(() => {
    if (!userId) {
      return undefined;
    }

    return subscribeToContentJobs({
      userId,
      onChange: (updatedJob) => {
        setJobs((currentJobs) => mergeJob(currentJobs, updatedJob));
      },
    });
  }, [userId]);

  const counts = useMemo(
    () => ({
      done: jobs.filter((job) => isDoneStatus(job.status)).length,
      failed: jobs.filter((job) => job.status === "failed").length,
      running: jobs.filter((job) => isProcessingStatus(job.status)).length,
    }),
    [jobs],
  );

  return (
    <section className="card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
            Automationsjobs
          </p>
          <h2 className="mt-1 text-lg font-semibold text-white">
            Content-Pipeline
          </h2>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs sm:min-w-64">
          <Counter label="Laeuft" value={counts.running} />
          <Counter label="Fertig" value={counts.done} />
          <Counter label="Fehlgeschlagen" value={counts.failed} />
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 text-slate-300">
            <tr>
              <th className="px-4 py-3 font-medium">Job</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Ergebnis</th>
              <th className="px-4 py-3 font-medium">Aktualisiert</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10 bg-surface-900/60">
            {jobs.length === 0 ? (
              <tr>
                <td className="px-4 py-5 text-slate-400" colSpan={4}>
                  Noch keine Content-Jobs vorhanden.
                </td>
              </tr>
            ) : (
              jobs.map((job) => <JobRow job={job} key={job.id} />)
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
      <strong className="block text-base text-white">{value}</strong>
      <span className="text-slate-400">{label}</span>
    </div>
  );
}

function JobRow({ job }: { job: ContentJobRow }) {
  const meta = statusMeta[job.status];
  const Icon = meta.icon;

  return (
    <tr>
      <td className="px-4 py-3">
        <div className="font-medium text-white">
          {formatJobTypeLabel(job.job_type)}
        </div>
        <div className="max-w-52 truncate text-xs text-slate-400">
          {job.queue_job_id ?? job.id}
        </div>
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex min-h-8 items-center gap-2 rounded-lg border px-2.5 py-1 text-xs font-semibold ${meta.className}`}
        >
          <Icon
            className={`h-4 w-4 ${isProcessingStatus(job.status) ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          {meta.label}
        </span>
      </td>
      <td className="max-w-72 px-4 py-3 text-slate-300">
        <span className="line-clamp-2">{getResultPreview(job)}</span>
      </td>
      <td className="px-4 py-3 text-slate-400">
        {new Intl.DateTimeFormat("de-DE", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }).format(new Date(job.updated_at))}
      </td>
    </tr>
  );
}

function getResultPreview(job: ContentJobRow): string {
  if (
    !job.result ||
    typeof job.result !== "object" ||
    Array.isArray(job.result)
  ) {
    return isProcessingStatus(job.status)
      ? "Transkription laeuft..."
      : "Wartet auf Ergebnis";
  }

  if ("error" in job.result && typeof job.result.error === "string") {
    return job.result.error;
  }

  if ("transcript" in job.result && typeof job.result.transcript === "string") {
    return job.result.transcript;
  }

  if (
    "virality_score" in job.result &&
    typeof job.result.virality_score === "number"
  ) {
    const summary =
      "repurpose_summary" in job.result &&
      typeof job.result.repurpose_summary === "string"
        ? job.result.repurpose_summary
        : null;
    const title =
      "title_suggestions" in job.result &&
      Array.isArray(job.result.title_suggestions) &&
      typeof job.result.title_suggestions[0] === "string"
        ? job.result.title_suggestions[0]
        : null;

    return [`Punktzahl ${job.result.virality_score}/100`, title, summary]
      .filter(Boolean)
      .join(" - ");
  }

  return "Ergebnis gespeichert";
}

function isProcessingStatus(status: ContentJobRow["status"]): boolean {
  return status === "running" || status === "processing";
}

function isDoneStatus(status: ContentJobRow["status"]): boolean {
  return status === "done" || status === "completed";
}

function formatJobTypeLabel(jobType: ContentJobRow["job_type"]): string {
  const labels: Record<ContentJobRow["job_type"], string> = {
    clip_scoring: "Clip-Bewertung",
    repurposing: "Repurposing",
    title_generation: "Titelgenerierung",
    transcription: "Transkription",
  };

  return labels[jobType];
}

function mergeJob(
  currentJobs: ContentJobRow[],
  updatedJob: ContentJobRow,
): ContentJobRow[] {
  const nextJobs = new Map(currentJobs.map((job) => [job.id, job]));

  nextJobs.set(updatedJob.id, updatedJob);

  return [...nextJobs.values()].sort(
    (left, right) =>
      new Date(right.updated_at).getTime() -
      new Date(left.updated_at).getTime(),
  );
}
