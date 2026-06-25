import React from "react";
import Link from "next/link";
import {
  BarChart3,
  CalendarClock,
  Layers3,
  RadioTower,
  TriangleAlert,
} from "lucide-react";
import { StatCard } from "@streamos/ui";
import { cn } from "@/lib/utils/cn";
import {
  formatContentPerformanceMetric,
  formatContentPerformanceTimestamp,
  getContentPerformanceCoverageLabel,
  getContentPerformancePlatformLabel,
  getContentPerformancePublicationStatusLabel,
  getContentPerformanceScheduleStatusLabel,
  type ContentPerformanceAnalyticsDashboardModel,
} from "./ContentPerformanceAnalyticsConsole.utils";

type ContentPerformanceAnalyticsConsoleProps = {
  model: ContentPerformanceAnalyticsDashboardModel;
};

export function ContentPerformanceAnalyticsConsole({
  model,
}: ContentPerformanceAnalyticsConsoleProps) {
  const hasLookupIssues = model.lookupIssues.length > 0;
  const hasData = model.items.length > 0 || model.platformComparison.length > 0;

  return (
    <div className="space-y-6">
      {model.error === "load-failed" && <LoadFailedNotice />}
      {model.feed.hasMore && <FeedScopeNotice model={model} />}
      {hasLookupIssues && <PartialLoadNotice />}

      <header className="grid gap-6 rounded-lg border border-white/10 bg-surface-900/85 p-6 shadow-[0_22px_70px_rgba(0,0,0,0.42)] xl:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-signal-green">
            Analytics Expansion
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-normal text-white md:text-5xl">
            Content-Performance aus Publishing-, Scheduling- und
            Metrics-Snapshots
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-400">
            Diese Ansicht verbindet bestehende Publications mit vorhandenen
            Metrics-Snapshots, ohne neue Provider-Syncs oder Mutationen
            auszufuehren. Fehlende Metriken bleiben explizit als unavailable
            oder not tracked markiert.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/dashboard/publications/analytics"
              className="btn-primary"
            >
              Publishing Analytics
            </Link>
            <Link href="/dashboard/growth" className="btn-ghost">
              Growth Intelligence
            </Link>
          </div>
        </div>

        <aside className="rounded-lg border border-white/10 bg-white/5 p-4">
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
            Contract Scope
          </p>
          <h2 className="mt-2 text-lg font-semibold text-white">
            Read-only sample join
          </h2>
          <ul className="mt-4 space-y-2 text-sm leading-6 text-slate-300">
            <li>Owner boundary: `user_id` und creator-scoped channel links.</li>
            <li>
              Keine Provider-API-Calls, keine Queue-Produktion, keine Writes.
            </li>
            <li>
              `viewer_count` wird als vorhandener Views-/Audience-Snapshot
              gezeigt.
            </li>
            <li>
              `watch_time_minutes` und `engagement_rate` bleiben sample-scoped.
            </li>
            <li>
              CTR bleibt `not tracked`, solange kein sicheres Feld existiert.
            </li>
          </ul>
        </aside>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Layers3}
          label="Sample Items"
          tone="violet"
          trend="Read-only Feed"
          value={String(model.summary.itemCount)}
        />
        <StatCard
          icon={RadioTower}
          label="Linked Metrics"
          tone="emerald"
          trend="Publication plus snapshot"
          value={String(model.summary.linkedCount)}
        />
        <StatCard
          icon={BarChart3}
          label="Views Sample"
          tone="amber"
          trend="viewer_count aus Metrics"
          value={formatContentPerformanceMetric(
            model.summary.totalViews,
            "count",
          )}
        />
        <StatCard
          icon={CalendarClock}
          label="Watchtime"
          tone="rose"
          trend="watch_time_minutes"
          value={formatContentPerformanceMetric(
            model.summary.totalWatchTimeMinutes,
            "minutes",
          )}
        />
      </section>

      {model.summary.averageEngagementRate.availability === "available" && (
        <section className="grid gap-4 md:grid-cols-3">
          <StatCard
            icon={BarChart3}
            label="Average Engagement"
            tone="emerald"
            trend="sample average"
            value={formatContentPerformanceMetric(
              model.summary.averageEngagementRate,
              "percent",
            )}
          />
          <StatCard
            icon={Layers3}
            label="Publication Only"
            tone="violet"
            trend="ohne Metrics-Match"
            value={String(model.summary.publicationOnlyCount)}
          />
          <StatCard
            icon={RadioTower}
            label="Metrics Only"
            tone="amber"
            trend="ohne Publication-Link"
            value={String(model.summary.metricsOnlyCount)}
          />
        </section>
      )}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)]">
        <article className="card space-y-4">
          <SectionHeader
            title="Platform Comparison"
            description="Plattformwerte bleiben sample-scoped und aggregieren nur die geladenen Eintraege."
          />

          {model.platformComparison.length > 0 ? (
            <div className="space-y-3">
              {model.platformComparison.map((platform) => (
                <article
                  key={platform.platform}
                  className="rounded-lg border border-white/10 bg-white/5 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-white">
                        {getContentPerformancePlatformLabel(platform.platform)}
                      </h3>
                      <p className="mt-1 text-sm text-slate-400">
                        {platform.itemCount} Items, {platform.publicationCount}{" "}
                        Publications, {platform.linkedCount} linked
                      </p>
                    </div>
                    <Pill tone="slate">
                      Latest snapshot{" "}
                      {formatContentPerformanceTimestamp(
                        platform.latestSnapshotAt,
                      )}
                    </Pill>
                  </div>

                  <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <MetricTile
                      label="Views / Audience"
                      value={formatContentPerformanceMetric(
                        platform.views,
                        "count",
                      )}
                    />
                    <MetricTile
                      label="Watchtime"
                      value={formatContentPerformanceMetric(
                        platform.watchTimeMinutes,
                        "minutes",
                      )}
                    />
                    <MetricTile
                      label="Engagement"
                      value={formatContentPerformanceMetric(
                        platform.engagementRate,
                        "percent",
                      )}
                    />
                    <MetricTile
                      label="CTR"
                      value={formatContentPerformanceMetric(
                        platform.ctr,
                        "percent",
                      )}
                    />
                  </dl>
                </article>
              ))}
            </div>
          ) : hasLookupIssues ? (
            <PartialState />
          ) : (
            <EmptyState
              title="Noch kein Plattformvergleich verfuegbar"
              body="Sobald Publications oder Metrics-Snapshots vorhanden sind, zeigt dieser Bereich die sample-scoped Plattformsicht."
            />
          )}
        </article>

        <article className="card space-y-4">
          <SectionHeader
            title="Content Performance"
            description="Liste mit verknuepften Publication-/Scheduling-Kontexten und expliziten Availability-Labels fuer fehlende Metriken."
          />

          {model.items.length > 0 ? (
            <div className="space-y-3">
              {model.items.map((item) => (
                <article
                  key={item.id}
                  className="rounded-lg border border-white/10 bg-white/5 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone="emerald">
                      {getContentPerformancePlatformLabel(item.platform)}
                    </Pill>
                    <Pill tone="violet">
                      {getContentPerformanceCoverageLabel(item.coverageStatus)}
                    </Pill>
                    <Pill tone="slate">
                      {getContentPerformancePublicationStatusLabel(
                        item.publicationStatus,
                      )}
                    </Pill>
                    <Pill tone="slate">
                      {getContentPerformanceScheduleStatusLabel(
                        item.scheduleStatus,
                      )}
                    </Pill>
                  </div>

                  <h3 className="mt-3 text-xl font-semibold text-white">
                    {item.contentTitle ?? "Untitled content record"}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    {item.channelDisplayName ?? "No linked channel"} · Snapshot{" "}
                    {formatContentPerformanceTimestamp(item.snapshotCapturedAt)}{" "}
                    · Primary activity{" "}
                    {formatContentPerformanceTimestamp(item.primaryTimestamp)}
                  </p>

                  <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <MetricTile
                      label="Views / Audience"
                      value={formatContentPerformanceMetric(
                        item.views,
                        "count",
                      )}
                    />
                    <MetricTile
                      label="Watchtime"
                      value={formatContentPerformanceMetric(
                        item.watchTimeMinutes,
                        "minutes",
                      )}
                    />
                    <MetricTile
                      label="Engagement"
                      value={formatContentPerformanceMetric(
                        item.engagementRate,
                        "percent",
                      )}
                    />
                    <MetricTile
                      label="CTR"
                      value={formatContentPerformanceMetric(
                        item.ctr,
                        "percent",
                      )}
                    />
                  </dl>

                  <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
                    <span>
                      Publication {item.publicationId ?? "not linked"}
                    </span>
                    <span>Content job {item.contentJobId ?? "not linked"}</span>
                    <span>
                      Metrics {item.metricsSnapshotId ?? "unavailable"}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          ) : hasLookupIssues ? (
            <PartialState />
          ) : hasData ? null : (
            <EmptyState
              title="Noch keine Content-Performance-Daten"
              body="Es gibt aktuell weder Publications noch passende Metrics-Snapshots fuer diese read-only Analytics-Surface."
            />
          )}
        </article>
      </section>
    </div>
  );
}

function SectionHeader({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-slate-400">{description}</p>
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-surface-950/60 p-3">
      <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </dt>
      <dd className="mt-2 text-sm font-semibold text-white">{value}</dd>
    </div>
  );
}

function FeedScopeNotice({
  model,
}: {
  model: ContentPerformanceAnalyticsDashboardModel;
}) {
  return (
    <section className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
      Diese Surface zeigt die neuesten {model.feed.returnedCount} Eintraege aus
      einer Stichprobe mit Limit {model.feed.limit}. Aggregationen und
      Plattformvergleiche sind deshalb sample-scoped.
    </section>
  );
}

function PartialLoadNotice() {
  return (
    <section className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
      Einige Read- oder Lookup-Quellen konnten nicht geladen werden. Vorhandene
      Daten bleiben sichtbar, aber Join-Abdeckung und Plattformsummen koennen
      unvollstaendig sein.
    </section>
  );
}

function LoadFailedNotice() {
  return (
    <section className="rounded-lg border border-signal-red/30 bg-signal-red/10 p-4 text-sm text-signal-red">
      Publications und Metrics-Snapshots konnten nicht geladen werden. Die
      Analytics-Surface bleibt read-only und zeigt keine irrefuehrenden
      Fallback-Daten.
    </section>
  );
}

function PartialState() {
  return (
    <EmptyState
      title="Teilweise geladene Analytics-Daten"
      body="Mindestens eine Lookup- oder Read-Quelle ist ausgefallen. Die Ansicht bleibt absichtlich konservativ und ersetzt den Fehler nicht durch einen stillen Empty State."
      tone="warning"
    />
  );
}

function EmptyState({
  body,
  title,
  tone = "default",
}: {
  body: string;
  title: string;
  tone?: "default" | "warning";
}) {
  return (
    <section
      className={cn(
        "rounded-lg border p-5",
        tone === "default" && "border-dashed border-white/10 bg-surface-950/60",
        tone === "warning" && "border-amber-300/30 bg-amber-300/10",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "rounded-lg border p-2",
            tone === "default" && "border-white/10 bg-white/5 text-slate-300",
            tone === "warning" &&
              "border-amber-300/30 bg-amber-300/10 text-amber-200",
          )}
        >
          <TriangleAlert className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            {body}
          </p>
        </div>
      </div>
    </section>
  );
}

function Pill({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: "amber" | "emerald" | "slate" | "violet";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold",
        tone === "amber" &&
          "border-amber-300/30 bg-amber-300/10 text-amber-200",
        tone === "emerald" &&
          "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
        tone === "slate" &&
          "border-slate-500/30 bg-slate-500/10 text-slate-200",
        tone === "violet" &&
          "border-violet-400/30 bg-violet-400/10 text-violet-200",
      )}
    >
      {children}
    </span>
  );
}
