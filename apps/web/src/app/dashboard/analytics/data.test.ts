import { beforeEach, describe, expect, it, vi } from "vitest";
import { getContentPerformanceAnalyticsDashboardData } from "./data";

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
  };
}

function createQueryBuilder(result?: QueryResult) {
  const finalResult = result ?? {
    data: [],
    error: null,
  };

  const chain = {
    eq: vi.fn(() => chain),
    in: vi.fn(() => finalResult),
    limit: vi.fn(() => finalResult),
    order: vi.fn(() => chain),
    select: vi.fn(() => chain),
  };

  return chain;
}
