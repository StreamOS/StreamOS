"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCopy,
  Clock3,
  Loader2,
  MessageSquareMore,
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
  getDefaultRepurposingExportSelection,
  getRepurposingExportBundleDetails,
  getRepurposingExportAnalyticsSummary,
  getRepurposingExportHistoryEntries,
  getRepurposingExportJobActivity,
  getLatestRepurposingExportAt,
  getRepurposingExportTemplates,
  resolveSelectedJob,
  sanitizeRepurposingFreeformText,
  type ReviewEventRow,
  type ContentJobRow,
  type RepurposingExportAnalyticsSummary,
  type RepurposingExportHistoryEntry,
  type RepurposingExportSelection,
  type RepurposingExportTemplateDetails,
  type JobStatusFilter,
} from "./RepurposingReviewConsole.utils";
import {
  REPURPOSING_REVIEW_DECISIONS,
  type RepurposingExportEventType,
  getRepurposingExportEventLabel,
  type RepurposingExportTemplateKey,
  getRepurposingExportTemplateLabel,
  type RepurposingExportTargetPlatform,
  getRepurposingExportTargetPlatformLabel,
  formatReviewDecisionSummary,
  getRepurposingReviewDecisionClassName,
  getRepurposingReviewStatusLabel,
  type RepurposingExportEventRow,
  type RepurposingReviewDecision,
} from "@/app/dashboard/jobs/repurposing/review";

type RepurposingReviewConsoleProps = {
  initialJobs: ContentJobRow[];
  initialAuditEvents: ReviewEventRow[];
  initialExportEvents?: RepurposingExportEventRow[];
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

const EXPORT_AUDIT_ROUTE = "/api/dashboard/jobs/repurposing/export";

type RepurposingExportCopyOption = {
  body: string;
  eventType: RepurposingExportEventType;
  targetPlatform: RepurposingExportTargetPlatform;
  templateKey: RepurposingExportTemplateKey;
  title: string;
};

export function RepurposingReviewConsole({
  initialJobs,
  initialAuditEvents,
  initialExportEvents = [],
  initialSelectedJobId = null,
  reviewAction,
}: RepurposingReviewConsoleProps) {
  const jobs = initialJobs;
  const [filter, setFilter] = useState<JobStatusFilter>("all");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(
    initialSelectedJobId ?? initialJobs[0]?.id ?? null,
  );
  const [copiedJobId, setCopiedJobId] = useState<string | null>(null);
  const [copiedExportActionId, setCopiedExportActionId] = useState<
    string | null
  >(null);
  const [exportCopyState, setExportCopyState] = useState<{
    actionId: string | null;
    kind: "idle" | "copied_and_audited" | "copy_failed" | "audit_failed";
    message: string | null;
  }>({
    actionId: null,
    kind: "idle",
    message: null,
  });
  const [exportEvents, setExportEvents] = useState(initialExportEvents);
  const [exportSelection, setExportSelection] =
    useState<RepurposingExportSelection>(() =>
      getDefaultRepurposingExportSelection(initialJobs[0] ?? null),
    );
  const [exportPlatformFilter, setExportPlatformFilter] = useState<
    RepurposingExportTargetPlatform | "all"
  >("all");
  const [exportStatusFilter, setExportStatusFilter] = useState<
    "all" | "exported" | "not_exported"
  >("all");
  const [exportPeriodFilter, setExportPeriodFilter] = useState<
    "all" | "last_7_days" | "last_30_days"
  >("all");

  const exportAnalyticsSummary = useMemo(
    () => getRepurposingExportAnalyticsSummary(jobs, exportEvents),
    [exportEvents, jobs],
  );
  const exportHistoryEntries = useMemo(
    () => getRepurposingExportHistoryEntries(exportEvents),
    [exportEvents],
  );
  const exportHistoryByJobId = useMemo(
    () => groupExportHistoryEntriesByJobId(exportHistoryEntries),
    [exportHistoryEntries],
  );

  const filteredJobs = useMemo(
    () =>
      jobs.filter(
        (job) =>
          matchesFilter(job, filter) &&
          matchesExportFilters(
            job,
            exportHistoryByJobId,
            exportPlatformFilter,
            exportStatusFilter,
            exportPeriodFilter,
          ),
      ),
    [
      exportHistoryByJobId,
      exportPeriodFilter,
      exportPlatformFilter,
      exportStatusFilter,
      filter,
      jobs,
    ],
  );

  const selectedJob = useMemo(
    () => resolveSelectedJob(filteredJobs, selectedJobId),
    [filteredJobs, selectedJobId],
  );
  const selectedSummary = useMemo(
    () => (selectedJob ? getRepurposingJobSummary(selectedJob) : null),
    [selectedJob],
  );
  const selectedExportBundle = useMemo(
    () =>
      selectedJob
        ? getRepurposingExportBundleDetails(selectedJob, exportSelection)
        : null,
    [exportSelection, selectedJob],
  );
  const selectedExportTemplates = useMemo(
    () =>
      selectedJob
        ? getRepurposingExportTemplates(selectedJob, exportSelection)
        : [],
    [exportSelection, selectedJob],
  );
  const selectedExportHistory = useMemo(
    () => (selectedJob ? (exportHistoryByJobId.get(selectedJob.id) ?? []) : []),
    [exportHistoryByJobId, selectedJob],
  );
  const selectedExportActivity = useMemo(
    () =>
      selectedJob
        ? getRepurposingExportJobActivity(selectedJob, selectedExportHistory)
        : null,
    [selectedExportHistory, selectedJob],
  );
  const latestExportAt = useMemo(
    () =>
      selectedJob
        ? getLatestRepurposingExportAt(selectedJob.id, exportEvents)
        : null,
    [exportEvents, selectedJob],
  );
  const selectedWarnings = selectedSummary?.warnings ?? [];
  const selectedTargetPlatforms = selectedSummary?.targetPlatforms ?? [];
  const selectedAuditTrail = useMemo(
    () => getSelectedAuditTrail(initialAuditEvents, selectedJob?.id ?? null),
    [initialAuditEvents, selectedJob?.id],
  );

  const counts = useMemo(() => getJobCounts(jobs), [jobs]);
  const hasVisibleJobs = filteredJobs.length > 0;

  useEffect(() => {
    setExportSelection(
      getDefaultRepurposingExportSelection(selectedJob ?? null),
    );
    setCopiedExportActionId(null);
    setExportCopyState({
      actionId: null,
      kind: "idle",
      message: null,
    });
    setSelectedJobId((currentSelectedJobId) => {
      const selected = resolveSelectedJob(filteredJobs, currentSelectedJobId);
      return selected?.id ?? null;
    });
  }, [filteredJobs, selectedJob]);

  async function copyExportOption(
    option: RepurposingExportCopyOption,
    copiedText: string,
  ) {
    if (!selectedJob) {
      return;
    }

    const actionId = buildExportActionId(selectedJob.id, option.templateKey);

    try {
      await navigator.clipboard.writeText(copiedText);
    } catch {
      setCopiedExportActionId(null);
      setExportCopyState({
        actionId,
        kind: "copy_failed",
        message: "Copy failed. Nothing was audited.",
      });
      return;
    }

    try {
      const response = await fetch(EXPORT_AUDIT_ROUTE, {
        body: JSON.stringify({
          eventType: option.eventType,
          jobId: selectedJob.id,
          selection: exportSelection,
          targetPlatform: option.targetPlatform,
          templateKey: option.templateKey,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            bundle_hash: string;
            event: RepurposingExportEventRow;
            status: "export_audited";
          }
        | { code?: string; error?: string }
        | null;

      if (!response.ok || !payload || !("event" in payload)) {
        const errorMessage =
          payload && "error" in payload && payload.error
            ? payload.error
            : "Audit failed.";

        setCopiedExportActionId(null);
        setExportCopyState({
          actionId,
          kind: "audit_failed",
          message: errorMessage,
        });
        return;
      }

      setCopiedExportActionId(actionId);
      setExportCopyState({
        actionId,
        kind: "copied_and_audited",
        message: "Copied and audited.",
      });
      setExportEvents((current) => [
        payload.event,
        ...current.filter((event) => event.id !== payload.event.id),
      ]);
    } catch {
      setCopiedExportActionId(null);
      setExportCopyState({
        actionId,
        kind: "audit_failed",
        message: "Copied locally, but audit failed.",
      });
    }
  }

  return (
    <div className="space-y-6">
      <ExportAnalyticsSummaryPanel summary={exportAnalyticsSummary} />

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

          <div className="mt-5 space-y-3 rounded-xl border border-white/10 bg-white/5 p-3">
            <FilterGroup
              label="Platform"
              options={[
                { label: "All", value: "all" },
                { label: "TikTok", value: "tiktok" },
                { label: "YouTube Shorts", value: "youtube_shorts" },
              ]}
              value={exportPlatformFilter}
              onChange={(value) =>
                setExportPlatformFilter(
                  value as RepurposingExportTargetPlatform | "all",
                )
              }
            />
            <FilterGroup
              label="Export status"
              options={[
                { label: "All", value: "all" },
                { label: "Exported", value: "exported" },
                { label: "Not exported", value: "not_exported" },
              ]}
              value={exportStatusFilter}
              onChange={(value) =>
                setExportStatusFilter(
                  value as "all" | "exported" | "not_exported",
                )
              }
            />
            <FilterGroup
              label="Period"
              options={[
                { label: "All time", value: "all" },
                { label: "Last 7 days", value: "last_7_days" },
                { label: "Last 30 days", value: "last_30_days" },
              ]}
              value={exportPeriodFilter}
              onChange={(value) =>
                setExportPeriodFilter(
                  value as "all" | "last_7_days" | "last_30_days",
                )
              }
            />
          </div>

          <div className="mt-5 space-y-3">
            {filteredJobs.length === 0 ? (
              <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-slate-400">
                {getEmptyStateMessage(filter, jobs.length)}
              </div>
            ) : (
              filteredJobs.map((job) => {
                const summary = getRepurposingJobSummary(job);
                const jobExportHistory = exportHistoryByJobId.get(job.id) ?? [];
                const hasExportHistory = jobExportHistory.length > 0;
                const approvedWithoutExport =
                  summary.reviewStatus === "approved" && !hasExportHistory;

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
                      <MetaPill
                        label="Provider"
                        value={summary.sourceProvider}
                      />
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
                      <MetaPill
                        label="Export"
                        value={
                          hasExportHistory
                            ? "Exported"
                            : approvedWithoutExport
                              ? "Approved but not exported"
                              : "Not exported"
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

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <SummaryMetric
                    label="Review status"
                    value={formatReviewDecisionSummary(
                      selectedSummary?.reviewStatus,
                    )}
                  />
                  <SummaryMetric
                    label="Job status"
                    value={statusMeta[selectedJob.status].label}
                  />
                  <SummaryMetric
                    label="manual_review_required"
                    value={
                      selectedSummary?.manualReviewRequired
                        ? "Required"
                        : "Not required"
                    }
                  />
                  <SummaryMetric
                    label="Export eligibility"
                    value={
                      selectedExportBundle
                        ? selectedExportBundle.eligible
                          ? "Eligible"
                          : "Not eligible"
                        : "Not available"
                    }
                  />
                  <SummaryMetric
                    label="Target platforms"
                    value={formatArrayValue(selectedTargetPlatforms)}
                  />
                  <SummaryMetric
                    label="Latest export"
                    value={
                      latestExportAt
                        ? formatUpdatedAt(latestExportAt)
                        : "No exports yet"
                    }
                  />
                  <SummaryMetric
                    label="Confidence"
                    value={selectedSummary?.confidence ?? "Not available"}
                  />
                  <SummaryMetric
                    label="Warnings"
                    value={
                      selectedWarnings.length > 0
                        ? `${selectedWarnings.length} warning${selectedWarnings.length === 1 ? "" : "s"}`
                        : "None"
                    }
                  />
                </div>
              </header>

              <section className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4">
                <SectionHeading
                  description="A job-level snapshot answers when it last exported, how often it exported, and which platform/template combination was used most recently."
                  label="Export snapshot"
                  title="Job-level export activity"
                />

                {selectedExportActivity ? (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <SummaryMetric
                      label="Export count"
                      value={selectedExportActivity.exportCount.toString()}
                    />
                    <SummaryMetric
                      label="Latest export"
                      value={formatUpdatedAt(
                        selectedExportActivity.latestExportAt,
                      )}
                    />
                    <SummaryMetric
                      label="Latest platform"
                      value={getRepurposingExportTargetPlatformLabel(
                        selectedExportActivity.latestTargetPlatform,
                      )}
                    />
                    <SummaryMetric
                      label="Latest template"
                      value={getRepurposingExportTemplateLabel(
                        selectedExportActivity.latestTemplateKey,
                      )}
                    />
                    <SummaryMetric
                      label="Latest actor"
                      value={selectedExportActivity.actorLabel}
                    />
                    <SummaryMetric
                      label="Latest review status"
                      value={formatReviewDecisionSummary(
                        selectedExportActivity.reviewStatusAtLatestExport,
                      )}
                    />
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-white/10 bg-white/5 p-4 text-sm text-slate-400">
                    This job has not been exported yet.
                  </div>
                )}
              </section>

              <section className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4">
                <SectionHeading
                  description="Review metadata, source fields, and result content stay in one place so the operator can judge the brief before touching export copy."
                  label="Review content"
                  title="Structured brief and result snapshot"
                />

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <DetailPanel
                    label="Title suggestions"
                    value={readTextArray(
                      selectedJob.result,
                      "title_suggestions",
                    )}
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
                    value={readNestedTextArray(
                      selectedJob.result,
                      "hashtag_sets",
                    )}
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
                </div>
              </section>

              <section className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4">
                <SectionHeading
                  description="A review decision updates the persisted audit trail only. It never starts publishing, worker execution, or AI processing."
                  label="Review decision"
                  title="Approve, reject, or request changes"
                />

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <form
                    action={reviewAction}
                    className="rounded-xl border border-white/10 bg-surface-900/75 p-4"
                    key={selectedJob.id}
                  >
                    <input name="jobId" type="hidden" value={selectedJob.id} />

                    <label className="block">
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
                        <ReviewDecisionButton
                          decision={decision}
                          key={decision}
                        />
                      ))}
                    </div>

                    <p className="mt-3 text-xs leading-5 text-slate-400">
                      Review decisions are stored server-side with an
                      append-only audit trail. There is no publishing, file
                      export, worker dispatch, or AI execution from this
                      surface.
                    </p>
                  </form>

                  <section className="rounded-xl border border-white/10 bg-surface-900/75 p-4">
                    <div className="flex items-start gap-3">
                      <span className="rounded-lg border border-signal-green/20 bg-signal-green/10 p-2 text-signal-green">
                        <MessageSquareMore
                          className="h-4 w-4"
                          aria-hidden="true"
                        />
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
                            className="rounded-xl border border-white/10 bg-white/5 p-4"
                            key={event.id}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span
                                className={`inline-flex min-h-8 items-center gap-2 rounded-lg border px-2.5 py-1 text-xs font-semibold ${getRepurposingReviewDecisionClassName(
                                  event.review_status,
                                )}`}
                              >
                                {formatReviewDecisionSummary(
                                  event.review_status,
                                )}
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
                </div>
              </section>

              <section className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4">
                <SectionHeading
                  description="Copying stays local and audit-only. The bundle and platform templates are separate from export history, and neither path publishes anything."
                  label="Export templates"
                  title="Local copy bundle and platform-specific templates"
                />

                <div className="grid gap-4 xl:grid-cols-2">
                  <ExportBundleSection
                    actionId={buildExportActionId(selectedJob.id, "bundle")}
                    bundle={selectedExportBundle}
                    copyState={exportCopyState}
                    copiedActionId={copiedExportActionId}
                    onCopy={() =>
                      void copyExportOption(
                        {
                          body: selectedExportBundle?.bundleText ?? "",
                          eventType: "copy_bundle",
                          targetPlatform:
                            (selectedExportBundle?.targetPlatform ??
                              "tiktok") as RepurposingExportTargetPlatform,
                          templateKey: "bundle",
                          title: "Approved export bundle",
                        },
                        selectedExportBundle?.bundleText ?? "",
                      )
                    }
                    onSelectionChange={setExportSelection}
                    selection={exportSelection}
                  />

                  <ExportTemplatesSection
                    actionIdPrefix={selectedJob.id}
                    copyState={exportCopyState}
                    copiedActionId={copiedExportActionId}
                    onCopy={(template) =>
                      void copyExportOption(
                        {
                          body: template.body,
                          eventType: "copy_template",
                          targetPlatform: template.targetPlatform,
                          templateKey: template.templateKey,
                          title: template.title,
                        },
                        template.body,
                      )
                    }
                    templates={selectedExportTemplates}
                  />
                </div>
              </section>

              <ExportAuditHistorySection events={selectedExportHistory} />

              <section className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4">
                <SectionHeading
                  description="Sanitized raw values are collapsed and kept below the structured review flow so operators can inspect them only when needed."
                  label="Raw / Debug"
                  title="Secondary payload inspection"
                />

                <div className="grid gap-4 xl:grid-cols-2">
                  <RawPanel
                    label="Open sanitized raw payload"
                    value={formatSanitizedJsonBlock(selectedJob.payload)}
                  />
                  <RawPanel
                    label="Open sanitized raw result"
                    value={formatSanitizedJsonBlock(selectedJob.result)}
                  />
                </div>
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
    </div>
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
      <span className="truncate" title={value}>
        {value}
      </span>
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
      aria-label={`Set review status to ${label}`}
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

function SectionHeading({
  description,
  label,
  title,
}: {
  description: string;
  label: string;
  title: string;
}) {
  return (
    <div className="flex flex-wrap items-start gap-3">
      <span className="rounded-lg border border-signal-green/20 bg-signal-green/10 p-2 text-signal-green">
        <MessageSquareMore className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
          {label}
        </p>
        <h3 className="mt-1 text-lg font-semibold text-white">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
      </div>
    </div>
  );
}

function ExportAnalyticsSummaryPanel({
  summary,
}: {
  summary: RepurposingExportAnalyticsSummary;
}) {
  return (
    <section className="card">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-lg border border-signal-green/20 bg-signal-green/10 p-2 text-signal-green">
          <MessageSquareMore className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
            Lightweight analytics
          </p>
          <h2 className="mt-1 text-lg font-semibold text-white">
            Workspace export activity summary
          </h2>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <SummaryMetric
          label="Total exports"
          value={summary.totalExports.toString()}
        />
        <SummaryMetric
          label="Latest export"
          value={
            summary.latestExportAt
              ? formatUpdatedAt(summary.latestExportAt)
              : "No exports yet"
          }
        />
        <SummaryMetric
          label="Top platform"
          value={
            summary.topPlatform
              ? getRepurposingExportTargetPlatformLabel(summary.topPlatform)
              : "Not available"
          }
        />
        <SummaryMetric
          label="Top template"
          value={
            summary.topTemplate
              ? getRepurposingExportTemplateLabel(summary.topTemplate)
              : "Not available"
          }
        />
        <SummaryMetric
          label="Approved but not exported"
          value={summary.approvedJobsWithoutExport.toString()}
        />
        <SummaryMetric
          label="Last 7 days"
          value={summary.exportsLast7Days.toString()}
        />
        <SummaryMetric
          label="Last 30 days"
          value={summary.exportsLast30Days.toString()}
        />
      </div>

      <div className="mt-5 grid gap-3 xl:grid-cols-3">
        <SummaryBreakdown
          label="By platform"
          items={[
            {
              label: "TikTok",
              value: summary.exportsByPlatform.tiktok,
            },
            {
              label: "YouTube Shorts",
              value: summary.exportsByPlatform.youtube_shorts,
            },
          ]}
        />
        <SummaryBreakdown
          label="By template"
          items={[
            { label: "Bundle", value: summary.exportsByTemplate.bundle },
            {
              label: "TikTok template",
              value: summary.exportsByTemplate.tiktok,
            },
            {
              label: "YouTube Shorts template",
              value: summary.exportsByTemplate.youtube_shorts,
            },
          ]}
        />
        <SummaryBreakdown
          label="By event type"
          items={[
            {
              label: "Bundle copy",
              value: summary.exportsByEventType.copy_bundle,
            },
            {
              label: "Platform template copy",
              value: summary.exportsByEventType.copy_template,
            },
          ]}
        />
      </div>

      <div className="mt-5 rounded-lg border border-white/10 bg-white/5 p-4">
        <div className="flex items-start gap-3">
          <span className="rounded-lg border border-signal-green/20 bg-signal-green/10 p-2 text-signal-green">
            <MessageSquareMore className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
              Recent export jobs
            </p>
            <h3 className="mt-1 text-lg font-semibold text-white">
              Latest jobs exported in this workspace
            </h3>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {summary.recentExportedJobs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/10 bg-surface-900/70 p-4 text-sm text-slate-400">
              No export activity yet.
            </div>
          ) : (
            summary.recentExportedJobs.map((job) => (
              <article
                className="rounded-xl border border-white/10 bg-surface-900/75 p-4"
                key={job.contentJobId}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">
                      {job.jobTitle}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {job.exportCount} export
                      {job.exportCount === 1 ? "" : "s"} •{" "}
                      {formatUpdatedAt(job.latestExportAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex min-h-8 items-center rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-slate-200">
                      {getRepurposingExportTargetPlatformLabel(
                        job.latestTargetPlatform,
                      )}
                    </span>
                    <span className="inline-flex min-h-8 items-center rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-slate-200">
                      {getRepurposingExportTemplateLabel(job.latestTemplateKey)}
                    </span>
                    <span className="inline-flex min-h-8 items-center rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-slate-200">
                      {formatReviewDecisionSummary(
                        job.reviewStatusAtLatestExport,
                      )}
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <span>{job.actorLabel}</span>
                  <span>•</span>
                  <span>Latest export</span>
                </div>

                {job.metadataSummary ? (
                  <p className="mt-2 text-xs leading-5 text-slate-400">
                    {job.metadataSummary}
                  </p>
                ) : null}
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function SummaryBreakdown({
  items,
  label,
}: {
  items: Array<{ label: string; value: number }>;
  label: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
        {label}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((item) => (
          <span
            className="inline-flex min-h-8 items-center rounded-lg border border-white/10 bg-surface-900/70 px-2.5 py-1 text-xs font-semibold text-slate-200"
            key={item.label}
          >
            {item.label}: {item.value}
          </span>
        ))}
      </div>
    </div>
  );
}

function FilterGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ label: string; value: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
        {label}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            aria-pressed={value === option.value}
            className={
              value === option.value
                ? "btn-primary min-h-8 px-3 py-1.5 text-xs"
                : "btn-ghost min-h-8 px-3 py-1.5 text-xs"
            }
            key={option.value}
            onClick={() => onChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ExportBundleSection({
  actionId,
  bundle,
  copyState,
  copiedActionId,
  onCopy,
  onSelectionChange,
  selection,
}: {
  actionId: string;
  bundle: ReturnType<typeof getRepurposingExportBundleDetails> | null;
  copyState: {
    actionId: string | null;
    kind: "idle" | "copied_and_audited" | "copy_failed" | "audit_failed";
    message: string | null;
  };
  copiedActionId: string | null;
  onCopy: () => void;
  onSelectionChange: React.Dispatch<
    React.SetStateAction<RepurposingExportSelection>
  >;
  selection: RepurposingExportSelection;
}) {
  if (!bundle) {
    return null;
  }

  const isEligible = bundle.eligible;
  const buttonLabel =
    copiedActionId === actionId ? "Copied" : "Copy local bundle";
  const statusTone =
    copyState.kind === "copy_failed"
      ? "border-signal-red/30 bg-signal-red/10 text-signal-red"
      : copyState.kind === "audit_failed"
        ? "border-amber-300/30 bg-amber-300/10 text-amber-100"
        : "border-signal-green/30 bg-signal-green/10 text-signal-green";

  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-start gap-3">
        <span className="rounded-lg border border-signal-green/20 bg-signal-green/10 p-2 text-signal-green">
          <ClipboardCopy className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
            Approved export bundle
          </p>
          <h3 className="mt-1 text-lg font-semibold text-white">
            Sanitized local copy for manual reuse
          </h3>
        </div>
      </div>

      <p className="mt-3 text-sm leading-6 text-slate-400">
        Only approved repurposing jobs can copy a sanitized bundle locally. This
        stays inside the clipboard and does not trigger publishing,
        cross-posting, clip export, rendering, or worker execution.
      </p>

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        <ExportSelectField
          label="Target platform"
          options={bundle.targetPlatforms}
          value={selection.targetPlatformIndex}
          onChange={(value) =>
            onSelectionChange((current) => ({
              ...current,
              targetPlatformIndex: value,
            }))
          }
          placeholder="Not available"
        />
        <ExportSelectField
          label="Title suggestion"
          options={bundle.titleSuggestions}
          value={selection.titleSuggestionIndex}
          onChange={(value) =>
            onSelectionChange((current) => ({
              ...current,
              titleSuggestionIndex: value,
            }))
          }
          placeholder="Not available"
        />
        <ExportSelectField
          label="Caption"
          options={bundle.captionSuggestions}
          value={selection.captionIndex}
          onChange={(value) =>
            onSelectionChange((current) => ({
              ...current,
              captionIndex: value,
            }))
          }
          placeholder="Not available"
        />
        <ExportSelectField
          label="Description"
          options={bundle.descriptionSuggestions}
          value={selection.descriptionIndex}
          onChange={(value) =>
            onSelectionChange((current) => ({
              ...current,
              descriptionIndex: value,
            }))
          }
          placeholder="Not available"
        />
        <ExportSelectField
          label="Hook"
          options={bundle.hookIdeas}
          value={selection.hookIdeaIndex}
          onChange={(value) =>
            onSelectionChange((current) => ({
              ...current,
              hookIdeaIndex: value,
            }))
          }
          placeholder="Not available"
        />
        <ExportSelectField
          label="Hashtag set"
          options={bundle.hashtagSets.map((set) => set.join(" "))}
          value={selection.hashtagSetIndex}
          onChange={(value) =>
            onSelectionChange((current) => ({
              ...current,
              hashtagSetIndex: value,
            }))
          }
          placeholder="Not available"
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          className="btn-primary min-h-10 gap-2 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!isEligible || !bundle.bundleText || !bundle.targetPlatform}
          aria-label="Copy local export bundle"
          onClick={onCopy}
          type="button"
        >
          <ClipboardCopy className="h-4 w-4" aria-hidden="true" />
          {isEligible ? buttonLabel : "Copy local bundle"}
        </button>
        <span className="text-xs leading-5 text-slate-400">
          Local clipboard only. Not published. No platform API write.
        </span>
      </div>

      {copyState.actionId === actionId && copyState.message ? (
        <div
          className={`mt-3 rounded-lg border px-3 py-2 text-xs font-medium ${statusTone}`}
          aria-live="polite"
          role="status"
        >
          {copyState.message}
        </div>
      ) : null}

      <div className="mt-4 rounded-lg border border-white/10 bg-surface-900/70 p-4 text-sm text-slate-300">
        {isEligible ? (
          <p>{bundle.reason ?? "Approved export bundle is ready."}</p>
        ) : (
          <p>{bundle.reason ?? "Export becomes available after approval."}</p>
        )}
      </div>

      <details className="mt-4 rounded-lg border border-white/10 bg-surface-900/75 p-4">
        <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
          Bundle preview
        </summary>
        <pre className="mt-3 whitespace-pre-wrap break-words text-xs leading-6 text-slate-200">
          {bundle.bundleText || "Bundle not available yet."}
        </pre>
      </details>

      <details className="mt-3 rounded-lg border border-white/10 bg-surface-900/75 p-4">
        <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
          Structured preview
        </summary>
        <pre className="mt-3 whitespace-pre-wrap break-words text-xs leading-6 text-slate-200">
          {formatSanitizedJsonBlock(bundle)}
        </pre>
      </details>
    </section>
  );
}

function ExportTemplatesSection({
  actionIdPrefix,
  copyState,
  copiedActionId,
  onCopy,
  templates,
}: {
  actionIdPrefix: string;
  copyState: {
    actionId: string | null;
    kind: "idle" | "copied_and_audited" | "copy_failed" | "audit_failed";
    message: string | null;
  };
  copiedActionId: string | null;
  onCopy: (template: RepurposingExportTemplateDetails) => void;
  templates: RepurposingExportTemplateDetails[];
}) {
  if (templates.length === 0) {
    return null;
  }

  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-start gap-3">
        <span className="rounded-lg border border-signal-green/20 bg-signal-green/10 p-2 text-signal-green">
          <ClipboardCopy className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
            Platform templates
          </p>
          <h3 className="mt-1 text-lg font-semibold text-white">
            Copy-friendly per-platform templates
          </h3>
        </div>
      </div>

      <p className="mt-3 text-sm leading-6 text-slate-400">
        Templates are ordered by the job&apos;s target platforms and reuse the
        approved result without publishing, worker execution, or platform
        writes. The copy action stays local.
      </p>

      <div className="mt-4 grid gap-3">
        {templates.map((template) => {
          const actionId = buildExportActionId(
            actionIdPrefix,
            template.templateKey,
          );
          const isCopied = copiedActionId === actionId;

          return (
            <article
              className="rounded-xl border border-white/10 bg-surface-900/75 p-4"
              key={template.templateKey}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
                    {template.title}
                  </p>
                  <h4 className="mt-1 text-base font-semibold text-white">
                    {getRepurposingExportTargetPlatformLabel(
                      template.targetPlatform,
                    )}
                  </h4>
                </div>

                <button
                  className="btn-primary min-h-9 gap-2 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!template.eligible || !template.body}
                  aria-label={`Copy local template for ${getRepurposingExportTargetPlatformLabel(
                    template.targetPlatform,
                  )}`}
                  onClick={() => onCopy(template)}
                  type="button"
                >
                  <ClipboardCopy className="h-4 w-4" aria-hidden="true" />
                  {isCopied ? "Copied" : "Copy local template"}
                </button>
              </div>

              <p className="mt-2 text-sm leading-6 text-slate-400">
                {template.reason ??
                  "Only approved repurposing jobs can be copied."}
              </p>

              {copyState.actionId === actionId && copyState.message ? (
                <div
                  className={`mt-3 rounded-lg border px-3 py-2 text-xs font-medium ${
                    copyState.kind === "copy_failed"
                      ? "border-signal-red/30 bg-signal-red/10 text-signal-red"
                      : copyState.kind === "audit_failed"
                        ? "border-amber-300/30 bg-amber-300/10 text-amber-100"
                        : "border-signal-green/30 bg-signal-green/10 text-signal-green"
                  }`}
                  aria-live="polite"
                  role="status"
                >
                  {copyState.message}
                </div>
              ) : null}

              <details className="mt-4 rounded-lg border border-white/10 bg-white/5 p-3">
                <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
                  Template preview
                </summary>
                <pre className="mt-3 whitespace-pre-wrap break-words text-xs leading-6 text-slate-200">
                  {template.body || "Template not available yet."}
                </pre>
              </details>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ExportAuditHistorySection({
  events,
}: {
  events: RepurposingExportHistoryEntry[];
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-start gap-3">
        <span className="rounded-lg border border-signal-green/20 bg-signal-green/10 p-2 text-signal-green">
          <MessageSquareMore className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
            Export history
          </p>
          <h3 className="mt-1 text-lg font-semibold text-white">
            Recent export events
          </h3>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {events.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/10 bg-white/5 p-4 text-sm text-slate-400">
            No export history yet.
          </div>
        ) : (
          events.map((event) => (
            <article
              className="rounded-xl border border-white/10 bg-surface-900/75 p-4"
              key={`${event.contentJobId}:${event.createdAt}:${event.templateKey}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex min-h-8 items-center rounded-lg border border-signal-green/30 bg-signal-green/10 px-2.5 py-1 text-xs font-semibold text-signal-green">
                  {getRepurposingExportEventLabel(event.eventType)}
                </span>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <span>{event.actorLabel}</span>
                  <span>•</span>
                  <time
                    className="text-xs text-slate-400"
                    dateTime={event.createdAt}
                  >
                    {formatUpdatedAt(event.createdAt)}
                  </time>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <MetaPill
                  label="Platform"
                  value={getRepurposingExportTargetPlatformLabel(
                    event.targetPlatform,
                  )}
                />
                <MetaPill
                  label="Template"
                  value={getRepurposingExportTemplateLabel(event.templateKey)}
                />
                <MetaPill
                  label="Review"
                  value={formatReviewDecisionSummary(
                    event.reviewStatusAtExport,
                  )}
                />
              </div>

              <dl className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-2">
                <ReviewTrailDefinition label="Actor" value={event.actorLabel} />
                <ReviewTrailDefinition
                  label="Bundle hash"
                  value={
                    event.bundleHash
                      ? `${event.bundleHash.slice(0, 12)}...`
                      : "Not available"
                  }
                />
                <ReviewTrailDefinition label="Source" value={event.source} />
                <ReviewTrailDefinition
                  label="Metadata summary"
                  value={event.metadataSummary ?? "Not available"}
                />
              </dl>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function ExportSelectField({
  label,
  options,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  placeholder: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const hasMultipleOptions = options.length > 1;
  const selectedValue =
    options.length > 0 ? options[Math.min(value, options.length - 1)] : null;

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
        {label}
      </p>
      {hasMultipleOptions ? (
        <select
          className="mt-2 w-full rounded-lg border border-white/10 bg-surface-900/80 px-3 py-2 text-sm text-white outline-none transition focus:border-signal-green/40"
          aria-label={label}
          onChange={(event) => onChange(Number(event.target.value))}
          value={options.length > 0 ? Math.min(value, options.length - 1) : 0}
        >
          {options.map((option, index) => (
            <option key={`${label}-${index}`} value={index}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <p className="mt-2 text-sm leading-6 text-slate-200">
          {selectedValue ?? placeholder}
        </p>
      )}
      {!hasMultipleOptions ? (
        <p className="mt-2 text-xs leading-5 text-slate-400">{placeholder}</p>
      ) : null}
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

function groupExportHistoryEntriesByJobId(
  entries: RepurposingExportHistoryEntry[],
): Map<string, RepurposingExportHistoryEntry[]> {
  const grouped = new Map<string, RepurposingExportHistoryEntry[]>();

  for (const entry of entries) {
    const currentEntries = grouped.get(entry.contentJobId) ?? [];
    currentEntries.push(entry);
    grouped.set(entry.contentJobId, currentEntries);
  }

  return grouped;
}

function matchesExportFilters(
  job: ContentJobRow,
  exportHistoryByJobId: Map<string, RepurposingExportHistoryEntry[]>,
  platformFilter: RepurposingExportTargetPlatform | "all",
  statusFilter: "all" | "exported" | "not_exported",
  periodFilter: "all" | "last_7_days" | "last_30_days",
): boolean {
  const history = exportHistoryByJobId.get(job.id) ?? [];
  const hasExportHistory = history.length > 0;

  if (
    platformFilter !== "all" &&
    !history.some((entry) => entry.targetPlatform === platformFilter)
  ) {
    return false;
  }

  if (statusFilter === "exported" && !hasExportHistory) {
    return false;
  }

  if (statusFilter === "not_exported" && hasExportHistory) {
    return false;
  }

  if (periodFilter === "all") {
    return true;
  }

  const referenceAt = hasExportHistory ? history[0]?.createdAt : job.updated_at;
  if (!referenceAt) {
    return false;
  }

  const referenceTime = new Date(referenceAt).getTime();
  const now = Date.now();
  const threshold =
    periodFilter === "last_7_days"
      ? now - 7 * 24 * 60 * 60 * 1000
      : now - 30 * 24 * 60 * 60 * 1000;

  return referenceTime >= threshold;
}

function buildExportActionId(
  jobId: string,
  templateKey: RepurposingExportTemplateKey,
): string {
  return `${jobId}:${templateKey}`;
}
