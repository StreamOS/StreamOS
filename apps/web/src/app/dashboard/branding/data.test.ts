import { BRANDING_DASHBOARD_PREVIEW_TTL_SECONDS } from "@streamos/types";
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
    expect(data.feed).toMatchObject({
      hasMore: false,
      limit: 12,
      nextCursor: null,
      returnedCount: 0,
      scope: "full_result",
      serverSort: "updated_desc",
    });
    expect(data.mutationContract.delete.available).toBe(false);
    expect(data.mutationContract.replace.reason).toBe(
      "requires_new_asset_row_strategy",
    );
    expect(data.mutationContract["orphan_cleanup"].reason).toBe(
      "requires_scoped_manual_cleanup",
    );
    expect("orphanCleanup" in data.mutationContract).toBe(false);
  });

  it("loads read-only brand assets with server-signed previews and without selecting public URLs", async () => {
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
          metadata: {
            upload: {
              content_type: "image/png",
              file_extension: "png",
              file_size_bytes: 2048,
              stored_filename: "neon-logo.png",
            },
          },
          storage_bucket: "brand-assets",
          storage_path:
            "11111111-1111-4111-8111-111111111111/logo/asset-1/neon-logo.png",
        }),
      ],
    });
    mocks.createClient.mockResolvedValue(supabase as never);

    const data = await getBrandingDashboardData();

    expect(data.state).toBe("ready");
    expect(data.feed).toMatchObject({
      hasMore: false,
      limit: 12,
      nextCursor: null,
      returnedCount: 1,
      scope: "full_result",
      serverSort: "updated_desc",
    });
    expect(data.items[0]).toMatchObject({
      assetType: "logo",
      futureActions: [
        expect.objectContaining({
          action: "replace",
          available: false,
        }),
        expect.objectContaining({
          action: "delete",
          available: false,
        }),
      ],
      name: "Neon Logo",
      platform: "twitch",
      preview: {
        reason: null,
        status: "available",
        url: expect.stringMatching(/^https:\/\/signed\.example\/preview-\d+$/),
      },
      storageState: "attached",
      uploadMetadata: {
        contentType: "image/png",
        fileExtension: "png",
        fileSizeBytes: 2048,
        status: "available",
        storedFilename: "neon-logo.png",
      },
      usageContext: "NovaPlays Live",
    });
    expect(data.items[0]?.preview.expiresAt).toEqual(expect.any(String));
    expect(supabase.selects[0]).toEqual(
      "asset_type,channel_id,created_at,description,id,metadata,name,status,storage_bucket,storage_path,updated_at",
    );
    expect(supabase.selects[0]).not.toContain("public_url");
    expect(supabase.signedUrlRequests).toEqual([
      {
        bucket: "brand-assets",
        expiresIn: BRANDING_DASHBOARD_PREVIEW_TTL_SECONDS,
        path: "11111111-1111-4111-8111-111111111111/logo/asset-1/neon-logo.png",
      },
    ]);
    expect(supabase.storageTouched).toBe(true);
    expect(data.mutationContract["orphan_cleanup"].reason).toBe(
      "requires_scoped_manual_cleanup",
    );
  });

  it("marks the feed as a loaded sample and prepares a next cursor when more rows exist than the current limit", async () => {
    const rows = Array.from({ length: 13 }, (_, index) =>
      createBrandAssetRow({
        asset_type: "logo",
        channel_id: null,
        id: `asset-${index + 1}`,
        name: `Asset ${index + 1}`,
        storage_bucket: null,
        storage_path: null,
      }),
    );
    const supabase = createSupabaseClientMock({ rows });
    mocks.createClient.mockResolvedValue(supabase as never);

    const data = await getBrandingDashboardData();

    expect(data.feed).toEqual({
      hasMore: true,
      limit: 12,
      nextCursor: {
        id: "asset-12",
        updatedAt: "2026-06-22T10:15:00.000Z",
      },
      returnedCount: 12,
      scope: "loaded_sample",
      serverSort: "updated_desc",
    });
    expect(data.items).toHaveLength(12);
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

  it("keeps previews unavailable when storage metadata is missing", async () => {
    const supabase = createSupabaseClientMock({
      rows: [
        createBrandAssetRow({
          asset_type: "logo",
          channel_id: null,
          storage_bucket: null,
          storage_path: null,
        }),
      ],
    });
    mocks.createClient.mockResolvedValue(supabase as never);

    const data = await getBrandingDashboardData();

    expect(data.state).toBe("ready");
    expect(data.items[0]?.preview).toEqual({
      expiresAt: null,
      reason: "missing_storage",
      status: "unavailable",
      url: null,
    });
    expect(data.items[0]?.uploadMetadata.status).toBe("unavailable");
    expect(supabase.signedUrlRequests).toHaveLength(0);
    expect(supabase.storageTouched).toBe(false);
  });

  it("keeps older assets without upload metadata page-safe and allows conservative extension fallback", async () => {
    const supabase = createSupabaseClientMock({
      rows: [
        createBrandAssetRow({
          asset_type: "logo",
          channel_id: null,
          metadata: null,
          storage_bucket: "brand-assets",
          storage_path:
            "11111111-1111-4111-8111-111111111111/logo/asset-1/legacy-logo.png",
        }),
      ],
    });
    mocks.createClient.mockResolvedValue(supabase as never);

    const data = await getBrandingDashboardData();

    expect(data.items[0]?.uploadMetadata).toEqual({
      contentType: null,
      fileExtension: null,
      fileSizeBytes: null,
      status: "unavailable",
      storedFilename: null,
    });
    expect(data.items[0]?.preview.status).toBe("available");
    expect(supabase.signedUrlRequests).toHaveLength(1);
  });

  it("rejects previews for tenant-foreign storage paths before signing", async () => {
    const supabase = createSupabaseClientMock({
      rows: [
        createBrandAssetRow({
          asset_type: "logo",
          channel_id: null,
          storage_bucket: "brand-assets",
          storage_path:
            "99999999-9999-4999-8999-999999999999/logo/asset-1/neon-logo.png",
        }),
      ],
    });
    mocks.createClient.mockResolvedValue(supabase as never);

    const data = await getBrandingDashboardData();

    expect(data.items[0]?.preview).toEqual({
      expiresAt: null,
      reason: "invalid_storage_metadata",
      status: "unavailable",
      url: null,
    });
    expect(supabase.signedUrlRequests).toHaveLength(0);
  });

  it("keeps svg and unsupported asset files out of the preview pipeline", async () => {
    const supabase = createSupabaseClientMock({
      rows: [
        createBrandAssetRow({
          asset_type: "logo",
          channel_id: null,
          storage_bucket: "brand-assets",
          storage_path:
            "11111111-1111-4111-8111-111111111111/logo/asset-1/neon-logo.svg",
        }),
      ],
    });
    mocks.createClient.mockResolvedValue(supabase as never);

    const data = await getBrandingDashboardData();

    expect(data.items[0]?.preview).toEqual({
      expiresAt: null,
      reason: "unsupported_file_type",
      status: "unsupported",
      url: null,
    });
    expect(supabase.signedUrlRequests).toHaveLength(0);
  });

  it("blocks preview signing when upload metadata content type and extension disagree", async () => {
    const supabase = createSupabaseClientMock({
      rows: [
        createBrandAssetRow({
          asset_type: "logo",
          channel_id: null,
          metadata: {
            upload: {
              content_type: "image/jpeg",
              file_extension: "png",
              file_size_bytes: 1200,
              stored_filename: "brand-shot.png",
            },
          },
          storage_bucket: "brand-assets",
          storage_path:
            "11111111-1111-4111-8111-111111111111/logo/asset-1/brand-shot.png",
        }),
      ],
    });
    mocks.createClient.mockResolvedValue(supabase as never);

    const data = await getBrandingDashboardData();

    expect(data.items[0]?.uploadMetadata.status).toBe("available");
    expect(data.items[0]?.preview).toEqual({
      expiresAt: null,
      reason: "unsupported_file_type",
      status: "unsupported",
      url: null,
    });
    expect(supabase.signedUrlRequests).toHaveLength(0);
  });

  it("accepts uppercase content types in otherwise valid upload metadata", async () => {
    const supabase = createSupabaseClientMock({
      rows: [
        createBrandAssetRow({
          asset_type: "logo",
          channel_id: null,
          metadata: {
            upload: {
              content_type: "IMAGE/PNG",
              file_extension: "png",
              file_size_bytes: 1200,
              stored_filename: "brand-shot.png",
            },
          },
          storage_bucket: "brand-assets",
          storage_path:
            "11111111-1111-4111-8111-111111111111/logo/asset-1/brand-shot.png",
        }),
      ],
    });
    mocks.createClient.mockResolvedValue(supabase as never);

    const data = await getBrandingDashboardData();

    expect(data.items[0]?.uploadMetadata.status).toBe("available");
    expect(data.items[0]?.preview.status).toBe("available");
    expect(supabase.signedUrlRequests).toHaveLength(1);
  });

  it("marks invalid upload metadata without crashing the page or exposing unsafe filenames", async () => {
    const supabase = createSupabaseClientMock({
      rows: [
        createBrandAssetRow({
          asset_type: "logo",
          channel_id: null,
          metadata: {
            upload: {
              content_type: "image/png",
              file_extension: "png",
              file_size_bytes: 1200,
              stored_filename: "../unsafe-logo.png",
            },
          },
          storage_bucket: "brand-assets",
          storage_path:
            "11111111-1111-4111-8111-111111111111/logo/asset-1/unsafe-logo.png",
        }),
      ],
    });
    mocks.createClient.mockResolvedValue(supabase as never);

    const data = await getBrandingDashboardData();

    expect(data.state).toBe("ready");
    expect(data.items[0]?.uploadMetadata).toEqual({
      contentType: "image/png",
      fileExtension: "png",
      fileSizeBytes: 1200,
      status: "invalid",
      storedFilename: null,
    });
    expect(data.items[0]?.preview.status).toBe("unsupported");
    expect(supabase.signedUrlRequests).toHaveLength(0);
  });

  it("degrades a single signing failure to asset-level preview state without failing the page", async () => {
    const failingPath =
      "11111111-1111-4111-8111-111111111111/logo/asset-2/failing-logo.png";
    const supabase = createSupabaseClientMock({
      rows: [
        createBrandAssetRow({
          asset_type: "logo",
          channel_id: null,
          id: "asset-1",
          storage_bucket: "brand-assets",
          storage_path:
            "11111111-1111-4111-8111-111111111111/logo/asset-1/neon-logo.png",
        }),
        createBrandAssetRow({
          asset_type: "overlay",
          channel_id: null,
          id: "asset-2",
          name: "Failing Logo",
          storage_bucket: "brand-assets",
          storage_path: failingPath,
        }),
      ],
      signedUrlErrorPaths: [failingPath],
    });
    mocks.createClient.mockResolvedValue(supabase as never);

    const data = await getBrandingDashboardData();

    expect(data.state).toBe("ready");
    expect(data.items).toHaveLength(2);
    expect(data.items[0]?.preview.status).toBe("available");
    expect(data.items[1]?.preview).toEqual({
      expiresAt: null,
      reason: "signing_failed",
      status: "failed",
      url: null,
    });
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
  id = "22222222-2222-4222-8222-222222222222",
  metadata = null,
  name = "Neon Logo",
  storage_bucket,
  storage_path,
}: {
  asset_type: string;
  channel_id: string | null;
  id?: string;
  metadata?: Record<string, unknown> | null;
  name?: string;
  storage_bucket: string | null;
  storage_path: string | null;
}) {
  return {
    asset_type,
    channel_id,
    created_at: "2026-06-22T10:00:00.000Z",
    description: "Private logo.",
    id,
    metadata,
    name,
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
  signedUrlErrorPaths = [],
  user = {
    id: "11111111-1111-4111-8111-111111111111",
  },
  userError = null,
}: {
  channelError?: unknown;
  channelRows?: unknown[] | null;
  rowError?: unknown;
  rows?: unknown[] | null;
  signedUrlErrorPaths?: string[];
  user?: { id: string } | null;
  userError?: unknown;
}) {
  const selects: string[] = [];
  const signedUrlRequests: Array<{
    bucket: string;
    expiresIn: number;
    path: string;
  }> = [];
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
    signedUrlRequests,
    storage: {
      from: vi.fn((bucket: string) => ({
        createSignedUrl: vi.fn(async (path: string, expiresIn: number) => {
          signedUrlRequests.push({
            bucket,
            expiresIn,
            path,
          });

          if (signedUrlErrorPaths.includes(path)) {
            return {
              data: null,
              error: new Error("signing failed"),
            };
          }

          return {
            data: {
              signedUrl: `https://signed.example/preview-${signedUrlRequests.length}`,
            },
            error: null,
          };
        }),
      })),
    },
    get storageTouched() {
      return signedUrlRequests.length > 0;
    },
  };
}
