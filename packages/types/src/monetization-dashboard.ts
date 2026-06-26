import type { MonetizationEventStatus, StreamPlatform } from "./index.js";

export const MONETIZATION_DASHBOARD_PERIODS = [
  "last_7_days",
  "last_30_days",
  "all_time",
] as const;

export type MonetizationDashboardPeriod =
  (typeof MONETIZATION_DASHBOARD_PERIODS)[number];

export const MONETIZATION_DASHBOARD_EVENT_LIMIT = 12;

export const MONETIZATION_DASHBOARD_LOOKUP_SOURCES = [
  "aggregates",
  "events",
  "summaries",
] as const;

export type MonetizationDashboardLookupSource =
  (typeof MONETIZATION_DASHBOARD_LOOKUP_SOURCES)[number];

export type MonetizationDashboardLookupIssue = {
  code: "load-failed";
  source: MonetizationDashboardLookupSource;
};

export const MONETIZATION_AMOUNT_AVAILABILITIES = [
  "available",
  "mixed_currency",
  "unavailable",
] as const;

export type MonetizationAmountAvailability =
  (typeof MONETIZATION_AMOUNT_AVAILABILITIES)[number];

export type MonetizationAmountValue = {
  amountCents: number | null;
  availability: MonetizationAmountAvailability;
  currency: string | null;
};

export type MonetizationRevenueSource = {
  amount: MonetizationAmountValue;
  eventCount: number | null;
  key: string;
  label: string;
};

export type MonetizationTrendPoint = {
  amount: MonetizationAmountValue;
  label: string;
  periodEnd: string | null;
  periodStart: string;
  source: "events" | "summaries";
};

export type MonetizationRecentEvent = {
  amount: MonetizationAmountValue;
  eventType: string;
  id: string;
  occurredAt: string;
  provider: StreamPlatform;
  source: string;
  status: MonetizationEventStatus;
};

export type MonetizationDashboardFeedMetadata = {
  hasMore: boolean;
  limit: number;
  returnedCount: number;
  totalCount?: number;
};

export type MonetizationDashboardCoverage = {
  aggregateSourceCount: number;
  currencies: string[];
  currencyMode: "mixed" | "single" | "unknown";
  latestEventAt: string | null;
  latestSummaryPeriodEnd: string | null;
  recentEventCount: number;
  sourceBreakdownSource: "events" | "none" | "summaries";
  summaryRowCount: number;
  trendSource: "events" | "none" | "summaries";
};

export type MonetizationDashboardSummary = {
  activePlatforms: number;
  averageRevenuePerDay: MonetizationAmountValue;
  latestEventAt: string | null;
  netRevenue: MonetizationAmountValue;
  totalConfirmedEvents: number | null;
  totalRevenue: MonetizationAmountValue;
};

export type MonetizationDashboardReadModel = {
  coverage: MonetizationDashboardCoverage;
  feed: MonetizationDashboardFeedMetadata;
  lookupIssues: MonetizationDashboardLookupIssue[];
  period: MonetizationDashboardPeriod;
  recentEvents: MonetizationRecentEvent[];
  revenueBySource: MonetizationRevenueSource[];
  summary: MonetizationDashboardSummary;
  topRevenueSources: MonetizationRevenueSource[];
  trend: MonetizationTrendPoint[];
};
