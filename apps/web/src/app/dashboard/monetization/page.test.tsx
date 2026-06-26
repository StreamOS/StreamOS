import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MonetizationPage from "./page";
import {
  buildMonetizationDashboardModel,
  createEmptyMonetizationDashboardModel,
} from "@/components/modules/MonetizationDashboardConsole.utils";

const mocks = vi.hoisted(() => ({
  getMonetizationDashboardData: vi.fn(),
}));

vi.mock("./data", () => ({
  getMonetizationDashboardData: mocks.getMonetizationDashboardData,
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

  it("renders partial-load warnings without hiding existing data", async () => {
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
    expect(html).toContain("Diese Surface zeigt die neuesten 1 Monetization");
    expect(html).toContain("Recent Monetization Events");
    expect(html).toContain("Sponsoring");
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
  });
});
