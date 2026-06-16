import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { verifyOAuthHandoffToken } from "@/lib/gateway/handoff";

const mocks = vi.hoisted(() => ({
  authGetUser: vi.fn(),
  ensureCreatorForUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: mocks.authGetUser,
    },
  })),
}));

vi.mock("@/lib/supabase/creator", () => ({
  ensureCreatorForUser: mocks.ensureCreatorForUser,
}));

describe("GET /api/platforms/twitch/connect", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-10T10:00:00.000Z"));
    process.env.API_GATEWAY_URL = "https://gateway.streamos.test";
    process.env.API_GATEWAY_SECRET = `base64:${randomBytes(32).toString("base64")}`;
    mocks.ensureCreatorForUser.mockResolvedValue({
      id: "creator-1",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = { ...originalEnv };
  });

  it("redirects authenticated users to the gateway with a signed handoff", async () => {
    mocks.authGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    const { GET } = await import("./route");
    const response = await GET(
      new NextRequest(
        "http://localhost/api/platforms/twitch/connect?next=/dashboard/platforms",
      ),
    );
    const location = response.headers.get("location");

    expect(response.status).toBe(307);
    expect(location).toBeTruthy();

    const connectUrl = new URL(location ?? "");
    expect(connectUrl.origin).toBe("https://gateway.streamos.test");
    expect(connectUrl.pathname).toBe("/api/auth/twitch/connect");

    const handoffToken = connectUrl.searchParams.get("handoff");
    expect(handoffToken).toBeTruthy();

    const handoff = verifyOAuthHandoffToken({
      now: () => Date.now(),
      secret: process.env.API_GATEWAY_SECRET,
      token: handoffToken ?? undefined,
    });

    expect(handoff).toEqual({
      creator_id: "creator-1",
      exp: Date.now() + 60_000,
      return_to: "http://localhost/dashboard/platforms",
      user_id: "user-1",
    });
  });

  it("redirects unauthenticated users directly to the gateway connect endpoint", async () => {
    mocks.authGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const { GET } = await import("./route");
    const response = await GET(
      new NextRequest("http://localhost/api/platforms/twitch/connect"),
    );
    const location = response.headers.get("location");

    expect(response.status).toBe(307);
    expect(location).toBe(
      "http://localhost/auth/login?error=unauthorized&next=%2Fdashboard%2Fplatforms",
    );
    expect(mocks.ensureCreatorForUser).not.toHaveBeenCalled();
  });
});
