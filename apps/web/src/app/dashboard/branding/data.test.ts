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

import { getBrandKitDashboardData } from "./data";

describe("getBrandKitDashboardData", () => {
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

  it("adds short-lived signed preview URLs without exposing storage metadata", async () => {
    const supabase = createSupabaseClientMock({
      rows: [
        createBrandAssetRow({
          storage_bucket: "brand-assets",
          storage_path:
            "11111111-1111-4111-8111-111111111111/logo/22222222-2222-4222-8222-222222222222/neon-logo.png",
        }),
      ],
      signedUrl: "https://storage.example/signed-preview",
    });
    mocks.createClient.mockResolvedValue(supabase as never);

    const data = await getBrandKitDashboardData();

    expect(data.assets).toHaveLength(1);
    expect(data.assets[0]).toMatchObject({
      id: "22222222-2222-4222-8222-222222222222",
      previewStatus: "available",
      previewUrl: "https://storage.example/signed-preview",
    });
    expect("storage_path" in data.assets[0]!).toBe(false);
    expect("public_url" in data.assets[0]!).toBe(false);
    expect(supabase.selects[0]).not.toContain("public_url");
    expect(supabase.signedUrlRequests).toEqual([
      {
        bucket: "brand-assets",
        expiresIn: 300,
        path: "11111111-1111-4111-8111-111111111111/logo/22222222-2222-4222-8222-222222222222/neon-logo.png",
      },
    ]);
  });

  it("does not sign missing, wrong-bucket, or tenant-mismatched storage metadata", async () => {
    const supabase = createSupabaseClientMock({
      rows: [
        createBrandAssetRow({
          id: "22222222-2222-4222-8222-222222222222",
          storage_bucket: null,
          storage_path: null,
        }),
        createBrandAssetRow({
          id: "33333333-3333-4333-8333-333333333333",
          storage_bucket: "public-assets",
          storage_path:
            "11111111-1111-4111-8111-111111111111/logo/33333333-3333-4333-8333-333333333333/logo.png",
        }),
        createBrandAssetRow({
          id: "44444444-4444-4444-8444-444444444444",
          storage_bucket: "brand-assets",
          storage_path:
            "99999999-9999-4999-8999-999999999999/logo/44444444-4444-4444-8444-444444444444/logo.png",
        }),
      ],
      signedUrl: "https://storage.example/signed-preview",
    });
    mocks.createClient.mockResolvedValue(supabase as never);

    const data = await getBrandKitDashboardData();

    expect(data.assets.map((asset) => asset.previewStatus)).toEqual([
      "no_preview",
      "invalid_storage_metadata",
      "invalid_storage_metadata",
    ]);
    expect(data.assets.map((asset) => asset.previewUrl)).toEqual([
      null,
      null,
      null,
    ]);
    expect(supabase.signedUrlRequests).toHaveLength(0);
  });

  it("keeps storage errors sanitized as unavailable previews", async () => {
    const supabase = createSupabaseClientMock({
      rows: [
        createBrandAssetRow({
          storage_bucket: "brand-assets",
          storage_path:
            "11111111-1111-4111-8111-111111111111/logo/22222222-2222-4222-8222-222222222222/neon-logo.png",
        }),
      ],
      signedUrlError: { message: "private storage detail" },
    });
    mocks.createClient.mockResolvedValue(supabase as never);

    const data = await getBrandKitDashboardData();

    expect(data.assets[0]).toMatchObject({
      previewStatus: "storage_error",
      previewUrl: null,
    });
  });
});

function createBrandAssetRow({
  id = "22222222-2222-4222-8222-222222222222",
  storage_bucket,
  storage_path,
}: {
  id?: string;
  storage_bucket: string | null;
  storage_path: string | null;
}) {
  return {
    asset_type: "logo",
    config: {},
    created_at: "2026-06-22T10:00:00.000Z",
    description: "Private logo.",
    id,
    metadata: {},
    name: "Neon Logo",
    status: "active",
    storage_bucket,
    storage_path,
    updated_at: "2026-06-22T10:15:00.000Z",
  };
}

function createSupabaseClientMock({
  rows,
  signedUrl = null,
  signedUrlError = null,
}: {
  rows: unknown[];
  signedUrl?: string | null;
  signedUrlError?: unknown;
}) {
  const selects: string[] = [];
  const signedUrlRequests: Array<{
    bucket: string;
    expiresIn: number;
    path: string;
  }> = [];

  const queryBuilder = {
    eq: () => queryBuilder,
    limit: async () => ({
      data: rows,
      error: null,
    }),
    order: () => queryBuilder,
    select: (payload: string) => {
      selects.push(payload);

      return queryBuilder;
    },
  };

  return {
    auth: {
      getUser: mocks.getUser,
    },
    from: vi.fn(() => queryBuilder),
    selects,
    signedUrlRequests,
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (path: string, expiresIn: number) => {
          signedUrlRequests.push({
            bucket,
            expiresIn,
            path,
          });

          return {
            data: signedUrl ? { signedUrl } : null,
            error: signedUrlError,
          };
        },
      }),
    },
  };
}
