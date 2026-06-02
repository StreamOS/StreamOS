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
    label: "Pending",
  },
  running: {
    className: "border-signal-gold/30 bg-signal-gold/10 text-signal-gold",
    icon: Loader2,
    label: "Running",
  },
  done: {
    className: "border-signal-green/30 bg-signal-green/10 text-signal-green",
    icon: CheckCircle2,
    label: "Done",
  },
  failed: {
    className: "border-signal-red/30 bg-signal-red/10 text-signal-red",
    icon: AlertTriangle,
    label: "Failed",
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
      done: jobs.filter((job) => job.status === "done").length,
      failed: jobs.filter((job) => job.status === "failed").length,
      running: jobs.filter((job) => job.status === "running").length,
    }),
    [jobs],
  );

  return (
    <section className="card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
            Automation Jobs
          </p>
          <h2 className="mt-1 text-lg font-semibold text-white">
            Content Pipeline
          </h2>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs sm:min-w-64">
          <Counter label="Running" value={counts.running} />
          <Counter label="Done" value={counts.done} />
          <Counter label="Failed" value={counts.failed} />
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 text-slate-300">
            <tr>
              <th className="px-4 py-3 font-medium">Job</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Result</th>
              <th className="px-4 py-3 font-medium">Updated</th>
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
        <div className="font-medium capitalize text-white">
          {job.job_type.replace("_", " ")}
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
            className={`h-4 w-4 ${job.status === "running" ? "animate-spin" : ""}`}
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
  if (!job.result || typeof job.result !== "object" || Array.isArray(job.result)) {
    return job.status === "running" ? "Transkription laeuft..." : "Wartet auf Ergebnis";
  }

  if ("error" in job.result && typeof job.result.error === "string") {
    return job.result.error;
  }

  if ("transcript" in job.result && typeof job.result.transcript === "string") {
    return job.result.transcript;
  }

  return "Ergebnis gespeichert";
}

function mergeJob(
  currentJobs: ContentJobRow[],
  updatedJob: ContentJobRow,
): ContentJobRow[] {
  const nextJobs = new Map(currentJobs.map((job) => [job.id, job]));

  nextJobs.set(updatedJob.id, updatedJob);

  return [...nextJobs.values()].sort(
    (left, right) =>
      new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
  );
}
