import React from "react";
import Link from "next/link";
import { MONETIZATION_DASHBOARD_PERIOD_OPTIONS } from "@streamos/types";
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
  MONETIZATION_EVENT_LIST_FILTER_EVENT_TYPES,
  MONETIZATION_EVENT_LIST_FILTER_PROVIDERS,
  MONETIZATION_EVENT_LIST_FILTER_STATUSES,
  encodeMonetizationEventCursorToken,
  formatMonetizationAmount,
  formatMonetizationCount,
  formatMonetizationDateTime,
  getMonetizationBreakdownValueLabel,
  getMonetizationDashboardPeriodLabel,
  getMonetizationPlatformLabel,
  getMonetizationStatusLabel,
  type MonetizationDashboardModel,
  type MonetizationEventListView,
} from "./MonetizationDashboardConsole.utils";
import { getMonetizationSourceCategoryLabel } from "./monetizationSourceTaxonomy";

type MonetizationDashboardConsoleProps = {
  eventListView: MonetizationEventListView;
  model: MonetizationDashboardModel;
};

export function MonetizationDashboardConsole({
  eventListView,
  model,
}: MonetizationDashboardConsoleProps) {
  const hasLookupIssues = model.lookupIssues.length > 0;
  const showPartialLoadNotice = model.state === "ready" && hasLookupIssues;
  const showDataQualityNotice =
    model.state === "ready" && model.dataQuality.notices.length > 0;
  const hasData =
    model.coverage.summaryRowCount > 0 ||
    model.recentEvents.length > 0 ||
    model.revenueBreakdown.length > 0 ||
    model.trend.length > 0 ||
    model.summary.totalRevenue.availability !== "unavailable" ||
    model.summary.totalConfirmedEvents !== null;
  const revenueBreakdownTitle = getRevenueBreakdownTitle(
    model.revenueBreakdownContext,
  );
  const revenueCategoryTitle = getRevenueCategoryTitle(
    model.revenueBreakdownContext,
  );
  const hasActiveEventFilters =
    eventListView.eventType !== null ||
    eventListView.provider !== null ||
    eventListView.source !== null ||
    eventListView.status !== null;
  const visibleEventSources = [
    ...new Set(
      model.recentEvents
        .map((event) => event.source)
        .filter((source): source is string => source !== null),
    ),
  ].slice(0, 4);

  return (
    <div className="space-y-6">
      {model.state === "disabled" && <DisabledNotice />}
      {model.state === "unauthorized" && <UnauthorizedNotice />}
      {model.state === "auth-failed" && <AuthFailedNotice />}
      {model.state === "load-failed" && <LoadFailedNotice />}
      {model.periodContext.periodCoverageNote && (
        <PeriodCoverageNote note={model.periodContext.periodCoverageNote} />
      )}
      {model.feed.scope === "server_page" && <FeedScopeNotice model={model} />}
      {showPartialLoadNotice && <PartialLoadNotice />}
      {showDataQualityNotice && <DataQualityNotice model={model} />}

      <header className="grid gap-6 rounded-lg border border-white/10 bg-surface-900/85 p-6 shadow-[0_22px_70px_rgba(0,0,0,0.42)] xl:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-signal-green">
            Monetization Dashboard
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-normal text-white md:text-5xl">
            Read-only Umsatz, Revenue Breakdown und letzte Monetization Events
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-400">
            Diese Surface nutzt vorhandene Monetization-Events und Summary-Daten
            tenant-scoped und ohne Provider-Syncs, Payment-Writes oder externe
            Integrationen.
          </p>
          <div className="mt-6 space-y-4">
            <PeriodControls model={model} />
            <p className="text-sm text-slate-400">
              Aktive Revenue-Perspektive:{" "}
              <span className="font-semibold text-white">
                {model.periodContext.periodLabel}
              </span>
            </p>
          </div>
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
              Period scope: {model.periodContext.periodLabel} mit expliziter
              Coverage statt stillen Vollstaendigkeitsannahmen.
            </li>
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
          trend={model.periodContext.periodLabel}
          value={formatMonetizationAmount(model.summary.totalRevenue)}
        />
        <StatCard
          icon={Coins}
          label="Net Revenue"
          tone="violet"
          trend={
            model.period === "all_time"
              ? "Weekly summaries in MVP"
              : `${model.periodContext.periodLabel} summaries`
          }
          value={formatMonetizationAmount(model.summary.netRevenue)}
        />
        <StatCard
          icon={CalendarDays}
          label="Avg Revenue / Day"
          tone="amber"
          trend={`Within ${model.periodContext.periodLabel}`}
          value={formatMonetizationAmount(model.summary.averageRevenuePerDay)}
        />
        <StatCard
          icon={RadioTower}
          label="Confirmed Events"
          tone="rose"
          trend={`${model.periodContext.periodLabel} scope`}
          value={formatMonetizationCount(model.summary.totalConfirmedEvents)}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_360px]">
        <article className="card space-y-4">
          <SectionHeader
            title="Revenue Trend"
            description={`Zeitverlauf fuer ${model.periodContext.periodLabel} aus vorhandenen Summary- oder Event-Aggregates. Fehlende Daten bleiben explizit leer.`}
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
              body="Sobald Plattformverbindungen und serverseitige Monetization-Ingestion erste Events oder Summary-Zeilen liefern, zeigt dieser Bereich den Revenue-Verlauf."
            />
          )}
        </article>

        <aside className="card space-y-4">
          <SectionHeader
            title="Coverage"
            description={`Abdeckung und Data-Source-Metadaten fuer ${model.periodContext.periodLabel}.`}
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
              helper="Aggregierte confirmed source buckets"
              label="Breakdown Buckets"
              value={String(model.coverage.aggregateSourceCount)}
            />
            <CoverageTile
              helper="Confirmed revenue providers"
              label="Platforms"
              value={String(model.summary.activePlatforms)}
            />
            <CoverageTile
              helper="Letzter Summary-Zeitraum mit Monetization-Abdeckung"
              label="Latest Summary"
              value={formatMonetizationDateTime(
                model.coverage.latestSummaryPeriodEnd,
              )}
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
            <p className="mt-4 font-semibold text-white">Revenue breakdown</p>
            <p className="mt-2">{formatRevenueBreakdownCoverage(model)}</p>
            <p className="mt-4 font-semibold text-white">Category taxonomy</p>
            <p className="mt-2">
              {model.coverage.revenueBreakdownDataSource === "none"
                ? "Unavailable"
                : "Canonical business categories derived client-side"}
            </p>
            <p className="mt-4 font-semibold text-white">Latest event</p>
            <p className="mt-2">
              {formatMonetizationDateTime(model.coverage.latestEventAt)}
            </p>
            <p className="mt-4 font-semibold text-white">Selected period</p>
            <p className="mt-2">{model.periodContext.periodLabel}</p>
          </div>
        </aside>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.35fr)]">
        <article className="card space-y-4">
          <SectionHeader
            title={revenueBreakdownTitle}
            description={getRevenueBreakdownDescription(model)}
          />

          {model.revenueBreakdownContext.note ? (
            <section className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
              {model.revenueBreakdownContext.note}
            </section>
          ) : null}

          {model.revenueBreakdown.length > 0 ? (
            <div className="space-y-3">
              {model.revenueBreakdown.map((item) => (
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
                      {model.revenueBreakdownContext.dimension === "source" ? (
                        <p className="mt-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                          Category:{" "}
                          <span className="text-slate-300">
                            {getMonetizationSourceCategoryLabel(item.category)}
                          </span>
                        </p>
                      ) : null}
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
              title={`${revenueBreakdownTitle} konnten nicht geladen werden`}
            />
          ) : hasLookupIssues ? (
            <PartialState
              title={`${revenueBreakdownTitle} teilweise verfuegbar`}
              body="Einige Monetization-Reads sind ausgefallen. StreamOS ersetzt fehlende Umsatzgruppen nicht durch stillschweigende Nullwerte."
            />
          ) : hasData ? (
            <EmptyState
              title={getEmptyRevenueBreakdownTitle(
                model.revenueBreakdownContext,
              )}
              body="Fuer diesen Zeitraum gibt es keine verwertbaren Revenue-Gruppen."
            />
          ) : (
            <EmptyState
              title={getInitialRevenueBreakdownTitle(
                model.revenueBreakdownContext,
              )}
              body="Sobald Plattformverbindungen und serverseitige Monetization-Daten vorliegen, erscheinen hier Revenue-Gruppen mit ehrlicher Breakdown-Semantik."
            />
          )}
        </article>

        <article className="card space-y-4">
          <SectionHeader
            title="Recent Monetization Events"
            description={`Neueste Events bei aktiver Revenue-Perspektive ${model.periodContext.periodLabel} aus einer serverseitig begrenzten, user-scoped Feed-Abfrage.`}
          />
          <EventFeedControls
            eventListView={eventListView}
            hasActiveEventFilters={hasActiveEventFilters}
            model={model}
            visibleSources={visibleEventSources}
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
                        {getMonetizationBreakdownValueLabel(event.eventType)}
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        <div>
                          <p>
                            {event.source
                              ? getMonetizationBreakdownValueLabel(event.source)
                              : "Unavailable"}
                          </p>
                          <p className="mt-1 text-xs uppercase tracking-[0.08em] text-slate-500">
                            {getMonetizationSourceCategoryLabel(
                              event.sourceCategory,
                            )}
                          </p>
                        </div>
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
          ) : hasActiveEventFilters ? (
            <EmptyState
              title="Keine Events fuer die aktiven Filter"
              body="Im ausgewaehlten Zeitraum wurden fuer die aktuellen Event-Filter keine user-scoped Monetization-Events gefunden."
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
          title={revenueCategoryTitle}
          description={getRevenueCategoryDescription(model)}
        />

        {model.revenueCategories.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-3">
            {model.revenueCategories.map((item) => (
              <article
                key={item.category}
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
            title={`${revenueCategoryTitle} konnten nicht geladen werden`}
          />
        ) : hasLookupIssues ? (
          <PartialState
            title={`${revenueCategoryTitle} teilweise verfuegbar`}
            body="Mindestens ein Monetization-Read ist ausgefallen. Deshalb bleibt diese Priorisierung konservativ leer."
          />
        ) : (
          <EmptyState
            title={getInitialRevenueCategoryTitle(
              model.revenueBreakdownContext,
            )}
            body="Sobald ausreichend serverseitige Monetization-Daten verfuegbar sind, zeigt dieser Bereich die staerksten Revenue-Gruppen."
          />
        )}
      </section>
    </div>
  );
}

function EventFeedControls({
  eventListView,
  hasActiveEventFilters,
  model,
  visibleSources,
}: {
  eventListView: MonetizationEventListView;
  hasActiveEventFilters: boolean;
  model: MonetizationDashboardModel;
  visibleSources: string[];
}) {
  const loadMoreHref =
    model.feed.hasMore && model.feed.nextCursor
      ? buildMonetizationEventListHref({
          overrides: {
            cursor: model.feed.nextCursor,
            cursorPeriod: model.period,
            cursorServerFilters: {
              eventType: eventListView.eventType,
              provider: eventListView.provider,
              source: eventListView.source,
              status: eventListView.status,
            },
            cursorToken: encodeMonetizationEventCursorToken({
              cursor: model.feed.nextCursor,
              period: model.period,
              serverFilters: {
                eventType: eventListView.eventType,
                provider: eventListView.provider,
                source: eventListView.source,
                status: eventListView.status,
              },
            }),
          },
          period: model.period,
          view: eventListView,
        })
      : null;

  return (
    <section className="rounded-lg border border-white/10 bg-white/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
            Event Feed Controls
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Diese Filter bleiben read-only, tenant-scoped und wirken nur auf den
            Monetization Event Feed. Die Summary-Reads bleiben unveraendert,
            waehrend der Feed serverseitig begrenzt und cursor-basiert erweitert
            wird.
          </p>
        </div>
        <Pill tone="slate">
          {model.feed.scope === "server_page" ? "Server page" : "Full result"}
        </Pill>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
          Aktive Filter
        </span>
        {hasActiveEventFilters ? (
          <>
            {eventListView.eventType ? (
              <Pill tone="violet">
                Type:{" "}
                {getMonetizationBreakdownValueLabel(eventListView.eventType)}
              </Pill>
            ) : null}
            {eventListView.provider ? (
              <Pill tone="violet">
                Platform: {getMonetizationPlatformLabel(eventListView.provider)}
              </Pill>
            ) : null}
            {eventListView.status ? (
              <Pill tone="violet">
                Status: {getMonetizationStatusLabel(eventListView.status)}
              </Pill>
            ) : null}
            {eventListView.source ? (
              <Pill tone="violet">
                Source:{" "}
                {getMonetizationBreakdownValueLabel(eventListView.source)}
              </Pill>
            ) : null}
          </>
        ) : (
          <span className="text-sm text-slate-400">Keine</span>
        )}
      </div>

      <div className="mt-4 space-y-4">
        <FilterGroup
          activeValue={eventListView.eventType}
          label="Event Type"
          options={MONETIZATION_EVENT_LIST_FILTER_EVENT_TYPES.map(
            (eventType) => ({
              href: buildMonetizationEventListHref({
                overrides: {
                  cursor: null,
                  cursorPeriod: null,
                  cursorServerFilters: null,
                  cursorToken: null,
                  eventType,
                },
                period: model.period,
                view: eventListView,
              }),
              label: getMonetizationBreakdownValueLabel(eventType),
              value: eventType,
            }),
          )}
          resetHref={buildMonetizationEventListHref({
            overrides: {
              cursor: null,
              cursorPeriod: null,
              cursorServerFilters: null,
              cursorToken: null,
              eventType: null,
            },
            period: model.period,
            view: eventListView,
          })}
        />
        <FilterGroup
          activeValue={eventListView.provider}
          label="Platform"
          options={MONETIZATION_EVENT_LIST_FILTER_PROVIDERS.map((provider) => ({
            href: buildMonetizationEventListHref({
              overrides: {
                cursor: null,
                cursorPeriod: null,
                cursorServerFilters: null,
                cursorToken: null,
                provider,
              },
              period: model.period,
              view: eventListView,
            }),
            label: getMonetizationPlatformLabel(provider),
            value: provider,
          }))}
          resetHref={buildMonetizationEventListHref({
            overrides: {
              cursor: null,
              cursorPeriod: null,
              cursorServerFilters: null,
              cursorToken: null,
              provider: null,
            },
            period: model.period,
            view: eventListView,
          })}
        />
        <FilterGroup
          activeValue={eventListView.status}
          label="Status"
          options={MONETIZATION_EVENT_LIST_FILTER_STATUSES.map((status) => ({
            href: buildMonetizationEventListHref({
              overrides: {
                cursor: null,
                cursorPeriod: null,
                cursorServerFilters: null,
                cursorToken: null,
                status,
              },
              period: model.period,
              view: eventListView,
            }),
            label: getMonetizationStatusLabel(status),
            value: status,
          }))}
          resetHref={buildMonetizationEventListHref({
            overrides: {
              cursor: null,
              cursorPeriod: null,
              cursorServerFilters: null,
              cursorToken: null,
              status: null,
            },
            period: model.period,
            view: eventListView,
          })}
        />
        {visibleSources.length > 0 ? (
          <FilterGroup
            activeValue={eventListView.source}
            label="Quick Sources"
            options={visibleSources.map((source) => ({
              href: buildMonetizationEventListHref({
                overrides: {
                  cursor: null,
                  cursorPeriod: null,
                  cursorServerFilters: null,
                  cursorToken: null,
                  source,
                },
                period: model.period,
                view: eventListView,
              }),
              label: getMonetizationBreakdownValueLabel(source),
              value: source,
            }))}
            resetHref={buildMonetizationEventListHref({
              overrides: {
                cursor: null,
                cursorPeriod: null,
                cursorServerFilters: null,
                cursorToken: null,
                source: null,
              },
              period: model.period,
              view: eventListView,
            })}
          />
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-400">
        <span>
          Server page: {model.feed.returnedCount}
          {model.feed.totalCount !== undefined
            ? ` von ${model.feed.totalCount}`
            : ""}{" "}
          Events in {getMonetizationDashboardPeriodLabel(model.period)}
        </span>
        {hasActiveEventFilters ? (
          <Link
            href={buildMonetizationEventListHref({
              overrides: {
                cursor: null,
                cursorPeriod: null,
                cursorServerFilters: null,
                cursorToken: null,
                eventType: null,
                provider: null,
                source: null,
                status: null,
              },
              period: model.period,
              view: eventListView,
            })}
            className="text-sm font-semibold text-signal-green hover:text-emerald-300"
          >
            Clear event filters
          </Link>
        ) : null}
        {loadMoreHref ? (
          <Link
            href={loadMoreHref}
            className="text-sm font-semibold text-signal-green hover:text-emerald-300"
          >
            Load older events
          </Link>
        ) : null}
      </div>

      {eventListView.cursorToken ? (
        <p className="mt-3 text-xs uppercase tracking-[0.08em] text-slate-500">
          Diese Ansicht wurde ueber einen servergebundenen Cursor geladen.
          Filterwechsel oder Reset fuehren fail-safe auf die erste Feed-Seite
          zurueck.
        </p>
      ) : null}
    </section>
  );
}

function FilterGroup({
  activeValue,
  label,
  options,
  resetHref,
}: {
  activeValue: string | null;
  label: string;
  options: Array<{
    href: string;
    label: string;
    value: string;
  }>;
  resetHref: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </p>
      <div className="flex flex-wrap gap-2">
        <FilterLink href={resetHref} isActive={activeValue === null}>
          All
        </FilterLink>
        {options.map((option) => (
          <FilterLink
            key={`${label}:${option.value}`}
            href={option.href}
            isActive={activeValue === option.value}
          >
            {option.label}
          </FilterLink>
        ))}
      </div>
    </div>
  );
}

function FilterLink({
  children,
  href,
  isActive,
}: {
  children: React.ReactNode;
  href: string;
  isActive: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "inline-flex min-h-9 items-center rounded-full border px-3 text-sm font-semibold transition-colors",
        isActive
          ? "border-signal-green/30 bg-signal-green/10 text-signal-green"
          : "border-white/10 bg-surface-950/60 text-slate-300 hover:bg-white/10 hover:text-white",
      )}
    >
      {children}
    </Link>
  );
}

function PeriodControls({ model }: { model: MonetizationDashboardModel }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {MONETIZATION_DASHBOARD_PERIOD_OPTIONS.map((option) => {
        const isActive = option.id === model.periodContext.selectedPeriod;

        return (
          <Link
            key={option.id}
            href={`/dashboard/monetization?period=${option.id}`}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-semibold transition-colors",
              isActive
                ? "border-signal-green/30 bg-signal-green/10 text-signal-green"
                : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white",
            )}
          >
            {option.label}
          </Link>
        );
      })}
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

function PeriodCoverageNote({ note }: { note: string }) {
  return (
    <section className="rounded-lg border border-slate-400/20 bg-slate-400/10 p-4 text-sm text-slate-200">
      {note}
    </section>
  );
}

function FeedScopeNotice({ model }: { model: MonetizationDashboardModel }) {
  return (
    <section className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
      Diese Surface zeigt pro serverseitiger Feed-Seite maximal{" "}
      {model.feed.limit} Monetization Events. Recent Events bleiben read-only
      und tenant-scoped; Summary-, Trend- und Breakdown-Reads werden davon nicht
      beeinflusst.
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

function DataQualityNotice({ model }: { model: MonetizationDashboardModel }) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
            Data Quality
          </p>
          <h2 className="mt-2 text-lg font-semibold text-white">
            Hinweise zur Datenabdeckung
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Diese Hinweise basieren nur auf bereits geladenen Monetization-
            Daten und helfen bei der Einordnung von Luecken, gemischten
            Waehrungen oder noch unkategorisierten Sources.
          </p>
        </div>
        <Pill tone="slate">
          {model.dataQuality.sourceObservationScope === "breakdown_events"
            ? "Period aggregate"
            : model.dataQuality.sourceObservationScope === "recent_event_sample"
              ? "Recent event sample"
              : "Unavailable"}
        </Pill>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {model.dataQuality.notices.map((notice) => (
          <article
            key={notice.code}
            className="rounded-lg border border-white/10 bg-surface-950/60 p-4"
          >
            <p className="text-sm font-semibold text-white">{notice.title}</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              {notice.description}
            </p>
          </article>
        ))}
      </div>
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

function getRevenueBreakdownTitle(
  context: MonetizationDashboardModel["revenueBreakdownContext"],
): string {
  if (context.dimension === "source") {
    return "Revenue by Source";
  }

  if (context.dimension === "summary_category") {
    return "Revenue Categories";
  }

  return "Revenue Breakdown";
}

function getRevenueCategoryTitle(
  context: MonetizationDashboardModel["revenueBreakdownContext"],
): string {
  return context.dimension === "source"
    ? "Revenue by Category"
    : "Revenue Categories";
}

function getRevenueBreakdownDescription(
  model: MonetizationDashboardModel,
): string {
  if (model.revenueBreakdownContext.dimension === "source") {
    return `Echte Source-Werte fuer ${model.periodContext.periodLabel} mit expliziten Availability-Labels fuer fehlende Umsatzbetraege.`;
  }

  if (model.revenueBreakdownContext.dimension === "summary_category") {
    return `Summary-Kategorien fuer ${model.periodContext.periodLabel}. Wenn nur Summary-Counts vorliegen, bleiben Umsatzbetraege explizit unavailable.`;
  }

  return `Breakdown fuer ${model.periodContext.periodLabel} mit konservativer Darstellung fehlender oder unvollstaendiger Monetization-Daten.`;
}

function getRevenueCategoryDescription(
  model: MonetizationDashboardModel,
): string {
  if (model.revenueBreakdownContext.dimension === "source") {
    return `Kanonische Business-Kategorien fuer ${model.periodContext.periodLabel}, clientseitig aus Raw Sources normalisiert und getrennt von den Originalwerten dargestellt.`;
  }

  if (model.revenueBreakdownContext.dimension === "summary_category") {
    return `Kanonische Kategorien fuer ${model.periodContext.periodLabel}. Bei Summary-Fallback bleiben Umsatzbetraege unveraendert unavailable, falls nur Count-Daten vorliegen.`;
  }

  return `Kanonische Kategorien fuer ${model.periodContext.periodLabel}, sobald belastbare Monetization-Daten verfuegbar sind.`;
}

function getInitialRevenueCategoryTitle(
  context: MonetizationDashboardModel["revenueBreakdownContext"],
): string {
  return context.dimension === "source"
    ? "Noch keine Revenue Categories"
    : "Noch keine Revenue Categories";
}

function formatRevenueBreakdownCoverage(
  model: MonetizationDashboardModel,
): string {
  if (model.coverage.revenueBreakdownDataSource === "none") {
    return "Unavailable";
  }

  if (model.coverage.revenueBreakdownDimension === "source") {
    return "Source via events";
  }

  if (model.coverage.revenueBreakdownDimension === "summary_category") {
    return "Summary category via summaries";
  }

  return model.coverage.revenueBreakdownDataSource;
}

function buildMonetizationEventListHref({
  overrides,
  period,
  view,
}: {
  overrides: Partial<MonetizationEventListView>;
  period: MonetizationDashboardModel["period"];
  view: MonetizationEventListView;
}) {
  const nextView: MonetizationEventListView = {
    ...view,
    ...overrides,
  };
  const searchParams = new URLSearchParams();

  searchParams.set("period", period);

  if (nextView.eventType) {
    searchParams.set("eventType", nextView.eventType);
  }

  if (nextView.provider) {
    searchParams.set("provider", nextView.provider);
  }

  if (nextView.status) {
    searchParams.set("status", nextView.status);
  }

  if (nextView.source) {
    searchParams.set("source", nextView.source);
  }

  if (nextView.cursorToken) {
    searchParams.set("cursor", nextView.cursorToken);
  }

  return `/dashboard/monetization?${searchParams.toString()}`;
}

function getEmptyRevenueBreakdownTitle(
  context: MonetizationDashboardModel["revenueBreakdownContext"],
): string {
  if (context.dimension === "source") {
    return "Keine Revenue Sources verfuegbar";
  }

  if (context.dimension === "summary_category") {
    return "Keine Revenue Categories verfuegbar";
  }

  return "Kein Revenue Breakdown verfuegbar";
}

function getInitialRevenueBreakdownTitle(
  context: MonetizationDashboardModel["revenueBreakdownContext"],
): string {
  if (context.dimension === "source") {
    return "Noch keine Revenue Sources";
  }

  if (context.dimension === "summary_category") {
    return "Noch keine Revenue Categories";
  }

  return "Noch kein Revenue Breakdown";
}
