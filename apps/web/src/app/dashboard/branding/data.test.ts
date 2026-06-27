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

import { BRANDING_DASHBOARD_P514_DERIVED_STATUS_QUERY_GATE } from "@/components/modules/BrandingDashboardConsole.utils";
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
      derivedStatusQueryGate: BRANDING_DASHBOARD_P514_DERIVED_STATUS_QUERY_GATE,
      hasMore: false,
      limit: 12,
      nextCursor: null,
      returnedCount: 0,
      serverFilters: {
        assetType: null,
        metadata: "all",
        preview: "all",
        status: null,
      },
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

  it("preserves server filter metadata for an empty filtered result", async () => {
    mocks.createClient.mockResolvedValue(
      createSupabaseClientMock({
        rows: [],
      }) as never,
    );

    const data = await getBrandingDashboardData({
      assetType: "logo",
      metadata: "invalid",
      preview: "unavailable",
      serverSort: "status",
      status: "draft",
    });

    expect(data.state).toBe("ready");
    expect(data.items).toHaveLength(0);
    expect(data.feed.serverFilters).toEqual({
      assetType: "logo",
      metadata: "invalid",
      preview: "unavailable",
      status: "draft",
    });
    expect(data.feed.serverSort).toBe("status");
    expect(data.feed.derivedStatusQueryGate.previewServerQueryable).toBe(true);
    expect(data.feed.derivedStatusQueryGate.metadataServerQueryable).toBe(true);
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
          preview_capability_status: "previewable",
          storage_bucket: "brand-assets",
          storage_path:
            "11111111-1111-4111-8111-111111111111/logo/asset-1/neon-logo.png",
          upload_metadata_status: "available",
        }),
      ],
    });
    mocks.createClient.mockResolvedValue(supabase as never);

    const data = await getBrandingDashboardData();

    expect(data.state).toBe("ready");
    expect(data.feed).toMatchObject({
      derivedStatusQueryGate: BRANDING_DASHBOARD_P514_DERIVED_STATUS_QUERY_GATE,
      hasMore: false,
      limit: 12,
      nextCursor: null,
      returnedCount: 1,
      serverFilters: {
        assetType: null,
        metadata: "all",
        preview: "all",
        status: null,
      },
      scope: "full_result",
      serverSort: "updated_desc",
    });
    expect(data.items[0]).toMatchObject({
      assetType: "logo",
      derivedStatuses: {
        previewCapabilityStatus: "previewable",
        uploadMetadataStatus: "available",
      },
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
      "asset_type,channel_id,created_at,description,id,metadata,name,preview_capability_status,status,storage_bucket,storage_path,upload_metadata_status,updated_at",
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
        id: `asset-${String(index + 1).padStart(2, "0")}`,
        name: `Asset ${index + 1}`,
        storage_bucket: null,
        storage_path: null,
      }),
    );
    const supabase = createSupabaseClientMock({ rows });
    mocks.createClient.mockResolvedValue(supabase as never);

    const data = await getBrandingDashboardData();

    expect(data.feed).toEqual({
      derivedStatusQueryGate: BRANDING_DASHBOARD_P514_DERIVED_STATUS_QUERY_GATE,
      filterOwnership: {
        assetType: "server_query",
        metadata: "server_query",
        preview: "server_query",
        status: "server_query",
      },
      hasMore: true,
      limit: 12,
      nextCursor: {
        assetType: null,
        createdAt: null,
        id: "asset-12",
        status: null,
        updatedAt: "2026-06-22T10:15:00.000Z",
      },
      returnedCount: 12,
      serverFilters: {
        assetType: null,
        metadata: "all",
        preview: "all",
        status: null,
      },
      scope: "loaded_sample",
      serverSort: "updated_desc",
    });
    expect(data.items).toHaveLength(12);
  });

  it("loads an additional cursor window without duplicating already visible assets", async () => {
    const firstWindowRows = Array.from({ length: 13 }, (_, index) =>
      createBrandAssetRow({
        asset_type: "logo",
        channel_id: null,
        id: `asset-${String(index + 1).padStart(2, "0")}`,
        name: `Asset ${index + 1}`,
        storage_bucket: null,
        storage_path: null,
      }),
    );
    const secondWindowRows = [
      createBrandAssetRow({
        asset_type: "banner",
        channel_id: null,
        id: "asset-14",
        name: "Asset 14",
        storage_bucket: null,
        storage_path: null,
        updated_at: "2026-06-21T10:15:00.000Z",
      }),
    ];
    const cursor = {
      assetType: null,
      createdAt: null,
      id: "asset-12",
      status: null,
      updatedAt: "2026-06-22T10:15:00.000Z",
    };
    const supabase = createSupabaseClientMock({
      rows: [...firstWindowRows, ...secondWindowRows],
    });
    mocks.createClient.mockResolvedValue(supabase as never);

    const data = await getBrandingDashboardData({
      cursor,
      cursorServerFilters: {
        assetType: null,
        metadata: "all",
        preview: "all",
        status: null,
      },
      cursorServerSort: "updated_desc",
      serverSort: "updated_desc",
      status: null,
      windowCount: 2,
    });

    expect(data.state).toBe("ready");
    expect(data.items).toHaveLength(14);
    expect(new Set(data.items.map((item) => item.id)).size).toBe(14);
    expect(data.feed).toEqual({
      derivedStatusQueryGate: BRANDING_DASHBOARD_P514_DERIVED_STATUS_QUERY_GATE,
      filterOwnership: {
        assetType: "server_query",
        metadata: "server_query",
        preview: "server_query",
        status: "server_query",
      },
      hasMore: false,
      limit: 12,
      nextCursor: null,
      returnedCount: 14,
      serverFilters: {
        assetType: null,
        metadata: "all",
        preview: "all",
        status: null,
      },
      scope: "full_result",
      serverSort: "updated_desc",
    });
  });

  it("falls back to the first window when the requested cursor does not match the prior server boundary", async () => {
    const firstWindowRows = Array.from({ length: 13 }, (_, index) =>
      createBrandAssetRow({
        asset_type: "logo",
        channel_id: null,
        id: `asset-${String(index + 1).padStart(2, "0")}`,
        name: `Asset ${index + 1}`,
        storage_bucket: null,
        storage_path: null,
      }),
    );
    const supabase = createSupabaseClientMock({
      rows: firstWindowRows,
    });
    mocks.createClient.mockResolvedValue(supabase as never);

    const data = await getBrandingDashboardData({
      cursor: {
        assetType: null,
        createdAt: null,
        id: "asset-mismatch",
        status: null,
        updatedAt: "2026-06-22T10:15:00.000Z",
      },
      cursorServerFilters: {
        assetType: null,
        metadata: "all",
        preview: "all",
        status: null,
      },
      cursorServerSort: "updated_desc",
      serverSort: "updated_desc",
      status: null,
      windowCount: 2,
    });

    expect(data.state).toBe("ready");
    expect(data.items).toHaveLength(12);
    expect(data.items.map((item) => item.id)).toEqual(
      Array.from(
        { length: 12 },
        (_, index) => `asset-${String(index + 1).padStart(2, "0")}`,
      ),
    );
    expect(data.feed).toEqual({
      derivedStatusQueryGate: BRANDING_DASHBOARD_P514_DERIVED_STATUS_QUERY_GATE,
      filterOwnership: {
        assetType: "server_query",
        metadata: "server_query",
        preview: "server_query",
        status: "server_query",
      },
      hasMore: true,
      limit: 12,
      nextCursor: {
        assetType: null,
        createdAt: null,
        id: "asset-12",
        status: null,
        updatedAt: "2026-06-22T10:15:00.000Z",
      },
      returnedCount: 12,
      serverFilters: {
        assetType: null,
        metadata: "all",
        preview: "all",
        status: null,
      },
      scope: "loaded_sample",
      serverSort: "updated_desc",
    });
  });

  it("applies the asset type filter server-side", async () => {
    const supabase = createSupabaseClientMock({
      rows: [
        createBrandAssetRow({
          asset_type: "overlay",
          channel_id: null,
          id: "asset-overlay",
          name: "Overlay Asset",
          storage_bucket: null,
          storage_path: null,
        }),
        createBrandAssetRow({
          asset_type: "logo",
          channel_id: null,
          id: "asset-logo",
          name: "Logo Asset",
          storage_bucket: null,
          storage_path: null,
        }),
      ],
    });
    mocks.createClient.mockResolvedValue(supabase as never);

    const data = await getBrandingDashboardData({
      assetType: "logo",
    });

    expect(data.items.map((item) => item.assetType)).toEqual(["logo"]);
    expect(data.feed.serverFilters).toEqual({
      assetType: "logo",
      metadata: "all",
      preview: "all",
      status: null,
    });
    expect(supabase.from).toHaveBeenCalledWith("brand_assets");
  });

  it("applies the status filter server-side", async () => {
    const supabase = createSupabaseClientMock({
      rows: [
        createBrandAssetRow({
          asset_type: "logo",
          channel_id: null,
          id: "asset-active",
          name: "Active Asset",
          status: "active",
          storage_bucket: null,
          storage_path: null,
        }),
        createBrandAssetRow({
          asset_type: "logo",
          channel_id: null,
          id: "asset-draft",
          name: "Draft Asset",
          status: "draft",
          storage_bucket: null,
          storage_path: null,
        }),
      ],
    });
    mocks.createClient.mockResolvedValue(supabase as never);

    const data = await getBrandingDashboardData({
      serverSort: "updated_desc",
      status: "draft",
    });

    expect(data.items.map((item) => item.status)).toEqual(["draft"]);
    expect(data.feed.serverFilters).toEqual({
      assetType: null,
      metadata: "all",
      preview: "all",
      status: "draft",
    });
  });

  it("maps preview and metadata to persisted derived-status server filters", async () => {
    const supabase = createSupabaseClientMock({
      rows: [
        createBrandAssetRow({
          asset_type: "logo",
          channel_id: null,
          id: "asset-match",
          metadata: {
            upload: {
              content_type: "image/png",
              file_extension: "png",
              file_size_bytes: 1024,
              stored_filename: "match.png",
            },
          },
          preview_capability_status: "previewable",
          status: "active",
          storage_bucket: "brand-assets",
          storage_path:
            "11111111-1111-4111-8111-111111111111/logo/asset-match/match.png",
          upload_metadata_status: "available",
        }),
        createBrandAssetRow({
          asset_type: "logo",
          channel_id: null,
          id: "asset-preview-blocked",
          preview_capability_status: "unsupported",
          status: "active",
          storage_bucket: "brand-assets",
          storage_path:
            "11111111-1111-4111-8111-111111111111/logo/asset-preview-blocked/block.png",
        }),
        createBrandAssetRow({
          asset_type: "logo",
          channel_id: null,
          id: "asset-metadata-blocked",
          preview_capability_status: "previewable",
          status: "active",
          storage_bucket: "brand-assets",
          storage_path:
            "11111111-1111-4111-8111-111111111111/logo/asset-metadata-blocked/meta.png",
          upload_metadata_status: "invalid",
        }),
      ],
    });
    mocks.createClient.mockResolvedValue(supabase as never);

    const data = await getBrandingDashboardData({
      assetType: "logo",
      metadata: "available",
      preview: "available",
      serverSort: "asset_type",
      status: "active",
    });

    expect(data.items.map((item) => item.id)).toEqual(["asset-match"]);
    expect(data.feed.serverFilters).toEqual({
      assetType: "logo",
      metadata: "available",
      preview: "available",
      status: "active",
    });
    expect(data.feed.serverSort).toBe("asset_type");
  });

  it("binds the cursor window to preview and metadata server filters", async () => {
    const rows = Array.from({ length: 13 }, (_, index) =>
      createBrandAssetRow({
        asset_type: "logo",
        channel_id: null,
        id: `asset-${String(index + 1).padStart(2, "0")}`,
        name: `Asset ${index + 1}`,
        preview_capability_status: "previewable",
        status: "active",
        storage_bucket: "brand-assets",
        storage_path: `11111111-1111-4111-8111-111111111111/logo/asset-${String(index + 1).padStart(2, "0")}/asset.png`,
        upload_metadata_status: "available",
      }),
    );
    const supabase = createSupabaseClientMock({ rows });
    mocks.createClient.mockResolvedValue(supabase as never);

    const data = await getBrandingDashboardData({
      cursor: {
        assetType: null,
        createdAt: null,
        id: "asset-12",
        status: null,
        updatedAt: "2026-06-22T10:15:00.000Z",
      },
      cursorServerFilters: {
        assetType: null,
        metadata: "all",
        preview: "all",
        status: null,
      },
      cursorServerSort: "updated_desc",
      metadata: "available",
      preview: "available",
      serverSort: "updated_desc",
      status: "active",
      windowCount: 2,
    });

    expect(data.items).toHaveLength(12);
    expect(data.feed.serverFilters).toEqual({
      assetType: null,
      metadata: "available",
      preview: "available",
      status: "active",
    });
  });

  it("keeps brand asset reads tenant-scoped to the authenticated user", async () => {
    const currentUserId = "11111111-1111-4111-8111-111111111111";
    const foreignUserId = "99999999-9999-4999-8999-999999999999";
    const supabase = createSupabaseClientMock({
      rows: [
        createBrandAssetRow({
          asset_type: "logo",
          channel_id: null,
          id: "asset-current-user",
          name: "Current User Asset",
          storage_bucket: null,
          storage_path: null,
          user_id: currentUserId,
        }),
        createBrandAssetRow({
          asset_type: "logo",
          channel_id: null,
          id: "asset-foreign-user",
          name: "Foreign User Asset",
          storage_bucket: null,
          storage_path: null,
          user_id: foreignUserId,
        }),
      ],
      user: {
        id: currentUserId,
      },
    });
    mocks.createClient.mockResolvedValue(supabase as never);

    const data = await getBrandingDashboardData();

    expect(data.items.map((item) => item.id)).toEqual(["asset-current-user"]);
    expect(data.items[0]?.name).toBe("Current User Asset");
  });

  it("applies server-side asset type sorting with a deterministic id tie-breaker", async () => {
    const supabase = createSupabaseClientMock({
      rows: [
        createBrandAssetRow({
          asset_type: "overlay",
          channel_id: null,
          id: "asset-zeta",
          name: "Overlay Zeta",
          storage_bucket: null,
          storage_path: null,
          updated_at: "2026-06-22T10:15:00.000Z",
        }),
        createBrandAssetRow({
          asset_type: "logo",
          channel_id: null,
          id: "asset-beta",
          name: "Logo Beta",
          storage_bucket: null,
          storage_path: null,
          updated_at: "2026-06-22T10:15:00.000Z",
        }),
        createBrandAssetRow({
          asset_type: "logo",
          channel_id: null,
          id: "asset-alpha",
          name: "Logo Alpha",
          storage_bucket: null,
          storage_path: null,
          updated_at: "2026-06-22T10:15:00.000Z",
        }),
      ],
    });
    mocks.createClient.mockResolvedValue(supabase as never);

    const data = await getBrandingDashboardData({
      serverSort: "asset_type",
    });

    expect(data.feed.serverSort).toBe("asset_type");
    expect(data.items.map((item) => item.id)).toEqual([
      "asset-alpha",
      "asset-beta",
      "asset-zeta",
    ]);
  });

  it("falls back to the first window when the cursor belongs to a different server sort", async () => {
    const rows = Array.from({ length: 13 }, (_, index) =>
      createBrandAssetRow({
        asset_type: "logo",
        channel_id: null,
        id: `asset-${String(index + 1).padStart(2, "0")}`,
        name: `Asset ${index + 1}`,
        storage_bucket: null,
        storage_path: null,
      }),
    );
    const supabase = createSupabaseClientMock({ rows });
    mocks.createClient.mockResolvedValue(supabase as never);

    const data = await getBrandingDashboardData({
      cursor: {
        assetType: null,
        createdAt: null,
        id: "asset-12",
        status: null,
        updatedAt: "2026-06-22T10:15:00.000Z",
      },
      cursorServerFilters: {
        assetType: null,
        metadata: "all",
        preview: "all",
        status: null,
      },
      cursorServerSort: "updated_desc",
      serverSort: "created_desc",
      windowCount: 2,
    });

    expect(data.feed.serverSort).toBe("created_desc");
    expect(data.feed.returnedCount).toBe(12);
    expect(data.feed.derivedStatusQueryGate).toEqual(
      BRANDING_DASHBOARD_P514_DERIVED_STATUS_QUERY_GATE,
    );
    expect(data.feed.nextCursor).toEqual({
      assetType: null,
      createdAt: "2026-06-22T10:00:00.000Z",
      id: "asset-12",
      status: null,
      updatedAt: null,
    });
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
    expect(data.items[0]?.derivedStatuses).toEqual({
      previewCapabilityStatus: "missing_storage",
      uploadMetadataStatus: "unavailable",
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
    expect(data.items[0]?.derivedStatuses).toEqual({
      previewCapabilityStatus: "previewable",
      uploadMetadataStatus: "unavailable",
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
    expect(data.items[0]?.derivedStatuses.previewCapabilityStatus).toBe(
      "invalid_storage",
    );
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
    expect(data.items[0]?.derivedStatuses.previewCapabilityStatus).toBe(
      "unsupported",
    );
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
    expect(data.items[0]?.derivedStatuses).toEqual({
      previewCapabilityStatus: "unsupported",
      uploadMetadataStatus: "invalid",
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
    expect(data.items[1]?.derivedStatuses.previewCapabilityStatus).toBe(
      "previewable",
    );
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
  created_at = "2026-06-22T10:00:00.000Z",
  id = "22222222-2222-4222-8222-222222222222",
  metadata = null,
  name = "Neon Logo",
  preview_capability_status,
  status = "active",
  storage_bucket,
  storage_path,
  updated_at = "2026-06-22T10:15:00.000Z",
  upload_metadata_status,
  user_id = "11111111-1111-4111-8111-111111111111",
}: {
  asset_type: string;
  channel_id: string | null;
  created_at?: string;
  id?: string;
  metadata?: Record<string, unknown> | null;
  name?: string;
  preview_capability_status?: string;
  status?: string;
  storage_bucket: string | null;
  storage_path: string | null;
  updated_at?: string;
  upload_metadata_status?: string;
  user_id?: string;
}) {
  return {
    asset_type,
    channel_id,
    created_at,
    description: "Private logo.",
    id,
    metadata,
    name,
    preview_capability_status:
      preview_capability_status ??
      derivePreviewCapabilityStatus({
        metadata,
        storage_bucket,
        storage_path,
        upload_metadata_status:
          upload_metadata_status ?? deriveUploadMetadataStatus(metadata),
        user_id,
      }),
    status,
    storage_bucket,
    storage_path,
    upload_metadata_status:
      upload_metadata_status ?? deriveUploadMetadataStatus(metadata),
    updated_at,
    user_id,
  };
}

function deriveUploadMetadataStatus(metadata: Record<string, unknown> | null) {
  if (!isPlainObject(metadata) || !Object.hasOwn(metadata, "upload")) {
    return "unavailable";
  }

  const upload = metadata.upload;

  if (!isPlainObject(upload)) {
    return "invalid";
  }

  const contentType = readUploadString(upload, "content_type");
  const fileExtension = readUploadString(upload, "file_extension");
  const fileSizeBytes = readUploadFileSize(upload, "file_size_bytes");
  const storedFilename = readUploadString(upload, "stored_filename");

  if (
    contentType === "invalid" ||
    fileExtension === "invalid" ||
    fileSizeBytes === "invalid" ||
    storedFilename === "invalid"
  ) {
    return "invalid";
  }

  if (
    contentType === null ||
    fileExtension === null ||
    fileSizeBytes === null ||
    storedFilename === null
  ) {
    return "unavailable";
  }

  if (
    storedFilename.includes("/") ||
    storedFilename.includes("\\") ||
    storedFilename.includes("://") ||
    storedFilename.includes("?") ||
    storedFilename.includes("#")
  ) {
    return "invalid";
  }

  return "available";
}

function derivePreviewCapabilityStatus({
  metadata,
  storage_bucket,
  storage_path,
  upload_metadata_status,
  user_id,
}: {
  metadata: Record<string, unknown> | null;
  storage_bucket: string | null;
  storage_path: string | null;
  upload_metadata_status: string;
  user_id: string;
}) {
  if (!storage_bucket && !storage_path) {
    return "missing_storage";
  }

  if (
    storage_bucket !== "brand-assets" ||
    !storage_path ||
    storage_path.startsWith("/") ||
    storage_path.includes("\\") ||
    storage_path.includes("://") ||
    storage_path.includes("?") ||
    storage_path.includes("#")
  ) {
    return "invalid_storage";
  }

  const segments = storage_path.split("/");

  if (
    segments.length < 4 ||
    segments[0] !== user_id ||
    segments.some(
      (segment) => segment.length === 0 || segment === "." || segment === "..",
    )
  ) {
    return "invalid_storage";
  }

  const extension = storage_path.split(".").at(-1)?.toLowerCase() ?? "";

  if (!["png", "jpg", "jpeg", "webp"].includes(extension)) {
    return "unsupported";
  }

  if (upload_metadata_status === "invalid") {
    return "unsupported";
  }

  if (upload_metadata_status !== "available") {
    return "previewable";
  }

  const upload =
    isPlainObject(metadata) && isPlainObject(metadata.upload)
      ? metadata.upload
      : null;
  const contentType = readUploadString(upload, "content_type");
  const fileExtension = readUploadString(upload, "file_extension");

  if (
    typeof contentType !== "string" ||
    typeof fileExtension !== "string" ||
    fileExtension.toLowerCase() !== extension
  ) {
    return "unsupported";
  }

  const normalizedContentType = contentType.toLowerCase();
  const normalizedExtension = fileExtension.toLowerCase();

  if (normalizedContentType === "image/png") {
    return normalizedExtension === "png" ? "previewable" : "unsupported";
  }

  if (normalizedContentType === "image/jpeg") {
    return ["jpg", "jpeg"].includes(normalizedExtension)
      ? "previewable"
      : "unsupported";
  }

  if (normalizedContentType === "image/webp") {
    return normalizedExtension === "webp" ? "previewable" : "unsupported";
  }

  return "unsupported";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readUploadString(upload: Record<string, unknown> | null, key: string) {
  if (!upload || !Object.hasOwn(upload, key) || upload[key] == null) {
    return null;
  }

  if (typeof upload[key] !== "string") {
    return "invalid";
  }

  const normalized = upload[key].trim();
  return normalized.length > 0 ? normalized : "invalid";
}

function readUploadFileSize(
  upload: Record<string, unknown> | null,
  key: string,
) {
  if (!upload || !Object.hasOwn(upload, key) || upload[key] == null) {
    return null;
  }

  if (
    typeof upload[key] !== "number" ||
    !Number.isSafeInteger(upload[key]) ||
    upload[key] <= 0
  ) {
    return "invalid";
  }

  return upload[key];
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
  const brandAssetQueryState = {
    cursorFilter: null as string | null,
    filters: {} as Record<string, string | string[]>,
    orders: [] as Array<{
      ascending: boolean;
      column: string;
    }>,
  };

  const brandAssetBuilder = {
    eq: vi.fn((column: string, value: string) => {
      brandAssetQueryState.filters[column] = value;

      return brandAssetBuilder;
    }),
    in: vi.fn((column: string, values: string[]) => {
      brandAssetQueryState.filters[column] = values;

      return brandAssetBuilder;
    }),
    limit: vi.fn(async (limit: number) => ({
      data: rowError
        ? rows
        : evaluateBrandAssetRows({
            cursorFilter: brandAssetQueryState.cursorFilter,
            filters: brandAssetQueryState.filters,
            limit,
            orders: brandAssetQueryState.orders,
            rows,
          }),
      error: rowError,
    })),
    or: vi.fn((value: string) => {
      brandAssetQueryState.cursorFilter = value;
      return brandAssetBuilder;
    }),
    order: vi.fn(
      (
        column: string,
        options?: {
          ascending?: boolean;
        },
      ) => {
        brandAssetQueryState.orders.push({
          ascending: options?.ascending ?? true,
          column,
        });
        return brandAssetBuilder;
      },
    ),
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
      brandAssetQueryState.cursorFilter = null;
      brandAssetQueryState.filters = {};
      brandAssetQueryState.orders = [];

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

function evaluateBrandAssetRows({
  cursorFilter,
  filters,
  limit,
  orders,
  rows,
}: {
  cursorFilter: string | null;
  filters: Record<string, string | string[]>;
  limit: number;
  orders: Array<{
    ascending: boolean;
    column: string;
  }>;
  rows: unknown[] | null;
}) {
  if (!rows) {
    return rows;
  }

  const filteredRows = (rows as ReturnType<typeof createBrandAssetRow>[])
    .filter((row) =>
      Object.entries(filters).every(([column, value]) => {
        const matches = (candidate: string) =>
          Array.isArray(value)
            ? value.includes(candidate)
            : candidate === value;

        if (column === "asset_type") {
          return matches(row.asset_type);
        }

        if (column === "user_id") {
          return matches(row.user_id);
        }

        if (column === "status") {
          return matches(row.status);
        }

        if (column === "preview_capability_status") {
          return matches(row.preview_capability_status);
        }

        if (column === "upload_metadata_status") {
          return matches(row.upload_metadata_status);
        }

        return true;
      }),
    )
    .sort((left, right) => compareBrandAssetRows(left, right, orders));

  const cursorDefinition = parseBrandingCursorDefinition(cursorFilter, orders);
  const visibleRows = cursorDefinition
    ? filteredRows.filter((row) => isRowAfterCursor(row, cursorDefinition))
    : filteredRows;

  return visibleRows.slice(0, limit);
}

function compareBrandAssetRows(
  left: ReturnType<typeof createBrandAssetRow>,
  right: ReturnType<typeof createBrandAssetRow>,
  orders: Array<{
    ascending: boolean;
    column: string;
  }>,
) {
  for (const order of orders) {
    const leftValue = readBrandAssetOrderValue(left, order.column);
    const rightValue = readBrandAssetOrderValue(right, order.column);
    const comparison =
      leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;

    if (comparison !== 0) {
      return order.ascending ? comparison : -comparison;
    }
  }

  return 0;
}

function readBrandAssetOrderValue(
  row: ReturnType<typeof createBrandAssetRow>,
  column: string,
) {
  switch (column) {
    case "asset_type":
      return row.asset_type;
    case "created_at":
      return row.created_at;
    case "id":
      return row.id;
    case "status":
      return row.status;
    case "updated_at":
      return row.updated_at;
    default:
      return "";
  }
}

function parseBrandingCursorDefinition(
  value: string | null,
  orders: Array<{
    ascending: boolean;
    column: string;
  }>,
): {
  assetType: string | null;
  createdAt: string | null;
  id: string;
  status: string | null;
  updatedAt: string | null;
} | null {
  if (!value) {
    return null;
  }

  if (orders[0]?.column === "updated_at") {
    const match = value.match(
      /^updated_at\.lt\.(.+),and\(updated_at\.eq\.(.+),id\.gt\.(.+)\)$/,
    );

    if (!match || match[1] !== match[2]) {
      return null;
    }

    const [, updatedAt, , id] = match as [string, string, string, string];

    return {
      assetType: null,
      createdAt: null,
      id,
      status: null,
      updatedAt,
    };
  }

  if (orders[0]?.column === "created_at") {
    const match = value.match(
      /^created_at\.lt\.(.+),and\(created_at\.eq\.(.+),id\.gt\.(.+)\)$/,
    );

    if (!match || match[1] !== match[2]) {
      return null;
    }

    const [, createdAt, , id] = match as [string, string, string, string];

    return {
      assetType: null,
      createdAt,
      id,
      status: null,
      updatedAt: null,
    };
  }

  if (orders[0]?.column === "asset_type") {
    const match = value.match(
      /^asset_type\.gt\.(.+),and\(asset_type\.eq\.(.+),updated_at\.lt\.(.+)\),and\(asset_type\.eq\.(.+),updated_at\.eq\.(.+),id\.gt\.(.+)\)$/,
    );

    if (
      !match ||
      match[1] !== match[2] ||
      match[1] !== match[4] ||
      match[3] !== match[5]
    ) {
      return null;
    }

    const [, assetType, , updatedAt, , , id] = match as [
      string,
      string,
      string,
      string,
      string,
      string,
      string,
    ];

    return {
      assetType,
      createdAt: null,
      id,
      status: null,
      updatedAt,
    };
  }

  if (orders[0]?.column === "status") {
    const match = value.match(
      /^status\.gt\.(.+),and\(status\.eq\.(.+),updated_at\.lt\.(.+)\),and\(status\.eq\.(.+),updated_at\.eq\.(.+),id\.gt\.(.+)\)$/,
    );

    if (
      !match ||
      match[1] !== match[2] ||
      match[1] !== match[4] ||
      match[3] !== match[5]
    ) {
      return null;
    }

    const [, status, , updatedAt, , , id] = match as [
      string,
      string,
      string,
      string,
      string,
      string,
      string,
    ];

    return {
      assetType: null,
      createdAt: null,
      id,
      status,
      updatedAt,
    };
  }

  return null;
}

function isRowAfterCursor(
  row: ReturnType<typeof createBrandAssetRow>,
  cursor: {
    assetType: string | null;
    createdAt: string | null;
    id: string;
    status: string | null;
    updatedAt: string | null;
  },
) {
  if (cursor.assetType !== null) {
    return (
      row.asset_type > cursor.assetType ||
      (row.asset_type === cursor.assetType &&
        (row.updated_at < (cursor.updatedAt ?? "") ||
          (row.updated_at === cursor.updatedAt && row.id > cursor.id)))
    );
  }

  if (cursor.status !== null) {
    return (
      row.status > cursor.status ||
      (row.status === cursor.status &&
        (row.updated_at < (cursor.updatedAt ?? "") ||
          (row.updated_at === cursor.updatedAt && row.id > cursor.id)))
    );
  }

  if (cursor.createdAt !== null) {
    return (
      row.created_at < cursor.createdAt ||
      (row.created_at === cursor.createdAt && row.id > cursor.id)
    );
  }

  return (
    row.updated_at < (cursor.updatedAt ?? "") ||
    (row.updated_at === cursor.updatedAt && row.id > cursor.id)
  );
}
