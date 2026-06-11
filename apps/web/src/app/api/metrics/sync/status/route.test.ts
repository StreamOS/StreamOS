import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authGetUser: vi.fn(),
  gatewayFetch: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: mocks.authGetUser,
    },
  })),
}));

describe("GET /api/metrics/sync/status", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mocks.gatewayFetch);

    process.env.API_GATEWAY_URL = "https://gateway.streamos.test";
    process.env.API_GATEWAY_SECRET = "gateway-secret";

    mocks.authGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mocks.gatewayFetch.mockImplementation(() => {
      throw new Error("Unexpected gateway fetch.");
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it("requires an authenticated Supabase session before loading status", async () => {
    mocks.authGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const { GET } = await import("./route");
    const response = await GET(
      createRequest("http://localhost/api/metrics/sync/status?job_id=job-1"),
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toEqual({
      code: "UNAUTHORIZED",
      error: "An authenticated Supabase session is required.",
    });
    expect(mocks.gatewayFetch).not.toHaveBeenCalled();
  });

  it("rejects status lookups without a job identifier", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      createRequest("http://localhost/api/metrics/sync/status"),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      code: "INVALID_REQUEST",
      error: "Request query must include job_id or queue_job_id.",
    });
    expect(mocks.gatewayFetch).not.toHaveBeenCalled();
  });

  it("forwards the status request to the gateway and returns the job state", async () => {
    mocks.gatewayFetch.mockResolvedValue(
      Response.json(
        {
          attempts_made: 1,
          data: {
            providers: ["twitch", "kick"],
            user_id: "user-1",
          },
          failed_reason: null,
          finished_on: null,
          job_id: "job-1",
          processed_on: 1_717_000_000_000,
          progress: { phase: "syncing" },
          queue: "streamos-metrics-sync",
          queue_job_id: "job-1",
          result: null,
          status: "active",
          timestamp: 1_716_999_990_000,
        },
        { status: 200 },
      ),
    );

    const { GET } = await import("./route");
    const response = await GET(
      createRequest(
        "http://localhost/api/metrics/sync/status?queue_job_id=job-1",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      attempts_made: 1,
      data: {
        providers: ["twitch", "kick"],
        user_id: "user-1",
      },
      failed_reason: null,
      finished_on: null,
      job_id: "job-1",
      processed_on: 1_717_000_000_000,
      progress: { phase: "syncing" },
      queue: "streamos-metrics-sync",
      queue_job_id: "job-1",
      result: null,
      status: "active",
      timestamp: 1_716_999_990_000,
    });
    expect(mocks.gatewayFetch).toHaveBeenCalledTimes(1);

    const [requestUrl, requestInit] = mocks.gatewayFetch.mock.calls[0] ?? [];
    expect(String(requestUrl)).toBe(
      "https://gateway.streamos.test/api/metrics/sync-status?job_id=job-1",
    );
    expect(requestInit).toMatchObject({
      headers: {
        Authorization: "Bearer gateway-secret",
      },
    });
  });
});

function createRequest(url: string): NextRequest {
  return new NextRequest(url);
}
