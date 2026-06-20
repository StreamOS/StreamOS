import React from "react";
import Link from "next/link";
import { ArrowUpRight, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  formatPublicationTimestamp,
  type PublicationStatusTone,
} from "./PublicationStatusConsole.utils";
import {
  getCrosspostingParentStatusMeta,
  getCrosspostingTargetStatusMeta,
  type CrosspostingSummaryDashboardModel,
  type CrosspostingSummaryFanoutItem,
  type CrosspostingSummaryTargetItem,
  type CrosspostingStatusTone,
} from "./CrosspostingSummaryConsole.utils";

type CrosspostingSummaryConsoleProps = {
  model: CrosspostingSummaryDashboardModel;
};

export function CrosspostingSummaryConsole({
  model,
}: CrosspostingSummaryConsoleProps) {
  const selectedFanout = model.selectedFanout;

  return (
    <div className="space-y-6">
      <header className="grid gap-6 rounded-lg border border-white/10 bg-surface-900/85 p-6 shadow-[0_22px_70px_rgba(0,0,0,0.42)] xl:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-signal-green">
            Crossposting
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-normal text-white md:text-5xl">
            Crossposting summary for approved repurposing jobs
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-400">
            Diese Ansicht bleibt read-only. Sie zeigt nur serverseitig
            gespeicherte Parent-Fanouts, sichere Child-Links und tenant-scoped
            Zielzustände. Browser-Code startet keine Provider-Write- oder
            Automation-Calls.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/dashboard/publications" className="btn-primary">
              Publication history
            </Link>
            <Link href="/dashboard/jobs/repurposing" className="btn-ghost">
              Repurposing review
            </Link>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <SummaryTile
            helper="Server-side parent snapshots"
            label="Parent fanouts"
            value={model.summary.fanoutCount}
          />
          <SummaryTile
            helper="All prepared child targets"
            label="Targets"
            value={model.summary.targetCount}
          />
          <SummaryTile
            helper="Live child publications"
            label="Published"
            value={model.summary.publishedCount}
          />
          <SummaryTile
            helper="Re-auth or manual follow-up"
            label="Requires action"
            value={model.summary.requiresActionCount}
          />
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        <MetricCard
          label="Latest activity"
          tone="violet"
          value={formatPublicationTimestamp(model.summary.latestActivityAt)}
        />
        <MetricCard
          label="Processing"
          tone="amber"
          value={String(model.summary.processingCount)}
        />
        <MetricCard
          label="Failed"
          tone="rose"
          value={String(model.summary.failedCount)}
        />
        <MetricCard
          label="Blocked"
          tone="slate"
          value={String(model.summary.blockedCount)}
        />
      </section>

      {model.items.length === 0 ? (
        <EmptyFanoutState />
      ) : (
        <section className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="card space-y-4 xl:sticky xl:top-6">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
                Parent fanouts
              </p>
              <h2 className="mt-1 text-lg font-semibold text-white">
                Select a parent fanout
              </h2>
            </div>
            <div className="space-y-3">
              {model.items.map((fanout) => (
                <FanoutListItem
                  key={fanout.id}
                  fanout={fanout}
                  selected={fanout.id === model.selectedFanoutId}
                />
              ))}
            </div>
          </aside>

          {selectedFanout ? (
            <CrosspostingFanoutDetail fanout={selectedFanout} />
          ) : (
            <EmptyDetailState />
          )}
        </section>
      )}
    </div>
  );
}

function CrosspostingFanoutDetail({
  fanout,
}: {
  fanout: CrosspostingSummaryFanoutItem;
}) {
  const statusMeta = getCrosspostingParentStatusMeta(fanout.status);

  return (
    <div className="space-y-6">
      <section className="card">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-signal-green">
              Selected parent fanout
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              {fanout.sourceTitle}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              {fanout.sourceContentLabel} · Approved snapshot prepared by the
              gateway and summarized without exposing payloads, tokens, or queue
              internals.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill label={fanout.statusLabel} tone={fanout.statusTone} />
            <StatusPill
              label={`Policy ${formatFanoutPolicyLabel(fanout.fanoutPolicy)}`}
              tone="slate"
            />
            <StatusPill label={`Targets ${fanout.targetCount}`} tone="slate" />
            <StatusPill
              label={`Published ${fanout.publishedCount}`}
              tone="emerald"
            />
            <StatusPill label={`Blocked ${fanout.blockedCount}`} tone="rose" />
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <DetailStat label="Status" value={fanout.statusLabel} />
          <DetailStat
            label="Policy"
            value={formatFanoutPolicyLabel(fanout.fanoutPolicy)}
          />
          <DetailStat
            label="Overall message"
            value={fanout.overallSafeMessage}
          />
          <DetailStat
            label="Created"
            value={formatPublicationTimestamp(fanout.createdAt)}
          />
          <DetailStat
            label="Updated"
            value={formatPublicationTimestamp(fanout.updatedAt)}
          />
          <DetailStat
            label="Requested"
            value={formatPublicationTimestamp(fanout.requestedAt)}
          />
          <DetailStat
            label="Snapshot hash"
            value={formatCompactId(fanout.snapshotHash)}
          />
          <DetailStat
            label="Intent hash"
            value={formatCompactId(fanout.requestIntentHash)}
          />
          <DetailStat
            label="Non-blocked targets"
            value={String(fanout.selectedTargetCount)}
          />
          <DetailStat label="Queued" value={String(fanout.queuedCount)} />
          <DetailStat
            label="Processing"
            value={String(fanout.processingCount)}
          />
          <DetailStat
            label="Requires action"
            value={String(fanout.requiresActionCount)}
          />
        </div>

        <div className="mt-6 rounded-lg border border-white/10 bg-white/5 p-4">
          <p className="text-sm font-semibold text-white">Summary note</p>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            {statusMeta.description}
          </p>
        </div>
      </section>

      <section className="card">
        <div className="flex items-center gap-3">
          <span className="rounded-lg border border-brand-500/20 bg-brand-500/10 p-2 text-brand-500">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
              Target publications
            </p>
            <h3 className="mt-1 text-lg font-semibold text-white">
              Child publications stay authoritative
            </h3>
          </div>
        </div>

        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
          Each card shows the creator-safe child publication snapshot, the
          current target state, and a link back to the existing child-history
          detail view.
        </p>

        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {fanout.targets.length > 0 ? (
            fanout.targets.map((target) => (
              <FanoutTargetCard
                fanout={fanout}
                key={`${target.targetPlatform}-${target.childPublicationId ?? target.connectionLabel}`}
                target={target}
              />
            ))
          ) : (
            <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-slate-400">
              No child targets were prepared for this fanout yet.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function FanoutTargetCard({
  fanout,
  target,
}: {
  fanout: CrosspostingSummaryFanoutItem;
  target: CrosspostingSummaryTargetItem;
}) {
  const targetStatusMeta = getCrosspostingTargetStatusMeta(target.targetStatus);

  return (
    <article className="rounded-lg border border-white/10 bg-white/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill label={target.providerLabel} tone="slate" />
            <StatusPill
              label={target.targetPlatformLabel}
              tone={target.targetStatusTone}
            />
            <StatusPill
              label={targetStatusMeta.label}
              tone={target.targetStatusTone}
            />
          </div>
          <p className="text-sm font-semibold text-white">
            {target.connectionLabel}
          </p>
          <p className="text-xs text-slate-500">
            {target.connectionStatusLabel} · child history stays on the
            publication detail route
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {target.childHistoryHref ? (
            <Link
              aria-label={`Open child history for ${target.targetPlatformLabel}`}
              className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-surface-900/80 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-brand-500"
              href={target.childHistoryHref}
            >
              Historie ansehen
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          ) : (
            <span className="rounded-full border border-white/10 bg-surface-900/80 px-3 py-1.5 text-xs font-semibold text-slate-500">
              No child history yet
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <InfoRow
          label="Child publication status"
          value={target.childPublicationStatusLabel}
        />
        <InfoRow
          label="Requested visibility"
          value={target.requestedVisibilityLabel}
        />
        <InfoRow
          label="Effective visibility"
          value={target.effectiveVisibilityLabel}
        />
        <InfoRow
          label="Last reconciled"
          value={formatPublicationTimestamp(target.lastReconciledAt)}
        />
        <InfoRow
          label="Last event"
          value={formatPublicationTimestamp(target.lastEventAt)}
        />
        <InfoRow
          label="Remote link"
          value={
            target.remoteUrl ? (
              <a
                className="inline-flex items-center gap-1 font-semibold text-brand-300 transition hover:text-brand-200"
                href={target.remoteUrl}
                rel="noreferrer"
                target="_blank"
              >
                Open remote post
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            ) : (
              "Not available"
            )
          }
        />
        <InfoRow
          label="Re-auth required"
          value={target.reauthRequired ? "Yes" : "No"}
        />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <InfoRow
          label="Manual intervention"
          value={target.manualInterventionRequired ? "Yes" : "No"}
        />
        <InfoRow
          label="Safe error hint"
          value={target.safeErrorHint ?? "None"}
        />
      </div>

      <div className="mt-4 rounded-lg border border-white/10 bg-surface-900/80 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
          Safe child context
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          {target.blockReason
            ? `Blocked target: ${target.blockReason}`
            : target.manualInterventionRequired || target.reauthRequired
              ? "A safe follow-up is available on the child publication detail view."
              : fanout.status === "requires_action"
                ? "This target needs safe reconnect or manual follow-up before it can continue."
                : "No additional action is currently required for this target."}
        </p>
      </div>
    </article>
  );
}

function FanoutListItem({
  fanout,
  selected,
}: {
  fanout: CrosspostingSummaryFanoutItem;
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
      href={`/dashboard/publications/fanouts?fanoutId=${fanout.id}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
            {fanout.sourceContentLabel}
          </p>
          <h3 className="mt-2 truncate text-base font-semibold text-white">
            {fanout.sourceTitle}
          </h3>
        </div>
        <StatusPill label={fanout.statusLabel} tone={fanout.statusTone} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-400">
        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
          Targets: {fanout.targetCount}
        </span>
        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
          Published: {fanout.publishedCount}
        </span>
        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
          Blocked: {fanout.blockedCount}
        </span>
      </div>

      <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-400">
        {fanout.overallSafeMessage}
      </p>
    </Link>
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
    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{helper}</p>
    </div>
  );
}

function MetricCard({
  label,
  tone,
  value,
}: {
  label: string;
  tone: CrosspostingStatusTone;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "rounded-lg border p-2",
            tone === "emerald" &&
              "border-signal-green/20 bg-signal-green/10 text-signal-green",
            tone === "amber" &&
              "border-amber-300/20 bg-amber-300/10 text-amber-200",
            tone === "rose" &&
              "border-signal-red/20 bg-signal-red/10 text-signal-red",
            tone === "slate" && "border-white/10 bg-white/5 text-slate-300",
            tone === "violet" &&
              "border-brand-500/20 bg-brand-500/10 text-brand-500",
          )}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
            {label}
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-white">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm leading-6 text-white">{value}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-surface-900/80 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </p>
      <div className="mt-2 text-sm leading-6 text-white">{value}</div>
    </div>
  );
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: PublicationStatusTone | CrosspostingStatusTone;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold",
        tone === "emerald" &&
          "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
        tone === "amber" &&
          "border-amber-300/30 bg-amber-300/10 text-amber-200",
        tone === "rose" && "border-rose-400/30 bg-rose-400/10 text-rose-300",
        tone === "slate" &&
          "border-slate-500/30 bg-slate-500/10 text-slate-200",
        tone === "violet" &&
          "border-violet-400/30 bg-violet-400/10 text-violet-200",
      )}
    >
      {label}
    </span>
  );
}

function EmptyFanoutState() {
  return (
    <section className="card">
      <div className="flex items-center gap-3">
        <span className="rounded-lg border border-slate-500/20 bg-slate-500/10 p-2 text-slate-200">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
            No crossposting fanouts yet
          </p>
          <h2 className="mt-1 text-lg font-semibold text-white">
            Approved parent fanouts will appear here
          </h2>
        </div>
      </div>
      <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-400">
        This view stays empty until a parent fanout has been created server-side
        from an approved repurposing job. No provider writes happen in the
        browser.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link href="/dashboard/publications" className="btn-primary">
          Back to publications
        </Link>
        <Link href="/dashboard/jobs/repurposing" className="btn-ghost">
          Review jobs
        </Link>
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
          Select a parent fanout to inspect child publications
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          The right-hand detail view stays focused on one fanout at a time so
          status, target visibility, and safe child links remain easy to scan.
        </p>
      </div>
    </section>
  );
}

function formatFanoutPolicyLabel(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatCompactId(value: string): string {
  if (value.length <= 16) {
    return value;
  }

  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}
