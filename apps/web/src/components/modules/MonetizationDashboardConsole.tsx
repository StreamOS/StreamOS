import React from "react";
import Link from "next/link";
import {
  BadgeDollarSign,
  CalendarDays,
  Coins,
  RadioTower,
  TriangleAlert,
} from "lucide-react";
import { StatCard } from "@streamos/ui";
import { cn } from "@/lib/utils/cn";
import {
  formatMonetizationAmount,
  formatMonetizationCount,
  formatMonetizationDateTime,
  getMonetizationPlatformLabel,
  getMonetizationSourceLabel,
  getMonetizationStatusLabel,
  type MonetizationDashboardModel,
} from "./MonetizationDashboardConsole.utils";

type MonetizationDashboardConsoleProps = {
  model: MonetizationDashboardModel;
};

export function MonetizationDashboardConsole({
  model,
}: MonetizationDashboardConsoleProps) {
  const hasLookupIssues = model.lookupIssues.length > 0;
  const showPartialLoadNotice = model.state === "ready" && hasLookupIssues;
  const hasData =
    model.coverage.summaryRowCount > 0 ||
    model.recentEvents.length > 0 ||
    model.revenueBySource.length > 0 ||
    model.trend.length > 0 ||
    model.summary.totalRevenue.availability !== "unavailable" ||
    model.summary.totalConfirmedEvents !== null;

  return (
    <div className="space-y-6">
      {model.state === "disabled" && <DisabledNotice />}
      {model.state === "unauthorized" && <UnauthorizedNotice />}
      {model.state === "auth-failed" && <AuthFailedNotice />}
      {model.state === "load-failed" && <LoadFailedNotice />}
      {model.feed.hasMore && <FeedScopeNotice model={model} />}
      {showPartialLoadNotice && <PartialLoadNotice />}

      <header className="grid gap-6 rounded-lg border border-white/10 bg-surface-900/85 p-6 shadow-[0_22px_70px_rgba(0,0,0,0.42)] xl:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-signal-green">
            Monetization Dashboard
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-normal text-white md:text-5xl">
            Read-only Umsatz, Revenue Sources und letzte Monetization Events
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-400">
            Diese Surface nutzt vorhandene Monetization-Events und Summary-Daten
            tenant-scoped und ohne Provider-Syncs, Payment-Writes oder externe
            Integrationen.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/dashboard/analytics" className="btn-primary">
              Analytics pruefen
            </Link>
            <Link
              href="/dashboard/publications/analytics"
              className="btn-ghost"
            >
              Publishing Analytics
            </Link>
          </div>
        </div>

        <aside className="rounded-lg border border-white/10 bg-white/5 p-4">
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
            Contract Scope
          </p>
          <h2 className="mt-2 text-lg font-semibold text-white">
            Read-only monetization model
          </h2>
          <ul className="mt-4 space-y-2 text-sm leading-6 text-slate-300">
            <li>Owner boundary: `user_id` via authenticated Supabase reads.</li>
            <li>
              No Payment-Provider connects, payouts, invoices or sync buttons.
            </li>
            <li>No service-role logic or secrets in browser code.</li>
            <li>
              Mixed oder fehlende Currencies bleiben explizit als unavailable
              markiert.
            </li>
          </ul>
        </aside>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={BadgeDollarSign}
          label="Total Revenue"
          tone="emerald"
          trend={periodLabel(model.period)}
          value={formatMonetizationAmount(model.summary.totalRevenue)}
        />
        <StatCard
          icon={Coins}
          label="Net Revenue"
          tone="violet"
          trend="Summary-backed"
          value={formatMonetizationAmount(model.summary.netRevenue)}
        />
        <StatCard
          icon={CalendarDays}
          label="Avg Revenue / Day"
          tone="amber"
          trend="Selected period"
          value={formatMonetizationAmount(model.summary.averageRevenuePerDay)}
        />
        <StatCard
          icon={RadioTower}
          label="Confirmed Events"
          tone="rose"
          trend="Summary or aggregate count"
          value={formatMonetizationCount(model.summary.totalConfirmedEvents)}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_360px]">
        <article className="card space-y-4">
          <SectionHeader
            title="Revenue Trend"
            description="Zeitverlauf aus vorhandenen Summary- oder Event-Aggregates. Fehlende Daten bleiben explizit leer."
          />

          {model.trend.length > 0 ? (
            <div className="space-y-3">
              {model.trend.map((point) => (
                <article
                  key={`${point.source}:${point.periodStart}`}
                  className="rounded-lg border border-white/10 bg-white/5 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
                        {point.label}
                      </h3>
                      <p className="mt-2 text-xl font-semibold text-white">
                        {formatMonetizationAmount(point.amount)}
                      </p>
                    </div>
                    <Pill tone="slate">
                      {point.source === "summaries"
                        ? "Summary trend"
                        : "Event aggregate"}
                    </Pill>
                  </div>
                </article>
              ))}
            </div>
          ) : model.state !== "ready" ? (
            <StateEmptyState
              state={model.state}
              title="Revenue Trend konnte nicht geladen werden"
            />
          ) : hasLookupIssues ? (
            <PartialState
              title="Trend teilweise verfuegbar"
              body="Mindestens eine Monetization-Quelle ist ausgefallen. Der Zeitverlauf bleibt deshalb leer oder unvollstaendig."
            />
          ) : hasData ? (
            <EmptyState
              title="Kein Trend fuer den Zeitraum"
              body="Es gibt derzeit keine verwertbaren Summary- oder Event-Aggregates fuer diesen Zeitraum."
            />
          ) : (
            <EmptyState
              title="Noch keine Monetization-Daten"
              body="Sobald serverseitig Monetization-Events oder Summaries vorhanden sind, zeigt dieser Bereich den Revenue-Verlauf."
            />
          )}
        </article>

        <aside className="card space-y-4">
          <SectionHeader
            title="Coverage"
            description="Abdeckung und Data-Source-Metadaten fuer die read-only Monetization-Surface."
          />

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <CoverageTile
              helper="Geladene Summary-Zeilen"
              label="Summaries"
              value={String(model.coverage.summaryRowCount)}
            />
            <CoverageTile
              helper="Geladene Recent Events"
              label="Recent Events"
              value={String(model.coverage.recentEventCount)}
            />
            <CoverageTile
              helper="Aggregierte Revenue Sources"
              label="Source Buckets"
              value={String(model.coverage.aggregateSourceCount)}
            />
            <CoverageTile
              helper="Confirmed revenue providers"
              label="Platforms"
              value={String(model.summary.activePlatforms)}
            />
          </div>

          <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
            <p className="font-semibold text-white">Currency mode</p>
            <p className="mt-2">
              {model.coverage.currencyMode === "single" &&
                (model.coverage.currencies[0] ?? "Unknown")}
              {model.coverage.currencyMode === "mixed" &&
                `Mixed (${model.coverage.currencies.join(", ")})`}
              {model.coverage.currencyMode === "unknown" && "Unavailable"}
            </p>
            <p className="mt-4 font-semibold text-white">Trend source</p>
            <p className="mt-2 capitalize">
              {model.coverage.trendSource === "none"
                ? "Unavailable"
                : model.coverage.trendSource}
            </p>
            <p className="mt-4 font-semibold text-white">Source breakdown</p>
            <p className="mt-2 capitalize">
              {model.coverage.sourceBreakdownSource === "none"
                ? "Unavailable"
                : model.coverage.sourceBreakdownSource}
            </p>
            <p className="mt-4 font-semibold text-white">Latest event</p>
            <p className="mt-2">
              {formatMonetizationDateTime(model.coverage.latestEventAt)}
            </p>
          </div>
        </aside>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.35fr)]">
        <article className="card space-y-4">
          <SectionHeader
            title="Revenue by Source"
            description="Quelle oder Event-Typ mit expliziten Availability-Labels fuer fehlende Umsatzbetraege."
          />

          {model.revenueBySource.length > 0 ? (
            <div className="space-y-3">
              {model.revenueBySource.map((item) => (
                <article
                  key={item.key}
                  className="rounded-lg border border-white/10 bg-white/5 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-white">
                        {item.label}
                      </h3>
                      <p className="mt-1 text-sm text-slate-400">
                        {formatMonetizationCount(item.eventCount)} events
                      </p>
                    </div>
                    <strong className="text-base text-white">
                      {formatMonetizationAmount(item.amount)}
                    </strong>
                  </div>
                </article>
              ))}
            </div>
          ) : model.state !== "ready" ? (
            <StateEmptyState
              state={model.state}
              title="Revenue Sources konnten nicht geladen werden"
            />
          ) : hasLookupIssues ? (
            <PartialState
              title="Revenue Sources teilweise verfuegbar"
              body="Einige Monetization-Reads sind ausgefallen. StreamOS ersetzt fehlende Umsatzgruppen nicht durch stillschweigende Nullwerte."
            />
          ) : hasData ? (
            <EmptyState
              title="Keine Revenue Sources verfuegbar"
              body="Fuer diesen Zeitraum gibt es keine verwertbaren Revenue-Gruppen oder nur Count-only Summary-Daten ohne Umsatzbetraege."
            />
          ) : (
            <EmptyState
              title="Noch keine Revenue Sources"
              body="Sobald bestaetigte Monetization-Daten vorliegen, erscheinen hier Revenue-Gruppen nach Quelle."
            />
          )}
        </article>

        <article className="card space-y-4">
          <SectionHeader
            title="Recent Monetization Events"
            description="Neueste Events aus einer begrenzten, user-scoped Feed-Abfrage."
          />

          {model.recentEvents.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-white/10 text-xs uppercase tracking-[0.08em] text-slate-500">
                  <tr>
                    <th className="py-3 pr-4 font-semibold">Datum</th>
                    <th className="px-4 py-3 font-semibold">Plattform</th>
                    <th className="px-4 py-3 font-semibold">Typ</th>
                    <th className="px-4 py-3 font-semibold">Source</th>
                    <th className="px-4 py-3 text-right font-semibold">
                      Betrag
                    </th>
                    <th className="py-3 pl-4 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {model.recentEvents.map((event) => (
                    <tr key={event.id} className="text-slate-300">
                      <td className="py-3 pr-4 text-slate-400">
                        {formatMonetizationDateTime(event.occurredAt)}
                      </td>
                      <td className="px-4 py-3 font-medium text-white">
                        {getMonetizationPlatformLabel(event.provider)}
                      </td>
                      <td className="px-4 py-3">
                        {getMonetizationSourceLabel(event.eventType)}
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {getMonetizationSourceLabel(event.source)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-white">
                        {formatMonetizationAmount(event.amount)}
                      </td>
                      <td className="py-3 pl-4">
                        <Pill tone={statusTone(event.status)}>
                          {getMonetizationStatusLabel(event.status)}
                        </Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : model.state !== "ready" ? (
            <StateEmptyState
              state={model.state}
              title="Recent Events konnten nicht geladen werden"
            />
          ) : hasLookupIssues ? (
            <PartialState
              title="Recent Events teilweise verfuegbar"
              body="Die Event-Feed-Abfrage ist fehlgeschlagen oder unvollstaendig. Deshalb zeigt StreamOS keinen irrefuehrenden leeren Verlauf."
            />
          ) : (
            <EmptyState
              title="Keine Monetization Events im Zeitraum"
              body="Es gibt aktuell keine user-scoped Monetization-Events fuer den ausgewaehlten Zeitraum."
            />
          )}
        </article>
      </section>

      <section className="card space-y-4">
        <SectionHeader
          title="Top Revenue Sources"
          description="Die staerksten Revenue-Gruppen im aktuellen Zeitraum, sofern Umsatzbetraege oder belastbare Count-only Summary-Daten vorliegen."
        />

        {model.topRevenueSources.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-3">
            {model.topRevenueSources.map((item) => (
              <article
                key={item.key}
                className="rounded-lg border border-white/10 bg-white/5 p-4"
              >
                <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
                  {item.label}
                </p>
                <p className="mt-3 text-xl font-semibold text-white">
                  {formatMonetizationAmount(item.amount)}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {formatMonetizationCount(item.eventCount)} events
                </p>
              </article>
            ))}
          </div>
        ) : model.state !== "ready" ? (
          <StateEmptyState
            state={model.state}
            title="Top Revenue Sources konnten nicht geladen werden"
          />
        ) : hasLookupIssues ? (
          <PartialState
            title="Top Sources teilweise verfuegbar"
            body="Mindestens ein Monetization-Read ist ausgefallen. Deshalb bleibt diese Priorisierung konservativ leer."
          />
        ) : (
          <EmptyState
            title="Noch keine Top Revenue Sources"
            body="Sobald ausreichend Monetization-Daten vorliegen, zeigt dieser Bereich die staerksten Revenue-Gruppen."
          />
        )}
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

function FeedScopeNotice({ model }: { model: MonetizationDashboardModel }) {
  return (
    <section className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
      Diese Surface zeigt die neuesten {model.feed.returnedCount} Monetization
      Events bei einem Feed-Limit von {model.feed.limit}. Der Recent-Events
      Bereich bleibt deshalb sample-scoped.
    </section>
  );
}

function PartialLoadNotice() {
  return (
    <section className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
      Einige Monetization-Reads konnten nicht geladen werden. Vorhandene Daten
      bleiben sichtbar, aber Breakdown, Trend oder Recent Events koennen
      unvollstaendig sein.
    </section>
  );
}

function DisabledNotice() {
  return (
    <section className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
      Diese Monetization-Surface ist in dieser Laufzeit deaktiviert, weil die
      Supabase-Konfiguration nicht verfuegbar ist.
    </section>
  );
}

function UnauthorizedNotice() {
  return (
    <section className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
      Melde dich mit einer gueltigen Dashboard-Session an, bevor du das
      Monetization Dashboard laedst.
    </section>
  );
}

function AuthFailedNotice() {
  return (
    <section className="rounded-lg border border-signal-red/30 bg-signal-red/10 p-4 text-sm text-signal-red">
      Die Dashboard-Session konnte nicht geladen werden. Monetization bleibt
      deshalb leer, bis die Auth-Abfrage wieder erfolgreich ist.
    </section>
  );
}

function LoadFailedNotice() {
  return (
    <section className="rounded-lg border border-signal-red/30 bg-signal-red/10 p-4 text-sm text-signal-red">
      Monetization-Aggregates, Summaries und Recent Events konnten nicht geladen
      werden. StreamOS zeigt deshalb keine irrefuehrenden Fallbackdaten.
    </section>
  );
}

function StateEmptyState({
  state,
  title,
}: {
  state: MonetizationDashboardModel["state"];
  title: string;
}) {
  if (state === "disabled") {
    return (
      <EmptyState
        title="Monetization-Surface ist deaktiviert"
        body="Die erforderliche Supabase-Konfiguration fehlt in dieser Laufzeit. StreamOS ersetzt diesen Zustand nicht durch einen normalen Empty State."
        tone="warning"
      />
    );
  }

  if (state === "unauthorized") {
    return (
      <EmptyState
        title="Dashboard-Session erforderlich"
        body="Diese read-only Monetization-Surface rendert nur fuer angemeldete Nutzerinnen und Nutzer."
        tone="warning"
      />
    );
  }

  if (state === "auth-failed") {
    return (
      <EmptyState
        title="Session konnte nicht geladen werden"
        body="Die Auth-Pruefung ist fehlgeschlagen. Die Surface bleibt konservativ leer, statt erfolgreiche Monetization-Reads vorzutaeuschen."
        tone="warning"
      />
    );
  }

  return (
    <EmptyState
      title={title}
      body="Die zugrunde liegenden Monetization-Reads haben keine belastbaren Daten geliefert. Die Surface ersetzt diesen Totalausfall nicht durch einen stillen Empty State."
      tone="warning"
    />
  );
}

function PartialState({ body, title }: { body: string; title: string }) {
  return <EmptyState title={title} body={body} tone="warning" />;
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

function CoverageTile({
  helper,
  label,
  value,
}: {
  helper: string;
  label: string;
  value: string;
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
  children: React.ReactNode;
  tone?: "amber" | "emerald" | "red" | "slate" | "violet";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold",
        tone === "amber" &&
          "border-amber-300/30 bg-amber-300/10 text-amber-200",
        tone === "emerald" &&
          "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
        tone === "red" &&
          "border-signal-red/30 bg-signal-red/10 text-signal-red",
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

function statusTone(
  status: MonetizationDashboardModel["recentEvents"][number]["status"],
): "amber" | "emerald" | "red" | "slate" | "violet" {
  if (status === "confirmed") {
    return "emerald";
  }

  if (status === "pending") {
    return "amber";
  }

  if (status === "disputed" || status === "refunded" || status === "failed") {
    return "red";
  }

  return "slate";
}

function periodLabel(period: MonetizationDashboardModel["period"]): string {
  if (period === "last_7_days") {
    return "Last 7 days";
  }

  if (period === "all_time") {
    return "All time";
  }

  return "Last 30 days";
}
