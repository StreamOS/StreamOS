import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  isSupabaseConfigured: vi.fn(),
}));

vi.mock("@/lib/supabase/config", () => ({
  isSupabaseConfigured: mocks.isSupabaseConfigured,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

import { getBrandingDashboardData } from "./data";

describe("getBrandingDashboardData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isSupabaseConfigured.mockReturnValue(true);
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: "11111111-1111-4111-8111-111111111111",
        },
      },
      error: null,
    });
  });

  it("returns a disabled state when Supabase is not configured", async () => {
    mocks.isSupabaseConfigured.mockReturnValue(false);

    const data = await getBrandingDashboardData();

    expect(data.state).toBe("disabled");
    expect(data.userId).toBeNull();
  });

  it("returns an auth-failed state when the session lookup errors", async () => {
    mocks.createClient.mockResolvedValue(
      createSupabaseClientMock({
        user: null,
        userError: new Error("session failed"),
      }) as never,
    );

    const data = await getBrandingDashboardData();

    expect(data.state).toBe("auth-failed");
    expect(data.userId).toBeNull();
  });

  it("returns an unauthorized state when no user session exists", async () => {
    mocks.createClient.mockResolvedValue(
      createSupabaseClientMock({
        user: null,
      }) as never,
    );

    const data = await getBrandingDashboardData();

    expect(data.state).toBe("unauthorized");
  });

  it("returns a true empty ready state when the brand asset read succeeds without rows", async () => {
    mocks.createClient.mockResolvedValue(
      createSupabaseClientMock({
        rows: [],
      }) as never,
    );

    const data = await getBrandingDashboardData();

    expect(data.state).toBe("ready");
    expect(data.items).toHaveLength(0);
    expect(data.lookupIssues).toHaveLength(0);
  });

  it("loads read-only brand assets without signing previews or selecting public URLs", async () => {
    const supabase = createSupabaseClientMock({
      channelRows: [
        {
          display_name: "NovaPlays Live",
          id: "channel-1",
          platform: "twitch",
        },
      ],
      rows: [
        createBrandAssetRow({
          asset_type: "logo",
          channel_id: "channel-1",
          storage_bucket: "brand-assets",
          storage_path:
            "11111111-1111-4111-8111-111111111111/logo/asset-1/neon-logo.png",
        }),
      ],
    });
    mocks.createClient.mockResolvedValue(supabase as never);

    const data = await getBrandingDashboardData();

    expect(data.state).toBe("ready");
    expect(data.items[0]).toMatchObject({
      assetType: "logo",
      name: "Neon Logo",
      platform: "twitch",
      storageState: "attached",
      usageContext: "NovaPlays Live",
    });
    expect(supabase.selects[0]).toEqual(
      "asset_type,channel_id,created_at,description,id,name,status,storage_bucket,storage_path,updated_at",
    );
    expect(supabase.selects[0]).not.toContain("public_url");
    expect(supabase.storageTouched).toBe(false);
  });

  it("keeps channel lookup failures as partial state instead of failing the main asset read", async () => {
    const supabase = createSupabaseClientMock({
      channelError: new Error("channels failed"),
      rows: [
        createBrandAssetRow({
          asset_type: "logo",
          channel_id: "channel-1",
          storage_bucket: null,
          storage_path: null,
        }),
      ],
    });
    mocks.createClient.mockResolvedValue(supabase as never);

    const data = await getBrandingDashboardData();

    expect(data.state).toBe("ready");
    expect(data.items[0]).toMatchObject({
      platform: null,
      usageContext: null,
    });
    expect(data.lookupIssues).toEqual([
      {
        code: "load-failed",
        source: "channels",
      },
    ]);
  });

  it("returns a load-failed state when the main brand asset read fails", async () => {
    mocks.createClient.mockResolvedValue(
      createSupabaseClientMock({
        rowError: new Error("brand_assets failed"),
        rows: null,
      }) as never,
    );

    const data = await getBrandingDashboardData();

    expect(data.state).toBe("load-failed");
    expect(data.items).toHaveLength(0);
  });
});

function createBrandAssetRow({
  asset_type,
  channel_id,
  storage_bucket,
  storage_path,
}: {
  asset_type: string;
  channel_id: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
}) {
  return {
    asset_type,
    channel_id,
    created_at: "2026-06-22T10:00:00.000Z",
    description: "Private logo.",
    id: "22222222-2222-4222-8222-222222222222",
    name: "Neon Logo",
    status: "active",
    storage_bucket,
    storage_path,
    updated_at: "2026-06-22T10:15:00.000Z",
  };
}

function createSupabaseClientMock({
  channelError = null,
  channelRows = [],
  rowError = null,
  rows = [],
  user = {
    id: "11111111-1111-4111-8111-111111111111",
  },
  userError = null,
}: {
  channelError?: unknown;
  channelRows?: unknown[] | null;
  rowError?: unknown;
  rows?: unknown[] | null;
  user?: { id: string } | null;
  userError?: unknown;
}) {
  const selects: string[] = [];
  let currentTable = "";

  const brandAssetBuilder = {
    eq: vi.fn(() => brandAssetBuilder),
    limit: vi.fn(async () => ({
      data: rows,
      error: rowError,
    })),
    order: vi.fn(() => brandAssetBuilder),
    select: vi.fn((payload: string) => {
      selects.push(payload);
      return brandAssetBuilder;
    }),
  };

  const channelBuilder = {
    eq: vi.fn(() => channelBuilder),
    in: vi.fn(async () => ({
      data: channelRows,
      error: channelError,
    })),
    select: vi.fn((payload: string) => {
      selects.push(payload);
      return channelBuilder;
    }),
  };

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user,
        },
        error: userError,
      }),
    },
    from: vi.fn((table: string) => {
      currentTable = table;

      return currentTable === "channels" ? channelBuilder : brandAssetBuilder;
    }),
    selects,
    get storageTouched() {
      return false;
    },
  };
}
