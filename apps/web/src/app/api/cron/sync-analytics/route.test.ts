import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("GET /api/cron/sync-analytics", () => {
  const CRON_SECRET = "0123456789abcdef0123456789abcdef";
  const API_GATEWAY_SECRET = "abcdef0123456789abcdef0123456789";
  const API_GATEWAY_URL = "https://gateway.streamos.test";
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("API_GATEWAY_SECRET", API_GATEWAY_SECRET);
    vi.stubEnv("API_GATEWAY_URL", `${API_GATEWAY_URL}/`);
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns 200 and triggers the api-gateway job when authorized", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
      }),
    );

    const { GET } = await import("./route");
    const response = await GET(
      createRequest({
        authorization: `Bearer ${CRON_SECRET}`,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      triggered: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://gateway.streamos.test/api/jobs/sync-analytics",
      expect.objectContaining({
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${API_GATEWAY_SECRET}`,
        },
        method: "POST",
      }),
    );
  });

  it("returns 401 without triggering the api-gateway job when unauthorized", async () => {
    const { GET } = await import("./route");
    const response = await GET(createRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "unauthorized",
      ok: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 500 when the api-gateway request fails", async () => {
    fetchMock.mockResolvedValue(
      new Response("boom", {
        status: 502,
        statusText: "Bad Gateway",
      }),
    );

    const { GET } = await import("./route");
    const response = await GET(
      createRequest({
        authorization: `Bearer ${CRON_SECRET}`,
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "API gateway responded with HTTP 502 for sync-analytics.",
      ok: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

function createRequest(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/cron/sync-analytics", {
    headers,
  });
}
