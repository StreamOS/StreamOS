import type { Tables } from "@streamos/database";
import {
  MONETIZATION_DASHBOARD_PERIOD_OPTIONS,
  MONETIZATION_DASHBOARD_EVENT_LIMIT,
  type MonetizationAmountValue,
  type MonetizationDashboardLookupIssue,
  type MonetizationDashboardPeriod,
  type MonetizationDashboardPeriodContext,
  type MonetizationDashboardReadModel,
  type MonetizationRecentEvent,
  type MonetizationRevenueBreakdownContext,
  type MonetizationRevenueBreakdownItem,
  type MonetizationTrendPoint,
  type StreamPlatform,
} from "@streamos/types";

export type MonetizationDashboardState =
  | "auth-failed"
  | "disabled"
  | "load-failed"
  | "ready"
  | "unauthorized";

export type MonetizationEventRow = Pick<
  Tables<"monetization_events">,
  | "amount_cents"
  | "currency"
  | "event_type"
  | "id"
  | "occurred_at"
  | "provider"
  | "source"
  | "status"
>;

export type MonetizationSummaryRow = Pick<
  Tables<"monetization_summaries">,
  | "channel_id"
  | "currency"
  | "event_count"
  | "gross_amount_cents"
  | "merch_sale_count"
  | "net_amount_cents"
  | "period"
  | "period_end"
  | "period_start"
  | "provider"
  | "subscription_count"
  | "tip_count"
  | "donation_count"
  | "ad_revenue_count"
  | "sponsorship_count"
>;

export type MonetizationAggregateSourceRow = {
  amountCents: number | null;
  eventCount: number | null;
  key: string;
};

export type MonetizationAggregateTrendRow = {
  amountCents: number | null;
  label: string;
  periodEnd: string | null;
  periodStart: string;
  source: "events" | "summaries";
};

export type MonetizationAggregateSnapshot = {
  activePlatforms: number | null;
  averageRevenuePerDayCents: number | null;
  currency: string | null;
  sourceBreakdown: MonetizationAggregateSourceRow[];
  totalRevenueCents: number | null;
  trend: MonetizationAggregateTrendRow[];
};

export type MonetizationDashboardModel = MonetizationDashboardReadModel & {
  state: MonetizationDashboardState;
  userId: string | null;
};

const SUMMARY_CATEGORY_KEYS = [
  "subscription",
  "tip",
  "donation",
  "ad_revenue",
  "sponsorship",
  "merch_sale",
] as const;

type CurrencyState = {
  currencies: string[];
  mode: "mixed" | "single" | "unknown";
  primaryCurrency: string | null;
};

export function buildMonetizationDashboardModel({
  aggregate,
  feed,
  events,
  lookupIssues,
  period,
  state,
  summaries,
  userId,
}: {
  aggregate: MonetizationAggregateSnapshot;
  events: MonetizationEventRow[];
  feed: MonetizationDashboardModel["feed"];
  lookupIssues: MonetizationDashboardLookupIssue[];
  period: MonetizationDashboardPeriod;
  state: MonetizationDashboardState;
  summaries: MonetizationSummaryRow[];
  userId: string | null;
}): MonetizationDashboardModel {
  const currencyState = resolveCurrencyState(aggregate, events, summaries);
  const recentEvents = normalizeRecentEvents(events);
  const periodContext = buildPeriodContext(period);
  const revenueBreakdown = buildRevenueBreakdown({
    aggregate,
    currencyState,
    summaries,
  });
  const revenueBreakdownContext = buildRevenueBreakdownContext({
    aggregate,
    revenueBreakdown,
    summaries,
  });
  const topRevenueBreakdown = [...revenueBreakdown]
    .sort(compareRevenueBreakdownItems)
    .slice(0, 3);
  const trend = buildTrend({
    aggregate,
    currencyState,
    summaries,
  });
  const totals = buildSummaryMetrics({
    aggregate,
    currencyState,
    latestEventAt: recentEvents[0]?.occurredAt ?? null,
    summaries,
    trend,
  });

  return {
    coverage: {
      aggregateSourceCount: aggregate.sourceBreakdown.length,
      currencies: currencyState.currencies,
      currencyMode: currencyState.mode,
      latestEventAt: recentEvents[0]?.occurredAt ?? null,
      latestSummaryPeriodEnd:
        summaries.length > 0
          ? ([...summaries].sort((left, right) =>
              right.period_end.localeCompare(left.period_end),
            )[0]?.period_end ?? null)
          : null,
      recentEventCount: recentEvents.length,
      revenueBreakdownDataSource: revenueBreakdownContext.dataSource,
      revenueBreakdownDimension: revenueBreakdownContext.dimension,
      summaryRowCount: summaries.length,
      trendSource:
        summaries.length > 0
          ? "summaries"
          : trend.length > 0
            ? "events"
            : "none",
    },
    feed,
    lookupIssues,
    period,
    periodContext,
    recentEvents,
    revenueBreakdown,
    revenueBreakdownContext,
    state,
    summary: totals,
    topRevenueBreakdown,
    trend,
    userId,
  };
}

export function createEmptyMonetizationDashboardModel(
  period: MonetizationDashboardPeriod,
  userId: string | null,
  state: MonetizationDashboardState = "ready",
  lookupIssues: MonetizationDashboardLookupIssue[] = [],
): MonetizationDashboardModel {
  return {
    coverage: {
      aggregateSourceCount: 0,
      currencies: [],
      currencyMode: "unknown",
      latestEventAt: null,
      latestSummaryPeriodEnd: null,
      recentEventCount: 0,
      revenueBreakdownDataSource: "none",
      revenueBreakdownDimension: null,
      summaryRowCount: 0,
      trendSource: "none",
    },
    feed: {
      hasMore: false,
      limit: MONETIZATION_DASHBOARD_EVENT_LIMIT,
      returnedCount: 0,
    },
    lookupIssues,
    period,
    periodContext: buildPeriodContext(period),
    recentEvents: [],
    revenueBreakdown: [],
    revenueBreakdownContext: {
      dataSource: "none",
      dimension: null,
      note: null,
    },
    state,
    summary: {
      activePlatforms: 0,
      averageRevenuePerDay: unavailableAmount(),
      latestEventAt: null,
      netRevenue: unavailableAmount(),
      totalConfirmedEvents: null,
      totalRevenue: unavailableAmount(),
    },
    topRevenueBreakdown: [],
    trend: [],
    userId,
  };
}

export function formatMonetizationAmount(
  value: MonetizationAmountValue,
): string {
  if (value.availability === "mixed_currency") {
    return "Mixed currency";
  }

  if (value.availability === "unavailable" || value.amountCents === null) {
    return "Unavailable";
  }

  return new Intl.NumberFormat("en-US", {
    currency: value.currency ?? "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value.amountCents / 100);
}

export function formatMonetizationDateTime(value: string | null): string {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(date);
}

export function formatMonetizationCount(value: number | null): string {
  if (value === null) {
    return "--";
  }

  return new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: 0,
  }).format(value);
}

export function getMonetizationPlatformLabel(value: StreamPlatform): string {
  switch (value) {
    case "kick":
      return "Kick";
    case "tiktok":
      return "TikTok";
    case "twitch":
      return "Twitch";
    case "youtube":
      return "YouTube";
  }
}

export function getMonetizationBreakdownValueLabel(value: string): string {
  switch (value) {
    case "ad_revenue":
      return "Ads";
    case "affiliate":
      return "Affiliate";
    case "bits":
      return "Bits";
    case "donation":
      return "Donation";
    case "membership":
      return "Membership";
    case "merch_sale":
      return "Merch";
    case "other":
      return "Other";
    case "sponsorship":
      return "Sponsoring";
    case "subscription":
      return "Subscription";
    case "tip":
      return "Tip";
    default:
      return value
        .replaceAll(/[_-]+/g, " ")
        .replace(/\b\w/g, (character) => character.toUpperCase());
  }
}

export function getMonetizationStatusLabel(
  value: MonetizationRecentEvent["status"],
): string {
  switch (value) {
    case "confirmed":
      return "Confirmed";
    case "disputed":
      return "Disputed";
    case "failed":
      return "Failed";
    case "pending":
      return "Pending";
    case "refunded":
      return "Refunded";
    case "void":
      return "Void";
  }
}

function buildPeriodContext(
  period: MonetizationDashboardPeriod,
): MonetizationDashboardPeriodContext {
  return {
    periodCoverageNote:
      period === "all_time"
        ? "All time uses weekly summary buckets in this MVP. Recent events remain a limited latest-feed view."
        : null,
    periodLabel: getMonetizationDashboardPeriodLabel(period),
    selectedPeriod: period,
  };
}

export function getMonetizationDashboardPeriodLabel(
  period: MonetizationDashboardPeriod,
): string {
  return (
    MONETIZATION_DASHBOARD_PERIOD_OPTIONS.find((option) => option.id === period)
      ?.label ?? "Last 30 days"
  );
}

function buildSummaryMetrics({
  aggregate,
  currencyState,
  latestEventAt,
  summaries,
  trend,
}: {
  aggregate: MonetizationAggregateSnapshot;
  currencyState: CurrencyState;
  latestEventAt: string | null;
  summaries: MonetizationSummaryRow[];
  trend: MonetizationTrendPoint[];
}): MonetizationDashboardModel["summary"] {
  const totalRevenueFromSummaries =
    summaries.length > 0
      ? summaries.reduce((sum, row) => sum + row.gross_amount_cents, 0)
      : null;
  const netRevenueFromSummaries =
    summaries.length > 0
      ? summaries.reduce((sum, row) => sum + row.net_amount_cents, 0)
      : null;
  const totalRevenue =
    totalRevenueFromSummaries ?? aggregate.totalRevenueCents ?? null;
  const averageRevenuePerDay =
    aggregate.averageRevenuePerDayCents ??
    (trend.length > 0 && totalRevenueFromSummaries !== null
      ? Math.floor(totalRevenueFromSummaries / trend.length)
      : null);

  return {
    activePlatforms:
      summaries.length > 0
        ? new Set(
            summaries
              .filter((row) => row.gross_amount_cents > 0)
              .map((row) => row.provider),
          ).size
        : (aggregate.activePlatforms ?? 0),
    averageRevenuePerDay: createAmountValue(
      averageRevenuePerDay,
      currencyState,
    ),
    latestEventAt,
    netRevenue: createAmountValue(netRevenueFromSummaries, currencyState),
    totalConfirmedEvents:
      summaries.length > 0
        ? summaries.reduce((sum, row) => sum + row.event_count, 0)
        : sumEventCounts(aggregate.sourceBreakdown),
    totalRevenue: createAmountValue(totalRevenue, currencyState),
  };
}

function buildRevenueBreakdown({
  aggregate,
  currencyState,
  summaries,
}: {
  aggregate: MonetizationAggregateSnapshot;
  currencyState: CurrencyState;
  summaries: MonetizationSummaryRow[];
}): MonetizationRevenueBreakdownItem[] {
  if (aggregate.sourceBreakdown.length > 0) {
    return aggregate.sourceBreakdown.map((row) => ({
      amount: createAmountValue(row.amountCents, currencyState),
      eventCount: row.eventCount,
      key: row.key,
      label: getMonetizationBreakdownValueLabel(row.key),
    }));
  }

  if (summaries.length === 0) {
    return [];
  }

  const counts = summaries.reduce<Record<string, number>>(
    (aggregateCounts, row) => {
      aggregateCounts.subscription =
        (aggregateCounts.subscription ?? 0) + row.subscription_count;
      aggregateCounts.tip = (aggregateCounts.tip ?? 0) + row.tip_count;
      aggregateCounts.donation =
        (aggregateCounts.donation ?? 0) + row.donation_count;
      aggregateCounts.ad_revenue =
        (aggregateCounts.ad_revenue ?? 0) + row.ad_revenue_count;
      aggregateCounts.sponsorship =
        (aggregateCounts.sponsorship ?? 0) + row.sponsorship_count;
      aggregateCounts.merch_sale =
        (aggregateCounts.merch_sale ?? 0) + row.merch_sale_count;
      return aggregateCounts;
    },
    {},
  );

  return SUMMARY_CATEGORY_KEYS.map((key) => ({
    amount: unavailableAmount(),
    eventCount: counts[key] ?? 0,
    key,
    label: getMonetizationBreakdownValueLabel(key),
  })).filter((item) => (item.eventCount ?? 0) > 0);
}

function buildRevenueBreakdownContext({
  aggregate,
  revenueBreakdown,
  summaries,
}: {
  aggregate: MonetizationAggregateSnapshot;
  revenueBreakdown: MonetizationRevenueBreakdownItem[];
  summaries: MonetizationSummaryRow[];
}): MonetizationRevenueBreakdownContext {
  if (aggregate.sourceBreakdown.length > 0) {
    return {
      dataSource: "events",
      dimension: "source",
      note: null,
    };
  }

  if (revenueBreakdown.length > 0 && summaries.length > 0) {
    return {
      dataSource: "summaries",
      dimension: "summary_category",
      note: "Summary rows expose category counts without source-level revenue amounts in this MVP.",
    };
  }

  return {
    dataSource: "none",
    dimension: null,
    note: null,
  };
}

function buildTrend({
  aggregate,
  currencyState,
  summaries,
}: {
  aggregate: MonetizationAggregateSnapshot;
  currencyState: CurrencyState;
  summaries: MonetizationSummaryRow[];
}): MonetizationTrendPoint[] {
  if (summaries.length > 0) {
    return [...summaries]
      .sort((left, right) =>
        left.period_start.localeCompare(right.period_start),
      )
      .map((row) => ({
        amount: createAmountValue(row.gross_amount_cents, currencyState),
        label: formatTrendLabel(row.period_start),
        periodEnd: row.period_end,
        periodStart: row.period_start,
        source: "summaries",
      }));
  }

  return aggregate.trend.map((row) => ({
    amount: createAmountValue(row.amountCents, currencyState),
    label: row.label,
    periodEnd: row.periodEnd,
    periodStart: row.periodStart,
    source: row.source,
  }));
}

function normalizeRecentEvents(
  rows: MonetizationEventRow[],
): MonetizationRecentEvent[] {
  return rows.map((row) => ({
    amount: createSingleCurrencyAmount(row.amount_cents, row.currency),
    eventType: row.event_type,
    id: row.id,
    occurredAt: row.occurred_at,
    provider: row.provider,
    source: row.source,
    status: row.status,
  }));
}

function resolveCurrencyState(
  aggregate: MonetizationAggregateSnapshot,
  events: MonetizationEventRow[],
  summaries: MonetizationSummaryRow[],
): CurrencyState {
  const values = new Set<string>();

  for (const row of summaries) {
    if (isCurrencyCode(row.currency)) {
      values.add(row.currency);
    }
  }

  for (const row of events) {
    if (isCurrencyCode(row.currency)) {
      values.add(row.currency);
    }
  }

  if (values.size === 0 && isCurrencyCode(aggregate.currency)) {
    values.add(aggregate.currency);
  }

  const currencies = [...values].sort();

  if (currencies.length === 0) {
    return {
      currencies,
      mode: "unknown",
      primaryCurrency: null,
    };
  }

  if (currencies.length > 1) {
    return {
      currencies,
      mode: "mixed",
      primaryCurrency: null,
    };
  }

  return {
    currencies,
    mode: "single",
    primaryCurrency: currencies[0] ?? null,
  };
}

function createAmountValue(
  amountCents: number | null,
  currencyState: CurrencyState,
): MonetizationAmountValue {
  if (amountCents === null) {
    return unavailableAmount();
  }

  if (currencyState.mode === "mixed") {
    return {
      amountCents: null,
      availability: "mixed_currency",
      currency: null,
    };
  }

  if (currencyState.mode !== "single" || !currencyState.primaryCurrency) {
    return unavailableAmount();
  }

  return {
    amountCents,
    availability: "available",
    currency: currencyState.primaryCurrency,
  };
}

function createSingleCurrencyAmount(
  amountCents: number,
  currency: string,
): MonetizationAmountValue {
  if (!isCurrencyCode(currency)) {
    return unavailableAmount();
  }

  return {
    amountCents,
    availability: "available",
    currency,
  };
}

function unavailableAmount(): MonetizationAmountValue {
  return {
    amountCents: null,
    availability: "unavailable",
    currency: null,
  };
}

function compareRevenueBreakdownItems(
  left: MonetizationRevenueBreakdownItem,
  right: MonetizationRevenueBreakdownItem,
): number {
  if (
    left.amount.availability === "available" &&
    right.amount.availability === "available"
  ) {
    return (right.amount.amountCents ?? 0) - (left.amount.amountCents ?? 0);
  }

  if (left.amount.availability === "available") {
    return -1;
  }

  if (right.amount.availability === "available") {
    return 1;
  }

  return (right.eventCount ?? 0) - (left.eventCount ?? 0);
}

function sumEventCounts(rows: MonetizationAggregateSourceRow[]): number | null {
  if (rows.length === 0 || rows.some((row) => row.eventCount === null)) {
    return null;
  }

  return rows.reduce((sum, row) => sum + (row.eventCount ?? 0), 0);
}

function isCurrencyCode(value: string | null): value is string {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value);
}

function formatTrendLabel(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "short",
    timeZone: "Europe/Berlin",
  }).format(date);
}
