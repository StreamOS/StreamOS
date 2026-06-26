import assert from "node:assert/strict";
import test from "node:test";

import {
  MONETIZATION_AMOUNT_AVAILABILITIES,
  MONETIZATION_DASHBOARD_EVENT_LIMIT,
  MONETIZATION_DASHBOARD_LOOKUP_SOURCES,
  MONETIZATION_DASHBOARD_PERIODS,
  MONETIZATION_REVENUE_BREAKDOWN_DIMENSIONS,
  MONETIZATION_SOURCE_CATEGORIES,
  type MonetizationDashboardReadModel,
} from "../src/monetization-dashboard.js";

const sampleReadModel = {
  coverage: {
    aggregateSourceCount: 2,
    currencies: ["USD"],
    currencyMode: "single",
    latestEventAt: "2026-06-25T10:30:00.000Z",
    latestSummaryPeriodEnd: "2026-06-25T23:59:59.000Z",
    recentEventCount: 2,
    revenueBreakdownDataSource: "events",
    revenueBreakdownDimension: "source",
    summaryRowCount: 7,
    trendSource: "summaries",
  },
  feed: {
    hasMore: false,
    limit: MONETIZATION_DASHBOARD_EVENT_LIMIT,
    returnedCount: 2,
    totalCount: 2,
  },
  lookupIssues: [],
  period: "last_30_days",
  periodContext: {
    periodCoverageNote: null,
    periodLabel: "Last 30 days",
    selectedPeriod: "last_30_days",
  },
  recentEvents: [
    {
      amount: {
        amountCents: 2499,
        availability: "available",
        currency: "USD",
      },
      eventType: "subscription",
      id: "event-1",
      occurredAt: "2026-06-25T10:30:00.000Z",
      provider: "twitch",
      source: "channel_subscription",
      sourceCategory: "subscriptions",
      status: "confirmed",
    },
  ],
  revenueCategories: [
    {
      amount: {
        amountCents: 182400,
        availability: "available",
        currency: "USD",
      },
      category: "subscriptions",
      eventCount: 128,
      label: "Subscriptions",
    },
  ],
  revenueBreakdown: [
    {
      amount: {
        amountCents: 182400,
        availability: "available",
        currency: "USD",
      },
      category: "subscriptions",
      eventCount: 128,
      key: "channel_subscription",
      label: "Channel Subscription",
      rawSource: "channel_subscription",
    },
  ],
  revenueBreakdownContext: {
    dataSource: "events",
    dimension: "source",
    note: null,
  },
  summary: {
    activePlatforms: 2,
    averageRevenuePerDay: {
      amountCents: 18240,
      availability: "available",
      currency: "USD",
    },
    latestEventAt: "2026-06-25T10:30:00.000Z",
    netRevenue: {
      amountCents: 240000,
      availability: "available",
      currency: "USD",
    },
    totalConfirmedEvents: 146,
    totalRevenue: {
      amountCents: 263400,
      availability: "available",
      currency: "USD",
    },
  },
  trend: [
    {
      amount: {
        amountCents: 42000,
        availability: "available",
        currency: "USD",
      },
      label: "25. Juni",
      periodEnd: "2026-06-25T23:59:59.000Z",
      periodStart: "2026-06-25T00:00:00.000Z",
      source: "summaries",
    },
  ],
} satisfies MonetizationDashboardReadModel;

void test("monetization dashboard contract keeps enums and feed limits stable", () => {
  assert.deepEqual(MONETIZATION_DASHBOARD_PERIODS, [
    "last_7_days",
    "last_30_days",
    "all_time",
  ]);
  assert.equal(MONETIZATION_DASHBOARD_EVENT_LIMIT, 12);
  assert.deepEqual(MONETIZATION_DASHBOARD_LOOKUP_SOURCES, [
    "aggregates",
    "events",
    "summaries",
  ]);
  assert.deepEqual(MONETIZATION_AMOUNT_AVAILABILITIES, [
    "available",
    "mixed_currency",
    "unavailable",
  ]);
  assert.deepEqual(MONETIZATION_REVENUE_BREAKDOWN_DIMENSIONS, [
    "source",
    "summary_category",
  ]);
  assert.deepEqual(MONETIZATION_SOURCE_CATEGORIES, [
    "subscriptions",
    "donations",
    "sponsorships",
    "merch",
    "ads",
    "affiliate",
    "platform_revenue",
    "other",
    "unknown",
  ]);
});

void test("monetization dashboard read model stays read-only and explicit about currency handling", () => {
  assert.equal(sampleReadModel.feed.limit, 12);
  assert.equal(sampleReadModel.lookupIssues.length, 0);
  assert.equal(sampleReadModel.periodContext.periodLabel, "Last 30 days");
  assert.equal(sampleReadModel.summary.totalRevenue.currency, "USD");
  assert.equal(sampleReadModel.summary.totalConfirmedEvents, 146);
  assert.equal(sampleReadModel.coverage.summaryRowCount, 7);
  assert.equal(sampleReadModel.coverage.trendSource, "summaries");
  assert.equal(sampleReadModel.coverage.revenueBreakdownDimension, "source");
  assert.equal(
    sampleReadModel.recentEvents[0]?.sourceCategory,
    "subscriptions",
  );
  assert.equal(sampleReadModel.revenueCategories[0]?.category, "subscriptions");
  assert.equal(
    sampleReadModel.revenueBreakdown[0]?.key,
    "channel_subscription",
  );
  assert.equal(
    sampleReadModel.revenueBreakdown[0]?.rawSource,
    "channel_subscription",
  );
  assert.equal(sampleReadModel.revenueBreakdownContext.dataSource, "events");
  assert.equal(sampleReadModel.recentEvents[0]?.status, "confirmed");
});
