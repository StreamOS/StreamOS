import React from "react";
import Link from "next/link";
import {
  ExternalLink,
  History,
  RefreshCw,
  RotateCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { GatewayConnectButton } from "@/app/dashboard/components/GatewayConnectButton";
import {
  markPublicationFinalFailedAction,
  reconcilePublicationAction,
  retryPublicationAction,
} from "@/app/dashboard/publications/actions";
import { cn } from "@/lib/utils/cn";
import {
  formatPublicationDuration,
  formatPublicationTimestamp,
  type PublicationDashboardModel,
  type PublicationDashboardItem,
  type PublicationStatusTone,
} from "./PublicationStatusConsole.utils";

type PublicationStatusConsoleProps = {
  model: PublicationDashboardModel;
};

export function PublicationStatusConsole({
  model,
}: PublicationStatusConsoleProps) {
  const selectedPublication = model.selectedPublication;

  return (
    <div className="space-y-6">
      <header className="grid gap-6 rounded-lg border border-white/10 bg-surface-900/85 p-6 shadow-[0_22px_70px_rgba(0,0,0,0.42)] xl:grid-cols-[minmax(0,1fr)_340px]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-signal-green">
            Publications
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-normal text-white md:text-5xl">
            Publication status fuer approved Repurposing Jobs
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-400">
            Diese Ansicht zeigt den sicheren, tenant-scoped Statusverlauf
            serverseitig gespeicherter Publikationen. Review, Visibility,
            Remote-Link, Reconciliation und History bleiben getrennt sichtbar.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="/dashboard/jobs/repurposing" className="btn-primary">
              Repurposing Review
            </a>
            <a href="/dashboard/content" className="btn-ghost">
              Content Overview
            </a>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <SummaryTile
            label="Publications"
            value={model.summary.total}
            helper="Server-side records"
          />
          <SummaryTile
            label="Published"
            value={model.summary.published}
            helper="Remote links live"
          />
          <SummaryTile
            label="In flight"
            value={model.summary.queued + model.summary.processing}
            helper="Queued + processing"
          />
          <SummaryTile
            label="Needs re-auth"
            value={model.summary.reauthRequired}
            helper="Gateway reconnect"
          />
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        <MetricCard
          label="Latest activity"
          value={formatPublicationTimestamp(model.summary.latestActivityAt)}
          tone="violet"
        />
        <MetricCard
          label="Latest published"
          value={formatPublicationTimestamp(model.summary.latestPublishedAt)}
          tone="emerald"
        />
        <MetricCard
          label="Latest reconciled"
          value={formatPublicationTimestamp(model.summary.latestReconciledAt)}
          tone="amber"
        />
        <MetricCard
          label="Audit events"
          value={String(model.summary.historyEvents)}
          tone="slate"
        />
      </section>

      {model.items.length === 0 ? (
        <EmptyPublicationState />
      ) : (
        <section className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="card space-y-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
                Publication queue
              </p>
              <h2 className="mt-1 text-lg font-semibold text-white">
                Select a publication
              </h2>
            </div>
            <div className="space-y-3">
              {model.items.map((publication) => (
                <PublicationListItem
                  key={publication.id}
                  publication={publication}
                  selected={publication.id === model.selectedPublicationId}
                />
              ))}
            </div>
          </aside>

          {selectedPublication ? (
            <PublicationDetail publication={selectedPublication} />
          ) : (
            <EmptyDetailState />
          )}
        </section>
      )}
    </div>
  );
}

function PublicationListItem({
  publication,
  selected,
}: {
  publication: PublicationDashboardItem;
  selected: boolean;
}) {
  return (
    <Link
      aria-current={selected ? "page" : undefined}
      className={cn(
        "block rounded-lg border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-brand-500",
        selected
          ? "border-brand-500/40 bg-brand-500/10"
          : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10",
      )}
      href={`/dashboard/publications?publicationId=${publication.id}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
            {publication.targetPlatformLabel}
          </p>
          <h3 className="mt-2 truncate text-base font-semibold text-white">
            {publication.publicationStatusLabel}
          </h3>
        </div>
        <StatusPill
          label={publication.deliveryStatusLabel}
          tone={publication.deliveryStatusTone}
        />
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-400">
        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
          Workflow: {publication.workflowStatusLabel}
        </span>
        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
          Review:{" "}
          {publication.reviewSnapshot.currentReviewStatus ?? "Not available"}
        </span>
      </div>
      <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-400">
        {publication.deliveryStatusDescription}
      </p>
    </Link>
  );
}

function PublicationDetail({
  publication,
}: {
  publication: PublicationDashboardItem;
}) {
  const reauthNeeded = publication.deliveryStatus === "re-auth required";

  return (
    <div className="space-y-6">
      <section className="card">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-signal-green">
              Selected publication
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              {publication.targetPlatformLabel} publication status
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Requested visibility and effective visibility stay separated, the
              audit trail remains append-only, and no browser path calls a
              provider write API.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill
              label={publication.deliveryStatusLabel}
              tone={publication.deliveryStatusTone}
            />
            <StatusPill label={publication.workflowStatusLabel} tone="slate" />
            <StatusPill
              label={publication.reviewStatusAtRequest}
              tone="slate"
            />
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <DetailStat
            label="Last reconciled"
            value={formatPublicationTimestamp(publication.lastReconciledAt)}
          />
          <DetailStat
            label="Updated"
            value={formatPublicationDuration(publication.updatedAt)}
          />
          <DetailStat
            label="Review status"
            value={
              publication.reviewSnapshot.currentReviewStatus ?? "Not available"
            }
          />
          <DetailStat
            label="Job status"
            value={formatStatusValue(publication.contentJobStatus)}
          />
          <DetailStat
            label="Manual review required"
            value={publication.manualReviewRequired ? "Yes" : "No"}
          />
          <DetailStat
            label="Target platform"
            value={publication.targetPlatformLabel}
          />
          <DetailStat
            label="Export eligibility"
            value={
              publication.manualActions.nextAction
                ? formatManualActionLabel(publication.manualActions.nextAction)
                : "Blocked"
            }
          />
          <DetailStat
            label="Latest export activity"
            value={formatPublicationTimestamp(
              publication.publishedAt ??
                publication.lastReconciledAt ??
                publication.updatedAt,
            )}
          />
          <DetailStat
            label="Warnings"
            value={
              publication.reviewSnapshot.warnings.length > 0
                ? `${publication.reviewSnapshot.warnings.length} recorded`
                : "None"
            }
          />
          <DetailStat
            label="Confidence"
            value={publication.reviewSnapshot.confidence ?? "Not available"}
          />
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <DetailStat
            label="Provider"
            value={publication.connection.providerLabel}
          />
          <DetailStat
            label="Target channel"
            value={publication.connection.channelDisplayName ?? "Not linked"}
          />
          <DetailStat
            label="Current UI status"
            value={publication.deliveryStatusLabel}
          />
          <DetailStat
            label="Requested visibility"
            value={formatVisibility(publication.desiredVisibility)}
          />
          <DetailStat
            label="Effective visibility"
            value={formatVisibility(publication.effectiveVisibility)}
          />
          <DetailStat
            label="Latest safe error hint"
            value={publication.latestSafeErrorHint ?? "None"}
          />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <article className="card">
            <div className="flex items-center gap-3">
              <span className="rounded-lg border border-signal-green/20 bg-signal-green/10 p-2 text-signal-green">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
                  Review snapshot
                </p>
                <h3 className="mt-1 text-lg font-semibold text-white">
                  Approval state at request time
                </h3>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <InfoRow
                label="Manual review required"
                value={publication.manualReviewRequired ? "Yes" : "No"}
              />
              <InfoRow
                label="Review at request"
                value={publication.reviewStatusAtRequest}
              />
              <InfoRow
                label="Current review"
                value={
                  publication.reviewSnapshot.currentReviewStatus ??
                  "Not available"
                }
              />
              <InfoRow
                label="Confidence"
                value={publication.reviewSnapshot.confidence ?? "Not available"}
              />
              <InfoRow
                label="Reviewed at"
                value={formatPublicationTimestamp(
                  publication.reviewSnapshot.reviewedAt,
                )}
              />
              <InfoRow
                label="Reviewed by"
                value={formatReviewerLabel(
                  publication.reviewSnapshot.reviewedBy,
                )}
              />
              <InfoRow
                label="Reviewer notes"
                value={
                  publication.reviewSnapshot.reviewerNotes ?? "Not available"
                }
              />
            </div>

            <div className="mt-5 rounded-lg border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-semibold text-white">Warnings</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-300">
                {publication.reviewSnapshot.warnings.length > 0 ? (
                  publication.reviewSnapshot.warnings.map((warning, index) => (
                    <li
                      className="rounded-lg border border-white/10 bg-surface-900/80 p-3"
                      key={`${publication.id}-warning-${index}`}
                    >
                      {warning}
                    </li>
                  ))
                ) : (
                  <li className="rounded-lg border border-white/10 bg-surface-900/80 p-3 text-slate-400">
                    No warnings recorded.
                  </li>
                )}
              </ul>
            </div>
          </article>

          <article className="card">
            <div className="flex items-center gap-3">
              <span className="rounded-lg border border-brand-500/20 bg-brand-500/10 p-2 text-brand-500">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
                  Manual intervention
                </p>
                <h3 className="mt-1 text-lg font-semibold text-white">
                  Safe retry controls for approved publications
                </h3>
              </div>
            </div>

            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
              These actions stay server-side, respect tenant isolation, and only
              appear when the gateway says the publication is safe to retry,
              reconcile, or close permanently.
            </p>

            <div className="mt-5 grid gap-4">
              <ManualActionRow
                action={publication.manualActions.actions.retry_publish}
                actionLabel="Retry Publish"
                buttonLabel="Retry publish"
                description="Re-enqueue the frozen publication contract without exposing provider writes in the browser."
                formAction={retryPublicationAction}
                publicationId={publication.id}
                tone="emerald"
              />
              <ManualActionRow
                action={publication.manualActions.actions.reconcile_now}
                actionLabel="Reconcile Now"
                buttonLabel="Reconcile now"
                description="Refresh the remote publication state and append the reconciliation audit trail server-side."
                formAction={reconcilePublicationAction}
                publicationId={publication.id}
                tone="violet"
              />
              <ManualActionRow
                action={publication.manualActions.actions.mark_final_failed}
                actionLabel="Mark Final Failed"
                buttonLabel="Mark final failed"
                description="Close the publication permanently when retrying or reconciling no longer makes sense."
                formAction={markPublicationFinalFailedAction}
                publicationId={publication.id}
                tone="rose"
                confirmFinalFail
              />
            </div>
          </article>

          <article className="card">
            <div className="flex items-center gap-3">
              <span className="rounded-lg border border-brand-500/20 bg-brand-500/10 p-2 text-brand-500">
                <History className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
                  History timeline
                </p>
                <h3 className="mt-1 text-lg font-semibold text-white">
                  Normalized, append-only publication history
                </h3>
              </div>
            </div>

            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
              The timeline is normalized from{" "}
              <code className="rounded bg-surface-950 px-1.5 py-0.5 text-xs text-slate-200">
                content_publication_events
              </code>{" "}
              and keeps creator-facing context, safe error hints, and
              reconciliation updates together without exposing raw secrets or
              worker internals.
            </p>

            <div className="mt-5 space-y-3">
              {publication.history.length > 0 ? (
                publication.history.map((event) => (
                  <article
                    className="rounded-lg border border-white/10 bg-white/5 p-4"
                    key={event.id}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusPill
                            label={event.timelineLabel}
                            tone={event.timelineTone}
                          />
                          {event.isFallback ? (
                            <StatusPill label="Fallback" tone="slate" />
                          ) : null}
                        </div>
                        <p className="text-sm font-semibold text-white">
                          {event.timelineDescription}
                        </p>
                        <p className="text-xs text-slate-500">
                          {event.eventLabel} - {event.actorLabel} -{" "}
                          {event.source}
                        </p>
                      </div>
                      <time className="text-xs text-slate-500">
                        {formatPublicationTimestamp(event.createdAt)}
                      </time>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full border border-white/10 bg-surface-900/80 px-2.5 py-1 text-slate-300">
                        Current: {event.publicationStatus}
                      </span>
                      <span className="rounded-full border border-white/10 bg-surface-900/80 px-2.5 py-1 text-slate-400">
                        Previous: {event.previousPublicationStatus ?? "None"}
                      </span>
                      <span className="rounded-full border border-white/10 bg-surface-900/80 px-2.5 py-1 text-slate-400">
                        Category: {event.timelineCategory.replaceAll("_", " ")}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <InfoRow label="Actor" value={event.actorLabel} />
                      <InfoRow label="Source" value={event.source} />
                      <InfoRow
                        label="Metadata summary"
                        value={event.metadataSummary}
                      />
                      <InfoRow
                        label="Status trail"
                        value={`${event.previousPublicationStatus ?? "None"} -> ${event.publicationStatus}`}
                      />
                    </div>

                    {event.metadata !== "Not available" ? (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-xs font-semibold text-slate-300">
                          Sanitized event metadata
                        </summary>
                        <pre className="mt-3 overflow-x-auto rounded-lg border border-white/10 bg-surface-950 p-4 text-xs leading-6 text-slate-300">
                          {event.metadata}
                        </pre>
                      </details>
                    ) : null}
                  </article>
                ))
              ) : (
                <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-slate-400">
                  No history entries yet.
                </div>
              )}
            </div>
          </article>

          <article className="card">
            <div className="flex items-center gap-3">
              <span className="rounded-lg border border-amber-300/20 bg-amber-300/10 p-2 text-amber-200">
                <ShieldAlert className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
                  Raw / Debug
                </p>
                <h3 className="mt-1 text-lg font-semibold text-white">
                  Secondary, sanitized record view
                </h3>
              </div>
            </div>

            <details className="mt-5 rounded-lg border border-white/10 bg-white/5 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-white">
                Open sanitized publication snapshot
              </summary>
              <pre className="mt-4 overflow-x-auto rounded-lg border border-white/10 bg-surface-950 p-4 text-xs leading-6 text-slate-300">
                {publication.debug.publication}
              </pre>
              {publication.debug.contentJob && (
                <>
                  <p className="mt-5 text-sm font-semibold text-white">
                    Sanitized source job
                  </p>
                  <pre className="mt-3 overflow-x-auto rounded-lg border border-white/10 bg-surface-950 p-4 text-xs leading-6 text-slate-300">
                    {publication.debug.contentJob}
                  </pre>
                </>
              )}
              {publication.debug.connection && (
                <>
                  <p className="mt-5 text-sm font-semibold text-white">
                    Sanitized platform connection
                  </p>
                  <pre className="mt-3 overflow-x-auto rounded-lg border border-white/10 bg-surface-950 p-4 text-xs leading-6 text-slate-300">
                    {publication.debug.connection}
                  </pre>
                </>
              )}
              <p className="mt-5 text-sm font-semibold text-white">
                Sanitized audit events
              </p>
              <pre className="mt-3 overflow-x-auto rounded-lg border border-white/10 bg-surface-950 p-4 text-xs leading-6 text-slate-300">
                {publication.debug.events}
              </pre>
            </details>
          </article>
        </div>

        <aside className="space-y-6">
          <article className="card">
            <div className="flex items-center gap-3">
              <span className="rounded-lg border border-brand-500/20 bg-brand-500/10 p-2 text-brand-500">
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
                  Publication status
                </p>
                <h3 className="mt-1 text-lg font-semibold text-white">
                  Remote state and recovery
                </h3>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <InfoRow
                label="Workflow status"
                value={publication.workflowStatusLabel}
              />
              <InfoRow
                label="Reconciliation"
                value={publication.reconciliationStatusLabel}
              />
              <InfoRow
                label="Remote status"
                value={publication.remoteStatusLabel}
              />
              <InfoRow
                label="Validation code"
                value={publication.validation.code ?? "Not available"}
              />
              <InfoRow
                label="Validation message"
                value={publication.validation.message ?? "Not available"}
              />
              <InfoRow
                label="Remote post id"
                value={formatCompactId(publication.externalPostId)}
              />
              <InfoRow
                label="Remote URL"
                value={publication.externalUrl ?? "Not available"}
              />
              <InfoRow
                label="Published at"
                value={formatPublicationTimestamp(publication.publishedAt)}
              />
            </div>

            <div className="mt-5 rounded-lg border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-semibold text-white">
                Failure summary
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {publication.failure.message ??
                  "No provider failure recorded for this publication."}
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <InfoRow
                  label="Failure code"
                  value={publication.failure.code ?? "Not available"}
                />
                <InfoRow
                  label="Retry budget"
                  value={publication.failure.retryBudget}
                />
                <InfoRow
                  label="Retryable"
                  value={publication.failure.retryable ? "Yes" : "No"}
                />
                <InfoRow
                  label="Next retry"
                  value={formatPublicationTimestamp(
                    publication.failure.retryEta,
                  )}
                />
              </div>
              {reauthNeeded && (
                <div className="mt-4">
                  <GatewayConnectButton
                    className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60"
                    label={`${publication.connection.providerLabel} reconnect`}
                    pendingLabel="Preparing reconnect..."
                    provider={publication.connection.platform}
                  />
                </div>
              )}
              {publication.externalUrl && (
                <a
                  className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-signal-green"
                  href={publication.externalUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open remote post
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </a>
              )}
            </div>
          </article>

          <article className="card">
            <div className="flex items-center gap-3">
              <span className="rounded-lg border border-signal-green/20 bg-signal-green/10 p-2 text-signal-green">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
                  Lightweight analytics
                </p>
                <h3 className="mt-1 text-lg font-semibold text-white">
                  Selected publication health
                </h3>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <InfoRow
                label="Target platform"
                value={publication.targetPlatformLabel}
              />
              <InfoRow
                label="Connection"
                value={`${publication.connection.providerLabel} · ${publication.connection.statusLabel}`}
              />
              <InfoRow
                label="Channel"
                value={
                  publication.connection.channelDisplayName ?? "Not linked"
                }
              />
              <InfoRow
                label="Scopes"
                value={
                  publication.connection.scopes.length > 0
                    ? `${publication.connection.scopes.length} granted`
                    : "Not available"
                }
              />
              <InfoRow
                label="Audit history"
                value={`${publication.history.length} events`}
              />
              <InfoRow
                label="Snapshot hash"
                value={formatCompactId(publication.snapshotHash)}
              />
            </div>
          </article>
        </aside>
      </section>
    </div>
  );
}

function EmptyPublicationState() {
  return (
    <section className="card grid gap-4">
      <div className="flex items-center gap-3">
        <span className="rounded-lg border border-white/10 bg-white/5 p-2 text-slate-300">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
            No publications yet
          </p>
          <h2 className="mt-1 text-lg font-semibold text-white">
            Approved repurposing jobs will appear here
          </h2>
        </div>
      </div>
      <p className="max-w-3xl text-sm leading-6 text-slate-400">
        This view is read-only. When a repurposing job is approved and sent
        through the publish contract, StreamOS will render the publication
        status, remote link, reconciliation state, and the append-only history
        here.
      </p>
      <div className="flex flex-wrap gap-3">
        <a href="/dashboard/jobs/repurposing" className="btn-primary">
          Review jobs
        </a>
        <a href="/dashboard/content" className="btn-ghost">
          Content overview
        </a>
      </div>
    </section>
  );
}

function EmptyDetailState() {
  return (
    <section className="card grid min-h-80 place-items-center text-center">
      <div className="max-w-md">
        <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
          No selection
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-white">
          Select a publication from the queue
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          The right-hand detail view stays focused on one publication at a time
          so review status, visibility, history, and remote state remain easy to
          scan.
        </p>
      </div>
    </section>
  );
}

function SummaryTile({
  helper,
  label,
  value,
}: {
  helper: string;
  label: string;
  value: number;
}) {
  return (
    <article className="rounded-lg border border-white/10 bg-white/5 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
        {label}
      </p>
      <strong className="mt-3 block text-3xl text-white">{value}</strong>
      <p className="mt-2 text-sm text-slate-400">{helper}</p>
    </article>
  );
}

function MetricCard({
  label,
  tone,
  value,
}: {
  label: string;
  tone: PublicationStatusTone;
  value: string;
}) {
  return (
    <article
      className={cn(
        "card",
        tone === "emerald" &&
          "border-signal-green/20 bg-signal-green/10 text-signal-green",
        tone === "amber" &&
          "border-amber-300/20 bg-amber-300/10 text-amber-200",
        tone === "rose" &&
          "border-signal-red/20 bg-signal-red/10 text-signal-red",
        tone === "violet" &&
          "border-brand-500/20 bg-brand-500/10 text-brand-500",
        tone === "slate" && "border-white/10 bg-white/5 text-slate-300",
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-white/70">
        {label}
      </p>
      <strong className="mt-3 block text-xl text-white">{value}</strong>
    </article>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-surface-950/70 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 break-words text-sm text-white">{value}</p>
    </div>
  );
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: PublicationStatusTone;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
        tone === "emerald" &&
          "border-signal-green/30 bg-signal-green/10 text-signal-green",
        tone === "amber" &&
          "border-amber-300/30 bg-amber-300/10 text-amber-200",
        tone === "rose" &&
          "border-signal-red/30 bg-signal-red/10 text-signal-red",
        tone === "violet" &&
          "border-brand-500/30 bg-brand-500/10 text-brand-500",
        tone === "slate" && "border-white/10 bg-white/5 text-slate-300",
      )}
    >
      {label}
    </span>
  );
}

function ManualActionRow({
  action,
  actionLabel,
  buttonLabel,
  confirmFinalFail = false,
  description,
  formAction,
  publicationId,
  tone,
}: {
  action: {
    allowed: boolean;
    blockReason: string | null;
    explanation: string;
  };
  actionLabel: string;
  buttonLabel: string;
  confirmFinalFail?: boolean;
  description: string;
  formAction: (formData: FormData) => void | Promise<void>;
  publicationId: string;
  tone: PublicationStatusTone;
}) {
  const toneClass =
    tone === "emerald"
      ? "border-signal-green/20 bg-signal-green/10 text-signal-green"
      : tone === "rose"
        ? "border-signal-red/20 bg-signal-red/10 text-signal-red"
        : tone === "violet"
          ? "border-brand-500/20 bg-brand-500/10 text-brand-500"
          : "border-white/10 bg-white/5 text-slate-300";

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">{actionLabel}</p>
          <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            {action.allowed
              ? action.explanation
              : `Blocked: ${formatManualActionBlockReason(action.blockReason)}. ${action.explanation}`}
          </p>
        </div>

        <div className="flex flex-col items-start gap-3 lg:items-end">
          <StatusPill
            label={action.allowed ? "Available" : "Blocked"}
            tone={action.allowed ? tone : "slate"}
          />
          {action.allowed ? (
            <form action={formAction} className="flex flex-col gap-2">
              <input name="publicationId" type="hidden" value={publicationId} />
              {confirmFinalFail ? (
                <input name="confirmFinalFail" type="hidden" value="true" />
              ) : null}
              <button
                aria-label={buttonLabel}
                className={cn(
                  "btn-primary inline-flex items-center justify-center gap-2",
                  toneClass,
                )}
                type="submit"
              >
                {tone === "emerald" ? (
                  <RotateCw className="h-4 w-4" aria-hidden="true" />
                ) : tone === "rose" ? (
                  <TriangleAlert className="h-4 w-4" aria-hidden="true" />
                ) : null}
                {buttonLabel}
              </button>
            </form>
          ) : (
            <button
              aria-label={`${buttonLabel} unavailable`}
              className="btn-ghost cursor-not-allowed opacity-60"
              disabled
              type="button"
            >
              {buttonLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function formatVisibility(value: string | null): string {
  if (!value) {
    return "Pending";
  }

  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatCompactId(value: string | null): string {
  if (!value) {
    return "Not available";
  }

  if (value.length <= 16) {
    return value;
  }

  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function formatReviewerLabel(value: string | null): string {
  if (!value) {
    return "Not available";
  }

  return value === "system" ? "System" : formatCompactId(value);
}

function formatStatusValue(value: string | null): string {
  if (!value) {
    return "Not available";
  }

  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatManualActionLabel(
  action: "retry_publish" | "reconcile_now" | "mark_final_failed" | null,
): string {
  switch (action) {
    case "retry_publish":
      return "Retry publish";
    case "reconcile_now":
      return "Reconcile now";
    case "mark_final_failed":
      return "Mark final failed";
    default:
      return "Blocked";
  }
}

function formatManualActionBlockReason(reason: string | null): string {
  if (!reason) {
    return "No blocking reason supplied";
  }

  return reason
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
