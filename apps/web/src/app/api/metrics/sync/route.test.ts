import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authGetUser: vi.fn(),
  createServiceRoleClient: vi.fn(),
  decryptToken: vi.fn(),
  encryptToken: vi.fn(),
  getKickChannelMetrics: vi.fn(),
  getTikTokChannelMetrics: vi.fn(),
  getTwitchChannelMetrics: vi.fn(),
  getYouTubeChannelMetrics: vi.fn(),
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

vi.mock("@/lib/crypto", () => ({
  decryptToken: mocks.decryptToken,
  encryptToken: mocks.encryptToken,
}));

vi.mock("@/lib/integrations/kick-metrics", () => ({
  getKickChannelMetrics: mocks.getKickChannelMetrics,
}));

vi.mock("@/lib/integrations/tiktok-metrics", () => ({
  getTikTokChannelMetrics: mocks.getTikTokChannelMetrics,
}));

vi.mock("@/lib/integrations/twitch-metrics", () => ({
  getTwitchChannelMetrics: mocks.getTwitchChannelMetrics,
}));

vi.mock("@/lib/integrations/youtube-metrics", () => ({
  getYouTubeChannelMetrics: mocks.getYouTubeChannelMetrics,
}));

describe("POST /api/metrics/sync", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-08T10:15:30.000Z"));

    mocks.authGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mocks.decryptToken.mockReturnValue("access-token");
    mocks.encryptToken.mockImplementation(
      (value: string) => `encrypted:${value}`,
    );
    mocks.getTwitchChannelMetrics.mockResolvedValue(createTwitchMetrics());
  });

  afterEach(() => {
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
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
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
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
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

  it("rejects oversized request bodies without trusting content-length", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      createJsonRequest({
        padding: "x".repeat(4_096),
        providers: ["twitch"],
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(413);
    expect(payload).toEqual({
      code: "REQUEST_TOO_LARGE",
      error: "Request body exceeds the metrics sync size limit.",
    });
    expect(mocks.authGetUser).toHaveBeenCalledTimes(1);
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("upserts one normalized hourly snapshot for duplicate provider input", async () => {
    const serviceSupabase = createMockServiceSupabase({
      connection: createConnection(),
    });
    mocks.createServiceRoleClient.mockReturnValue(serviceSupabase);

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
    expect(mocks.getTwitchChannelMetrics).toHaveBeenCalledTimes(1);
    expect(mocks.getTwitchChannelMetrics).toHaveBeenCalledWith(
      "access-token",
      "provider-account-1",
      {
        signal: expect.any(AbortSignal),
      },
    );
    expect(serviceSupabase.upserts).toEqual([
      {
        options: {
          onConflict: "user_id,platform,captured_hour",
        },
        payload: {
          captured_at: "2026-06-08T10:15:30.000Z",
          captured_hour: "2026-06-08T10:00:00.000Z",
          channel_id: "channel-1",
          creator_id: "creator-1",
          follower_count: 1234,
          platform: "twitch",
          raw_payload: {
            broadcasterId: "provider-account-1",
            followers: {
              total: 1234,
            },
            normalized: {
              followers: 1234,
              peak_viewers: 88,
              subscribers: null,
              views: 9876,
            },
            stream: {
              id: "stream-1",
              started_at: "2026-06-08T10:00:00.000Z",
              title: "Live coding",
              viewer_count: 88,
            },
            synced_at: "2026-06-08T10:15:30.000Z",
            user: {
              display_name: "StreamOS",
              id: "provider-account-1",
              login: "streamos",
              view_count: 9876,
            },
          },
          revenue_cents: 0,
          user_id: "user-1",
          viewer_count: 88,
          watch_time_minutes: 0,
        },
      },
    ]);
  });

  it("returns a structured provider failure when no connection exists", async () => {
    mocks.createServiceRoleClient.mockReturnValue(
      createMockServiceSupabase({
        connection: null,
      }),
    );

    const { POST } = await import("./route");
    const response = await POST(
      createJsonRequest({
        providers: ["twitch"],
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(207);
    expect(payload).toEqual({
      failed: [
        {
          code: "CONNECTION_NOT_FOUND",
          provider: "twitch",
          reason: "No twitch connection found for this user.",
        },
      ],
      synced: [],
    });
    expect(mocks.getTwitchChannelMetrics).not.toHaveBeenCalled();
  });

  it("blocks revoked connections before decrypting tokens or calling providers", async () => {
    mocks.createServiceRoleClient.mockReturnValue(
      createMockServiceSupabase({
        connection: createConnection({
          status: "revoked",
        }),
      }),
    );

    const { POST } = await import("./route");
    const response = await POST(
      createJsonRequest({
        providers: ["twitch"],
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(207);
    expect(payload).toEqual({
      failed: [
        {
          code: "CONNECTION_NOT_FOUND",
          provider: "twitch",
          reason: "The latest twitch connection is not syncable.",
        },
      ],
      synced: [],
    });
    expect(mocks.decryptToken).not.toHaveBeenCalled();
    expect(mocks.getTwitchChannelMetrics).not.toHaveBeenCalled();
  });

  it("returns provider API failures without leaking stack traces", async () => {
    mocks.createServiceRoleClient.mockReturnValue(
      createMockServiceSupabase({
        connection: createConnection(),
      }),
    );
    mocks.getTwitchChannelMetrics.mockRejectedValue(
      new Error("Twitch metrics request failed with 500."),
    );

    const { POST } = await import("./route");
    const response = await POST(
      createJsonRequest({
        providers: ["twitch"],
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(207);
    expect(payload).toEqual({
      failed: [
        {
          code: "PROVIDER_FETCH_FAILED",
          provider: "twitch",
          reason: "Twitch metrics request failed with 500.",
        },
      ],
      synced: [],
    });
  });

  it("rate limits repeated provider syncs in the active window", async () => {
    const serviceSupabase = createMockServiceSupabase({
      connection: createConnection(),
    });
    mocks.createServiceRoleClient.mockReturnValue(serviceSupabase);

    const { POST } = await import("./route");
    const firstResponse = await POST(
      createJsonRequest({
        providers: ["twitch"],
      }),
    );
    const secondResponse = await POST(
      createJsonRequest({
        providers: ["twitch"],
      }),
    );
    const payload = await secondResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(207);
    expect(payload).toEqual({
      failed: [
        {
          code: "RATE_LIMITED",
          provider: "twitch",
          reason: "Only one metrics sync per provider per minute is allowed.",
        },
      ],
      synced: [],
    });
    expect(mocks.getTwitchChannelMetrics).toHaveBeenCalledTimes(1);
    expect(serviceSupabase.upserts).toHaveLength(1);
  });
});

type MockConnection = {
  access_token_ciphertext: string | null;
  channel_id: string | null;
  creator_id: string;
  expires_at: string | null;
  id: string;
  platform: string;
  provider_account_id: string;
  provider_profile: Record<string, unknown> | null;
  refresh_token_ciphertext: string | null;
  scopes: string[] | null;
  status: string;
  user_id: string;
};

type MockServiceSupabase = {
  from: ReturnType<typeof vi.fn>;
  upserts: Array<{
    options: unknown;
    payload: unknown;
  }>;
  updates: unknown[];
};

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

function createConnection(
  overrides: Partial<MockConnection> = {},
): MockConnection {
  return {
    access_token_ciphertext: "encrypted-access-token",
    channel_id: "channel-1",
    creator_id: "creator-1",
    expires_at: "2026-06-08T11:15:30.000Z",
    id: "connection-1",
    platform: "twitch",
    provider_account_id: "provider-account-1",
    provider_profile: null,
    refresh_token_ciphertext: "encrypted-refresh-token",
    scopes: ["channel:read:subscriptions"],
    status: "connected",
    user_id: "user-1",
    ...overrides,
  };
}

function createTwitchMetrics() {
  return {
    broadcasterId: "provider-account-1",
    followers: {
      total: 1234,
    },
    stream: {
      id: "stream-1",
      started_at: "2026-06-08T10:00:00.000Z",
      title: "Live coding",
      viewer_count: 88,
    },
    user: {
      display_name: "StreamOS",
      id: "provider-account-1",
      login: "streamos",
      view_count: 9876,
    },
  };
}

function createMockServiceSupabase({
  connection,
  connectionError = null,
  upsertError = null,
}: {
  connection: MockConnection | null;
  connectionError?: { message: string } | null;
  upsertError?: { message: string } | null;
}): MockServiceSupabase {
  const upserts: MockServiceSupabase["upserts"] = [];
  const updates: unknown[] = [];

  return {
    from: vi.fn((table: string) => {
      if (table === "platform_connections") {
        return createPlatformConnectionBuilder({
          connection,
          connectionError,
          updates,
        });
      }

      if (table === "metrics_snapshots") {
        return createMetricsSnapshotBuilder({
          upsertError,
          upserts,
        });
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
    updates,
    upserts,
  };
}

function createPlatformConnectionBuilder({
  connection,
  connectionError,
  updates,
}: {
  connection: MockConnection | null;
  connectionError: { message: string } | null;
  updates: unknown[];
}) {
  const builder = {
    eq: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({
      data: connection,
      error: connectionError,
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

function createMetricsSnapshotBuilder({
  upsertError,
  upserts,
}: {
  upsertError: { message: string } | null;
  upserts: MockServiceSupabase["upserts"];
}) {
  return {
    upsert: vi.fn(async (payload: unknown, options: unknown) => {
      upserts.push({
        options,
        payload,
      });

      return {
        error: upsertError,
      };
    }),
  };
}
