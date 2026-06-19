"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCopy,
  Clock3,
  Loader2,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import type { Tables } from "@streamos/database";

type ContentJobRow = Tables<"content_jobs">;
type JobStatusFilter = "all" | "pending" | "processing" | "failed" | "done";

type RepurposingReviewConsoleProps = {
  initialJobs: ContentJobRow[];
};

const statusMeta = {
  pending: {
    badgeClassName: "border-slate-500/30 bg-slate-500/10 text-slate-300",
    icon: Clock3,
    label: "Pending",
  },
  running: {
    badgeClassName: "border-signal-gold/30 bg-signal-gold/10 text-signal-gold",
    icon: Loader2,
    label: "Processing",
  },
  processing: {
    badgeClassName: "border-signal-gold/30 bg-signal-gold/10 text-signal-gold",
    icon: Loader2,
    label: "Processing",
  },
  failed: {
    badgeClassName: "border-signal-red/30 bg-signal-red/10 text-signal-red",
    icon: AlertTriangle,
    label: "Needs attention",
  },
  done: {
    badgeClassName:
      "border-signal-green/30 bg-signal-green/10 text-signal-green",
    icon: CheckCircle2,
    label: "Review ready",
  },
  completed: {
    badgeClassName:
      "border-signal-green/30 bg-signal-green/10 text-signal-green",
    icon: CheckCircle2,
    label: "Review ready",
  },
  cancelled: {
    badgeClassName: "border-slate-500/30 bg-slate-500/10 text-slate-300",
    icon: AlertTriangle,
    label: "Cancelled",
  },
} as const satisfies Record<
  ContentJobRow["status"],
  {
    badgeClassName: string;
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

export function RepurposingReviewConsole({
  initialJobs,
}: RepurposingReviewConsoleProps) {
  const [jobs, setJobs] = useState(initialJobs);
  const [filter, setFilter] = useState<JobStatusFilter>("all");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(
    initialJobs[0]?.id ?? null,
  );
  const [copiedJobId, setCopiedJobId] = useState<string | null>(null);

  const filteredJobs = useMemo(
    () => jobs.filter((job) => matchesFilter(job, filter)),
    [filter, jobs],
  );

  useEffect(() => {
    setJobs(initialJobs);
    setSelectedJobId((currentSelectedJobId) => {
      if (
        currentSelectedJobId &&
        initialJobs.some((job) => job.id === currentSelectedJobId)
      ) {
        return currentSelectedJobId;
      }

      return initialJobs[0]?.id ?? null;
    });
  }, [initialJobs]);

  useEffect(() => {
    if (selectedJobId && filteredJobs.some((job) => job.id === selectedJobId)) {
      return;
    }

    setSelectedJobId(filteredJobs[0]?.id ?? jobs[0]?.id ?? null);
  }, [filteredJobs, jobs, selectedJobId]);

  const selectedJob = useMemo(
    () =>
      filteredJobs.find((job) => job.id === selectedJobId) ??
      jobs.find((job) => job.id === selectedJobId) ??
      filteredJobs[0] ??
      jobs[0] ??
      null,
    [filteredJobs, jobs, selectedJobId],
  );

  const counts = useMemo(() => getJobCounts(jobs), [jobs]);

  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <aside className="card">
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-lg border border-signal-green/20 bg-signal-green/10 p-2 text-signal-green">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
              Review queue
            </p>
            <h2 className="mt-1 text-lg font-semibold text-white">
              Repurposing Jobs
            </h2>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 text-center text-xs sm:grid-cols-4 xl:grid-cols-2">
          <Counter label="Pending" value={counts.pending} />
          <Counter label="Processing" value={counts.processing} />
          <Counter label="Failed" value={counts.failed} />
          <Counter label="Done" value={counts.done} />
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

        <div className="mt-5 space-y-3">
          {filteredJobs.length === 0 ? (
            <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-slate-400">
              Keine Repurposing-Jobs fuer diesen Status.
            </div>
          ) : (
            filteredJobs.map((job) => (
              <button
                className={`block w-full rounded-xl border p-4 text-left transition ${
                  selectedJob?.id === job.id
                    ? "border-signal-green/30 bg-signal-green/10"
                    : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
                }`}
                key={job.id}
                onClick={() => setSelectedJobId(job.id)}
                type="button"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-white">
                      {getJobTitle(job)}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      {job.queue_job_id ?? job.id}
                    </div>
                  </div>
                  <StatusBadge status={job.status} />
                </div>

                <div className="mt-3 text-sm leading-6 text-slate-300">
                  {getJobPreview(job)}
                </div>

                <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                  <span>{formatRetrySummary(job)}</span>
                  <span>{formatUpdatedAt(job.updated_at)}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      <article className="card">
        {selectedJob ? (
          <div className="space-y-6">
            <header className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.08em] text-signal-green">
                  Selected job
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  {getJobTitle(selectedJob)}
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                  Manual-review-only repurposing brief. Keine Publishing- oder
                  Export-Aktion in diesem Flow.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={selectedJob.status} />
                <button
                  className="btn-ghost min-h-9 gap-2 px-3 py-1.5 text-sm"
                  onClick={() => {
                    void copyReviewBundle(selectedJob).then(() => {
                      setCopiedJobId(selectedJob.id);
                      window.setTimeout(() => {
                        setCopiedJobId((current) =>
                          current === selectedJob.id ? null : current,
                        );
                      }, 1500);
                    });
                  }}
                  type="button"
                >
                  <ClipboardCopy className="h-4 w-4" aria-hidden="true" />
                  {copiedJobId === selectedJob.id
                    ? "Copied"
                    : "Copy review bundle"}
                </button>
              </div>
            </header>

            <section className="grid gap-4 md:grid-cols-2">
              <InfoCard label="Content job id" value={selectedJob.id} />
              <InfoCard
                label="Queue job id"
                value={selectedJob.queue_job_id ?? "not assigned"}
              />
              <InfoCard
                label="Retry budget"
                value={`${selectedJob.retry_count} / ${selectedJob.max_retries}`}
              />
              <InfoCard
                label="Updated"
                value={formatUpdatedAt(selectedJob.updated_at)}
              />
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
              <DetailPanel
                label="Short-form plan"
                value={
                  readText(selectedJob.result, "short_form_plan") ??
                  "Not available"
                }
              />
              <DetailPanel
                label="Review notes"
                value={readTextArray(selectedJob.result, "review_notes")}
              />
              <DetailPanel
                label="Title suggestions"
                value={readTextArray(selectedJob.result, "title_suggestions")}
              />
              <DetailPanel
                label="Warnings"
                value={readTextArray(selectedJob.result, "warnings")}
              />
              <DetailPanel
                label="Captions"
                value={readTextArray(selectedJob.result, "captions")}
              />
              <DetailPanel
                label="Descriptions"
                value={readTextArray(selectedJob.result, "descriptions")}
              />
              <DetailPanel
                label="Hashtags"
                value={readNestedTextArray(selectedJob.result, "hashtag_sets")}
              />
              <DetailPanel
                label="Hook ideas"
                value={readTextArray(selectedJob.result, "hook_ideas")}
              />
            </section>

            <section className="grid gap-4 md:grid-cols-2">
              <DetailPanel
                label="Source payload"
                value={formatJsonBlock(selectedJob.payload)}
              />
              <DetailPanel
                label="Automation result"
                value={formatJsonBlock(selectedJob.result)}
              />
              <InfoCard
                label="Manual review"
                value={
                  readBoolean(selectedJob.result, "manual_review_required")
                    ? "Required"
                    : "Not marked"
                }
              />
              <InfoCard
                label="Confidence"
                value={readNumber(selectedJob.result, "confidence")}
              />
            </section>

            <section className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
              <div className="flex items-center gap-2 text-slate-200">
                <AlertTriangle className="h-4 w-4 text-amber-300" />
                Review contract
              </div>
              <p className="mt-2 leading-6 text-slate-400">
                This view is intentionally read-only. Approved repurposing
                actions, publishing, cross-posting, clip export, and rendering
                remain out of scope until a separate backend contract exists.
              </p>
            </section>
          </div>
        ) : (
          <div className="grid min-h-96 place-items-center rounded-xl border border-dashed border-white/10 bg-white/5 text-center">
            <div className="max-w-md px-6 py-10">
              <h2 className="text-xl font-semibold text-white">
                No repurposing jobs found
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                Sobald `repurposing.plan` Jobs eintreffen, erscheinen sie hier
                als reviewbare Content-Job-Karte mit strukturiertem
                Vorschlagspaket.
              </p>
            </div>
          </div>
        )}
      </article>
    </section>
  );
}

function StatusBadge({ status }: { status: ContentJobRow["status"] }) {
  const meta = statusMeta[status];
  const Icon = meta.icon;

  return (
    <span
      className={`inline-flex min-h-8 items-center gap-2 rounded-lg border px-2.5 py-1 text-xs font-semibold ${meta.badgeClassName}`}
    >
      <Icon
        className={`h-4 w-4 ${status === "processing" || status === "running" ? "animate-spin" : ""}`}
        aria-hidden="true"
      />
      {meta.label}
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

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-surface-900/75 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 break-words text-sm leading-6 text-white">{value}</p>
    </div>
  );
}

function DetailPanel({ label, value }: { label: string; value: string }) {
  return (
    <section className="rounded-xl border border-white/10 bg-surface-900/75 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-200">
        {value}
      </p>
    </section>
  );
}

function getJobTitle(job: ContentJobRow): string {
  const sourceTitle = readText(job.payload, "source_video_title");
  const sourceVideoId = readText(job.payload, "source_video_id");

  return sourceTitle ?? sourceVideoId ?? job.queue_job_id ?? job.id;
}

function getJobPreview(job: ContentJobRow): string {
  if (job.error_message) {
    return job.error_message;
  }

  if (
    !job.result ||
    typeof job.result !== "object" ||
    Array.isArray(job.result)
  ) {
    return isProcessingStatus(job.status)
      ? "Waiting for automation result..."
      : "Review bundle not stored yet.";
  }

  const shortFormPlan = readText(job.result, "short_form_plan");
  if (shortFormPlan) {
    return shortFormPlan;
  }

  const reviewNotes = readTextArray(job.result, "review_notes");
  if (reviewNotes) {
    return reviewNotes;
  }

  const warnings = readTextArray(job.result, "warnings");
  if (warnings) {
    return warnings;
  }

  return "Result stored";
}

function getJobCounts(jobs: ContentJobRow[]) {
  return {
    done: jobs.filter((job) => isDoneStatus(job.status)).length,
    failed: jobs.filter((job) => job.status === "failed").length,
    pending: jobs.filter((job) => job.status === "pending").length,
    processing: jobs.filter((job) => isProcessingStatus(job.status)).length,
  };
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

function formatRetrySummary(job: ContentJobRow): string {
  if (job.status !== "failed") {
    return job.last_retried_at ? "Retry logged" : "No retry required";
  }

  if (job.next_retry_at) {
    return `Next retry ${formatUpdatedAt(job.next_retry_at)}`;
  }

  return job.retry_count >= job.max_retries
    ? "Retry budget exhausted"
    : "Retry due";
}

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  }).format(new Date(value));
}

function readText(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = (value as Record<string, unknown>)[key];

  return typeof candidate === "string" && candidate.trim().length > 0
    ? candidate
    : null;
}

function readTextArray(value: unknown, key: string): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "Not available";
  }

  const candidate = (value as Record<string, unknown>)[key];

  if (!Array.isArray(candidate) || candidate.length === 0) {
    return "Not available";
  }

  const items = candidate.filter(
    (item): item is string => typeof item === "string",
  );

  return items.length > 0 ? items.join("\n\n") : "Not available";
}

function readNestedTextArray(value: unknown, key: string): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "Not available";
  }

  const candidate = (value as Record<string, unknown>)[key];

  if (!Array.isArray(candidate) || candidate.length === 0) {
    return "Not available";
  }

  const lines = candidate
    .map((entry) =>
      Array.isArray(entry)
        ? entry.filter((item): item is string => typeof item === "string")
        : [],
    )
    .filter((entry) => entry.length > 0)
    .map((entry) => entry.join(", "));

  return lines.length > 0 ? lines.join("\n") : "Not available";
}

function readBoolean(value: unknown, key: string): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return (value as Record<string, unknown>)[key] === true;
}

function readNumber(value: unknown, key: string): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "Not available";
  }

  const candidate = (value as Record<string, unknown>)[key];

  return typeof candidate === "number" ? `${candidate}/100` : "Not available";
}

function formatJsonBlock(value: unknown): string {
  if (value === null || value === undefined) {
    return "Not available";
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "Not available";
  }
}

async function copyReviewBundle(job: ContentJobRow): Promise<void> {
  if (!navigator.clipboard) {
    return;
  }

  const bundle = [
    `Repurposing review bundle: ${getJobTitle(job)}`,
    `job_id: ${job.id}`,
    `queue_job_id: ${job.queue_job_id ?? "not assigned"}`,
    `status: ${job.status}`,
    `retry_count: ${job.retry_count}/${job.max_retries}`,
    "",
    "short_form_plan:",
    readText(job.result, "short_form_plan") ?? "Not available",
    "",
    "review_notes:",
    readTextArray(job.result, "review_notes"),
    "",
    "warnings:",
    readTextArray(job.result, "warnings"),
  ].join("\n");

  await navigator.clipboard.writeText(bundle);
}
