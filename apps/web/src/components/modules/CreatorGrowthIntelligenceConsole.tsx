import React from "react";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  BarChart3,
  Database,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import { StatCard } from "@streamos/ui";
import {
  CREATOR_GROWTH_INTELLIGENCE_CATEGORIES,
  CREATOR_GROWTH_RECOMMENDATION_TYPES,
} from "@streamos/types";
import { cn } from "@/lib/utils/cn";
import type {
  CreatorGrowthIntelligenceDashboardModel,
  CreatorGrowthIntelligenceDashboardSignal,
} from "./CreatorGrowthIntelligenceConsole.utils";

type CreatorGrowthIntelligenceConsoleProps = {
  model: CreatorGrowthIntelligenceDashboardModel;
};

export function CreatorGrowthIntelligenceConsole({
  model,
}: CreatorGrowthIntelligenceConsoleProps) {
  const hasLookupIssues = model.lookupIssues.length > 0;

  return (
    <div className="space-y-6">
      {model.error === "load-failed" && <GrowthLoadNotice />}

      {model.feed.hasMore && <FeedScopeNotice feed={model.feed} />}

      {hasLookupIssues && <LookupIssueNotice />}

      <header className="grid gap-6 rounded-lg border border-white/10 bg-surface-900/85 p-6 shadow-[0_22px_70px_rgba(0,0,0,0.42)] xl:grid-cols-[minmax(0,1fr)_380px]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-signal-green">
            Creator Growth Intelligence
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-normal text-white md:text-5xl">
            SEO-Signale, Publish-Timing und Metadaten-Empfehlungen
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-400">
            Dieser Bereich bleibt tenant-scoped, read-only und review-first.
            Spaetere Analyseergebnisse aus dem Automation-Service landen hier
            als pruefbare Vorschlaege, nicht als automatische Provider-Aktionen.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/dashboard/analytics" className="btn-primary">
              Analytics pruefen
            </Link>
            <Link href="/dashboard/content" className="btn-ghost">
              Content review
            </Link>
          </div>
        </div>

        <aside className="rounded-lg border border-white/10 bg-white/5 p-4">
          <div className="flex items-center gap-3">
            <span className="rounded-lg border border-brand-500/20 bg-brand-500/10 p-2 text-brand-500">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
                Contract Scope
              </p>
              <h2 className="mt-1 text-lg font-semibold text-white">
                Review-only read model
              </h2>
            </div>
          </div>
          <ul className="mt-4 space-y-2 text-sm leading-6 text-slate-300">
            <li>Owner boundary: `user_id`.</li>
            <li>
              Optional links: `creator_id`, `channel_id`, `platform`,
              `content_publication_id`, `content_job_id`, `metrics_snapshot_id`.
            </li>
            <li>Statuses stay review-oriented and never auto-publish.</li>
            <li>No OpenAI or provider writes from the browser.</li>
          </ul>
        </aside>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Search}
          label="SEO Health"
          tone="emerald"
          trend="Kanal-SEO und Metadaten"
          value={formatScoreValue(model.summary.seoHealthScore)}
        />
        <StatCard
          icon={TrendingUp}
          label="Growth Opportunities"
          tone="amber"
          trend="Publish-Timing und Engagement"
          value={String(model.summary.growthOpportunityCount)}
        />
        <StatCard
          icon={BarChart3}
          label="Platform Fit"
          tone="violet"
          trend="Plattform-spezifische Signale"
          value={String(model.summary.platformFitCount)}
        />
        <StatCard
          icon={ShieldCheck}
          label="Review Queue"
          tone="rose"
          trend="Muss manuell geprueft werden"
          value={String(model.summary.reviewQueueCount)}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_360px]">
        <article className="card space-y-4">
          <SectionHeader
            description="Review-first Signale aus dem neuen Creator-Growth-Contract. Jede Karte bleibt tenant-sicher und beschreibt nur den gespeicherten Vorschlag."
            icon={<Sparkles className="h-4 w-4" aria-hidden="true" />}
            title="Review Queue"
          />

          {model.signals.length > 0 ? (
            <div className="space-y-3">
              {model.signals.map((signal) => (
                <SignalCard key={signal.id} signal={signal} />
              ))}
            </div>
          ) : model.error === "load-failed" ? (
            <LoadFailedState />
          ) : hasLookupIssues ? (
            <PartialLoadState />
          ) : (
            <EmptySignalState />
          )}
        </article>

        <aside className="card space-y-4">
          <SectionHeader
            description="Diese Abdeckung zeigt, welche bestehenden StreamOS-Entities die Intelligence-Records bereits referenzieren."
            icon={<Database className="h-4 w-4" aria-hidden="true" />}
            title="Contract Coverage"
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <CoverageTile
              helper="Creator-gebundene Empfehlungen"
              label="Creators"
              value={model.coverage.creators}
            />
            <CoverageTile
              helper="Kanal-spezifische Signale"
              label="Channels"
              value={model.coverage.channels}
            />
            <CoverageTile
              helper="Metrics-Snapshots verknuepft"
              label="Metrics"
              value={model.coverage.metricsSnapshots}
            />
            <CoverageTile
              helper="Reviewbare Job-Kontexte"
              label="Content Jobs"
              value={model.coverage.contentJobs}
            />
            <CoverageTile
              helper="Publication-Kontext vorhanden"
              label="Publications"
              value={model.coverage.contentPublications}
            />
            <CoverageTile
              helper="Signals mit Source-Link"
              label="Linked"
              value={model.summary.sourceLinkedCount}
            />
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
              Allowed categories
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {CREATOR_GROWTH_INTELLIGENCE_CATEGORIES.map((category) => (
                <Pill key={category}>{category}</Pill>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
              Allowed recommendation types
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {CREATOR_GROWTH_RECOMMENDATION_TYPES.map((type) => (
                <Pill key={type}>{type}</Pill>
              ))}
            </div>
          </div>

          <p className="text-sm leading-6 text-slate-400">
            Score und Confidence sind reviewbare Integer-Werte von 1 bis 100.
            Die Tabelle bleibt durch RLS auf den aktuellen User begrenzt und
            akzeptiert keine Client-Writes.
          </p>
        </aside>
      </section>
    </div>
  );
}

function SignalCard({
  signal,
}: {
  signal: CreatorGrowthIntelligenceDashboardSignal;
}) {
  return (
    <article className="rounded-lg border border-white/10 bg-white/5 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="emerald">{signal.categoryLabel}</Pill>
        <Pill tone="slate">{signal.recommendationTypeLabel}</Pill>
        <Pill tone="violet">{signal.recommendationStatusLabel}</Pill>
        {signal.platform !== null && (
          <Pill tone="amber">{signal.platformLabel}</Pill>
        )}
      </div>

      <h3 className="mt-3 text-2xl font-semibold text-white">{signal.title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-400">{signal.summary}</p>

      {signal.rationale && (
        <p className="mt-3 text-sm leading-6 text-slate-300">
          {signal.rationale}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>{signal.sourceLabel}</span>
        {signal.sourceDetail && <span>- {signal.sourceDetail}</span>}
        <span>- Updated {signal.updatedAtLabel}</span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {signal.scoreLabel && (
          <Pill tone="emerald">Score {signal.scoreLabel}</Pill>
        )}
        {signal.confidenceLabel && (
          <Pill tone="slate">Confidence {signal.confidenceLabel}</Pill>
        )}
        <Pill tone="slate">Created {signal.createdAtLabel}</Pill>
      </div>
    </article>
  );
}

function EmptySignalState() {
  return (
    <section className="rounded-lg border border-dashed border-white/10 bg-surface-950/60 p-5">
      <div className="flex items-start gap-3">
        <span className="rounded-lg border border-white/10 bg-white/5 p-2 text-slate-300">
          <TriangleAlert className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <h3 className="text-lg font-semibold text-white">
            Noch keine SEO Intelligence Records
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Sobald der Automation-Service oder ein serverseitiger Worker
            reviewbare Empfehlungen schreibt, erscheinen sie hier. Bis dahin
            bleibt der Bereich read-only und zeigt nur tenant-scoped Daten.
          </p>
        </div>
      </div>
    </section>
  );
}

function LoadFailedState() {
  return (
    <section className="rounded-lg border border-signal-red/30 bg-signal-red/10 p-5">
      <div className="flex items-start gap-3">
        <span className="rounded-lg border border-signal-red/30 bg-signal-red/10 p-2 text-signal-red">
          <TriangleAlert className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <h3 className="text-lg font-semibold text-white">
            SEO Intelligence konnte nicht geladen werden
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Die Datenquelle hat keine verwertbaren Signale geliefert. Die
            Oberflaeche bleibt read-only und zeigt erst wieder Inhalte, wenn die
            Abfrage erfolgreich ist.
          </p>
        </div>
      </div>
    </section>
  );
}

function PartialLoadState() {
  return (
    <section className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-5">
      <div className="flex items-start gap-3">
        <span className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-2 text-amber-200">
          <TriangleAlert className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <h3 className="text-lg font-semibold text-white">
            Teilweise geladene Creator-Growth-Daten
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Einige verknuepfte Lookup-Daten konnten nicht geladen werden. Die
            Ansicht ist deshalb leer oder nur teilweise belastbar, und die
            Abdeckung kann unvollstaendig sein.
          </p>
        </div>
      </div>
    </section>
  );
}

function FeedScopeNotice({
  feed,
}: {
  feed: CreatorGrowthIntelligenceDashboardModel["feed"];
}) {
  return (
    <section className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
      <div className="flex items-start gap-3">
        <span className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-2 text-amber-200">
          <TriangleAlert className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-amber-50">
            Neueste {feed.limit} Signale
          </h3>
          <p className="mt-2 max-w-3xl leading-6 text-amber-100/85">
            Diese Ansicht zeigt die neuesten {feed.returnedCount} geladenen
            Eintraege. Die Kennzahlen und die Abdeckung darunter sind auf diese
            Stichprobe begrenzt.
          </p>
        </div>
      </div>
    </section>
  );
}

function LookupIssueNotice() {
  return (
    <section className="rounded-lg border border-signal-red/30 bg-signal-red/10 p-4 text-sm text-signal-red">
      Einige verknuepfte Lookup-Daten konnten nicht geladen werden. Die
      angezeigten Signale bleiben verfuegbar, aber die Abdeckung kann
      unvollstaendig sein.
    </section>
  );
}

function GrowthLoadNotice() {
  return (
    <section className="rounded-lg border border-signal-red/30 bg-signal-red/10 p-4 text-sm text-signal-red">
      SEO Intelligence konnte nicht geladen werden. Die Liste bleibt deshalb
      leer.
    </section>
  );
}

function SectionHeader({
  description,
  icon,
  title,
}: {
  description: string;
  icon: ReactNode;
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

function CoverageTile({
  helper,
  label,
  value,
}: {
  helper: string;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </p>
      <strong className="mt-2 block text-xl text-white">{value}</strong>
      <p className="mt-2 text-xs leading-5 text-slate-400">{helper}</p>
    </div>
  );
}

function Pill({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: "amber" | "emerald" | "slate" | "violet";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold",
        tone === "emerald" &&
          "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
        tone === "amber" &&
          "border-amber-300/30 bg-amber-300/10 text-amber-200",
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

function formatScoreValue(value: number | null): string {
  if (value === null) {
    return "--/100";
  }

  return `${new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: 0,
  }).format(value)}/100`;
}
