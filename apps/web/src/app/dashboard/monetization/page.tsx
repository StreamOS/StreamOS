import {
  BadgeDollarSign,
  CalendarDays,
  CircleDollarSign,
  RadioTower,
} from "lucide-react";
import { StatCard } from "@streamos/ui";
import {
  formatDateTime,
  formatEventType,
  formatMoney,
  formatProvider,
  formatStatus,
  periodLabel,
} from "@/app/dashboard/modules/monetization/formatters";
import {
  getMonetizationDashboardData,
  parseMonetizationPeriod,
} from "@/app/dashboard/modules/monetization/data";
import { RevenueOverTimeChart } from "@/app/dashboard/modules/monetization/RevenueOverTimeChart";
import {
  MONETIZATION_PERIODS,
  type MonetizationBreakdownItem,
  type MonetizationPeriod,
  type MonetizationPlatformRevenue,
  type RecentMonetizationEvent,
} from "@/app/dashboard/modules/monetization/types";

type MonetizationPageProps = {
  searchParams?: Promise<{
    period?: string;
  }>;
};

export default async function MonetizationPage({
  searchParams,
}: MonetizationPageProps) {
  const params = await searchParams;
  const selectedPeriod = parseMonetizationPeriod(params?.period);
  const dashboard = await getMonetizationDashboardData(selectedPeriod);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-signal-green">
            Monetization
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-white">
            Umsatz, Plattform-Mix und letzte Zahlungen
          </h1>
        </div>
        <PeriodFilter selectedPeriod={selectedPeriod} />
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard
          icon={BadgeDollarSign}
          label="Total Revenue"
          tone="emerald"
          trend={periodLabel(dashboard.period)}
          value={formatMoney(dashboard.totalRevenueCents, dashboard.currency)}
        />
        <StatCard
          icon={RadioTower}
          label="Active Platforms"
          tone="violet"
          trend="Confirmed revenue sources"
          value={String(dashboard.activePlatforms)}
        />
        <StatCard
          icon={CalendarDays}
          label="Avg Revenue / Day"
          tone="amber"
          trend={periodLabel(dashboard.period)}
          value={formatMoney(
            dashboard.avgRevenuePerDayCents,
            dashboard.currency,
          )}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.9fr)]">
        <RevenueOverTimeChart
          currency={dashboard.currency}
          data={dashboard.trend}
        />
        <RevenueByPlatform
          currency={dashboard.currency}
          items={dashboard.platformRevenue}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(320px,.85fr)_minmax(0,1.4fr)]">
        <RevenueBreakdown
          currency={dashboard.currency}
          items={dashboard.breakdown}
        />
        <RecentEventsTable events={dashboard.recentEvents} />
      </section>
    </div>
  );
}

function PeriodFilter({
  selectedPeriod,
}: {
  selectedPeriod: MonetizationPeriod;
}) {
  return (
    <nav
      aria-label="Monetization period"
      className="inline-flex w-full rounded-lg border border-white/10 bg-white/5 p-1 md:w-auto"
    >
      {MONETIZATION_PERIODS.map((period) => {
        const isSelected = period.id === selectedPeriod;

        return (
          <a
            aria-current={isSelected ? "page" : undefined}
            className={`flex min-h-9 flex-1 items-center justify-center rounded-md px-3 text-sm font-semibold transition md:flex-none ${
              isSelected
                ? "bg-white text-surface-950"
                : "text-slate-300 hover:bg-white/10 hover:text-white"
            }`}
            href={`/dashboard/monetization?period=${period.id}`}
            key={period.id}
          >
            {period.label}
          </a>
        );
      })}
    </nav>
  );
}

function RevenueByPlatform({
  currency,
  items,
}: {
  currency: string;
  items: MonetizationPlatformRevenue[];
}) {
  const maxAmount = Math.max(...items.map((item) => item.amountCents), 1);

  return (
    <section className="card">
      <div className="flex items-center gap-3">
        <span className="rounded-lg border border-brand-500/20 bg-brand-500/10 p-2 text-brand-500">
          <CircleDollarSign className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
            Revenue per Platform
          </p>
          <h2 className="mt-1 text-lg font-semibold text-white">
            Plattform-Mix
          </h2>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {items.map((item) => (
          <div key={item.provider}>
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="font-medium text-slate-200">{item.label}</span>
              <span className="text-slate-400">
                {formatMoney(item.amountCents, currency)}
              </span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-white/10">
              <div
                className="h-2 rounded-full bg-signal-green"
                style={{
                  width: `${Math.max(3, (item.amountCents / maxAmount) * 100)}%`,
                }}
              />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {item.eventCount} events
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function RevenueBreakdown({
  currency,
  items,
}: {
  currency: string;
  items: MonetizationBreakdownItem[];
}) {
  return (
    <section className="card">
      <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
        Revenue Breakdown
      </p>
      <h2 className="mt-2 text-lg font-semibold text-white">Event-Typen</h2>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <article
            className="rounded-lg border border-white/10 bg-white/5 p-4"
            key={item.id}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-200">
                  {item.label}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {item.eventCount} events
                </p>
              </div>
              <strong className="text-right text-base text-white">
                {formatMoney(item.amountCents, currency)}
              </strong>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function RecentEventsTable({ events }: { events: RecentMonetizationEvent[] }) {
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
            Latest Events
          </p>
          <h2 className="mt-2 text-lg font-semibold text-white">
            Letzte Monetization Events
          </h2>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="border-b border-white/10 text-xs uppercase tracking-[0.08em] text-slate-500">
            <tr>
              <th className="py-3 pr-4 font-semibold">Datum</th>
              <th className="px-4 py-3 font-semibold">Plattform</th>
              <th className="px-4 py-3 font-semibold">Typ</th>
              <th className="px-4 py-3 text-right font-semibold">Betrag</th>
              <th className="py-3 pl-4 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {events.length === 0 ? (
              <tr>
                <td className="py-8 text-center text-slate-400" colSpan={5}>
                  Keine Monetization Events im ausgewaehlten Zeitraum.
                </td>
              </tr>
            ) : (
              events.map((event) => (
                <RecentEventRow event={event} key={event.id} />
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RecentEventRow({ event }: { event: RecentMonetizationEvent }) {
  return (
    <tr className="text-slate-300">
      <td className="py-3 pr-4 text-slate-400">
        {formatDateTime(event.occurredAt)}
      </td>
      <td className="px-4 py-3 font-medium text-white">
        {formatProvider(event.provider)}
      </td>
      <td className="px-4 py-3">{formatEventType(event.eventType)}</td>
      <td className="px-4 py-3 text-right font-semibold text-white">
        {formatMoney(event.amountCents, event.currency)}
      </td>
      <td className="py-3 pl-4">
        <span
          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(
            event.status,
          )}`}
        >
          {formatStatus(event.status)}
        </span>
      </td>
    </tr>
  );
}

function statusTone(status: RecentMonetizationEvent["status"]): string {
  if (status === "confirmed") {
    return "border-signal-green/30 bg-signal-green/10 text-signal-green";
  }

  if (status === "pending") {
    return "border-signal-gold/30 bg-signal-gold/10 text-signal-gold";
  }

  return "border-signal-red/30 bg-signal-red/10 text-signal-red";
}
