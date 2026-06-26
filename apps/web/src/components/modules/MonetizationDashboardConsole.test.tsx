import { describe, expect, it } from "vitest";
import {
  buildMonetizationDashboardModel,
  createEmptyMonetizationDashboardModel,
} from "./MonetizationDashboardConsole.utils";

describe("MonetizationDashboardConsole.utils", () => {
  it("builds monetization dashboard data from summaries and recent events", () => {
    const model = buildMonetizationDashboardModel({
      aggregate: {
        activePlatforms: 2,
        averageRevenuePerDayCents: 18800,
        currency: "USD",
        revenueBySource: [
          {
            amountCents: 182400,
            eventCount: 128,
            key: "subscription",
          },
          {
            amountCents: 68400,
            eventCount: 18,
            key: "merch_sale",
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
          occurred_at: "2026-06-25T10:30:00.000Z",
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
    expect(model.summary.latestEventAt).toBe("2026-06-25T10:30:00.000Z");
    expect(model.coverage.summaryRowCount).toBe(1);
    expect(model.coverage.trendSource).toBe("summaries");
    expect(model.revenueBySource[0]?.key).toBe("subscription");
    expect(model.topRevenueSources[0]?.label).toBe("Subscription");
    expect(model.recentEvents[0]?.source).toBe("channel_subscription");
  });

  it("keeps summaries without events explicit and leaves source amounts unavailable", () => {
    const model = buildMonetizationDashboardModel({
      aggregate: {
        activePlatforms: null,
        averageRevenuePerDayCents: null,
        currency: null,
        revenueBySource: [],
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
    expect(model.revenueBySource[0]?.amount.availability).toBe("unavailable");
    expect(model.revenueBySource[0]?.eventCount).toBe(2);
  });

  it("uses event aggregates when summaries are absent", () => {
    const model = buildMonetizationDashboardModel({
      aggregate: {
        activePlatforms: 1,
        averageRevenuePerDayCents: 9000,
        currency: "USD",
        revenueBySource: [
          {
            amountCents: 63000,
            eventCount: 7,
            key: "sponsorship",
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
          occurred_at: "2026-06-25T12:00:00.000Z",
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
    expect(model.coverage.trendSource).toBe("events");
    expect(model.revenueBySource[0]?.label).toBe("Sponsoring");
  });

  it("keeps unknown revenue source labels stable", () => {
    const model = buildMonetizationDashboardModel({
      aggregate: {
        activePlatforms: 1,
        averageRevenuePerDayCents: 5000,
        currency: "USD",
        revenueBySource: [
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

    expect(model.revenueBySource[0]?.label).toBe("Brand Deal Bonus");
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
    expect(model.lookupIssues[0]?.source).toBe("events");
  });
});
