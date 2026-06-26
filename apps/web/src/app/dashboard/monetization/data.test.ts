import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMonetizationDashboardData } from "./data";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  isSupabaseConfigured: vi.fn(),
}));

vi.mock("@/lib/supabase/config", () => ({
  isSupabaseConfigured: mocks.isSupabaseConfigured,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

type QueryResult = {
  count?: number | null;
  data: unknown[] | null;
  error: unknown;
};

describe("monetization data loader", () => {
  beforeEach(() => {
    mocks.createClient.mockReset();
    mocks.isSupabaseConfigured.mockReset();
  });

  it("returns a disabled state when Supabase is not configured", async () => {
    mocks.isSupabaseConfigured.mockReturnValue(false);

    const model = await getMonetizationDashboardData("last_30_days");

    expect(model.state).toBe("disabled");
    expect(model.userId).toBeNull();
  });

  it("returns an auth-failed state when the session lookup errors", async () => {
    mocks.isSupabaseConfigured.mockReturnValue(true);
    mocks.createClient.mockResolvedValue(
      createSupabaseClient({
        rpcResult: {
          data: {},
          error: null,
        },
        user: null,
        userError: new Error("session lookup failed"),
      }),
    );

    const model = await getMonetizationDashboardData("last_30_days");

    expect(model.state).toBe("auth-failed");
    expect(model.userId).toBeNull();
  });

  it("returns an unauthorized state when no user session exists", async () => {
    mocks.isSupabaseConfigured.mockReturnValue(true);
    mocks.createClient.mockResolvedValue(
      createSupabaseClient({
        rpcResult: {
          data: {},
          error: null,
        },
        user: null,
      }),
    );

    const model = await getMonetizationDashboardData("last_30_days");

    expect(model.state).toBe("unauthorized");
  });

  it("returns the true empty ready state when monetization reads succeed without rows", async () => {
    mocks.isSupabaseConfigured.mockReturnValue(true);
    mocks.createClient.mockResolvedValue(
      createSupabaseClient({
        rpcResult: {
          data: {},
          error: null,
        },
        tableResults: {
          monetization_events: {
            count: 0,
            data: [],
            error: null,
          },
          monetization_summaries: {
            data: [],
            error: null,
          },
        },
        user: {
          id: "user-1",
        },
      }),
    );

    const model = await getMonetizationDashboardData("last_30_days");

    expect(model.state).toBe("ready");
    expect(model.summary.totalRevenue.availability).toBe("unavailable");
    expect(model.recentEvents).toHaveLength(0);
    expect(model.revenueBreakdownContext.dimension).toBeNull();
    expect(model.lookupIssues).toHaveLength(0);
  });

  it("prefers revenue_by_source aggregates when the RPC exposes real source buckets", async () => {
    mocks.isSupabaseConfigured.mockReturnValue(true);
    mocks.createClient.mockResolvedValue(
      createSupabaseClient({
        rpcResult: {
          data: {
            active_platforms: 1,
            avg_revenue_per_day_cents: 5000,
            currency: "USD",
            revenue_by_source: [
              {
                amount_cents: 5000,
                event_count: 2,
                source: "channel_subscription",
              },
            ],
            total_revenue_cents: 5000,
          },
          error: null,
        },
        tableResults: {
          monetization_events: {
            count: 1,
            data: [
              {
                amount_cents: 2500,
                currency: "USD",
                event_type: "subscription",
                id: "event-1",
                occurred_at: "2026-06-25T10:30:00.000Z",
                provider: "twitch",
                source: "channel_subscription",
                status: "confirmed",
              },
            ],
            error: null,
          },
          monetization_summaries: {
            data: [],
            error: null,
          },
        },
        user: {
          id: "user-3",
        },
      }),
    );

    const model = await getMonetizationDashboardData("last_30_days");

    expect(model.revenueBreakdownContext.dimension).toBe("source");
    expect(model.revenueBreakdownContext.dataSource).toBe("events");
    expect(model.revenueBreakdown[0]?.key).toBe("channel_subscription");
    expect(model.revenueBreakdown[0]?.label).toBe("Channel Subscription");
    expect(model.revenueBreakdown[0]?.category).toBe("subscriptions");
    expect(model.revenueCategories[0]?.label).toBe("Subscriptions");
    expect(model.recentEvents[0]?.sourceCategory).toBe("subscriptions");
  });

  it("does not treat legacy revenue_by_event_type aggregates as source breakdown data", async () => {
    mocks.isSupabaseConfigured.mockReturnValue(true);
    mocks.createClient.mockResolvedValue(
      createSupabaseClient({
        rpcResult: {
          data: {
            active_platforms: 1,
            avg_revenue_per_day_cents: 5000,
            currency: "USD",
            revenue_by_event_type: [
              {
                amount_cents: 5000,
                event_count: 2,
                event_type: "subscription",
              },
            ],
            total_revenue_cents: 5000,
          },
          error: null,
        },
        tableResults: {
          monetization_events: {
            count: 1,
            data: [
              {
                amount_cents: 2500,
                currency: "USD",
                event_type: "subscription",
                id: "event-legacy",
                occurred_at: "2026-06-25T10:30:00.000Z",
                provider: "twitch",
                source: "channel_subscription",
                status: "confirmed",
              },
            ],
            error: null,
          },
          monetization_summaries: {
            data: [],
            error: null,
          },
        },
        user: {
          id: "user-legacy",
        },
      }),
    );

    const model = await getMonetizationDashboardData("last_30_days");

    expect(model.revenueBreakdown).toEqual([]);
    expect(model.revenueBreakdownContext.dataSource).toBe("none");
    expect(model.revenueBreakdownContext.dimension).toBeNull();
  });

  it("returns a load-failed state when aggregates, events and summaries fail together", async () => {
    mocks.isSupabaseConfigured.mockReturnValue(true);
    mocks.createClient.mockResolvedValue(
      createSupabaseClient({
        rpcResult: {
          data: null,
          error: new Error("rpc failed"),
        },
        tableResults: {
          monetization_events: {
            count: null,
            data: null,
            error: new Error("events failed"),
          },
          monetization_summaries: {
            data: null,
            error: new Error("summaries failed"),
          },
        },
        user: {
          id: "user-2",
        },
      }),
    );

    const model = await getMonetizationDashboardData("last_30_days");

    expect(model.state).toBe("load-failed");
    expect(model.lookupIssues.map((issue) => issue.source)).toEqual([
      "aggregates",
      "events",
      "summaries",
    ]);
  });
});

function createSupabaseClient({
  rpcResult,
  tableResults = {},
  user,
  userError = null,
}: {
  rpcResult: {
    data: unknown;
    error: unknown;
  };
  tableResults?: Record<string, QueryResult>;
  user: { id: string } | null;
  userError?: unknown;
}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user,
        },
        error: userError,
      }),
    },
    from: vi.fn((table: string) => createQueryBuilder(tableResults[table])),
    rpc: vi.fn().mockResolvedValue(rpcResult),
  };
}

function createQueryBuilder(result?: QueryResult) {
  const finalResult = result ?? {
    count: 0,
    data: [],
    error: null,
  };

  const chain = {
    eq: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    order: vi.fn(() => chain),
    select: vi.fn(() => chain),
    then: (resolve: (value: QueryResult) => unknown) => resolve(finalResult),
  };

  return chain;
}
