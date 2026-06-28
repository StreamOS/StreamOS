import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MonetizationPage from "./page";
import { dynamic } from "./page";
import {
  buildMonetizationDashboardModel,
  createEmptyMonetizationDashboardModel,
} from "@/components/modules/MonetizationDashboardConsole.utils";

const mocks = vi.hoisted(() => ({
  getMonetizationDashboardData: vi.fn(),
}));

vi.mock("./data", () => ({
  getMonetizationDashboardData: mocks.getMonetizationDashboardData,
  parseMonetizationEventListView: (
    value: Record<string, string | string[] | undefined> | undefined,
  ) => ({
    eventType: typeof value?.eventType === "string" ? value.eventType : null,
    provider: typeof value?.provider === "string" ? value.provider : null,
    source: typeof value?.source === "string" ? value.source : null,
    status: typeof value?.status === "string" ? value.status : null,
    windowCount: typeof value?.window === "string" ? Number(value.window) : 1,
  }),
  parseMonetizationDashboardPeriod: (value: string | undefined) =>
    value === "all_time"
      ? "all_time"
      : value === "last_7_days"
        ? "last_7_days"
        : "last_30_days",
}));

describe("MonetizationPage", () => {
  beforeEach(() => {
    mocks.getMonetizationDashboardData.mockReset();
  });

  it("renders as a dynamic dashboard route", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("renders the empty read-only monetization surface", async () => {
    mocks.getMonetizationDashboardData.mockResolvedValue(
      createEmptyMonetizationDashboardModel("last_30_days", "user-1"),
    );

    const html = renderToStaticMarkup(await MonetizationPage());

    expect(html).toContain("Monetization Dashboard");
    expect(html).toContain("Read-only monetization model");
    expect(html).toContain("/dashboard/monetization?period=last_30_days");
    expect(html).toContain("Aktive Revenue-Perspektive:");
    expect(html).toContain("Noch keine Monetization-Daten");
    expect(html).toContain("Keine Monetization Events im Zeitraum");
    expect(html).toContain(
      "Plattformverbindungen und serverseitige Monetization-Ingestion",
    );
    expect(html).not.toContain("Data Quality");
  });

  it("renders active all-time period controls with the weekly-summary note", async () => {
    mocks.getMonetizationDashboardData.mockResolvedValue(
      createEmptyMonetizationDashboardModel("all_time", "user-9"),
    );

    const html = renderToStaticMarkup(
      await MonetizationPage({
        searchParams: Promise.resolve({
          period: "all_time",
        }),
      }),
    );

    expect(html).toContain('href="/dashboard/monetization?period=all_time"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain(
      "All time uses weekly summary buckets in this MVP. Recent events remain a limited latest-feed view.",
    );
  });

  it("passes event list filters into the read model and renders sample controls", async () => {
    const model = buildMonetizationDashboardModel({
      aggregate: {
        activePlatforms: 1,
        averageRevenuePerDayCents: 9000,
        currency: "USD",
        sourceBreakdown: [],
        totalRevenueCents: 63000,
        trend: [],
      },
      events: [
        {
          amount_cents: 63000,
          currency: "USD",
          event_type: "sponsorship",
          id: "event-filter-1",
          occurred_at: "2026-06-25T12:00:00.000Z",
          provider: "youtube",
          source: "brand_campaign",
          status: "confirmed",
        },
      ],
      feed: {
        hasMore: true,
        limit: 24,
        returnedCount: 1,
        totalCount: 25,
      },
      lookupIssues: [],
      period: "last_30_days",
      state: "ready",
      summaries: [],
      userId: "user-filter",
    });

    mocks.getMonetizationDashboardData.mockResolvedValue(model);

    const html = renderToStaticMarkup(
      await MonetizationPage({
        searchParams: Promise.resolve({
          eventType: "sponsorship",
          provider: "youtube",
          source: "brand_campaign",
          status: "confirmed",
          window: "2",
        }),
      }),
    );

    expect(mocks.getMonetizationDashboardData).toHaveBeenCalledWith(
      "last_30_days",
      {
        eventType: "sponsorship",
        provider: "youtube",
        source: "brand_campaign",
        status: "confirmed",
        windowCount: 2,
      },
    );
    expect(html).toContain("Event Feed Controls");
    expect(html).toContain("Sample window 2 / 3");
    expect(html).toContain("Clear event filters");
    expect(html).toContain("Show more sample events");
    expect(html).toContain("eventType=sponsorship");
    expect(html).toContain("provider=youtube");
    expect(html).toContain("source=brand_campaign");
    expect(html).toContain("status=confirmed");
    expect(html).toContain("window=3");
  });

  it("renders partial-load warnings without hiding existing data", async () => {
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
        trend: [],
      },
      events: [
        {
          amount_cents: 63000,
          currency: "USD",
          event_type: "sponsorship",
          id: "event-1",
          occurred_at: "2026-06-25T12:00:00.000Z",
          provider: "youtube",
          source: "brand_campaign",
          status: "confirmed",
        },
      ],
      feed: {
        hasMore: true,
        limit: 12,
        returnedCount: 1,
        totalCount: 14,
      },
      lookupIssues: [
        {
          code: "load-failed",
          source: "summaries",
        },
      ],
      period: "last_30_days",
      state: "ready",
      summaries: [],
      userId: "user-2",
    });

    mocks.getMonetizationDashboardData.mockResolvedValue(model);

    const html = renderToStaticMarkup(await MonetizationPage());

    expect(html).toContain(
      "Einige Monetization-Reads konnten nicht geladen werden",
    );
    expect(html).toContain("Data Quality");
    expect(html).toContain("This view is based on partial data.");
    expect(html).toContain("Diese Surface zeigt die neuesten 1 Monetization");
    expect(html).toContain("Recent Monetization Events");
    expect(html).toContain("Revenue by Category");
    expect(html).toContain("Sponsorships");
    expect(html).toContain("Sponsoring");
    expect(html).toContain("Brand Campaign");
  });

  it("does not overstate a single uncategorized source in a tiny recent-event sample", async () => {
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
          id: "event-unknown-sample",
          occurred_at: "2026-06-25T12:00:00.000Z",
          provider: "youtube",
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
      userId: "user-unknown-sample",
    });

    mocks.getMonetizationDashboardData.mockResolvedValue(model);

    const html = renderToStaticMarkup(await MonetizationPage());

    expect(html).toContain("Recent Monetization Events");
    expect(html).toContain("Mystery Drop");
    expect(html).toContain("Unknown");
    expect(html).not.toContain(
      "Some sampled revenue sources are uncategorized.",
    );
  });

  it("renders summary fallback as categories instead of sources", async () => {
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
      userId: "user-7",
    });

    mocks.getMonetizationDashboardData.mockResolvedValue(model);

    const html = renderToStaticMarkup(await MonetizationPage());

    expect(html).toContain("Revenue Categories");
    expect(html).toContain("Donations");
    expect(html).toContain("Recent events are missing for this period.");
    expect(html).toContain("Latest Summary");
    expect(html).not.toContain("Revenue by Source");
    expect(html).toContain(
      "Summary rows expose category counts without source-level revenue amounts in this MVP.",
    );
  });

  it("renders a hard load failure without the partial-load notice", async () => {
    mocks.getMonetizationDashboardData.mockResolvedValue(
      createEmptyMonetizationDashboardModel(
        "last_30_days",
        "user-3",
        "load-failed",
        [
          {
            code: "load-failed",
            source: "aggregates",
          },
        ],
      ),
    );

    const html = renderToStaticMarkup(await MonetizationPage());

    expect(html).toContain(
      "Monetization-Aggregates, Summaries und Recent Events konnten nicht geladen werden",
    );
    expect(html).not.toContain(
      "Einige Monetization-Reads konnten nicht geladen werden",
    );
    expect(html).not.toContain("Data Quality");
  });
});
