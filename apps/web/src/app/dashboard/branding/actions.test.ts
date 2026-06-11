import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createBrandKitAction,
  deleteBrandKitAction,
  uploadBrandAssetFileAction,
  updateBrandKitAction,
} from "./actions";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("node:crypto", () => ({
  randomUUID: vi.fn(() => "11111111-1111-4111-8111-111111111111"),
}));

vi.mock("@/lib/supabase/config", () => ({
  isSupabaseConfigured: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

const mockIsSupabaseConfigured = vi.mocked(isSupabaseConfigured);
const mockCreateClient = vi.mocked(createClient);

describe("branding actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsSupabaseConfigured.mockReturnValue(true);
    mockCreateClient.mockResolvedValue(createSupabaseClientMock() as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a brand kit using the authenticated Supabase session", async () => {
    const supabase = createSupabaseClientMock();
    mockCreateClient.mockResolvedValue(supabase as never);
    const formData = new FormData();
    formData.set("assetType", "overlay");
    formData.set("configJson", '{"primaryColor":"#00d4aa"}');
    formData.set("name", "Neon Overlay");
    formData.set("status", "active");

    await expect(createBrandKitAction(formData)).rejects.toThrow(
      "REDIRECT:/dashboard/branding?status=brand-kit-created",
    );

    expect(supabase.inserts).toEqual([
      {
        asset_type: "overlay",
        config: {
          primaryColor: "#00d4aa",
        },
        name: "Neon Overlay",
        status: "active",
        user_id: "user-1",
      },
    ]);
  });

  it("rejects invalid brand kit config before touching Supabase writes", async () => {
    const supabase = createSupabaseClientMock();
    mockCreateClient.mockResolvedValue(supabase as never);
    const formData = new FormData();
    formData.set("assetType", "overlay");
    formData.set("configJson", "not-json");
    formData.set("name", "Neon Overlay");
    formData.set("status", "draft");

    await expect(updateBrandKitAction(formData)).rejects.toThrow(
      "REDIRECT:/dashboard/branding?error=invalid-brand-kit-config",
    );

    expect(supabase.selects).toHaveLength(0);
    expect(supabase.updates).toHaveLength(0);
  });

  it("updates an existing brand kit owned by the current user", async () => {
    const supabase = createSupabaseClientMock({
      existingBrandAsset: {
        id: "11111111-1111-4111-8111-111111111111",
      },
    });
    mockCreateClient.mockResolvedValue(supabase as never);
    const formData = new FormData();
    formData.set("assetType", "logo");
    formData.set("brandAssetId", "11111111-1111-4111-8111-111111111111");
    formData.set("configJson", '{"source":"svg"}');
    formData.set("name", "Logo Mark");
    formData.set("status", "draft");

    await expect(updateBrandKitAction(formData)).rejects.toThrow(
      "REDIRECT:/dashboard/branding?status=brand-kit-updated",
    );

    expect(supabase.selects).toEqual([
      {
        table: "brand_assets",
        filters: [
          ["id", "11111111-1111-4111-8111-111111111111"],
          ["user_id", "user-1"],
        ],
        method: "select",
        payload: "id",
      },
    ]);
    expect(supabase.updates).toEqual([
      {
        asset_type: "logo",
        config: {
          source: "svg",
        },
        name: "Logo Mark",
        status: "draft",
      },
    ]);
  });

  it("deletes an existing brand kit owned by the current user", async () => {
    const supabase = createSupabaseClientMock({
      existingBrandAsset: {
        id: "11111111-1111-4111-8111-111111111111",
      },
    });
    mockCreateClient.mockResolvedValue(supabase as never);
    const formData = new FormData();
    formData.set("brandAssetId", "11111111-1111-4111-8111-111111111111");

    await expect(deleteBrandKitAction(formData)).rejects.toThrow(
      "REDIRECT:/dashboard/branding?status=brand-kit-deleted",
    );

    expect(supabase.deletes).toEqual([
      {
        filters: [
          ["id", "11111111-1111-4111-8111-111111111111"],
          ["user_id", "user-1"],
        ],
        table: "brand_assets",
      },
    ]);
  });

  it("uploads a brand asset file and persists the storage metadata", async () => {
    const supabase = createSupabaseClientMock();
    mockCreateClient.mockResolvedValue(supabase as never);
    const formData = new FormData();
    formData.set("assetType", "overlay");
    formData.set(
      "file",
      new File(["overlay"], "My Overlay File.png", { type: "image/png" }),
    );
    formData.set("name", "Overlay Upload");
    formData.set("status", "draft");
    formData.set("configJson", '{"placement":"top-right"}');

    await expect(uploadBrandAssetFileAction(formData)).rejects.toThrow(
      "REDIRECT:/dashboard/branding?status=brand-asset-uploaded",
    );

    expect(supabase.storageUploads).toHaveLength(1);
    expect(supabase.storageUploads[0]).toMatchObject({
      bucket: "brand-assets",
      fileName: "My Overlay File.png",
    });
    expect(supabase.inserts).toHaveLength(1);

    const payload = supabase.inserts[0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      asset_type: "overlay",
      name: "Overlay Upload",
      public_url:
        "https://storage.example/brand-assets/user-1/overlay/11111111-1111-4111-8111-111111111111/11111111-1111-4111-8111-111111111111-my-overlay-file.png",
      status: "draft",
      storage_bucket: "brand-assets",
      storage_path:
        "user-1/overlay/11111111-1111-4111-8111-111111111111/11111111-1111-4111-8111-111111111111-my-overlay-file.png",
      user_id: "user-1",
    });
    expect(payload.metadata).toMatchObject({
      asset_type: "overlay",
      file_name: "My Overlay File.png",
      mime_type: "image/png",
      source: "upload",
      storage_path:
        "user-1/overlay/11111111-1111-4111-8111-111111111111/11111111-1111-4111-8111-111111111111-my-overlay-file.png",
    });
  });
});

function createSupabaseClientMock({
  existingBrandAsset = null,
}: {
  existingBrandAsset?: { id: string } | null;
} = {}) {
  const inserts: unknown[] = [];
  const updates: unknown[] = [];
  const storageDeletes: Array<{
    bucket: string;
    paths: string[];
  }> = [];
  const storageUploads: Array<{
    bucket: string;
    fileName: string;
    options: Record<string, unknown>;
    path: string;
  }> = [];
  const deletes: Array<{
    filters: Array<[string, string]>;
    table: string;
  }> = [];
  const selects: Array<{
    filters: Array<[string, string]>;
    method: string;
    payload: string;
    table: string;
  }> = [];

  const builder = {
    delete: vi.fn(() => {
      currentMutation = "delete";
      return builder;
    }),
    eq: vi.fn((field: string, value: string) => {
      currentFilters.push([field, value]);
      if (currentMutation === "delete" && currentFilters.length >= 2) {
        deletes.push({
          filters: [...currentFilters],
          table: currentTable,
        });
        currentMutation = "none";
      }
      return builder;
    }),
    insert: vi.fn(async (payload: unknown) => {
      inserts.push(payload);
      return { error: null };
    }),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => {
      const result = {
        data: existingBrandAsset,
        error: null,
      };

      selects.push({
        filters: [...currentFilters],
        method: "select",
        payload: currentSelectPayload,
        table: currentTable,
      });
      currentFilters = [];
      currentSelectPayload = "";
      currentTable = "brand_assets";

      return result;
    }),
    order: vi.fn(() => builder),
    select: vi.fn((payload: string) => {
      currentSelectPayload = payload;
      currentTable = "brand_assets";
      return builder;
    }),
    update: vi.fn((payload: unknown) => {
      updates.push(payload);
      return builder;
    }),
  };

  let currentFilters: Array<[string, string]> = [];
  let currentSelectPayload = "";
  let currentTable = "brand_assets";
  let currentMutation: "delete" | "none" = "none";

  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: "user-1" } },
        error: null,
      })),
    },
    storage: {
      from: vi.fn((bucket: string) => ({
        getPublicUrl: vi.fn((path: string) => ({
          data: {
            publicUrl: `https://storage.example/${bucket}/${path}`,
          },
        })),
        remove: vi.fn(async (paths: string[]) => {
          storageDeletes.push({
            bucket,
            paths,
          });

          return { error: null };
        }),
        upload: vi.fn(
          async (
            path: string,
            file: File,
            options: { contentType?: string; upsert?: boolean },
          ) => {
            storageUploads.push({
              bucket,
              fileName: file.name,
              options,
              path,
            });

            return { error: null };
          },
        ),
      })),
    },
    deletes,
    from: vi.fn((table: string) => {
      currentTable = table;
      return builder;
    }),
    inserts,
    storageDeletes,
    storageUploads,
    selects,
    updates,
  };
}
