import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
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

import { uploadBrandAssetAction } from "./actions";

describe("uploadBrandAssetAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isSupabaseConfigured.mockReturnValue(true);
    mocks.createClient.mockResolvedValue(createSupabaseClientMock() as never);
  });

  it("uploads a PNG asset into private storage and persists safe metadata", async () => {
    const supabase = createSupabaseClientMock();
    mocks.createClient.mockResolvedValue(supabase as never);

    await expect(
      uploadBrandAssetAction(
        createUploadFormData({
          assetType: "logo",
          file: createFile("neon-logo.png", "image/png"),
        }),
      ),
    ).rejects.toThrow(
      "REDIRECT:/dashboard/branding?status=brand-asset-uploaded",
    );

    expect(supabase.storageUploads).toHaveLength(1);
    expect(supabase.storageUploads[0]?.bucket).toBe("brand-assets");
    expect(supabase.storageUploads[0]?.path).toMatch(
      /^11111111-1111-4111-8111-111111111111\/logo\/[0-9a-f-]{36}\/neon-logo\.png$/,
    );
    expect(supabase.inserts).toEqual([
      expect.objectContaining({
        asset_type: "logo",
        description: "Primary brand asset.",
        name: "Neon Logo",
        public_url: null,
        status: "draft",
        storage_bucket: "brand-assets",
        storage_path: supabase.storageUploads[0]?.path,
        user_id: "11111111-1111-4111-8111-111111111111",
      }),
    ]);
    expect(supabase.inserts[0]?.metadata).toEqual({
      upload: {
        content_type: "image/png",
        file_extension: "png",
        file_size_bytes: 7,
        stored_filename: "neon-logo.png",
      },
    });
    expect(supabase.storageRemoves).toHaveLength(0);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard/branding");
  });

  it.each([
    ["image/jpeg", "brand-shot.jpg", "jpg"],
    ["image/jpeg", "brand-shot.jpeg", "jpeg"],
    ["image/webp", "brand-shot.webp", "webp"],
  ])(
    "accepts %s uploads with .%s storage filenames",
    async (mimeType, filename, extension) => {
      const supabase = createSupabaseClientMock();
      mocks.createClient.mockResolvedValue(supabase as never);

      await expect(
        uploadBrandAssetAction(
          createUploadFormData({
            assetType: "banner",
            file: createFile(filename, mimeType),
          }),
        ),
      ).rejects.toThrow(
        "REDIRECT:/dashboard/branding?status=brand-asset-uploaded",
      );

      expect(supabase.storageUploads[0]?.path).toContain(`.${extension}`);
    },
  );

  it("blocks SVG uploads before touching storage", async () => {
    const supabase = createSupabaseClientMock();
    mocks.createClient.mockResolvedValue(supabase as never);

    await expect(
      uploadBrandAssetAction(
        createUploadFormData({
          assetType: "logo",
          file: createFile("brand-mark.svg", "image/svg+xml"),
        }),
      ),
    ).rejects.toThrow(
      "REDIRECT:/dashboard/branding?error=brand-asset-svg-not-supported",
    );

    expect(supabase.storageUploads).toHaveLength(0);
    expect(supabase.inserts).toHaveLength(0);
  });

  it("blocks unsupported file types", async () => {
    const supabase = createSupabaseClientMock();
    mocks.createClient.mockResolvedValue(supabase as never);

    await expect(
      uploadBrandAssetAction(
        createUploadFormData({
          assetType: "logo",
          file: createFile("brand-brief.pdf", "application/pdf"),
        }),
      ),
    ).rejects.toThrow(
      "REDIRECT:/dashboard/branding?error=brand-asset-file-type-not-supported",
    );

    expect(supabase.storageUploads).toHaveLength(0);
  });

  it("blocks oversized files before storage writes", async () => {
    const supabase = createSupabaseClientMock();
    mocks.createClient.mockResolvedValue(supabase as never);

    await expect(
      uploadBrandAssetAction(
        createUploadFormData({
          assetType: "overlay",
          file: createFile(
            "large-overlay.png",
            "image/png",
            "x".repeat(5 * 1024 * 1024 + 1),
          ),
        }),
      ),
    ).rejects.toThrow(
      "REDIRECT:/dashboard/branding?error=brand-asset-file-too-large",
    );

    expect(supabase.storageUploads).toHaveLength(0);
    expect(supabase.inserts).toHaveLength(0);
  });

  it("sanitizes unsafe filenames so the storage path stays tenant-scoped", async () => {
    const supabase = createSupabaseClientMock();
    mocks.createClient.mockResolvedValue(supabase as never);

    await expect(
      uploadBrandAssetAction(
        createUploadFormData({
          assetType: "panel",
          file: createFile("..\\..//Neon ?Panel!!.png", "image/png"),
          name: "",
        }),
      ),
    ).rejects.toThrow(
      "REDIRECT:/dashboard/branding?status=brand-asset-uploaded",
    );

    const storagePath = supabase.storageUploads[0]?.path ?? "";
    expect(
      storagePath.startsWith("11111111-1111-4111-8111-111111111111/"),
    ).toBe(true);
    expect(storagePath).not.toContain("..");
    expect(storagePath).not.toContain("\\");
    expect(storagePath).not.toContain("?");
    expect(storagePath).not.toContain("#");
    expect(storagePath).toMatch(/neon-panel\.png$/);
  });

  it("blocks unauthenticated uploads", async () => {
    mocks.createClient.mockResolvedValue(
      createSupabaseClientMock({
        user: null,
      }) as never,
    );

    await expect(
      uploadBrandAssetAction(
        createUploadFormData({
          assetType: "logo",
          file: createFile("neon-logo.png", "image/png"),
        }),
      ),
    ).rejects.toThrow("REDIRECT:/login");
  });

  it("returns a secret-safe storage failure", async () => {
    const supabase = createSupabaseClientMock({
      uploadError: new Error("storage internals"),
    });
    mocks.createClient.mockResolvedValue(supabase as never);

    await expect(
      uploadBrandAssetAction(
        createUploadFormData({
          assetType: "logo",
          file: createFile("neon-logo.png", "image/png"),
        }),
      ),
    ).rejects.toThrow(
      "REDIRECT:/dashboard/branding?error=brand-asset-upload-failed",
    );

    expect(supabase.inserts).toHaveLength(0);
    expect(supabase.storageRemoves).toHaveLength(0);
  });

  it("attempts cleanup when the database insert fails after storage upload", async () => {
    const supabase = createSupabaseClientMock({
      insertError: new Error("db exploded"),
    });
    mocks.createClient.mockResolvedValue(supabase as never);

    await expect(
      uploadBrandAssetAction(
        createUploadFormData({
          assetType: "logo",
          file: createFile("neon-logo.png", "image/png"),
        }),
      ),
    ).rejects.toThrow(
      "REDIRECT:/dashboard/branding?error=brand-asset-persist-failed",
    );

    expect(supabase.storageUploads).toHaveLength(1);
    expect(supabase.storageRemoves).toEqual([
      {
        bucket: "brand-assets",
        paths: [supabase.storageUploads[0]?.path],
      },
    ]);
  });
});

function createUploadFormData({
  assetType,
  file,
  name = "Neon Logo",
}: {
  assetType: string;
  file: File;
  name?: string;
}) {
  const formData = new FormData();
  formData.set("assetType", assetType);
  formData.set("assetFile", file);
  formData.set("description", "Primary brand asset.");
  formData.set("name", name);
  return formData;
}

function createFile(name: string, type: string, content = "content") {
  return new File([content], name, { type });
}

function createSupabaseClientMock({
  insertError = null,
  uploadError = null,
  user = {
    id: "11111111-1111-4111-8111-111111111111",
  },
  userError = null,
}: {
  insertError?: unknown;
  uploadError?: unknown;
  user?: { id: string } | null;
  userError?: unknown;
} = {}) {
  const inserts: Array<Record<string, unknown>> = [];
  const storageUploads: Array<{
    bucket: string;
    options: {
      contentType: string;
      upsert: boolean;
    };
    path: string;
  }> = [];
  const storageRemoves: Array<{
    bucket: string;
    paths: Array<string | undefined>;
  }> = [];

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user,
        },
        error: userError,
      }),
    },
    from: vi.fn(() => ({
      insert: vi.fn(async (payload: Record<string, unknown>) => {
        inserts.push(payload);

        return {
          data: insertError ? null : {},
          error: insertError,
        };
      }),
    })),
    inserts,
    storage: {
      from: vi.fn((bucket: string) => ({
        remove: vi.fn(async (paths: Array<string | undefined>) => {
          storageRemoves.push({
            bucket,
            paths,
          });

          return {
            data: null,
            error: null,
          };
        }),
        upload: vi.fn(
          async (
            path: string,
            _file: File,
            options: { contentType: string; upsert: boolean },
          ) => {
            storageUploads.push({
              bucket,
              options,
              path,
            });

            return {
              data: uploadError ? null : { path },
              error: uploadError,
            };
          },
        ),
      })),
    },
    storageRemoves,
    storageUploads,
  };
}
