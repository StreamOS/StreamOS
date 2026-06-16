import { NextRequest } from "next/server";
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

describe("POST /api/metrics/sync", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.authGetUser.mockResolvedValue({
      data: { user: { id: "11111111-1111-4111-8111-111111111111" } },
      error: null,
    });
    mocks.callApiGatewayJson.mockResolvedValue({
      data: {
        failed: [],
        synced: ["twitch"],
      },
      ok: true,
      status: 200,
    });
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
    expect(mocks.callApiGatewayJson).not.toHaveBeenCalled();
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
    expect(mocks.callApiGatewayJson).not.toHaveBeenCalled();
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
    expect(mocks.callApiGatewayJson).not.toHaveBeenCalled();
  });

  it("forwards a deduplicated provider list and authenticated user id to the gateway", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      createJsonRequest({
        providers: ["twitch", "twitch"],
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      failed: [],
      synced: ["twitch"],
    });
    expect(mocks.callApiGatewayJson).toHaveBeenCalledWith({
      body: {
        providers: ["twitch"],
        user_id: "11111111-1111-4111-8111-111111111111",
      },
      path: "/api/metrics/sync",
    });
  });

  it("preserves gateway multi-status responses", async () => {
    mocks.callApiGatewayJson.mockResolvedValue({
      data: {
        failed: [
          {
            code: "CONNECTION_NOT_FOUND",
            provider: "twitch",
            reason: "No twitch connection found for this user.",
          },
        ],
        synced: [],
      },
      ok: true,
      status: 207,
    });

    const { POST } = await import("./route");
    const response = await POST(
      createJsonRequest({
        providers: ["twitch"],
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(207);
    expect(payload.failed[0].code).toBe("CONNECTION_NOT_FOUND");
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
