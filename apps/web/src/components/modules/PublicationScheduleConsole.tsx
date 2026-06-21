import React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { formatPublicationTimestamp } from "./PublicationStatusConsole.utils";
import {
  getPublicationScheduleFilterLabel,
  type PublicationScheduleStatusTone,
  type PublicationScheduleDashboardModel,
  type PublicationScheduleItem,
  PUBLICATION_SCHEDULE_PERIODS,
  PUBLICATION_SCHEDULE_PROVIDERS,
  PUBLICATION_SCHEDULE_STATUSES,
  PUBLICATION_SCHEDULE_TYPES,
} from "./PublicationScheduleConsole.utils";

type PublicationScheduleConsoleProps = {
  model: PublicationScheduleDashboardModel;
};

export function PublicationScheduleConsole({
  model,
}: PublicationScheduleConsoleProps) {
  const selectedItem = model.selectedItem;
  const hasActiveFilters = hasNonDefaultFilters(model);

  return (
    <div className="space-y-6">
      <header className="grid gap-6 rounded-lg border border-white/10 bg-surface-900/85 p-6 shadow-[0_22px_70px_rgba(0,0,0,0.42)] xl:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-signal-green">
            Scheduling
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-normal text-white md:text-5xl">
            Calendar light for approved publications and parent fanouts
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-400">
            Diese Ansicht bleibt read-only. Sie zeigt nur serverseitig
            gespeicherte Planungseinträge, gruppiert nach Tag und tenant-sicher
            gefiltert. Der Browser startet keine Scheduling-, Publish-, Worker-
            oder Provider-Execution.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/dashboard/publications" className="btn-primary">
              Publication history
            </Link>
            <Link href="/dashboard/publications/fanouts" className="btn-ghost">
              Fanout summary
            </Link>
            <Link
              href="/dashboard/publications/analytics"
              className="btn-ghost"
            >
              Publishing analytics
            </Link>
            <Link href="/dashboard/jobs/repurposing" className="btn-ghost">
              Repurposing review
            </Link>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <SummaryTile
            helper="Read-only schedule entries"
            label="Visible items"
            value={model.summary.totalCount}
          />
          <SummaryTile
            helper="Published history links"
            label="Publications"
            value={model.summary.publicationCount}
          />
          <SummaryTile
            helper="Grouped parent fanouts"
            label="Fanouts"
            value={model.summary.fanoutCount}
          />
          <SummaryTile
            helper="Ready or attention-needed"
            label="Needs attention"
            value={model.summary.attentionCount}
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
          label="Latest scheduled"
          tone="emerald"
          value={formatPublicationTimestamp(model.summary.latestScheduledAt)}
        />
        <MetricCard
          label="Ready"
          tone="emerald"
          value={String(model.summary.readyCount)}
        />
        <MetricCard
          label="Blocked / re-auth"
          tone="amber"
          value={String(
            model.summary.blockedCount + model.summary.reauthRequiredCount,
          )}
        />
      </section>

      <section className="card space-y-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-signal-green">
              Filters
            </p>
            <h2 className="mt-1 text-lg font-semibold text-white">
              Period, type, provider, and schedule status
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Filteren bleibt serverseitig. Die Auswahl verändert nur das
              Read-Model und behält die aktuelle Detailauswahl, solange der
              Eintrag noch sichtbar ist.
            </p>
          </div>
        </div>

        <form
          action="/dashboard/publications/schedule"
          className="grid gap-4 xl:grid-cols-4"
          method="get"
        >
          <input
            name="scheduleItemId"
            type="hidden"
            value={model.selectedItemId ?? ""}
          />

          <FilterField htmlFor="publication-schedule-period" label="Period">
            <select
              aria-label="Publication schedule period"
              className="w-full rounded-lg border border-white/10 bg-surface-900/80 px-3 py-2.5 text-sm text-white outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
              defaultValue={model.filters.period}
              id="publication-schedule-period"
              name="period"
            >
              {PUBLICATION_SCHEDULE_PERIODS.map((period) => (
                <option key={period} value={period}>
                  {getPublicationScheduleFilterLabel(period)}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField htmlFor="publication-schedule-type" label="Type">
            <select
              aria-label="Publication schedule type"
              className="w-full rounded-lg border border-white/10 bg-surface-900/80 px-3 py-2.5 text-sm text-white outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
              defaultValue={model.filters.type}
              id="publication-schedule-type"
              name="type"
            >
              {PUBLICATION_SCHEDULE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {getPublicationScheduleFilterLabel(type)}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField htmlFor="publication-schedule-provider" label="Provider">
            <select
              aria-label="Publication schedule provider"
              className="w-full rounded-lg border border-white/10 bg-surface-900/80 px-3 py-2.5 text-sm text-white outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
              defaultValue={model.filters.provider}
              id="publication-schedule-provider"
              name="provider"
            >
              {PUBLICATION_SCHEDULE_PROVIDERS.map((provider) => (
                <option key={provider} value={provider}>
                  {getPublicationScheduleFilterLabel(provider)}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField htmlFor="publication-schedule-status" label="Status">
            <select
              aria-label="Publication schedule status"
              className="w-full rounded-lg border border-white/10 bg-surface-900/80 px-3 py-2.5 text-sm text-white outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
              defaultValue={model.filters.status}
              id="publication-schedule-status"
              name="status"
            >
              {PUBLICATION_SCHEDULE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {getPublicationScheduleFilterLabel(status)}
                </option>
              ))}
            </select>
          </FilterField>

          <div className="flex flex-wrap gap-3 xl:col-span-4">
            <button className="btn-primary" type="submit">
              Apply filters
            </button>
            <Link href="/dashboard/publications/schedule" className="btn-ghost">
              Reset
            </Link>
          </div>
        </form>
      </section>

      {model.items.length === 0 ? (
        <EmptyScheduleState
          hasActiveFilters={hasActiveFilters}
          sourceCount={model.summary.sourceCount}
        />
      ) : (
        <section className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="card space-y-4 xl:sticky xl:top-6">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
                Calendar light
              </p>
              <h2 className="mt-1 text-lg font-semibold text-white">
                Grouped by day
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Einzelne Einträge sind nach Datum gruppiert, aber weiterhin als
                sichere Read-Model-Links auswählbar.
              </p>
            </div>

            <div className="space-y-4">
              {model.groups.map((group) => (
                <div key={group.dateKey} className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {group.dateLabel}
                      </p>
                      <p className="text-xs uppercase tracking-[0.08em] text-slate-500">
                        {group.itemCount} entries
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {group.items.map((item) => (
                      <ScheduleListItem
                        key={item.id}
                        item={item}
                        selected={item.id === model.selectedItemId}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </aside>

          {selectedItem ? (
            <ScheduleDetail item={selectedItem} />
          ) : (
            <EmptyDetailState />
          )}
        </section>
      )}
    </div>
  );
}

function ScheduleListItem({
  item,
  selected,
}: {
  item: PublicationScheduleItem;
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
      href={item.detailHref}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
            {item.itemTypeLabel}
          </p>
          <h3 className="mt-2 truncate text-base font-semibold text-white">
            {item.safeSourceLabel}
          </h3>
        </div>
        <StatusPill
          label={item.scheduleStatusLabel}
          tone={item.scheduleStatusTone}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-400">
        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
          {item.targetPlatformLabel}
        </span>
        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
          {item.scheduledTimeLabel}
        </span>
        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
          {item.scheduledTimezone}
        </span>
      </div>

      <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-400">
        {item.safeMessage}
      </p>
    </Link>
  );
}

function ScheduleDetail({ item }: { item: PublicationScheduleItem }) {
  return (
    <div className="space-y-6">
      <section className="card">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-signal-green">
              Selected schedule entry
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              {item.safeSourceLabel}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              {item.safeMessage}
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-slate-400">
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                Review: {item.reviewStatusAtRequestLabel}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                Manual review:{" "}
                {item.manualReviewRequiredLabel ?? "Not available"}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                {item.targetPlatformLabel}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                {item.scheduleSourceLabel}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill
              label={item.scheduleStatusLabel}
              tone={item.scheduleStatusTone}
            />
            <StatusPill label={item.itemTypeLabel} tone={item.itemTypeTone} />
            {item.isReauthRequired ? (
              <StatusPill label="Needs re-auth" tone="amber" />
            ) : null}
            {item.isBlocked ? <StatusPill label="Blocked" tone="rose" /> : null}
            {item.isExpired ? (
              <StatusPill label="Expired" tone="amber" />
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <DetailStat
            label="Review status"
            value={item.reviewStatusAtRequestLabel}
          />
          <DetailStat
            label="Manual review required"
            value={item.manualReviewRequiredLabel ?? "Not available"}
          />
          <DetailStat
            label="Schedule source"
            value={item.scheduleSourceLabel}
          />
          <DetailStat
            label="Target platform"
            value={item.targetPlatformLabel}
          />
          <DetailStat
            label="Scheduled creator time"
            value={item.scheduledDateLabel}
          />
          <DetailStat label="Scheduled UTC" value={item.utcLabel} />
          <DetailStat label="Timezone" value={item.scheduledTimezone} />
          <DetailStat
            label="Connection status"
            value={item.connectionStatusLabel ?? "Not available"}
          />
          <DetailStat
            label="Publication status"
            value={item.publicationStatusLabel ?? "Not available"}
          />
          <DetailStat
            label="Fanout status"
            value={item.fanoutStatusLabel ?? "Not available"}
          />
          <DetailStat
            label="Block reason"
            value={item.blockedReasonLabel ?? "None"}
          />
          <DetailStat
            label="Created"
            value={formatPublicationTimestamp(item.createdAt)}
          />
          <DetailStat
            label="Updated"
            value={formatPublicationTimestamp(item.updatedAt)}
          />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="card">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-signal-green">
              Schedule metadata
            </p>
            <h3 className="mt-1 text-lg font-semibold text-white">
              Safe history links and schedule metadata
            </h3>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <InfoRow
              label="Target platform summary"
              value={item.targetPlatformSummary}
            />
            <InfoRow label="Provider summary" value={item.providerSummary} />
            <InfoRow
              label="Schedule status"
              value={item.scheduleStatusDescription}
            />
            <InfoRow label="Safe source label" value={item.safeSourceLabel} />
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href={
                item.itemType === "fanout"
                  ? (item.fanoutSummaryHref ?? item.historyHref)
                  : item.historyHref
              }
              className="btn-primary"
            >
              {item.itemType === "fanout"
                ? "Open fanout summary"
                : "Open publication history"}
            </Link>
            <Link href={item.detailHref} className="btn-ghost">
              Open schedule permalink
            </Link>
          </div>
        </div>

        <details className="card">
          <summary className="cursor-pointer list-none text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
            Raw / Debug
          </summary>
          <div className="mt-4 space-y-3">
            <DebugRow label="Schedule status" value={item.scheduleStatus} />
            <DebugRow label="Item id" value={item.id} />
            <DebugRow
              label="Schedule source"
              value={item.scheduleSourceLabel}
            />
            <DebugRow label="History href" value={item.historyHref} />
            <DebugRow label="Summary href" value={item.summaryHref} />
            {item.fanoutSummaryHref ? (
              <DebugRow
                label="Fanout summary href"
                value={item.fanoutSummaryHref}
              />
            ) : null}
            <DebugRow label="UTC label" value={item.utcLabel} />
          </div>
        </details>
      </section>
    </div>
  );
}

function EmptyScheduleState({
  hasActiveFilters,
  sourceCount,
}: {
  hasActiveFilters: boolean;
  sourceCount: number;
}) {
  return (
    <section className="card">
      <div className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.08em] text-signal-green">
          Empty schedule
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-white">
          {sourceCount === 0
            ? "No scheduled publications or parent fanouts yet"
            : "No schedule entries match the current filters"}
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          {hasActiveFilters
            ? "The schedule read model is still present, but the current filter combination returns no visible items."
            : "The read-only schedule view only shows stored planning data. It never starts worker execution, provider writes, retries, or scheduling jobs from the browser."}
        </p>
      </div>
    </section>
  );
}

function EmptyDetailState() {
  return (
    <section className="card">
      <p className="text-sm font-semibold uppercase tracking-[0.08em] text-signal-green">
        No selection
      </p>
      <h2 className="mt-2 text-2xl font-semibold text-white">
        Select a schedule entry
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
        The detail panel stays read-only. It only renders server-side schedule
        metadata, history links, and safe debug fields.
      </p>
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
  value: number | string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-sm leading-6 text-slate-400">{helper}</p>
    </div>
  );
}

function MetricCard({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "emerald" | "amber" | "rose" | "slate" | "violet";
  value: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 text-lg font-semibold",
          tone === "emerald" && "text-emerald-300",
          tone === "amber" && "text-amber-200",
          tone === "rose" && "text-rose-300",
          tone === "slate" && "text-slate-200",
          tone === "violet" && "text-violet-200",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-surface-950/70 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </p>
      <div className="mt-2 text-sm leading-6 text-white">{value}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-surface-950/70 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </p>
      <div className="mt-2 text-sm leading-6 text-white">{value}</div>
    </div>
  );
}

function DebugRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-surface-950/70 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </p>
      <div className="mt-2 break-all font-mono text-xs leading-5 text-slate-200">
        {value}
      </div>
    </div>
  );
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: PublicationScheduleStatusTone;
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

function FilterField({
  children,
  htmlFor,
  label,
}: {
  children: React.ReactNode;
  htmlFor: string;
  label: string;
}) {
  return (
    <label className="block space-y-1.5" htmlFor={htmlFor}>
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
        {label}
      </span>
      {children}
    </label>
  );
}

function hasNonDefaultFilters(
  model: PublicationScheduleDashboardModel,
): boolean {
  return (
    model.filters.period !== "upcoming" ||
    model.filters.provider !== "all" ||
    model.filters.status !== "all" ||
    model.filters.type !== "all"
  );
}
