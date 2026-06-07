"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Loader2,
  RefreshCw,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  type ContentJobRow,
  type ContentJobsRealtimeStatus,
  fetchContentJobsSnapshot,
  subscribeToContentJobs,
} from "@/lib/supabase/realtime";

type JobStatusFilter = "all" | "pending" | "processing" | "failed" | "done";

type ContentJobsLiveListProps = {
  initialJobs: ContentJobRow[];
  retryAction: (formData: FormData) => Promise<void>;
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
    label: "Processing",
  },
  processing: {
    className: "border-signal-gold/30 bg-signal-gold/10 text-signal-gold",
    icon: Loader2,
    label: "Processing",
  },
  failed: {
    className: "border-signal-red/30 bg-signal-red/10 text-signal-red",
    icon: AlertTriangle,
    label: "Failed",
  },
  done: {
    className: "border-signal-green/30 bg-signal-green/10 text-signal-green",
    icon: CheckCircle2,
    label: "Done",
  },
  completed: {
    className: "border-signal-green/30 bg-signal-green/10 text-signal-green",
    icon: CheckCircle2,
    label: "Completed",
  },
  cancelled: {
    className: "border-slate-500/30 bg-slate-500/10 text-slate-300",
    icon: AlertTriangle,
    label: "Cancelled",
  },
} as const satisfies Record<
  ContentJobRow["status"],
  {
    className: string;
    icon: typeof Clock3;
    label: string;
  }
>;

const statusFilters: Array<{ label: string; value: JobStatusFilter }> = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Processing", value: "processing" },
  { label: "Failed", value: "failed" },
  { label: "Done", value: "done" },
];

export function ContentJobsLiveList({
  initialJobs,
  retryAction,
  userId,
}: ContentJobsLiveListProps) {
  const [jobs, setJobs] = useState(initialJobs);
  const [filter, setFilter] = useState<JobStatusFilter>("all");
  const [realtimeStatus, setRealtimeStatus] =
    useState<ContentJobsRealtimeStatus>("connecting");

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
      onStatus: setRealtimeStatus,
    });
  }, [userId]);

  useEffect(() => {
    if (!userId || realtimeStatus === "subscribed") {
      return undefined;
    }

    let cancelled = false;
    const subscribedUserId = userId;

    async function refreshSnapshot() {
      try {
        const snapshot = await fetchContentJobsSnapshot({
          userId: subscribedUserId,
        });

        if (!cancelled) {
          setJobs(snapshot);
        }
      } catch {
        // Keep the last known jobs; the visible realtime badge already shows degraded state.
      }
    }

    void refreshSnapshot();
    const intervalId = window.setInterval(() => {
      void refreshSnapshot();
    }, 15_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [realtimeStatus, userId]);

  const counts = useMemo(() => getJobCounts(jobs), [jobs]);
  const filteredJobs = useMemo(
    () => jobs.filter((job) => matchesFilter(job, filter)),
    [filter, jobs],
  );

  return (
    <section className="card">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Live Job Queue</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-400">
            <span>{jobs.length} Jobs synchronisiert</span>
            <RealtimeBadge status={realtimeStatus} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
          <Counter label="Pending" value={counts.pending} />
          <Counter label="Processing" value={counts.processing} />
          <Counter label="Failed" value={counts.failed} />
          <Counter label="Done" value={counts.done} />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {statusFilters.map((item) => (
          <button
            aria-pressed={filter === item.value}
            className={
              filter === item.value
                ? "btn-primary min-h-9 px-3 py-1.5"
                : "btn-ghost min-h-9 px-3 py-1.5"
            }
            key={item.value}
            onClick={() => setFilter(item.value)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-5 overflow-hidden rounded-lg border border-white/10">
        <div className="overflow-x-auto">
          <table className="min-w-[920px] w-full text-left text-sm">
            <thead className="bg-white/5 text-slate-300">
              <tr>
                <th className="px-4 py-3 font-medium">Job</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Retries</th>
                <th className="px-4 py-3 font-medium">Result</th>
                <th className="px-4 py-3 font-medium">Updated</th>
                <th className="px-4 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10 bg-surface-900/60">
              {filteredJobs.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-slate-400" colSpan={6}>
                    Keine Jobs fuer diesen Status.
                  </td>
                </tr>
              ) : (
                filteredJobs.map((job) => (
                  <JobRow job={job} key={job.id} retryAction={retryAction} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function RealtimeBadge({ status }: { status: ContentJobsRealtimeStatus }) {
  const isLive = status === "subscribed";
  const label = isLive ? "Realtime live" : "Polling fallback";

  return (
    <span
      className={
        isLive
          ? "rounded-full border border-signal-green/20 bg-signal-green/10 px-2 py-0.5 text-xs font-medium text-signal-green"
          : "rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-0.5 text-xs font-medium text-amber-200"
      }
      title={`Supabase Realtime status: ${status}`}
    >
      {label}
    </span>
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

function JobRow({
  job,
  retryAction,
}: {
  job: ContentJobRow;
  retryAction: (formData: FormData) => Promise<void>;
}) {
  const meta = statusMeta[job.status];
  const Icon = meta.icon;

  return (
    <tr>
      <td className="px-4 py-3">
        <div className="font-medium capitalize text-white">
          {job.job_type.replace("_", " ")}
        </div>
        <div className="mt-1 max-w-56 truncate text-xs text-slate-400">
          {job.queue_job_id ?? job.id}
        </div>
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex min-h-8 items-center gap-2 rounded-lg border px-2.5 py-1 text-xs font-semibold ${meta.className}`}
        >
          <Icon
            aria-hidden="true"
            className={`h-4 w-4 ${isProcessingStatus(job.status) ? "animate-spin" : ""}`}
          />
          {meta.label}
        </span>
      </td>
      <td className="px-4 py-3 text-slate-300">
        <div className="font-medium text-white">
          {job.retry_count} / {job.max_retries}
        </div>
        <div className="mt-1 text-xs text-slate-400">{getRetryLabel(job)}</div>
      </td>
      <td className="max-w-80 px-4 py-3 text-slate-300">
        <span className="line-clamp-2">{getResultPreview(job)}</span>
      </td>
      <td className="px-4 py-3 text-slate-400">
        {formatDateTime(job.updated_at)}
      </td>
      <td className="px-4 py-3 text-right">
        {job.status === "failed" ? (
          <form action={retryAction}>
            <input name="jobId" type="hidden" value={job.id} />
            <RetryButton />
          </form>
        ) : (
          <span className="text-xs text-slate-500">-</span>
        )}
      </td>
    </tr>
  );
}

function RetryButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="btn-ghost min-h-9 gap-2 px-3 py-1.5"
      disabled={pending}
      type="submit"
    >
      <RefreshCw
        aria-hidden="true"
        className={`h-4 w-4 ${pending ? "animate-spin" : ""}`}
      />
      {pending ? "Retry..." : "Retry"}
    </button>
  );
}

function getJobCounts(jobs: ContentJobRow[]) {
  return {
    done: jobs.filter((job) => isDoneStatus(job.status)).length,
    failed: jobs.filter((job) => job.status === "failed").length,
    pending: jobs.filter((job) => job.status === "pending").length,
    processing: jobs.filter((job) => isProcessingStatus(job.status)).length,
  };
}

function getRetryLabel(job: ContentJobRow): string {
  if (job.status !== "failed") {
    return job.last_retried_at
      ? `Last retry ${formatDateTime(job.last_retried_at)}`
      : "No retry required";
  }

  if (job.next_retry_at) {
    return `Next ${formatDateTime(job.next_retry_at)}`;
  }

  return job.retry_count >= job.max_retries ? "Limit reached" : "Retry due";
}

function getResultPreview(job: ContentJobRow): string {
  if (job.error_message) {
    return job.error_message;
  }

  if (
    !job.result ||
    typeof job.result !== "object" ||
    Array.isArray(job.result)
  ) {
    return isProcessingStatus(job.status)
      ? "Processing..."
      : "Waiting for result";
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

    return [`Score ${job.result.virality_score}/100`, title, summary]
      .filter(Boolean)
      .join(" - ");
  }

  return "Result stored";
}

function matchesFilter(job: ContentJobRow, filter: JobStatusFilter): boolean {
  if (filter === "all") {
    return true;
  }

  if (filter === "processing") {
    return isProcessingStatus(job.status);
  }

  if (filter === "done") {
    return isDoneStatus(job.status);
  }

  return job.status === filter;
}

function isProcessingStatus(status: ContentJobRow["status"]): boolean {
  return status === "running" || status === "processing";
}

function isDoneStatus(status: ContentJobRow["status"]): boolean {
  return status === "done" || status === "completed";
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

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  }).format(new Date(value));
}
