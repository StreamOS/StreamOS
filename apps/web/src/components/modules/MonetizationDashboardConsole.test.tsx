import { describe, expect, it } from "vitest";
import {
  buildMonetizationDashboardModel,
  createEmptyMonetizationDashboardModel,
} from "./MonetizationDashboardConsole.utils";

describe("MonetizationDashboardConsole.utils", () => {
  it("builds monetization dashboard data from summaries and recent events", () => {
    const freshOccurredAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const model = buildMonetizationDashboardModel({
      aggregate: {
        activePlatforms: 2,
        averageRevenuePerDayCents: 18800,
        currency: "USD",
        sourceBreakdown: [
          {
            amountCents: 182400,
            eventCount: 128,
            key: "channel_subscription",
          },
          {
            amountCents: 68400,
            eventCount: 18,
            key: "merch_store",
          },
        ],
        totalRevenueCents: 250800,
        trend: [],
      },
      events: [
        {
          amount_cents: 2499,
          currency: "USD",
          event_type: "subscription",
          id: "event-1",
          occurred_at: freshOccurredAt,
          provider: "twitch",
          source: "channel_subscription",
          status: "confirmed",
        },
      ],
      feed: {
        hasMore: false,
        limit: 12,
        returnedCount: 1,
        totalCount: 1,
      },
      lookupIssues: [],
      period: "last_30_days",
      state: "ready",
      summaries: [
        {
          ad_revenue_count: 0,
          channel_id: "channel-1",
          currency: "USD",
          donation_count: 0,
          event_count: 4,
          gross_amount_cents: 250800,
          merch_sale_count: 1,
          net_amount_cents: 240000,
          period: "daily",
          period_end: "2026-06-25T23:59:59.000Z",
          period_start: "2026-06-25T00:00:00.000Z",
          provider: "twitch",
          sponsorship_count: 0,
          subscription_count: 3,
          tip_count: 0,
        },
      ],
      userId: "user-1",
    });

    expect(model.summary.totalRevenue.amountCents).toBe(250800);
    expect(model.summary.netRevenue.amountCents).toBe(240000);
    expect(model.summary.latestEventAt).toBe(freshOccurredAt);
    expect(model.periodContext.periodLabel).toBe("Last 30 days");
    expect(model.coverage.summaryRowCount).toBe(1);
    expect(model.coverage.trendSource).toBe("summaries");
    expect(model.coverage.revenueBreakdownDimension).toBe("source");
    expect(model.revenueBreakdownContext.dataSource).toBe("events");
    expect(model.revenueBreakdown[0]?.key).toBe("channel_subscription");
    expect(model.revenueBreakdown[0]?.category).toBe("subscriptions");
    expect(model.revenueBreakdown[0]?.rawSource).toBe("channel_subscription");
    expect(model.revenueCategories[0]?.label).toBe("Subscriptions");
    expect(model.recentEvents[0]?.source).toBe("channel_subscription");
    expect(model.recentEvents[0]?.sourceCategory).toBe("subscriptions");
    expect(model.dataQuality.notices).toEqual([]);
  });

  it("derives latestEventAt and stale checks from the newest unsorted recent event", () => {
    const staleOccurredAt = new Date(
      Date.now() - 45 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const freshOccurredAt = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    const model = buildMonetizationDashboardModel({
      aggregate: {
        activePlatforms: 1,
        averageRevenuePerDayCents: 4000,
        currency: "USD",
        sourceBreakdown: [],
        totalRevenueCents: 8000,
        trend: [],
      },
      events: [
        {
          amount_cents: 4000,
          currency: "USD",
          event_type: "tip",
          id: "event-stale-first",
          occurred_at: staleOccurredAt,
          provider: "twitch",
          source: "tip",
          status: "confirmed",
        },
        {
          amount_cents: 4000,
          currency: "USD",
          event_type: "subscription",
          id: "event-fresh-second",
          occurred_at: freshOccurredAt,
          provider: "youtube",
          source: "channel_subscription",
          status: "confirmed",
        },
      ],
      feed: {
        hasMore: false,
        limit: 12,
        returnedCount: 2,
      },
      lookupIssues: [],
      period: "last_30_days",
      state: "ready",
      summaries: [],
      userId: "user-unsorted-events",
    });

    expect(model.recentEvents[0]?.id).toBe("event-fresh-second");
    expect(model.summary.latestEventAt).toBe(freshOccurredAt);
    expect(model.coverage.latestEventAt).toBe(freshOccurredAt);
    expect(model.dataQuality.staleLatestEvent).toBe(false);
  });

  it("keeps summaries without events explicit and leaves summary-category amounts unavailable", () => {
    const model = buildMonetizationDashboardModel({
      aggregate: {
        activePlatforms: null,
        averageRevenuePerDayCents: null,
        currency: null,
        sourceBreakdown: [],
        totalRevenueCents: null,
        trend: [],
      },
      events: [],
      feed: {
        hasMore: false,
        limit: 12,
        returnedCount: 0,
      },
      lookupIssues: [],
      period: "last_30_days",
      state: "ready",
      summaries: [
        {
          ad_revenue_count: 0,
          channel_id: "channel-2",
          currency: "USD",
          donation_count: 2,
          event_count: 2,
          gross_amount_cents: 12000,
          merch_sale_count: 0,
          net_amount_cents: 11000,
          period: "daily",
          period_end: "2026-06-25T23:59:59.000Z",
          period_start: "2026-06-25T00:00:00.000Z",
          provider: "youtube",
          sponsorship_count: 0,
          subscription_count: 0,
          tip_count: 0,
        },
      ],
      userId: "user-2",
    });

    expect(model.summary.totalRevenue.amountCents).toBe(12000);
    expect(model.recentEvents).toHaveLength(0);
    expect(model.coverage.revenueBreakdownDimension).toBe("summary_category");
    expect(model.revenueBreakdownContext.note).toContain("category counts");
    expect(model.revenueBreakdown[0]?.rawSource).toBeNull();
    expect(model.revenueBreakdown[0]?.category).toBe("donations");
    expect(model.revenueCategories[0]?.category).toBe("donations");
    expect(model.revenueBreakdown[0]?.amount.availability).toBe("unavailable");
    expect(model.revenueBreakdown[0]?.eventCount).toBe(2);
    expect(model.dataQuality.summariesWithoutEvents).toBe(true);
    expect(model.dataQuality.notices.map((notice) => notice.code)).toContain(
      "summaries_without_events",
    );
  });

  it("merges duplicate summary buckets into one trend point and averages over bucket count", () => {
    const model = buildMonetizationDashboardModel({
      aggregate: {
        activePlatforms: null,
        averageRevenuePerDayCents: null,
        currency: null,
        sourceBreakdown: [],
        totalRevenueCents: null,
        trend: [],
      },
      events: [],
      feed: {
        hasMore: false,
        limit: 12,
        returnedCount: 0,
      },
      lookupIssues: [],
      period: "last_30_days",
      state: "ready",
      summaries: [
        {
          ad_revenue_count: 0,
          channel_id: "channel-1",
          currency: "USD",
          donation_count: 0,
          event_count: 1,
          gross_amount_cents: 10000,
          merch_sale_count: 0,
          net_amount_cents: 9000,
          period: "daily",
          period_end: "2026-06-24T11:59:59.000Z",
          period_start: "2026-06-24T00:00:00.000Z",
          provider: "twitch",
          sponsorship_count: 0,
          subscription_count: 1,
          tip_count: 0,
        },
        {
          ad_revenue_count: 0,
          channel_id: "channel-2",
          currency: "USD",
          donation_count: 0,
          event_count: 1,
          gross_amount_cents: 5000,
          merch_sale_count: 0,
          net_amount_cents: 4500,
          period: "daily",
          period_end: "2026-06-24T23:59:59.000Z",
          period_start: "2026-06-24T00:00:00.000Z",
          provider: "youtube",
          sponsorship_count: 0,
          subscription_count: 1,
          tip_count: 0,
        },
        {
          ad_revenue_count: 0,
          channel_id: "channel-3",
          currency: "USD",
          donation_count: 0,
          event_count: 1,
          gross_amount_cents: 9000,
          merch_sale_count: 0,
          net_amount_cents: 8000,
          period: "daily",
          period_end: "2026-06-25T23:59:59.000Z",
          period_start: "2026-06-25T00:00:00.000Z",
          provider: "twitch",
          sponsorship_count: 0,
          subscription_count: 1,
          tip_count: 0,
        },
      ],
      userId: "user-summary-buckets",
    });

    expect(model.trend).toHaveLength(2);
    expect(model.trend[0]?.periodStart).toBe("2026-06-24T00:00:00.000Z");
    expect(model.trend[0]?.amount.amountCents).toBe(15000);
    expect(model.trend[1]?.periodStart).toBe("2026-06-25T00:00:00.000Z");
    expect(model.summary.totalRevenue.amountCents).toBe(24000);
    expect(model.summary.averageRevenuePerDay.amountCents).toBe(12000);
  });

  it("uses event aggregates when summaries are absent", () => {
    const freshOccurredAt = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    const model = buildMonetizationDashboardModel({
      aggregate: {
        activePlatforms: 1,
        averageRevenuePerDayCents: 9000,
        currency: "USD",
        sourceBreakdown: [
          {
            amountCents: 63000,
            eventCount: 7,
            key: "brand_campaign",
          },
        ],
        totalRevenueCents: 63000,
        trend: [
          {
            amountCents: 63000,
            label: "25. Juni",
            periodEnd: null,
            periodStart: "2026-06-25",
            source: "events",
          },
        ],
      },
      events: [
        {
          amount_cents: 63000,
          currency: "USD",
          event_type: "sponsorship",
          id: "event-3",
          occurred_at: freshOccurredAt,
          provider: "youtube",
          source: "brand_campaign",
          status: "confirmed",
        },
      ],
      feed: {
        hasMore: false,
        limit: 12,
        returnedCount: 1,
      },
      lookupIssues: [],
      period: "last_7_days",
      state: "ready",
      summaries: [],
      userId: "user-3",
    });

    expect(model.summary.totalRevenue.amountCents).toBe(63000);
    expect(model.summary.netRevenue.availability).toBe("unavailable");
    expect(model.periodContext.periodLabel).toBe("Last 7 days");
    expect(model.coverage.trendSource).toBe("events");
    expect(model.revenueBreakdownContext.dimension).toBe("source");
    expect(model.revenueBreakdown[0]?.label).toBe("Brand Campaign");
    expect(model.revenueBreakdown[0]?.category).toBe("sponsorships");
    expect(model.revenueCategories[0]?.label).toBe("Sponsorships");
    expect(model.dataQuality.eventsWithoutSummaries).toBe(true);
  });

  it("keeps unknown source labels stable", () => {
    const model = buildMonetizationDashboardModel({
      aggregate: {
        activePlatforms: 1,
        averageRevenuePerDayCents: 5000,
        currency: "USD",
        sourceBreakdown: [
          {
            amountCents: 5000,
            eventCount: 1,
            key: "brand_deal_bonus",
          },
        ],
        totalRevenueCents: 5000,
        trend: [],
      },
      events: [],
      feed: {
        hasMore: false,
        limit: 12,
        returnedCount: 0,
      },
      lookupIssues: [],
      period: "last_30_days",
      state: "ready",
      summaries: [],
      userId: "user-4",
    });

    expect(model.revenueBreakdown[0]?.label).toBe("Brand Deal Bonus");
    expect(model.revenueBreakdown[0]?.category).toBe("sponsorships");
  });

  it("keeps aggregated category amounts unavailable when any source bucket amount is unknown", () => {
    const model = buildMonetizationDashboardModel({
      aggregate: {
        activePlatforms: 1,
        averageRevenuePerDayCents: 5000,
        currency: "USD",
        sourceBreakdown: [
          {
            amountCents: 5000,
            eventCount: 2,
            key: "channel_subscription",
          },
          {
            amountCents: null,
            eventCount: 1,
            key: "prime_sub",
          },
        ],
        totalRevenueCents: 5000,
        trend: [],
      },
      events: [],
      feed: {
        hasMore: false,
        limit: 12,
        returnedCount: 0,
      },
      lookupIssues: [],
      period: "last_30_days",
      state: "ready",
      summaries: [],
      userId: "user-unknown-amount",
    });

    expect(model.revenueCategories).toHaveLength(1);
    expect(model.revenueCategories[0]?.category).toBe("subscriptions");
    expect(model.revenueCategories[0]?.amount.availability).toBe("unavailable");
    expect(model.revenueCategories[0]?.amount.amountCents).toBeNull();
  });

  it("treats unmapped raw sources as unknown categories without inventing source values", () => {
    const freshOccurredAt = new Date(Date.now() - 90 * 60 * 1000).toISOString();

    const model = buildMonetizationDashboardModel({
      aggregate: {
        activePlatforms: 1,
        averageRevenuePerDayCents: 5000,
        currency: "USD",
        sourceBreakdown: [
          {
            amountCents: 5000,
            eventCount: 1,
            key: "mystery_drop",
          },
        ],
        totalRevenueCents: 5000,
        trend: [],
      },
      events: [
        {
          amount_cents: 5000,
          currency: "USD",
          event_type: "other",
          id: "event-unknown",
          occurred_at: freshOccurredAt,
          provider: "twitch",
          source: "mystery_drop",
          status: "confirmed",
        },
      ],
      feed: {
        hasMore: false,
        limit: 12,
        returnedCount: 1,
      },
      lookupIssues: [],
      period: "last_30_days",
      state: "ready",
      summaries: [],
      userId: "user-unknown",
    });

    expect(model.revenueBreakdown[0]?.rawSource).toBe("mystery_drop");
    expect(model.revenueBreakdown[0]?.category).toBe("unknown");
    expect(model.recentEvents[0]?.sourceCategory).toBe("unknown");
    expect(model.dataQuality.unknownSourceCount).toBe(1);
    expect(model.dataQuality.unknownSourceRatio).toBe(1);
    expect(model.dataQuality.notices.map((notice) => notice.code)).toContain(
      "unknown_sources",
    );
  });

  it("avoids over-warning for a single unknown source in a tiny recent-event sample", () => {
    const freshOccurredAt = new Date(Date.now() - 45 * 60 * 1000).toISOString();

    const model = buildMonetizationDashboardModel({
      aggregate: {
        activePlatforms: 1,
        averageRevenuePerDayCents: 5000,
        currency: "USD",
        sourceBreakdown: [],
        totalRevenueCents: 5000,
        trend: [],
      },
      events: [
        {
          amount_cents: 5000,
          currency: "USD",
          event_type: "other",
          id: "event-sampled-unknown",
          occurred_at: freshOccurredAt,
          provider: "twitch",
          source: "mystery_drop",
          status: "confirmed",
        },
      ],
      feed: {
        hasMore: false,
        limit: 12,
        returnedCount: 1,
      },
      lookupIssues: [],
      period: "last_30_days",
      state: "ready",
      summaries: [],
      userId: "user-sampled-unknown",
    });

    expect(model.dataQuality.sourceObservationScope).toBe(
      "recent_event_sample",
    );
    expect(model.dataQuality.unknownSourceCount).toBe(1);
    expect(model.dataQuality.unknownSourceRatio).toBe(1);
    expect(
      model.dataQuality.notices.map((notice) => notice.code),
    ).not.toContain("unknown_sources");
  });

  it("keeps unknown-source warnings visible once the recent-event sample is no longer tiny", () => {
    const freshOccurredAt = new Date(Date.now() - 45 * 60 * 1000).toISOString();

    const model = buildMonetizationDashboardModel({
      aggregate: {
        activePlatforms: 1,
        averageRevenuePerDayCents: 9000,
        currency: "USD",
        sourceBreakdown: [],
        totalRevenueCents: 9000,
        trend: [],
      },
      events: [
        {
          amount_cents: 5000,
          currency: "USD",
          event_type: "other",
          id: "event-sampled-unknown-1",
          occurred_at: freshOccurredAt,
          provider: "twitch",
          source: "mystery_drop",
          status: "confirmed",
        },
        {
          amount_cents: 4000,
          currency: "USD",
          event_type: "other",
          id: "event-sampled-unknown-2",
          occurred_at: freshOccurredAt,
          provider: "youtube",
          source: "platform_bonus",
          status: "confirmed",
        },
      ],
      feed: {
        hasMore: false,
        limit: 12,
        returnedCount: 2,
      },
      lookupIssues: [],
      period: "last_30_days",
      state: "ready",
      summaries: [],
      userId: "user-sampled-unknowns",
    });

    expect(model.dataQuality.sourceObservationScope).toBe(
      "recent_event_sample",
    );
    expect(model.dataQuality.unknownSourceCount).toBe(2);
    expect(model.dataQuality.unknownSourceRatio).toBe(1);
    expect(model.dataQuality.notices.map((notice) => notice.code)).toContain(
      "unknown_sources",
    );
  });

  it("surfaces missing sources, mixed currency, partial reads, and stale latest events", () => {
    const staleOccurredAt = new Date(
      Date.now() - 40 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const model = buildMonetizationDashboardModel({
      aggregate: {
        activePlatforms: 1,
        averageRevenuePerDayCents: 5000,
        currency: "USD",
        sourceBreakdown: [],
        totalRevenueCents: 5000,
        trend: [],
      },
      events: [
        {
          amount_cents: 5000,
          currency: "USD",
          event_type: "other",
          id: "event-missing-source",
          occurred_at: staleOccurredAt,
          provider: "twitch",
          source: " ",
          status: "confirmed",
        },
        {
          amount_cents: 2500,
          currency: "EUR",
          event_type: "tip",
          id: "event-mixed-currency",
          occurred_at: staleOccurredAt,
          provider: "youtube",
          source: "tip",
          status: "confirmed",
        },
      ],
      feed: {
        hasMore: false,
        limit: 12,
        returnedCount: 2,
      },
      lookupIssues: [
        {
          code: "load-failed",
          source: "summaries",
        },
      ],
      period: "all_time",
      state: "ready",
      summaries: [],
      userId: "user-quality",
    });

    expect(model.dataQuality.missingSourceCount).toBe(1);
    expect(model.dataQuality.mixedCurrency).toBe(true);
    expect(model.dataQuality.partialRead).toBe(true);
    expect(model.dataQuality.staleLatestEvent).toBe(true);
    expect(model.dataQuality.notices.map((notice) => notice.code)).toEqual(
      expect.arrayContaining([
        "partial_read",
        "mixed_currency",
        "missing_sources",
        "stale_latest_event",
      ]),
    );
  });

  it("keeps missing and unknown sources separate in recent-event data quality counts", () => {
    const freshOccurredAt = new Date(Date.now() - 20 * 60 * 1000).toISOString();

    const model = buildMonetizationDashboardModel({
      aggregate: {
        activePlatforms: 1,
        averageRevenuePerDayCents: 5000,
        currency: "USD",
        sourceBreakdown: [],
        totalRevenueCents: 10000,
        trend: [],
      },
      events: [
        {
          amount_cents: 5000,
          currency: "USD",
          event_type: "other",
          id: "event-missing-source",
          occurred_at: freshOccurredAt,
          provider: "twitch",
          source: " ",
          status: "confirmed",
        },
        {
          amount_cents: 5000,
          currency: "USD",
          event_type: "other",
          id: "event-unknown-source",
          occurred_at: freshOccurredAt,
          provider: "youtube",
          source: "mystery_drop",
          status: "confirmed",
        },
      ],
      feed: {
        hasMore: false,
        limit: 12,
        returnedCount: 2,
      },
      lookupIssues: [],
      period: "last_30_days",
      state: "ready",
      summaries: [],
      userId: "user-source-semantics",
    });

    expect(model.dataQuality.missingSourceCount).toBe(1);
    expect(model.dataQuality.unknownSourceCount).toBe(1);
    expect(model.dataQuality.unknownSourceRatio).toBe(0.5);
    expect(model.dataQuality.notices.map((notice) => notice.code)).toContain(
      "missing_sources",
    );
    expect(
      model.dataQuality.notices.map((notice) => notice.code),
    ).not.toContain("unknown_sources");
  });

  it("preserves explicit event feed metadata and load-failed state", () => {
    const model = createEmptyMonetizationDashboardModel(
      "all_time",
      "user-5",
      "load-failed",
      [
        {
          code: "load-failed",
          source: "events",
        },
      ],
    );

    expect(model.state).toBe("load-failed");
    expect(model.feed.hasMore).toBe(false);
    expect(model.feed.limit).toBe(12);
    expect(model.periodContext.periodCoverageNote).toContain("weekly summary");
    expect(model.lookupIssues[0]?.source).toBe("events");
    expect(model.revenueBreakdownContext.dimension).toBeNull();
    expect(model.dataQuality.notices).toEqual([]);
  });
});
