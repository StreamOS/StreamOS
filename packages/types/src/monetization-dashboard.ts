import type { MonetizationEventStatus, StreamPlatform } from "./index.js";

export const MONETIZATION_DASHBOARD_PERIODS = [
  "last_7_days",
  "last_30_days",
  "all_time",
] as const;

export type MonetizationDashboardPeriod =
  (typeof MONETIZATION_DASHBOARD_PERIODS)[number];

export const MONETIZATION_DASHBOARD_PERIOD_OPTIONS = [
  {
    id: "last_7_days",
    label: "Last 7 days",
  },
  {
    id: "last_30_days",
    label: "Last 30 days",
  },
  {
    id: "all_time",
    label: "All time",
  },
] as const;

export type MonetizationDashboardPeriodOption =
  (typeof MONETIZATION_DASHBOARD_PERIOD_OPTIONS)[number];

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

export const MONETIZATION_SOURCE_CATEGORIES = [
  "subscriptions",
  "donations",
  "sponsorships",
  "merch",
  "ads",
  "affiliate",
  "platform_revenue",
  "other",
  "unknown",
] as const;

export type MonetizationSourceCategory =
  (typeof MONETIZATION_SOURCE_CATEGORIES)[number];

export const MONETIZATION_REVENUE_BREAKDOWN_DIMENSIONS = [
  "source",
  "summary_category",
] as const;

export type MonetizationRevenueBreakdownDimension =
  (typeof MONETIZATION_REVENUE_BREAKDOWN_DIMENSIONS)[number];

export type MonetizationRevenueBreakdownItem = {
  amount: MonetizationAmountValue;
  category: MonetizationSourceCategory;
  eventCount: number | null;
  key: string;
  label: string;
  rawSource: string | null;
};

export type MonetizationRevenueBreakdownContext = {
  dataSource: "events" | "none" | "summaries";
  dimension: MonetizationRevenueBreakdownDimension | null;
  note: string | null;
};

export type MonetizationRevenueCategoryItem = {
  amount: MonetizationAmountValue;
  category: MonetizationSourceCategory;
  eventCount: number | null;
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
  source: string | null;
  sourceCategory: MonetizationSourceCategory;
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
  revenueBreakdownDataSource: "events" | "none" | "summaries";
  revenueBreakdownDimension: MonetizationRevenueBreakdownDimension | null;
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

export type MonetizationDashboardPeriodContext = {
  periodCoverageNote: string | null;
  periodLabel: string;
  selectedPeriod: MonetizationDashboardPeriod;
};

export type MonetizationDashboardReadModel = {
  coverage: MonetizationDashboardCoverage;
  feed: MonetizationDashboardFeedMetadata;
  lookupIssues: MonetizationDashboardLookupIssue[];
  period: MonetizationDashboardPeriod;
  periodContext: MonetizationDashboardPeriodContext;
  recentEvents: MonetizationRecentEvent[];
  revenueCategories: MonetizationRevenueCategoryItem[];
  revenueBreakdown: MonetizationRevenueBreakdownItem[];
  revenueBreakdownContext: MonetizationRevenueBreakdownContext;
  summary: MonetizationDashboardSummary;
  trend: MonetizationTrendPoint[];
};
