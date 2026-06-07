import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authGetUser: vi.fn(),
  createServiceRoleClient: vi.fn(),
  deleteEventSubSubscriptions: vi.fn(),
  getTwitchAppAccessToken: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: mocks.authGetUser,
    },
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}));

vi.mock("@streamos/twitch-eventsub", () => ({
  deleteEventSubSubscriptions: mocks.deleteEventSubSubscriptions,
  getTwitchAppAccessToken: mocks.getTwitchAppAccessToken,
}));

describe("POST /api/platforms/twitch/disconnect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TWITCH_CLIENT_ID = "twitch-client-id";
    process.env.TWITCH_CLIENT_SECRET = "twitch-client-secret";
  });

  it("deletes stored EventSub subscriptions and marks the connection disconnected", async () => {
    const updates: unknown[] = [];
    const serviceSupabase = createMockServiceSupabase({
      connection: {
        id: "connection-1",
        metadata: {
          eventsub: {
            subscription_ids: ["sub-1", "sub-2"],
          },
        },
      },
      updates,
    });

    mocks.authGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mocks.createServiceRoleClient.mockReturnValue(serviceSupabase);
    mocks.getTwitchAppAccessToken.mockResolvedValue("app-access-token");
    mocks.deleteEventSubSubscriptions.mockResolvedValue({
      deleted: ["sub-1", "sub-2"],
      failed: [],
    });

    const { POST } = await import("./route");
    const response = await POST(
      new NextRequest("http://localhost/api/platforms/twitch/disconnect", {
        method: "POST",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.getTwitchAppAccessToken).toHaveBeenCalledWith({
      config: {
        clientId: "twitch-client-id",
        clientSecret: "twitch-client-secret",
      },
    });
    expect(mocks.deleteEventSubSubscriptions).toHaveBeenCalledWith({
      appAccessToken: "app-access-token",
      clientId: "twitch-client-id",
      subscriptionIds: ["sub-1", "sub-2"],
    });
    expect(updates).toEqual([
      {
        metadata: {
          eventsub: null,
        },
        status: "disconnected",
      },
    ]);
    expect(payload).toEqual({
      data: {
        eventsub: {
          deleted: ["sub-1", "sub-2"],
          failed: [],
        },
        platform: "twitch",
        status: "disconnected",
      },
      success: true,
    });
  });
});

function createMockServiceSupabase({
  connection,
  updates,
}: {
  connection: unknown;
  updates: unknown[];
}) {
  return {
    from() {
      return createQueryBuilder({ connection, updates });
    },
  };
}

function createQueryBuilder({
  connection,
  updates,
}: {
  connection: unknown;
  updates: unknown[];
}) {
  const builder = {
    eq: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({
      data: connection,
      error: null,
    })),
    order: vi.fn(() => builder),
    select: vi.fn(() => builder),
    update: vi.fn((payload: unknown) => {
      updates.push(payload);
      return builder;
    }),
  };

  return builder;
}
