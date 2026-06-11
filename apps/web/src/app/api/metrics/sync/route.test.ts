import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getMetricsSyncJobId } from "@streamos/queue";

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

describe("POST /api/metrics/sync", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mocks.gatewayFetch);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-08T10:15:30.000Z"));

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
    vi.useRealTimers();
  });

  it("requires an authenticated Supabase session before parsing sync input", async () => {
    mocks.authGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const { POST } = await import("./route");
    const response = await POST(createJsonRequest("{"));
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toEqual({
      code: "UNAUTHORIZED",
      error: "An authenticated Supabase session is required.",
    });
  });

  it("rejects unsupported or empty provider lists", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      createJsonRequest({
        providers: ["twitch", "instagram"],
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      code: "INVALID_REQUEST",
      error: "Request body must be { providers: SupportedProvider[] }.",
    });
    expect(mocks.gatewayFetch).not.toHaveBeenCalled();
  });

  it("rejects oversized request bodies before touching Supabase", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      createJsonRequest(
        {
          providers: ["twitch"],
        },
        {
          "content-length": "4097",
        },
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(413);
    expect(payload).toEqual({
      code: "REQUEST_TOO_LARGE",
      error: "Request body exceeds the metrics sync size limit.",
    });
    expect(mocks.authGetUser).not.toHaveBeenCalled();
  });

  it("forwards the sync request to the gateway and returns the queued job", async () => {
    const jobId = getMetricsSyncJobId("user-1", ["twitch", "kick"]);
    mocks.gatewayFetch.mockResolvedValue(
      Response.json(
        {
          job_id: jobId,
          providers: ["twitch", "kick"],
          queue_job_id: jobId,
          status: "queued",
        },
        { status: 202 },
      ),
    );

    const { POST } = await import("./route");
    const response = await POST(
      createJsonRequest({
        providers: ["kick", "twitch", "kick"],
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload).toEqual({
      job_id: jobId,
      providers: ["twitch", "kick"],
      queue_job_id: jobId,
      status: "queued",
    });
    expect(mocks.gatewayFetch).toHaveBeenCalledTimes(1);

    const [requestUrl, requestInit] = mocks.gatewayFetch.mock.calls[0] ?? [];
    expect(String(requestUrl)).toBe(
      "https://gateway.streamos.test/api/metrics/sync-request",
    );
    expect(requestInit).toMatchObject({
      headers: {
        Authorization: "Bearer gateway-secret",
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      providers: ["kick", "twitch", "kick"],
      user_id: "user-1",
    });
  });

  it("returns a configured gateway error payload when the producer fails", async () => {
    mocks.gatewayFetch.mockResolvedValue(
      new Response("queue unavailable", { status: 503 }),
    );

    const { POST } = await import("./route");
    const response = await POST(
      createJsonRequest({
        providers: ["twitch"],
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toEqual({
      error: "gateway_response_unparseable",
      message: "queue unavailable",
    });
  });
});

function createJsonRequest(
  body: unknown,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest("http://localhost/api/metrics/sync", {
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    method: "POST",
  });
}
