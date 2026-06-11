import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  buildMonetizationDashboardData,
  parseMonetizationPeriod,
} from "./data";

describe("monetization dashboard data", () => {
  it("parses supported periods and falls back to the default", () => {
    expect(parseMonetizationPeriod("last_7_days")).toBe("last_7_days");
    expect(parseMonetizationPeriod("last_30_days")).toBe("last_30_days");
    expect(parseMonetizationPeriod("all_time")).toBe("all_time");
    expect(parseMonetizationPeriod("invalid")).toBe("last_30_days");
  });

  it("builds monetization metrics from direct event rows", () => {
    const dashboard = buildMonetizationDashboardData({
      events: [
        {
          amount_cents: 2_499,
          currency: "USD",
          event_type: "subscription",
          id: "event-1",
          occurred_at: "2026-06-05T18:24:00.000Z",
          provider: "twitch",
          source: "live_stream",
          status: "confirmed",
        },
        {
          amount_cents: 12_000,
          currency: "USD",
          event_type: "sponsorship",
          id: "event-2",
          occurred_at: "2026-06-04T14:10:00.000Z",
          provider: "youtube",
          source: "sponsorship_campaign",
          status: "confirmed",
        },
        {
          amount_cents: 5_499,
          currency: "USD",
          event_type: "merch_sale",
          id: "event-3",
          occurred_at: "2026-06-03T20:42:00.000Z",
          provider: "tiktok",
          source: "merch_sku",
          status: "pending",
        },
      ],
      period: "last_30_days",
      summaries: [],
    });

    expect(dashboard.totalRevenueCents).toBe(14_499);
    expect(dashboard.activePlatforms).toBe(2);
    expect(dashboard.avgRevenuePerDayCents).toBeGreaterThan(0);
    expect(dashboard.platformRankings).toHaveLength(0);
    expect(dashboard.platformRevenue).toHaveLength(4);
    expect(dashboard.platformRevenue[0]).toMatchObject({
      amountCents: 2_499,
      provider: "twitch",
    });
    expect(dashboard.breakdown[0]?.eventCount).toBeGreaterThan(0);
    expect(dashboard.recentEvents).toHaveLength(3);
    expect(dashboard.trend).toHaveLength(2);
    expect(dashboard.trend[0]).toMatchObject({
      amountCents: 12_000,
      day: "2026-06-04",
    });
  });

  it("exposes the latest summary snapshot from monetization_summaries", () => {
    const dashboard = buildMonetizationDashboardData({
      events: [],
      period: "all_time",
      summaries: [
        {
          ad_revenue_count: 5,
          currency: "USD",
          donation_count: 2,
          event_count: 98,
          gross_amount_cents: 650_000,
          id: "summary-2",
          merch_sale_count: 11,
          net_amount_cents: 612_000,
          period: "weekly",
          period_end: "2026-06-04",
          period_start: "2026-05-29",
          provider: "youtube",
          sponsorship_count: 4,
          subscription_count: 72,
          tip_count: 9,
          updated_at: "2026-06-04T18:30:00.000Z",
        },
        {
          ad_revenue_count: 7,
          currency: "USD",
          donation_count: 6,
          event_count: 154,
          gross_amount_cents: 569_400,
          id: "summary-1",
          merch_sale_count: 18,
          net_amount_cents: 536_000,
          period: "weekly",
          period_end: "2026-06-05",
          period_start: "2026-05-30",
          provider: "twitch",
          sponsorship_count: 3,
          subscription_count: 128,
          tip_count: 41,
          updated_at: "2026-06-05T18:30:00.000Z",
        },
      ],
    });

    expect(dashboard.latestSummary).toMatchObject({
      currency: "USD",
      eventCount: 154,
      grossAmountCents: 569_400,
      netAmountCents: 536_000,
      periodLabel: "Wochenabschluss",
      providerLabel: "Twitch",
    });
    expect(dashboard.activePlatforms).toBe(2);
    expect(dashboard.platformRankings).toHaveLength(2);
    expect(dashboard.platformRankings[0]).toMatchObject({
      grossAmountCents: 650_000,
      provider: "youtube",
      providerLabel: "YouTube",
      rank: 1,
    });
    expect(
      dashboard.breakdown.reduce((sum, item) => sum + item.amountCents, 0),
    ).toBe(1_219_400);
  });
});
