import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getContentPerformanceAnalyticsDashboardData,
  parseContentPerformanceAnalyticsDetailId,
  parseContentPerformanceAnalyticsPeriod,
} from "./data";

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
  data: unknown[] | null;
  error: unknown;
};

describe("analytics data loader", () => {
  beforeEach(() => {
    mocks.createClient.mockReset();
    mocks.isSupabaseConfigured.mockReset();
  });

  it("returns a disabled state when Supabase is not configured", async () => {
    mocks.isSupabaseConfigured.mockReturnValue(false);

    const model = await getContentPerformanceAnalyticsDashboardData();

    expect(model.state).toBe("disabled");
    expect(model.userId).toBeNull();
    expect(model.items).toHaveLength(0);
    expect(model.detail.state).toBe("idle");
  });

  it("returns an auth-failed state when the session lookup errors", async () => {
    mocks.isSupabaseConfigured.mockReturnValue(true);
    mocks.createClient.mockResolvedValue(
      createSupabaseClient({
        user: null,
        userError: new Error("session lookup failed"),
      }),
    );

    const model = await getContentPerformanceAnalyticsDashboardData();

    expect(model.state).toBe("auth-failed");
    expect(model.userId).toBeNull();
  });

  it("returns an unauthorized state when no user session exists", async () => {
    mocks.isSupabaseConfigured.mockReturnValue(true);
    mocks.createClient.mockResolvedValue(
      createSupabaseClient({
        user: null,
      }),
    );

    const model = await getContentPerformanceAnalyticsDashboardData();

    expect(model.state).toBe("unauthorized");
    expect(model.userId).toBeNull();
  });

  it("returns the true empty ready state when the read-only queries succeed with no rows", async () => {
    mocks.isSupabaseConfigured.mockReturnValue(true);
    mocks.createClient.mockResolvedValue(
      createSupabaseClient({
        tableResults: {
          content_publications: {
            data: [],
            error: null,
          },
          metrics_snapshots: {
            data: [],
            error: null,
          },
        },
        user: {
          id: "user-1",
        },
      }),
    );

    const model = await getContentPerformanceAnalyticsDashboardData();

    expect(model.state).toBe("ready");
    expect(model.userId).toBe("user-1");
    expect(model.items).toHaveLength(0);
    expect(model.lookupIssues).toHaveLength(0);
    expect(model.detail.state).toBe("idle");
  });

  it("applies the selected period as a server-side read window", async () => {
    mocks.isSupabaseConfigured.mockReturnValue(true);
    const client = createSupabaseClient({
      tableResults: {
        content_publications: {
          data: [],
          error: null,
        },
        metrics_snapshots: {
          data: [],
          error: null,
        },
      },
      user: {
        id: "user-3",
      },
    });
    mocks.createClient.mockResolvedValue(client);

    const model = await getContentPerformanceAnalyticsDashboardData("7d");

    expect(model.periodContext.selectedPeriod).toBe("7d");
    expect(client.__builders.content_publications?.gte).toHaveBeenCalledWith(
      "updated_at",
      expect.any(String),
    );
    expect(client.__builders.metrics_snapshots?.gte).toHaveBeenCalledWith(
      "captured_at",
      expect.any(String),
    );
  });

  it("returns a ready detail state with matched stream evidence", async () => {
    mocks.isSupabaseConfigured.mockReturnValue(true);
    mocks.createClient.mockResolvedValue(
      createSupabaseClient({
        tableResults: {
          channels: {
            data: [
              {
                display_name: "NovaPlays Live",
                id: "channel-1",
                platform: "youtube",
              },
            ],
            error: null,
          },
          content_publications: {
            data: [
              {
                content_job_id: "job-1",
                created_at: "2026-06-25T09:45:00.000Z",
                id: "publication-1",
                platform_connection_id: "connection-1",
                publication_status: "published",
                published_at: "2026-06-25T10:00:00.000Z",
                requested_at: "2026-06-25T09:45:00.000Z",
                schedule_status: "not_scheduled",
                scheduled_at_utc: null,
                target_platform: "youtube",
                updated_at: "2026-06-25T10:05:00.000Z",
              },
            ],
            error: null,
          },
          content_jobs: {
            data: [],
            error: null,
          },
          metrics_snapshots: {
            data: [
              {
                captured_at: "2026-06-25T10:30:00.000Z",
                channel_id: "channel-1",
                engagement_rate: 7.8,
                id: "metric-1",
                platform: "youtube",
                viewer_count: 18400,
                watch_time_minutes: 920,
              },
            ],
            error: null,
          },
          platform_connections: {
            data: [
              {
                channel_id: "channel-1",
                id: "connection-1",
                platform: "youtube",
                status: "connected",
              },
            ],
            error: null,
          },
          streams: {
            data: [
              {
                average_viewers: 6400,
                channel_id: "channel-1",
                ended_at: "2026-06-25T10:40:00.000Z",
                game_name: "Ranked Arena",
                id: "stream-1",
                peak_viewers: 9100,
                provider: "youtube",
                started_at: "2026-06-25T09:55:00.000Z",
                status: "ended",
                title: "Ranked launch stream",
                updated_at: "2026-06-25T10:45:00.000Z",
                viewer_peak: 9100,
              },
            ],
            error: null,
          },
        },
        user: {
          id: "user-4",
        },
      }),
    );

    const model = await getContentPerformanceAnalyticsDashboardData(
      "30d",
      "publication:publication-1",
    );

    expect(model.detail.state).toBe("ready");
    expect(model.detail.item?.id).toBe("publication:publication-1");
    expect(model.detail.stream?.title).toBe("Ranked launch stream");
    expect(model.detail.stream?.peakViewers.value).toBe(9100);
  });

  it("returns a load-failed detail state when the stream lookup fails", async () => {
    mocks.isSupabaseConfigured.mockReturnValue(true);
    mocks.createClient.mockResolvedValue(
      createSupabaseClient({
        tableResults: {
          channels: {
            data: [
              {
                display_name: "NovaPlays Live",
                id: "channel-1",
                platform: "youtube",
              },
            ],
            error: null,
          },
          content_publications: {
            data: [
              {
                content_job_id: "job-1",
                created_at: "2026-06-25T09:45:00.000Z",
                id: "publication-1",
                platform_connection_id: "connection-1",
                publication_status: "published",
                published_at: "2026-06-25T10:00:00.000Z",
                requested_at: "2026-06-25T09:45:00.000Z",
                schedule_status: "not_scheduled",
                scheduled_at_utc: null,
                target_platform: "youtube",
                updated_at: "2026-06-25T10:05:00.000Z",
              },
            ],
            error: null,
          },
          content_jobs: {
            data: [],
            error: null,
          },
          metrics_snapshots: {
            data: [
              {
                captured_at: "2026-06-25T10:30:00.000Z",
                channel_id: "channel-1",
                engagement_rate: 7.8,
                id: "metric-1",
                platform: "youtube",
                viewer_count: 18400,
                watch_time_minutes: 920,
              },
            ],
            error: null,
          },
          platform_connections: {
            data: [
              {
                channel_id: "channel-1",
                id: "connection-1",
                platform: "youtube",
                status: "connected",
              },
            ],
            error: null,
          },
          streams: {
            data: null,
            error: new Error("streams failed"),
          },
        },
        user: {
          id: "user-5",
        },
      }),
    );

    const model = await getContentPerformanceAnalyticsDashboardData(
      "30d",
      "publication:publication-1",
    );

    expect(model.state).toBe("ready");
    expect(model.detail.state).toBe("load-failed");
    expect(model.detail.item?.id).toBe("publication:publication-1");
  });

  it("returns a load-failed state when both primary data sources fail", async () => {
    mocks.isSupabaseConfigured.mockReturnValue(true);
    mocks.createClient.mockResolvedValue(
      createSupabaseClient({
        tableResults: {
          content_publications: {
            data: null,
            error: new Error("publications failed"),
          },
          metrics_snapshots: {
            data: null,
            error: new Error("metrics failed"),
          },
        },
        user: {
          id: "user-2",
        },
      }),
    );

    const model = await getContentPerformanceAnalyticsDashboardData();

    expect(model.state).toBe("load-failed");
    expect(model.userId).toBe("user-2");
    expect(model.lookupIssues.map((issue) => issue.source)).toEqual([
      "publications",
      "metricsSnapshots",
    ]);
  });

  it("defaults invalid period values to the 30-day window and trims detail ids", () => {
    expect(parseContentPerformanceAnalyticsPeriod("7d")).toBe("7d");
    expect(parseContentPerformanceAnalyticsPeriod("90d")).toBe("90d");
    expect(parseContentPerformanceAnalyticsPeriod(undefined)).toBe("30d");
    expect(parseContentPerformanceAnalyticsPeriod("all")).toBe("30d");
    expect(parseContentPerformanceAnalyticsDetailId(" metrics:metric-1 ")).toBe(
      "metrics:metric-1",
    );
    expect(parseContentPerformanceAnalyticsDetailId(undefined)).toBeNull();
    expect(parseContentPerformanceAnalyticsDetailId("   ")).toBeNull();
  });
});

function createSupabaseClient({
  tableResults = {},
  user,
  userError = null,
}: {
  tableResults?: Record<string, QueryResult>;
  user: { id: string } | null;
  userError?: unknown;
}) {
  const builders: Record<string, ReturnType<typeof createQueryBuilder>> = {};

  return {
    __builders: builders,
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user,
        },
        error: userError,
      }),
    },
    from: vi.fn((table: string) => {
      const builder = createQueryBuilder(tableResults[table]);
      builders[table] = builder;
      return builder;
    }),
  };
}

function createQueryBuilder(result?: QueryResult) {
  const finalResult = result ?? {
    data: [],
    error: null,
  };

  const chain = {
    eq: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    in: vi.fn(() => chain),
    limit: vi.fn(() => finalResult),
    order: vi.fn(() => chain),
    select: vi.fn(() => chain),
    then: (onFulfilled: (value: QueryResult) => unknown) =>
      Promise.resolve(onFulfilled(finalResult)),
  };

  return chain;
}
