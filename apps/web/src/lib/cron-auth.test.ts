import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireCronAuth } from "./cron-auth";

describe("requireCronAuth", () => {
  const CRON_SECRET = "0123456789abcdef0123456789abcdef";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 401 when the authorization header is missing", async () => {
    const response = requireCronAuth(createRequest());

    expect(response).not.toBeNull();
    expect(response?.status).toBe(401);
    await expect(response!.json()).resolves.toEqual({
      error: "unauthorized",
      ok: false,
    });
  });

  it("returns 401 when the bearer token does not match", async () => {
    const response = requireCronAuth(
      createRequest({
        authorization: "Bearer wrong-secret-value-1234567890",
      }),
    );

    expect(response).not.toBeNull();
    expect(response?.status).toBe(401);
    await expect(response!.json()).resolves.toEqual({
      error: "unauthorized",
      ok: false,
    });
  });

  it("returns null for a matching bearer token", () => {
    const response = requireCronAuth(
      createRequest({
        authorization: `Bearer ${CRON_SECRET}`,
      }),
    );

    expect(response).toBeNull();
  });

  it("returns 401 when CRON_SECRET is missing", async () => {
    vi.unstubAllEnvs();

    const response = requireCronAuth(
      createRequest({
        authorization: `Bearer ${CRON_SECRET}`,
      }),
    );

    expect(response).not.toBeNull();
    expect(response?.status).toBe(401);
    await expect(response!.json()).resolves.toEqual({
      error: "unauthorized",
      ok: false,
    });
  });
});

function createRequest(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/cron/example", {
    headers,
  });
}
