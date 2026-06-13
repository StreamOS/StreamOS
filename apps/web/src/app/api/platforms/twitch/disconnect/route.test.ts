import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authGetUser: vi.fn(),
  callApiGatewayJson: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: mocks.authGetUser,
    },
  })),
}));

vi.mock("@/lib/api-gateway", () => ({
  ApiGatewayConfigurationError: class ApiGatewayConfigurationError extends Error {},
  callApiGatewayJson: mocks.callApiGatewayJson,
}));

describe("POST /api/platforms/twitch/disconnect", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.authGetUser.mockResolvedValue({
      data: { user: { id: "11111111-1111-4111-8111-111111111111" } },
      error: null,
    });
    mocks.callApiGatewayJson.mockResolvedValue({
      data: {
        data: {
          platform: "twitch",
          status: "disconnected",
        },
        success: true,
      },
      ok: true,
      status: 200,
    });
  });

  it("requires an authenticated Supabase session", async () => {
    mocks.authGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const { POST } = await import("./route");
    const response = await POST();
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toBe("unauthorized");
    expect(mocks.callApiGatewayJson).not.toHaveBeenCalled();
  });

  it("proxies disconnect requests to the API gateway with the authenticated user id", async () => {
    const { POST } = await import("./route");
    const response = await POST();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      data: {
        platform: "twitch",
        status: "disconnected",
      },
      success: true,
    });
    expect(mocks.callApiGatewayJson).toHaveBeenCalledWith({
      body: {
        user_id: "11111111-1111-4111-8111-111111111111",
      },
      path: "/api/platforms/twitch/disconnect",
    });
  });
});
