import React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { mutatePublicationScheduleAction } from "@/app/dashboard/publications/schedule/actions";
import { formatPublicationTimestamp } from "./PublicationStatusConsole.utils";
import {
  getPublicationProviderNativeSchedulingAvailabilityLabel,
  getPublicationProviderNativeSchedulingExecutionStatusLabel,
  getPublicationProviderNativeSchedulingPolicyLabel,
  getPublicationScheduleFilterLabel,
  getPublicationSchedulingSourceOfTruthLabel,
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

      <section className="card space-y-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-signal-green">
            Schedule controls
          </p>
          <h3 className="mt-1 text-lg font-semibold text-white">
            Update, replace, or cancel the stored schedule
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Die Aktionen bleiben serverseitig, tenant-sicher und ohne Provider-
            oder Worker-Aufrufe. Edit und Replace nutzen dieselbe Zeitangabe;
            Cancel ignoriert die Zeitfelder und verlangt eine Bestätigung.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <ActionAvailabilityTile
            decision={item.scheduleActionPolicy.actions.edit_schedule}
            descriptionId={`schedule-edit-description-${item.id}`}
            kind={item.itemType}
            itemId={item.id}
            scheduleAction="edit"
            submittedActionLabel="Update schedule"
          />
          <ActionAvailabilityTile
            decision={item.scheduleActionPolicy.actions.replace_schedule}
            descriptionId={`schedule-replace-description-${item.id}`}
            kind={item.itemType}
            itemId={item.id}
            scheduleAction="replace"
            submittedActionLabel="Replace schedule"
          />
          <ActionAvailabilityTile
            decision={item.scheduleActionPolicy.actions.cancel_schedule}
            descriptionId={`schedule-cancel-description-${item.id}`}
            kind={item.itemType}
            itemId={item.id}
            scheduleAction="cancel"
            submittedActionLabel="Cancel schedule"
            requiresConfirmation
          />
        </div>

        <form action={mutatePublicationScheduleAction} className="space-y-4">
          <input name="kind" type="hidden" value={item.itemType} />
          <input name="itemId" type="hidden" value={item.id} />

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Scheduled UTC">
              <input
                aria-label="Scheduled UTC timestamp"
                className="w-full rounded-lg border border-white/10 bg-surface-900/80 px-3 py-2.5 text-sm text-white outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
                defaultValue={item.scheduledAtUtc ?? ""}
                name="scheduledAtUtc"
                placeholder="2026-06-22T18:30:00.000Z"
                required
                type="text"
              />
            </Field>

            <Field label="Timezone">
              <input
                aria-label="Scheduled timezone"
                className="w-full rounded-lg border border-white/10 bg-surface-900/80 px-3 py-2.5 text-sm text-white outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
                defaultValue={item.scheduledTimezoneRaw ?? ""}
                name="scheduledTimezone"
                placeholder="Europe/Berlin"
                required
                type="text"
              />
            </Field>
          </div>

          <Field label="Operator note">
            <textarea
              aria-label="Schedule mutation note"
              className="min-h-28 w-full rounded-lg border border-white/10 bg-surface-900/80 px-3 py-2.5 text-sm text-white outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
              name="reason"
              placeholder="Optional reason for the audit trail"
            />
          </Field>

          <label className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-300">
            <input
              className="mt-1 h-4 w-4 rounded border-white/20 bg-surface-900 text-brand-500 focus:ring-brand-500"
              name="confirmCancel"
              type="checkbox"
              value="true"
            />
            <span>
              I confirm that canceling this schedule stops future execution and
              keeps the audit trail server-side.
            </span>
          </label>

          <div className="grid gap-3 md:grid-cols-3">
            <button
              className="btn-primary justify-center"
              disabled={
                !item.scheduleActionPolicy.actions.edit_schedule.allowed
              }
              aria-describedby={`schedule-edit-description-${item.id}`}
              name="scheduleAction"
              type="submit"
              value="edit"
            >
              {item.scheduleActionPolicy.actions.edit_schedule.safeLabel}
            </button>
            <button
              className="btn-ghost justify-center"
              disabled={
                !item.scheduleActionPolicy.actions.replace_schedule.allowed
              }
              aria-describedby={`schedule-replace-description-${item.id}`}
              name="scheduleAction"
              type="submit"
              value="replace"
            >
              {item.scheduleActionPolicy.actions.replace_schedule.safeLabel}
            </button>
            <button
              className="btn-ghost justify-center"
              disabled={
                !item.scheduleActionPolicy.actions.cancel_schedule.allowed
              }
              aria-describedby={`schedule-cancel-description-${item.id}`}
              formNoValidate
              name="scheduleAction"
              type="submit"
              value="cancel"
            >
              {item.scheduleActionPolicy.actions.cancel_schedule.safeLabel}
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <ActionNote
              decision={item.scheduleActionPolicy.actions.edit_schedule}
              descriptionId={`schedule-edit-description-${item.id}`}
              label="Update schedule"
            />
            <ActionNote
              decision={item.scheduleActionPolicy.actions.replace_schedule}
              descriptionId={`schedule-replace-description-${item.id}`}
              label="Replace schedule"
            />
            <ActionNote
              decision={item.scheduleActionPolicy.actions.cancel_schedule}
              descriptionId={`schedule-cancel-description-${item.id}`}
              label="Cancel schedule"
            />
          </div>

          <p className="text-sm leading-6 text-slate-400">
            {item.scheduleActionPolicy.explanation}
          </p>
        </form>
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

        <div className="card space-y-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-signal-green">
              Schedule policy
            </p>
            <h3 className="mt-1 text-lg font-semibold text-white">
              Lead time, horizon, execution lock, and scheduling ownership
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Die zentrale Policy ist serverseitig berechnet und bleibt
              read-only. StreamOS bleibt die primäre Scheduling-Schicht;
              Provider-native Hinweise bleiben sekundär, lösen keine Execution
              aus und offenbaren keine Browser-Secrets.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <DetailStat
              label="Policy status"
              value={item.schedulePolicy.policyStatus}
            />
            <DetailStat
              label="Policy version"
              value={item.schedulePolicy.policyVersion}
            />
            <DetailStat
              label="Execution lock"
              value={item.schedulePolicy.execution.isLocked ? "Locked" : "Open"}
            />
            <DetailStat
              label="Source of truth"
              value={getPublicationSchedulingSourceOfTruthLabel(
                item.schedulePolicy.schedulingDecision.schedulerSourceOfTruth,
              )}
            />
            <DetailStat
              label="Provider-native availability"
              value={getPublicationProviderNativeSchedulingAvailabilityLabel(
                item.schedulePolicy.schedulingDecision
                  .providerNativeSchedulingAvailability,
              )}
            />
            <DetailStat
              label="Provider-native policy"
              value={getPublicationProviderNativeSchedulingPolicyLabel(
                item.schedulePolicy.schedulingDecision
                  .providerNativeSchedulingPolicy,
              )}
            />
            <DetailStat
              label="Provider-native execution"
              value={getPublicationProviderNativeSchedulingExecutionStatusLabel(
                item.schedulePolicy.schedulingDecision
                  .providerNativeSchedulingExecutionStatus,
              )}
            />
            <DetailStat
              label="Provider-native revalidation"
              value={
                item.schedulePolicy.schedulingDecision.requiresRevalidation
                  ? "Required"
                  : "Not required"
              }
            />
            <DetailStat
              label="Lead time"
              value={`${item.schedulePolicy.timing.minLeadTimeMinutes} min minimum`}
            />
            <DetailStat
              label="Edit window"
              value={`${item.schedulePolicy.timing.nearDueEditWindowMinutes} min near-due`}
            />
            <DetailStat
              label="Horizon"
              value={`${item.schedulePolicy.timing.maxHorizonDays} days max`}
            />
            <DetailStat
              label="Revalidation"
              value={
                item.schedulePolicy.requiresRevalidation
                  ? "Required"
                  : "Not required"
              }
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <InfoRow
              label="Provider hint"
              value={item.schedulePolicy.providerHint.description}
            />
            <InfoRow
              label="Next recommended action"
              value={item.schedulePolicy.nextRecommendedAction ?? "None"}
            />
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
              Warnings
            </p>
            {item.schedulePolicy.warnings.length > 0 ? (
              <ul className="space-y-2 text-sm leading-6 text-slate-300">
                {item.schedulePolicy.warnings.map((warning) => (
                  <li
                    key={`${item.id}-${warning.code}`}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2"
                  >
                    <span className="font-semibold text-white">
                      {warning.code}
                    </span>
                    <span className="ml-2 text-slate-400">
                      {warning.message}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm leading-6 text-slate-400">
                No schedule warnings are currently stored for this entry.
              </p>
            )}
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

function ActionAvailabilityTile({
  decision,
  descriptionId,
  kind,
  itemId,
  requiresConfirmation = false,
  scheduleAction,
  submittedActionLabel,
}: {
  decision: PublicationScheduleItem["scheduleActionPolicy"]["actions"]["edit_schedule"];
  descriptionId: string;
  kind: "publication" | "fanout";
  itemId: string;
  requiresConfirmation?: boolean;
  scheduleAction: "cancel" | "edit" | "replace";
  submittedActionLabel: string;
}) {
  const isBlocked = !decision.allowed;

  return (
    <div
      className="rounded-lg border border-white/10 bg-white/5 p-4"
      data-schedule-action={scheduleAction}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
        {submittedActionLabel}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-300">
        {decision.explanation}
      </p>
      <div className="mt-4 flex items-center justify-between gap-3">
        <span
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em]",
            isBlocked
              ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
          )}
        >
          {isBlocked ? "Blocked" : "Enabled"}
        </span>
        {requiresConfirmation ? (
          <span className="text-xs uppercase tracking-[0.08em] text-slate-500">
            Confirmation required
          </span>
        ) : null}
      </div>
      <p id={descriptionId} className="mt-3 text-xs leading-5 text-slate-500">
        {decision.blockReason
          ? `Block reason: ${decision.blockReason}.`
          : `This action stays server-side for the selected ${kind} (${itemId}).`}
      </p>
    </div>
  );
}

function ActionNote({
  decision,
  descriptionId,
  label,
}: {
  decision: PublicationScheduleItem["scheduleActionPolicy"]["actions"]["edit_schedule"];
  descriptionId: string;
  label: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-surface-950/70 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </p>
      <p id={descriptionId} className="mt-2 text-sm leading-6 text-slate-300">
        {decision.allowed ? decision.explanation : decision.explanation}
      </p>
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

function Field({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <label className="block space-y-1.5">
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
