"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCopy,
  Clock3,
  Loader2,
  MessageSquareMore,
  PencilLine,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import {
  buildRepurposingReviewBundle,
  formatSanitizedJsonBlock,
  getEmptyStateMessage,
  getRepurposingJobPreview,
  getRepurposingJobSummary,
  getRepurposingJobTitle,
  resolveSelectedJob,
  sanitizeRepurposingFreeformText,
  type ReviewEventRow,
  type ContentJobRow,
  type JobStatusFilter,
} from "./RepurposingReviewConsole.utils";
import {
  REPURPOSING_REVIEW_DECISIONS,
  formatReviewDecisionSummary,
  getRepurposingReviewDecisionClassName,
  getRepurposingReviewStatusLabel,
  type RepurposingReviewDecision,
} from "@/app/dashboard/jobs/repurposing/review";

type RepurposingReviewConsoleProps = {
  initialJobs: ContentJobRow[];
  initialAuditEvents: ReviewEventRow[];
  initialSelectedJobId?: string | null;
  reviewAction: (formData: FormData) => Promise<void>;
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
  initialAuditEvents,
  initialSelectedJobId = null,
  reviewAction,
}: RepurposingReviewConsoleProps) {
  const jobs = initialJobs;
  const [filter, setFilter] = useState<JobStatusFilter>("all");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(
    initialSelectedJobId ?? initialJobs[0]?.id ?? null,
  );
  const [copiedJobId, setCopiedJobId] = useState<string | null>(null);

  const filteredJobs = useMemo(
    () => jobs.filter((job) => matchesFilter(job, filter)),
    [filter, jobs],
  );

  const selectedJob = useMemo(
    () => resolveSelectedJob(filteredJobs, selectedJobId),
    [filteredJobs, selectedJobId],
  );
  const selectedSummary = useMemo(
    () => (selectedJob ? getRepurposingJobSummary(selectedJob) : null),
    [selectedJob],
  );
  const selectedAuditTrail = useMemo(
    () => getSelectedAuditTrail(initialAuditEvents, selectedJob?.id ?? null),
    [initialAuditEvents, selectedJob?.id],
  );

  const counts = useMemo(() => getJobCounts(jobs), [jobs]);
  const hasVisibleJobs = filteredJobs.length > 0;

  useEffect(() => {
    setSelectedJobId((currentSelectedJobId) => {
      const selected = resolveSelectedJob(filteredJobs, currentSelectedJobId);
      return selected?.id ?? null;
    });
  }, [filteredJobs]);

  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <aside className="card h-fit xl:sticky xl:top-6">
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
              {getEmptyStateMessage(filter, jobs.length)}
            </div>
          ) : (
            filteredJobs.map((job) => {
              const summary = getRepurposingJobSummary(job);

              return (
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
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-white">
                        {getRepurposingJobTitle(job)}
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        {job.queue_job_id ?? job.id}
                      </div>
                    </div>
                    <StatusBadge status={job.status} />
                  </div>

                  <div className="mt-3 text-sm leading-6 text-slate-300">
                    {getRepurposingJobPreview(job)}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                    <span>{formatRetrySummary(job)}</span>
                    <span>{formatUpdatedAt(job.updated_at)}</span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
                    <MetaPill label="Provider" value={summary.sourceProvider} />
                    <MetaPill
                      label="Targets"
                      value={formatArrayValue(summary.targetPlatforms)}
                    />
                    <MetaPill
                      label="Review"
                      value={getRepurposingReviewStatusLabel(
                        summary.reviewStatus,
                      )}
                    />
                    <MetaPill
                      label="Manual"
                      value={
                        summary.manualReviewRequired ? "Required" : "Optional"
                      }
                    />
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      <article className="card min-w-0">
        {selectedJob && hasVisibleJobs ? (
          <div className="space-y-6">
            <header className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.08em] text-signal-green">
                  Selected job
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  {getRepurposingJobTitle(selectedJob)}
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                  Manual-review-only repurposing brief. Keine Publishing-,
                  Datei-Export- oder Rendering-Aktion in diesem Flow.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <MetaPill
                    label="Review"
                    value={formatReviewDecisionSummary(
                      selectedSummary?.reviewStatus,
                    )}
                  />
                  <MetaPill
                    label="Manual"
                    value={
                      selectedSummary?.manualReviewRequired
                        ? "Required"
                        : "Optional"
                    }
                  />
                  <MetaPill label="Clipboard" value="Sanitized local copy" />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={selectedJob.status} />
                <span className="inline-flex min-h-8 items-center rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-slate-200">
                  {formatReviewDecisionSummary(selectedSummary?.reviewStatus)}
                </span>
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
                  title="Copies a sanitized summary to your clipboard."
                  aria-label="Copy sanitized review summary to clipboard"
                  type="button"
                >
                  <ClipboardCopy className="h-4 w-4" aria-hidden="true" />
                  {copiedJobId === selectedJob.id
                    ? "Copied"
                    : "Copy sanitized review summary"}
                </button>
              </div>
            </header>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <InfoCard label="Content job id" value={selectedJob.id} />
              <InfoCard
                label="Queue job id"
                value={selectedJob.queue_job_id ?? "not assigned"}
              />
              <InfoCard
                label="Source provider"
                value={selectedSummary?.sourceProvider ?? "Not available"}
              />
              <InfoCard
                label="Source title"
                value={selectedSummary?.sourceTitle ?? "Not available"}
              />
              <InfoCard
                label="Source identifier"
                value={selectedSummary?.sourceIdentifier ?? "Not available"}
              />
              <InfoCard
                label="Target platforms"
                value={formatArrayValue(selectedSummary?.targetPlatforms ?? [])}
              />
              <InfoCard
                label="Generated at"
                value={selectedSummary?.generatedAt ?? "Not available"}
              />
              <InfoCard
                label="Model provider"
                value={selectedSummary?.modelProvider ?? "Not available"}
              />
              <InfoCard
                label="Model name"
                value={selectedSummary?.modelName ?? "Not available"}
              />
              <InfoCard
                label="Retry budget"
                value={`${selectedJob.retry_count} / ${selectedJob.max_retries}`}
              />
              <InfoCard
                label="Manual review"
                value={
                  selectedSummary?.manualReviewRequired
                    ? "Required"
                    : "Not marked"
                }
              />
              <InfoCard
                label="Review status"
                value={formatReviewDecisionSummary(
                  selectedSummary?.reviewStatus,
                )}
              />
              <InfoCard
                label="Reviewer notes"
                value={
                  selectedSummary?.reviewerNotes?.trim()
                    ? sanitizeRepurposingFreeformText(
                        selectedSummary.reviewerNotes,
                      )
                    : "No reviewer notes"
                }
              />
              <InfoCard
                label="Reviewed at"
                value={selectedSummary?.reviewedAt ?? "Not reviewed yet"}
              />
              <InfoCard
                label="Reviewed by"
                value={selectedSummary?.reviewedBy ?? "Not reviewed yet"}
              />
              <InfoCard
                label="Confidence"
                value={selectedSummary?.confidence ?? "Not available"}
              />
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
              <DetailPanel
                label="Title suggestions"
                value={readTextArray(selectedJob.result, "title_suggestions")}
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
                label="Hashtag sets"
                value={readNestedTextArray(selectedJob.result, "hashtag_sets")}
              />
              <DetailPanel
                label="Hook ideas"
                value={readTextArray(selectedJob.result, "hook_ideas")}
              />
              <DetailPanel
                label="Short-form plan"
                value={
                  readText(selectedJob.result, "short_form_plan") ??
                  "Not available"
                }
              />
              <DetailPanel
                label="AI review notes"
                value={readTextArray(selectedJob.result, "review_notes")}
              />
              <DetailPanel
                label="Warnings"
                value={readTextArray(selectedJob.result, "warnings")}
              />
            </section>

            <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <form
                action={reviewAction}
                className="rounded-xl border border-white/10 bg-white/5 p-4"
                key={selectedJob.id}
              >
                <div className="flex items-start gap-3">
                  <span className="rounded-lg border border-signal-green/20 bg-signal-green/10 p-2 text-signal-green">
                    <PencilLine className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
                      Persisted review
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-white">
                      Approve, reject, or request changes
                    </h3>
                  </div>
                </div>

                <input name="jobId" type="hidden" value={selectedJob.id} />

                <label className="mt-4 block">
                  <span className="text-sm font-medium text-slate-200">
                    Reviewer notes
                  </span>
                  <textarea
                    className="mt-2 min-h-32 w-full rounded-xl border border-white/10 bg-surface-900/80 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-500 focus:border-signal-green/40"
                    name="reviewerNotes"
                    placeholder="Add an internal review note for this repurposing brief."
                    defaultValue={selectedSummary?.reviewerNotes ?? ""}
                  />
                </label>

                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  {REPURPOSING_REVIEW_DECISIONS.map((decision) => (
                    <ReviewDecisionButton decision={decision} key={decision} />
                  ))}
                </div>

                <p className="mt-3 text-xs leading-5 text-slate-400">
                  Review decisions are stored server-side with an append-only
                  audit trail. There is no publishing, file export, worker
                  dispatch, or AI execution from this surface.
                </p>
              </form>

              <section className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-start gap-3">
                  <span className="rounded-lg border border-signal-green/20 bg-signal-green/10 p-2 text-signal-green">
                    <MessageSquareMore className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
                      Audit trail
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-white">
                      Review history for this job
                    </h3>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {selectedAuditTrail.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-white/10 bg-white/5 p-4 text-sm text-slate-400">
                      No review events stored yet.
                    </div>
                  ) : (
                    selectedAuditTrail.map((event) => (
                      <article
                        className="rounded-xl border border-white/10 bg-surface-900/75 p-4"
                        key={event.id}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span
                            className={`inline-flex min-h-8 items-center gap-2 rounded-lg border px-2.5 py-1 text-xs font-semibold ${getRepurposingReviewDecisionClassName(
                              event.review_status,
                            )}`}
                          >
                            {formatReviewDecisionSummary(event.review_status)}
                          </span>
                          <time
                            className="text-xs text-slate-400"
                            dateTime={event.reviewed_at}
                          >
                            {formatUpdatedAt(event.reviewed_at)}
                          </time>
                        </div>

                        <p className="mt-3 text-sm leading-6 text-slate-200">
                          {event.reviewer_notes
                            ? sanitizeRepurposingFreeformText(
                                event.reviewer_notes,
                              )
                            : "No reviewer notes recorded."}
                        </p>

                        <dl className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-2">
                          <ReviewTrailDefinition
                            label="Previous status"
                            value={formatReviewDecisionSummary(
                              event.previous_review_status,
                            )}
                          />
                          <ReviewTrailDefinition
                            label="Reviewer"
                            value={event.reviewed_by}
                          />
                        </dl>
                      </article>
                    ))
                  )}
                </div>
              </section>
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
              <RawPanel
                label="Open raw payload"
                value={formatSanitizedJsonBlock(selectedJob.payload)}
              />
              <RawPanel
                label="Open raw result"
                value={formatSanitizedJsonBlock(selectedJob.result)}
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
                {jobs.length === 0
                  ? "No repurposing jobs found"
                  : "No jobs match this filter"}
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                {getEmptyStateMessage(filter, jobs.length)}
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

function RawPanel({ label, value }: { label: string; value: string }) {
  return (
    <details className="rounded-xl border border-white/10 bg-surface-900/75 p-4">
      <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
        {label}
      </summary>
      <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words text-xs leading-6 text-slate-200">
        {value}
      </pre>
    </details>
  );
}

function MetaPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-medium text-slate-300">
      <span className="text-slate-400">{label}:</span>
      <span className="truncate">{value}</span>
    </span>
  );
}

function formatArrayValue(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "Not available";
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

async function copyReviewBundle(job: ContentJobRow): Promise<void> {
  if (!navigator.clipboard) {
    return;
  }

  await navigator.clipboard.writeText(buildRepurposingReviewBundle(job));
}

function ReviewDecisionButton({
  decision,
}: {
  decision: RepurposingReviewDecision;
}) {
  const className = getRepurposingReviewDecisionClassName(decision);
  const label = formatReviewDecisionSummary(decision);

  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition hover:scale-[1.01] ${className}`}
      name="reviewStatus"
      type="submit"
      value={decision}
    >
      {decision === "approved" ? (
        <ThumbsUp className="h-4 w-4" aria-hidden="true" />
      ) : decision === "rejected" ? (
        <ThumbsDown className="h-4 w-4" aria-hidden="true" />
      ) : (
        <MessageSquareMore className="h-4 w-4" aria-hidden="true" />
      )}
      {label}
    </button>
  );
}

function ReviewTrailDefinition({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
        {label}
      </dt>
      <dd className="mt-1 break-words text-xs leading-5 text-slate-200">
        {value ?? "Not available"}
      </dd>
    </div>
  );
}

function getSelectedAuditTrail(
  auditEvents: ReviewEventRow[],
  selectedJobId: string | null,
): ReviewEventRow[] {
  if (!selectedJobId) {
    return [];
  }

  return auditEvents
    .filter((event) => event.content_job_id === selectedJobId)
    .slice()
    .sort(
      (left, right) =>
        new Date(right.created_at).getTime() -
        new Date(left.created_at).getTime(),
    );
}
