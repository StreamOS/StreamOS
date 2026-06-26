import type { Tables } from "@streamos/database";
import {
  MONETIZATION_DASHBOARD_PERIOD_OPTIONS,
  MONETIZATION_DASHBOARD_EVENT_LIMIT,
  type MonetizationAmountValue,
  type MonetizationDataQuality,
  type MonetizationDataQualityNotice,
  type MonetizationDashboardLookupIssue,
  type MonetizationDashboardPeriod,
  type MonetizationDashboardPeriodContext,
  type MonetizationDashboardReadModel,
  type MonetizationRecentEvent,
  type MonetizationRevenueCategoryItem,
  type MonetizationRevenueBreakdownContext,
  type MonetizationRevenueBreakdownItem,
  type MonetizationSourceCategory,
  type MonetizationTrendPoint,
  type StreamPlatform,
} from "@streamos/types";
import {
  getMonetizationSourceCategoryLabel,
  normalizeMonetizationSourceCategory,
  resolveBreakdownCategory,
} from "./monetizationSourceTaxonomy";

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
  const revenueCategories = buildRevenueCategories({
    aggregate,
    currencyState,
    revenueBreakdown,
  });
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
  const dataQuality = buildDataQuality({
    aggregate,
    currencyState,
    lookupIssues,
    period,
    recentEvents,
    revenueBreakdown,
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
    dataQuality,
    feed,
    lookupIssues,
    period,
    periodContext,
    recentEvents,
    revenueCategories,
    revenueBreakdown,
    revenueBreakdownContext,
    state,
    summary: totals,
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
    dataQuality: createEmptyDataQuality(),
    feed: {
      hasMore: false,
      limit: MONETIZATION_DASHBOARD_EVENT_LIMIT,
      returnedCount: 0,
    },
    lookupIssues,
    period,
    periodContext: buildPeriodContext(period),
    recentEvents: [],
    revenueCategories: [],
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
      category: resolveBreakdownCategory({
        dimension: "source",
        key: row.key,
        rawSource: row.key,
      }),
      eventCount: row.eventCount,
      key: row.key,
      label: getMonetizationBreakdownValueLabel(row.key),
      rawSource: row.key,
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
    category: resolveBreakdownCategory({
      dimension: "summary_category",
      key,
      rawSource: null,
    }),
    eventCount: counts[key] ?? 0,
    key,
    label: getMonetizationBreakdownValueLabel(key),
    rawSource: null,
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

function buildRevenueCategories({
  aggregate,
  currencyState,
  revenueBreakdown,
}: {
  aggregate: MonetizationAggregateSnapshot;
  currencyState: CurrencyState;
  revenueBreakdown: MonetizationRevenueBreakdownItem[];
}): MonetizationRevenueCategoryItem[] {
  if (aggregate.sourceBreakdown.length > 0) {
    const categoryMap = aggregate.sourceBreakdown.reduce<
      Map<
        MonetizationSourceCategory,
        { amountCents: number | null; eventCount: number | null }
      >
    >((map, row) => {
      const category = normalizeMonetizationSourceCategory(row.key);
      const current = map.get(category);

      map.set(category, {
        amountCents: (current?.amountCents ?? 0) + (row.amountCents ?? 0),
        eventCount:
          current?.eventCount === undefined
            ? row.eventCount
            : sumNullableCounts(current.eventCount, row.eventCount),
      });

      return map;
    }, new Map());

    return [...categoryMap.entries()]
      .map(([category, value]) => ({
        amount: createAmountValue(value.amountCents, currencyState),
        category,
        eventCount: value.eventCount,
        label: getMonetizationSourceCategoryLabel(category),
      }))
      .sort(compareRevenueCategoryItems);
  }

  const categoryMap = revenueBreakdown.reduce<
    Map<MonetizationSourceCategory, MonetizationRevenueCategoryItem>
  >((map, item) => {
    const current = map.get(item.category);

    map.set(item.category, {
      amount: mergeAmountValues(current?.amount ?? null, item.amount),
      category: item.category,
      eventCount:
        current?.eventCount === undefined
          ? item.eventCount
          : sumNullableCounts(current.eventCount, item.eventCount),
      label: getMonetizationSourceCategoryLabel(item.category),
    });

    return map;
  }, new Map());

  return [...categoryMap.values()].sort(compareRevenueCategoryItems);
}

function buildDataQuality({
  aggregate,
  currencyState,
  lookupIssues,
  period,
  recentEvents,
  revenueBreakdown,
  summaries,
  trend,
}: {
  aggregate: MonetizationAggregateSnapshot;
  currencyState: CurrencyState;
  lookupIssues: MonetizationDashboardLookupIssue[];
  period: MonetizationDashboardPeriod;
  recentEvents: MonetizationRecentEvent[];
  revenueBreakdown: MonetizationRevenueBreakdownItem[];
  summaries: MonetizationSummaryRow[];
  trend: MonetizationTrendPoint[];
}): MonetizationDataQuality {
  const hasAnyData =
    recentEvents.length > 0 ||
    summaries.length > 0 ||
    aggregate.sourceBreakdown.length > 0 ||
    aggregate.totalRevenueCents !== null ||
    trend.length > 0;

  if (!hasAnyData) {
    return createEmptyDataQuality();
  }

  const breakdownCounts =
    aggregate.sourceBreakdown.length > 0 &&
    aggregate.sourceBreakdown.every((row) => row.eventCount !== null)
      ? aggregate.sourceBreakdown
      : null;
  const sourceObservationScope: MonetizationDataQuality["sourceObservationScope"] =
    breakdownCounts
      ? "breakdown_events"
      : recentEvents.length > 0
        ? "recent_event_sample"
        : "none";
  const sourceObservationCount =
    sourceObservationScope === "breakdown_events"
      ? (breakdownCounts?.reduce(
          (sum, row) => sum + (row.eventCount ?? 0),
          0,
        ) ?? 0)
      : sourceObservationScope === "recent_event_sample"
        ? recentEvents.length
        : 0;
  const unknownSourceCount =
    sourceObservationScope === "breakdown_events"
      ? revenueBreakdown
          .filter((item) => item.category === "unknown")
          .reduce((sum, item) => sum + (item.eventCount ?? 0), 0)
      : recentEvents.filter((event) => event.sourceCategory === "unknown")
          .length;
  const missingSourceCount = recentEvents.filter(
    (event) => event.source === null,
  ).length;
  const unknownSourceRatio =
    sourceObservationCount > 0
      ? (unknownSourceCount + missingSourceCount) / sourceObservationCount
      : null;
  const mixedCurrency = currencyState.mode === "mixed";
  const partialRead = lookupIssues.length > 0;
  const summariesWithoutEvents =
    summaries.length > 0 && recentEvents.length === 0;
  const eventsWithoutSummaries =
    recentEvents.length > 0 && summaries.length === 0;
  const noRecentEvents =
    recentEvents.length === 0 &&
    (summaries.length > 0 ||
      aggregate.sourceBreakdown.length > 0 ||
      aggregate.totalRevenueCents !== null);
  const staleLatestEvent = isLatestEventStale({
    latestEventAt: recentEvents[0]?.occurredAt ?? null,
    period,
  });
  const notices = buildDataQualityNotices({
    eventsWithoutSummaries,
    mixedCurrency,
    missingSourceCount,
    noRecentEvents,
    partialRead,
    sourceObservationCount,
    sourceObservationScope,
    staleLatestEvent,
    summariesWithoutEvents,
    unknownSourceCount,
    unknownSourceRatio,
  });

  return {
    eventsWithoutSummaries,
    missingSourceCount,
    mixedCurrency,
    noRecentEvents,
    notices,
    partialRead,
    sourceObservationCount,
    sourceObservationScope,
    staleLatestEvent,
    summariesWithoutEvents,
    unknownSourceCount,
    unknownSourceRatio,
  };
}

function buildDataQualityNotices({
  eventsWithoutSummaries,
  mixedCurrency,
  missingSourceCount,
  noRecentEvents,
  partialRead,
  sourceObservationCount,
  sourceObservationScope,
  staleLatestEvent,
  summariesWithoutEvents,
  unknownSourceCount,
  unknownSourceRatio,
}: {
  eventsWithoutSummaries: boolean;
  mixedCurrency: boolean;
  missingSourceCount: number;
  noRecentEvents: boolean;
  partialRead: boolean;
  sourceObservationCount: number;
  sourceObservationScope: MonetizationDataQuality["sourceObservationScope"];
  staleLatestEvent: boolean;
  summariesWithoutEvents: boolean;
  unknownSourceCount: number;
  unknownSourceRatio: number | null;
}): MonetizationDataQualityNotice[] {
  const notices: MonetizationDataQualityNotice[] = [];

  if (partialRead) {
    notices.push({
      code: "partial_read",
      description:
        "This view is based on partial data because at least one monetization read failed.",
      title: "This view is based on partial data.",
    });
  }

  if (mixedCurrency) {
    notices.push({
      code: "mixed_currency",
      description:
        "Revenue amounts span multiple currencies, so category totals may stay unavailable.",
      title: "Currency is mixed across monetization data.",
    });
  }

  if (missingSourceCount > 0) {
    notices.push({
      code: "missing_sources",
      description:
        "Some recent events do not include a raw source, so StreamOS cannot categorize them more precisely.",
      title: "Some recent events are missing a revenue source.",
    });
  }

  if (
    shouldWarnUnknownSources({
      sourceObservationCount,
      sourceObservationScope,
      unknownSourceCount,
      unknownSourceRatio,
    })
  ) {
    notices.push({
      code: "unknown_sources",
      description:
        sourceObservationScope === "breakdown_events"
          ? "Some revenue sources are still uncategorized in the current period."
          : "Some sampled recent events use uncategorized revenue sources.",
      title:
        sourceObservationScope === "recent_event_sample"
          ? "Some sampled revenue sources are uncategorized."
          : "Some revenue sources are uncategorized.",
    });
  }

  if (summariesWithoutEvents) {
    notices.push({
      code: "summaries_without_events",
      description:
        "Summary data is available, but recent events are missing for this period.",
      title: "Recent events are missing for this period.",
    });
  }

  if (eventsWithoutSummaries) {
    notices.push({
      code: "events_without_summaries",
      description:
        "Recent events are available, but summary rows are missing for this period.",
      title: "Summary coverage is limited for this period.",
    });
  }

  if (noRecentEvents && !summariesWithoutEvents) {
    notices.push({
      code: "no_recent_events",
      description:
        "This period has no recent monetization events in the sampled event feed.",
      title: "Recent events are not available in this view.",
    });
  }

  if (staleLatestEvent) {
    notices.push({
      code: "stale_latest_event",
      description:
        "The newest monetization event in this view is older than expected for the selected period.",
      title: "Latest monetization activity looks stale.",
    });
  }

  return notices;
}

function shouldWarnUnknownSources({
  sourceObservationCount,
  sourceObservationScope,
  unknownSourceCount,
  unknownSourceRatio,
}: {
  sourceObservationCount: number;
  sourceObservationScope: MonetizationDataQuality["sourceObservationScope"];
  unknownSourceCount: number;
  unknownSourceRatio: number | null;
}): boolean {
  if (unknownSourceCount === 0) {
    return false;
  }

  if (
    sourceObservationScope === "recent_event_sample" &&
    sourceObservationCount < 3 &&
    unknownSourceCount < 2
  ) {
    return false;
  }

  if (unknownSourceRatio !== null) {
    return unknownSourceRatio >= 0.2;
  }

  return sourceObservationScope === "recent_event_sample"
    ? unknownSourceCount >= 2
    : unknownSourceCount >= 1;
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
    source: normalizeRawSource(row.source),
    sourceCategory: normalizeMonetizationSourceCategory(row.source),
    status: row.status,
  }));
}

function createEmptyDataQuality(): MonetizationDataQuality {
  return {
    eventsWithoutSummaries: false,
    missingSourceCount: 0,
    mixedCurrency: false,
    noRecentEvents: false,
    notices: [],
    partialRead: false,
    sourceObservationCount: 0,
    sourceObservationScope: "none",
    staleLatestEvent: false,
    summariesWithoutEvents: false,
    unknownSourceCount: 0,
    unknownSourceRatio: null,
  };
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

function compareRevenueCategoryItems(
  left: MonetizationRevenueCategoryItem,
  right: MonetizationRevenueCategoryItem,
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

function sumNullableCounts(
  left: number | null,
  right: number | null,
): number | null {
  if (left === null || right === null) {
    return null;
  }

  return left + right;
}

function mergeAmountValues(
  left: MonetizationAmountValue | null,
  right: MonetizationAmountValue,
): MonetizationAmountValue {
  if (!left) {
    return right;
  }

  if (
    left.availability === "available" &&
    right.availability === "available" &&
    left.currency === right.currency
  ) {
    return {
      amountCents: (left.amountCents ?? 0) + (right.amountCents ?? 0),
      availability: "available",
      currency: left.currency,
    };
  }

  if (
    left.availability === "mixed_currency" ||
    right.availability === "mixed_currency"
  ) {
    return {
      amountCents: null,
      availability: "mixed_currency",
      currency: null,
    };
  }

  return unavailableAmount();
}

function isCurrencyCode(value: string | null): value is string {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value);
}

function normalizeRawSource(value: string): string | null {
  const normalized = value.trim();

  return normalized.length > 0 ? normalized : null;
}

function isLatestEventStale({
  latestEventAt,
  period,
}: {
  latestEventAt: string | null;
  period: MonetizationDashboardPeriod;
}): boolean {
  if (!latestEventAt) {
    return false;
  }

  const latest = new Date(latestEventAt);

  if (Number.isNaN(latest.getTime())) {
    return false;
  }

  const thresholdDays =
    period === "last_7_days" ? 3 : period === "last_30_days" ? 14 : 30;

  return Date.now() - latest.getTime() > thresholdDays * 24 * 60 * 60 * 1000;
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
