import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  isSupabaseConfigured: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/lib/supabase/config", () => ({
  isSupabaseConfigured: mocks.isSupabaseConfigured,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

import {
  createBrandKitAction,
  deleteBrandKitAction,
  updateBrandKitAction,
} from "./actions";

describe("branding server actions", () => {
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
    mocks.createClient.mockResolvedValue(createSupabaseClientMock() as never);
  });

  it("creates a brand kit with the authenticated user id", async () => {
    const supabase = createSupabaseClientMock();
    mocks.createClient.mockResolvedValue(supabase as never);
    const formData = createBrandKitFormData();

    await expect(createBrandKitAction(formData)).rejects.toThrow(
      "REDIRECT:/dashboard/branding?status=brand-kit-created",
    );

    expect(supabase.inserts).toEqual([
      {
        asset_type: "overlay",
        config: {
          primaryColor: "#00d4aa",
        },
        description: "Main overlay.",
        name: "Neon Overlay",
        status: "active",
        user_id: "11111111-1111-4111-8111-111111111111",
      },
    ]);
    expect(supabase.storageTouched).toBe(false);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard/branding");
  });

  it("rejects malformed form data before Supabase writes", async () => {
    const supabase = createSupabaseClientMock();
    mocks.createClient.mockResolvedValue(supabase as never);
    const formData = createBrandKitFormData();
    formData.set("configJson", "not-json");

    await expect(createBrandKitAction(formData)).rejects.toThrow(
      "REDIRECT:/dashboard/branding?error=invalid-brand-kit-config",
    );

    expect(supabase.inserts).toHaveLength(0);
    expect(supabase.updates).toHaveLength(0);
    expect(supabase.deletes).toHaveLength(0);
  });

  it("redirects to login when the authenticated session is missing", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    await expect(
      createBrandKitAction(createBrandKitFormData()),
    ).rejects.toThrow("REDIRECT:/login");
  });

  it("updates only a brand kit owned by the current user", async () => {
    const supabase = createSupabaseClientMock({
      existingBrandAsset: {
        id: "22222222-2222-4222-8222-222222222222",
      },
    });
    mocks.createClient.mockResolvedValue(supabase as never);
    const formData = createBrandKitFormData({
      id: "22222222-2222-4222-8222-222222222222",
      name: "Updated Overlay",
      status: "draft",
    });

    await expect(updateBrandKitAction(formData)).rejects.toThrow(
      "REDIRECT:/dashboard/branding?status=brand-kit-updated",
    );

    expect(supabase.selects).toEqual([
      {
        filters: [
          ["id", "22222222-2222-4222-8222-222222222222"],
          ["user_id", "11111111-1111-4111-8111-111111111111"],
        ],
        payload: "id",
        table: "brand_assets",
      },
    ]);
    expect(supabase.updates).toEqual([
      {
        asset_type: "overlay",
        config: {
          primaryColor: "#00d4aa",
        },
        description: "Main overlay.",
        name: "Updated Overlay",
        status: "draft",
      },
    ]);
  });

  it("deletes only a brand kit owned by the current user", async () => {
    const supabase = createSupabaseClientMock({
      existingBrandAsset: {
        id: "22222222-2222-4222-8222-222222222222",
      },
    });
    mocks.createClient.mockResolvedValue(supabase as never);
    const formData = new FormData();
    formData.set("brandAssetId", "22222222-2222-4222-8222-222222222222");

    await expect(deleteBrandKitAction(formData)).rejects.toThrow(
      "REDIRECT:/dashboard/branding?status=brand-kit-deleted",
    );

    expect(supabase.deletes).toEqual([
      {
        filters: [
          ["id", "22222222-2222-4222-8222-222222222222"],
          ["user_id", "11111111-1111-4111-8111-111111111111"],
        ],
        table: "brand_assets",
      },
    ]);
    expect(supabase.storageTouched).toBe(false);
  });
});

function createBrandKitFormData({
  id,
  name = "Neon Overlay",
  status = "active",
}: {
  id?: string;
  name?: string;
  status?: string;
} = {}) {
  const formData = new FormData();

  formData.set("assetType", "overlay");
  formData.set("configJson", '{"primaryColor":"#00d4aa"}');
  formData.set("description", "Main overlay.");
  formData.set("name", name);
  formData.set("status", status);

  if (id) {
    formData.set("brandAssetId", id);
  }

  return formData;
}

function createSupabaseClientMock({
  existingBrandAsset = null,
}: {
  existingBrandAsset?: { id: string } | null;
} = {}) {
  const inserts: unknown[] = [];
  const updates: unknown[] = [];
  const deletes: Array<{
    filters: Array<[string, string]>;
    table: string;
  }> = [];
  const selects: Array<{
    filters: Array<[string, string]>;
    payload: string;
    table: string;
  }> = [];
  let currentFilters: Array<[string, string]> = [];
  let currentPayload = "";
  let currentTable = "";

  const builder = {
    delete: vi.fn(() => {
      return builder;
    }),
    eq: vi.fn((field: string, value: string) => {
      currentFilters.push([field, value]);
      return builder;
    }),
    insert: vi.fn(async (payload: unknown) => {
      inserts.push(payload);
      return { error: null };
    }),
    maybeSingle: vi.fn(async () => {
      selects.push({
        filters: [...currentFilters],
        payload: currentPayload,
        table: currentTable,
      });
      currentFilters = [];

      return {
        data: existingBrandAsset,
        error: null,
      };
    }),
    select: vi.fn((payload: string) => {
      currentPayload = payload;
      return builder;
    }),
    update: vi.fn((payload: unknown) => {
      updates.push(payload);
      return builder;
    }),
  };

  return {
    auth: {
      getUser: mocks.getUser,
    },
    deletes,
    from: vi.fn((table: string) => {
      currentTable = table;

      return {
        ...builder,
        delete: vi.fn(() => ({
          eq: vi.fn((field: string, value: string) => {
            currentFilters.push([field, value]);

            return {
              eq: vi.fn(async (secondField: string, secondValue: string) => {
                currentFilters.push([secondField, secondValue]);
                deletes.push({
                  filters: [...currentFilters],
                  table,
                });
                currentFilters = [];

                return { error: null };
              }),
            };
          }),
        })),
      };
    }),
    inserts,
    selects,
    storageTouched: false,
    updates,
  };
}
