import React from "react";
import Link from "next/link";
import {
  BarChart2,
  History,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  formatPublishingAnalyticsDuration,
  formatPublishingAnalyticsPeriodWindow,
  formatPublishingAnalyticsRate,
  getPublishingAnalyticsPeriodLabel,
  getPublishingAnalyticsProviderFilterLabel,
  PUBLISHING_ANALYTICS_PERIODS,
  PUBLISHING_ANALYTICS_PROVIDERS,
  type PublishingAnalyticsDashboardModel,
  type PublishingAnalyticsProviderSummary,
  type PublishingAnalyticsReasonBucket,
} from "./PublishingAnalyticsConsole.utils";
import { formatPublicationTimestamp } from "./PublicationStatusConsole.utils";

type PublishingAnalyticsConsoleProps = {
  model: PublishingAnalyticsDashboardModel;
};

export function PublishingAnalyticsConsole({
  model,
}: PublishingAnalyticsConsoleProps) {
  const hasData =
    model.summary.totalPublications > 0 ||
    model.summary.totalFanouts > 0 ||
    model.summary.totalAnalyzedTargets > 0;

  return (
    <div className="space-y-6">
      <header className="grid gap-6 rounded-lg border border-white/10 bg-surface-900/85 p-6 shadow-[0_22px_70px_rgba(0,0,0,0.42)] xl:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-signal-green">
            Publishing analytics
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-normal text-white md:text-5xl">
            Read-only publishing analytics for approved repurposing jobs and
            crossposting fanouts
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-400">
            Diese Ansicht bleibt tenant-safe und secret-safe. Sie analysiert nur
            serverseitig gespeicherte Publications und Fanouts aus dem
            bestehenden Publishing-Contract, ohne Worker-, Provider- oder
            Write-Pfade aus dem Browser zu starten.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/dashboard/publications" className="btn-primary">
              Publication history
            </Link>
            <Link href="/dashboard/publications/fanouts" className="btn-ghost">
              Crossposting summary
            </Link>
            <Link href="/dashboard/jobs/repurposing" className="btn-ghost">
              Repurposing review
            </Link>
          </div>
        </div>

        <form
          action="/dashboard/publications/analytics"
          className="space-y-4 rounded-lg border border-white/10 bg-white/5 p-4"
          method="get"
        >
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
              Filters
            </p>
            <h2 className="mt-1 text-lg font-semibold text-white">
              Period and provider scope
            </h2>
          </div>

          <FilterField label="Period" htmlFor="publishing-analytics-period">
            <select
              aria-label="Publishing analytics period"
              className="w-full rounded-lg border border-white/10 bg-surface-900/80 px-3 py-2.5 text-sm text-white outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
              defaultValue={model.filters.period}
              id="publishing-analytics-period"
              name="period"
            >
              {PUBLISHING_ANALYTICS_PERIODS.map((period) => (
                <option key={period} value={period}>
                  {getPublishingAnalyticsPeriodLabel(period)}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="Provider" htmlFor="publishing-analytics-provider">
            <select
              aria-label="Publishing analytics provider"
              className="w-full rounded-lg border border-white/10 bg-surface-900/80 px-3 py-2.5 text-sm text-white outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
              defaultValue={model.filters.provider}
              id="publishing-analytics-provider"
              name="provider"
            >
              {PUBLISHING_ANALYTICS_PROVIDERS.map((provider) => (
                <option key={provider} value={provider}>
                  {getPublishingAnalyticsProviderFilterLabel(provider)}
                </option>
              ))}
            </select>
          </FilterField>

          <div className="flex flex-wrap gap-3">
            <button className="btn-primary" type="submit">
              Apply filters
            </button>
            <Link
              href="/dashboard/publications/analytics"
              className="btn-ghost"
            >
              Reset
            </Link>
          </div>

          <p className="text-xs leading-6 text-slate-500">
            Read-only summary · server-side snapshots only · no provider writes
          </p>
        </form>
      </header>

      {hasData ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              helper={`${model.summary.finalSuccessCount} successful / ${model.summary.finalFailedCount} failed`}
              label="Success rate"
              tone="emerald"
              value={formatPublishingAnalyticsRate(model.summary.successRate)}
            />
            <MetricCard
              helper={`${model.summary.blockedTargetCount} blocked targets`}
              label="Failure rate"
              tone="rose"
              value={formatPublishingAnalyticsRate(model.summary.failureRate)}
            />
            <MetricCard
              helper="Average publication latency"
              label="Average time to publish"
              tone="violet"
              value={formatPublishingAnalyticsDuration(
                model.summary.averageTimeToPublishMs,
              )}
            />
            <MetricCard
              helper="90th percentile latency"
              label="P90 time to publish"
              tone="amber"
              value={formatPublishingAnalyticsDuration(
                model.summary.p90TimeToPublishMs,
              )}
            />
            <MetricCard
              helper={`${model.summary.retrySuccessCount} retry successes`}
              label="Retry success rate"
              tone="emerald"
              value={formatPublishingAnalyticsRate(
                model.summary.retrySuccessRate,
              )}
            />
            <MetricCard
              helper={`${model.summary.manualInterventionCount} manual interventions`}
              label="Manual intervention rate"
              tone="slate"
              value={formatPublishingAnalyticsRate(
                model.summary.manualInterventionRate,
              )}
            />
            <MetricCard
              helper={`${model.summary.partialFanoutCount} partial fanouts`}
              label="Partial fanout rate"
              tone="amber"
              value={formatPublishingAnalyticsRate(
                model.summary.partialFanoutRate,
              )}
            />
            <MetricCard
              helper={`${model.summary.retryAttemptedCount} retry attempts`}
              label="Retry attempts"
              tone="slate"
              value={String(model.summary.retryAttemptedCount)}
            />
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <article className="card space-y-4">
              <SectionHeader
                description="Filter window, provider scope, and the read-model coverage behind the summary."
                icon={<BarChart2 className="h-4 w-4" aria-hidden="true" />}
                title="Scope and window"
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <InfoRow
                  label="Period window"
                  value={formatPublishingAnalyticsPeriodWindow(
                    model.filters.period,
                    model.summary.periodStart,
                  )}
                />
                <InfoRow
                  label="Provider filter"
                  value={model.filters.providerLabel}
                />
                <InfoRow
                  label="Publications analyzed"
                  value={String(model.summary.totalPublications)}
                />
                <InfoRow
                  label="Targets analyzed"
                  value={String(model.summary.totalAnalyzedTargets)}
                />
                <InfoRow
                  label="Fanouts analyzed"
                  value={String(model.summary.totalFanouts)}
                />
                <InfoRow
                  label="Single publications"
                  value={String(model.scopeSummary.singlePublicationCount)}
                />
                <InfoRow
                  label="Fanout child publications"
                  value={String(model.scopeSummary.fanoutChildPublicationCount)}
                />
                <InfoRow
                  label="Current snapshot end"
                  value={formatPublicationTimestamp(model.summary.periodEnd)}
                />
              </div>
            </article>

            <article className="card space-y-4">
              <SectionHeader
                description="Per-provider outcomes and the strongest safe failure reasons."
                icon={<Sparkles className="h-4 w-4" aria-hidden="true" />}
                title="Provider breakdown"
              />

              <div className="space-y-4">
                {model.providerBreakdown.map((provider) => (
                  <ProviderCard key={provider.provider} provider={provider} />
                ))}
              </div>
            </article>
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <article className="card space-y-4">
              <SectionHeader
                description="Blocked and retryable publication reasons grouped by safe reason key."
                icon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />}
                title="Failure reasons"
              />

              {model.reasonBreakdown.length > 0 ? (
                <div className="space-y-3">
                  {model.reasonBreakdown.map((reason) => (
                    <ReasonItem key={reason.reason} reason={reason} />
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-white/10 bg-surface-950/80 p-4">
                  <p className="text-sm font-semibold text-white">
                    No failure reasons
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    No failure reasons were recorded for the selected scope.
                  </p>
                </div>
              )}
            </article>

            <article className="card space-y-4">
              <SectionHeader
                description="Crossposting fanouts stay separate from single publications but are summarized here."
                icon={<History className="h-4 w-4" aria-hidden="true" />}
                title="Fanout outcomes"
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <InfoRow
                  label="Published fanouts"
                  value={String(model.fanoutSummary.publishedCount)}
                />
                <InfoRow
                  label="Queued / in progress"
                  value={String(model.fanoutSummary.queuedCount)}
                />
                <InfoRow
                  label="Blocked fanouts"
                  value={String(model.fanoutSummary.blockedCount)}
                />
                <InfoRow
                  label="Failed fanouts"
                  value={String(model.fanoutSummary.failedCount)}
                />
                <InfoRow
                  label="Requires action"
                  value={String(model.fanoutSummary.requiresActionCount)}
                />
                <InfoRow
                  label="Partial success"
                  value={String(model.fanoutSummary.partialSuccessCount)}
                />
              </div>
              <p className="text-sm leading-6 text-slate-400">
                Partial success means at least one child publication was created
                while another child remained blocked or failed.
              </p>
            </article>
          </section>
        </>
      ) : (
        <EmptyPublishingAnalyticsState filters={model.filters} />
      )}
    </div>
  );
}

function ProviderCard({
  provider,
}: {
  provider: PublishingAnalyticsProviderSummary;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
            {provider.label}
          </p>
          <h3 className="mt-1 text-lg font-semibold text-white">
            {provider.totalPublications} publications / {provider.totalTargets}{" "}
            targets
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill
            tone="emerald"
            value={formatPublishingAnalyticsRate(provider.successRate)}
          />
          <StatusPill
            tone="rose"
            value={formatPublishingAnalyticsRate(provider.failureRate)}
          />
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <InfoRow
          label="Average time to publish"
          value={formatPublishingAnalyticsDuration(
            provider.averageTimeToPublishMs,
          )}
        />
        <InfoRow
          label="P90 time to publish"
          value={formatPublishingAnalyticsDuration(provider.p90TimeToPublishMs)}
        />
        <InfoRow
          label="Blocked targets"
          value={String(provider.blockedTargetCount)}
        />
        <InfoRow
          label="Retry success rate"
          value={formatPublishingAnalyticsRate(provider.retrySuccessRate)}
        />
      </div>

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
          Top failure reasons
        </p>
        {provider.topFailureReasons.length > 0 ? (
          <div className="mt-3 space-y-2">
            {provider.topFailureReasons.map((reason) => (
              <ReasonChip key={reason.reason} reason={reason} />
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm leading-6 text-slate-400">
            No provider failures recorded for this scope.
          </p>
        )}
      </div>
    </div>
  );
}

function ReasonItem({ reason }: { reason: PublishingAnalyticsReasonBucket }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-white">{reason.label}</p>
          <p className="mt-1 text-xs text-slate-500">{reason.reason}</p>
        </div>
        <span className="rounded-full border border-white/10 bg-surface-900/80 px-2.5 py-1 text-xs font-semibold text-slate-200">
          {reason.count}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <StatusPill
          tone="violet"
          value={`YouTube ${reason.byProvider.youtube}`}
        />
        <StatusPill
          tone="violet"
          value={`TikTok ${reason.byProvider.tiktok}`}
        />
      </div>
    </div>
  );
}

function ReasonChip({ reason }: { reason: PublishingAnalyticsReasonBucket }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-surface-900/80 px-3 py-2">
      <p className="text-sm font-medium text-white">{reason.label}</p>
      <p className="text-xs text-slate-400">
        YT {reason.byProvider.youtube} · TT {reason.byProvider.tiktok}
      </p>
    </div>
  );
}

function EmptyPublishingAnalyticsState({
  filters,
}: {
  filters: PublishingAnalyticsDashboardModel["filters"];
}) {
  return (
    <section className="card space-y-4">
      <div className="flex items-center gap-3">
        <span className="rounded-lg border border-white/10 bg-white/5 p-2 text-slate-300">
          <TriangleAlert className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
            No publishing analytics yet
          </p>
          <h2 className="mt-1 text-lg font-semibold text-white">
            No approved publications matched the selected scope
          </h2>
        </div>
      </div>

      <p className="max-w-3xl text-sm leading-6 text-slate-400">
        The current filters return no approved publications or fanouts. The
        dashboard stays read-only and secret-safe, and only YouTube / TikTok
        publishing data is aggregated here.
      </p>

      <div className="grid gap-3 md:grid-cols-3">
        <InfoRow label="Period" value={filters.periodLabel} />
        <InfoRow label="Provider" value={filters.providerLabel} />
        <InfoRow label="Coverage" value="Read-only snapshot" />
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href="/dashboard/publications" className="btn-primary">
          Publication history
        </Link>
        <Link href="/dashboard/publications/fanouts" className="btn-ghost">
          Crossposting summary
        </Link>
      </div>
    </section>
  );
}

function MetricCard({
  helper,
  label,
  tone,
  value,
}: {
  helper: string;
  label: string;
  tone: "emerald" | "amber" | "rose" | "slate" | "violet";
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
      <p className="mt-2 text-sm text-slate-400">{helper}</p>
    </article>
  );
}

function SectionHeader({
  description,
  icon,
  title,
}: {
  description: string;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="rounded-lg border border-brand-500/20 bg-brand-500/10 p-2 text-brand-500">
        {icon}
      </span>
      <div>
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-slate-400">{description}</p>
      </div>
    </div>
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

function StatusPill({
  tone,
  value,
}: {
  tone: "emerald" | "amber" | "rose" | "slate" | "violet";
  value: string;
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
      {value}
    </span>
  );
}
