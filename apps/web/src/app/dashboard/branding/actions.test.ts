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

import { replaceBrandAssetAction, uploadBrandAssetAction } from "./actions";

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
          file: createImageFile("neon-logo.png", "image/png"),
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
    expect(supabase.inserts[0]).not.toHaveProperty("upload_metadata_status");
    expect(supabase.inserts[0]).not.toHaveProperty("preview_capability_status");
    expect(supabase.inserts[0]?.metadata).toEqual({
      upload: {
        content_type: "image/png",
        file_extension: "png",
        file_size_bytes: 8,
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
  ] as const)(
    "accepts %s uploads with .%s storage filenames",
    async (mimeType, filename, extension) => {
      const supabase = createSupabaseClientMock();
      mocks.createClient.mockResolvedValue(supabase as never);

      await expect(
        uploadBrandAssetAction(
          createUploadFormData({
            assetType: "banner",
            file: createImageFile(filename, mimeType),
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

  it("blocks MIME and extension mismatches before storage writes", async () => {
    const supabase = createSupabaseClientMock();
    mocks.createClient.mockResolvedValue(supabase as never);

    await expect(
      uploadBrandAssetAction(
        createUploadFormData({
          assetType: "logo",
          file: createImageFile("brand-shot.png", "image/jpeg"),
        }),
      ),
    ).rejects.toThrow(
      "REDIRECT:/dashboard/branding?error=brand-asset-file-extension-mismatch",
    );

    expect(supabase.storageUploads).toHaveLength(0);
    expect(supabase.inserts).toHaveLength(0);
  });

  it("blocks spoofed file contents even when MIME type and extension look allowed", async () => {
    const supabase = createSupabaseClientMock();
    mocks.createClient.mockResolvedValue(supabase as never);

    await expect(
      uploadBrandAssetAction(
        createUploadFormData({
          assetType: "logo",
          file: createFile("neon-logo.png", "image/png", "not-a-real-png"),
        }),
      ),
    ).rejects.toThrow(
      "REDIRECT:/dashboard/branding?error=brand-asset-file-type-not-supported",
    );

    expect(supabase.storageUploads).toHaveLength(0);
    expect(supabase.inserts).toHaveLength(0);
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
          file: createImageFile("..\\..//Neon ?Panel!!.png", "image/png"),
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
          file: createImageFile("neon-logo.png", "image/png"),
        }),
      ),
    ).rejects.toThrow("REDIRECT:/login");

    const supabase = await mocks.createClient.mock.results[0]?.value;
    expect(supabase.storageUploads).toHaveLength(0);
    expect(supabase.inserts).toHaveLength(0);
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
          file: createImageFile("neon-logo.png", "image/png"),
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
          file: createImageFile("neon-logo.png", "image/png"),
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

  it("surfaces cleanup failure without exposing private storage details", async () => {
    const supabase = createSupabaseClientMock({
      insertError: new Error("db exploded"),
      removeError: new Error("cleanup failed"),
    });
    mocks.createClient.mockResolvedValue(supabase as never);

    await expect(
      uploadBrandAssetAction(
        createUploadFormData({
          assetType: "logo",
          file: createImageFile("neon-logo.png", "image/png"),
        }),
      ),
    ).rejects.toThrow(
      "REDIRECT:/dashboard/branding?error=brand-asset-cleanup-failed",
    );

    expect(supabase.storageRemoves).toEqual([
      {
        bucket: "brand-assets",
        paths: [supabase.storageUploads[0]?.path],
      },
    ]);
  });
});

describe("replaceBrandAssetAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isSupabaseConfigured.mockReturnValue(true);
    mocks.createClient.mockResolvedValue(createSupabaseClientMock() as never);
  });

  it("uploads a replacement object on a fresh private path and updates only safe asset fields", async () => {
    const supabase = createSupabaseClientMock({
      brandAssetRow: createBrandAssetRow(),
    });
    mocks.createClient.mockResolvedValue(supabase as never);

    await expect(
      replaceBrandAssetAction(
        createReplaceFormData({
          assetId: "asset-existing",
          file: createImageFile("replacement-logo.png", "image/png"),
        }),
      ),
    ).rejects.toThrow(
      "REDIRECT:/dashboard/branding?status=brand-asset-replaced",
    );

    expect(supabase.storageUploads).toHaveLength(1);
    expect(supabase.storageUploads[0]?.bucket).toBe("brand-assets");
    expect(supabase.storageUploads[0]?.path).toMatch(
      /^11111111-1111-4111-8111-111111111111\/logo\/asset-existing\/replacements\/[0-9a-f-]{36}-replacement-logo\.png$/,
    );
    expect(supabase.storageRemoves).toHaveLength(0);
    expect(supabase.updates).toEqual([
      expect.objectContaining({
        public_url: null,
        storage_bucket: "brand-assets",
        storage_path: supabase.storageUploads[0]?.path,
      }),
    ]);
    expect(supabase.updates[0]).not.toHaveProperty("preview_capability_status");
    expect(supabase.updates[0]).not.toHaveProperty("upload_metadata_status");
    expect(supabase.updates[0]?.metadata).toEqual({
      origin: "seeded",
      upload: {
        content_type: "image/png",
        file_extension: "png",
        file_size_bytes: 8,
        stored_filename: "replacement-logo.png",
      },
    });
    expect(JSON.stringify(supabase.updates[0]?.metadata)).not.toContain(
      "signed.example",
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard/branding");
  });

  it("blocks replace when the target asset is missing or cross-tenant", async () => {
    const supabase = createSupabaseClientMock({
      brandAssetRow: null,
    });
    mocks.createClient.mockResolvedValue(supabase as never);

    await expect(
      replaceBrandAssetAction(
        createReplaceFormData({
          assetId: "asset-missing",
          file: createImageFile("replacement-logo.png", "image/png"),
        }),
      ),
    ).rejects.toThrow(
      "REDIRECT:/dashboard/branding?error=brand-asset-replace-not-found",
    );

    expect(supabase.storageUploads).toHaveLength(0);
    expect(supabase.updates).toHaveLength(0);
  });

  it("blocks unauthenticated replace attempts", async () => {
    mocks.createClient.mockResolvedValue(
      createSupabaseClientMock({
        user: null,
      }) as never,
    );

    await expect(
      replaceBrandAssetAction(
        createReplaceFormData({
          assetId: "asset-existing",
          file: createImageFile("replacement-logo.png", "image/png"),
        }),
      ),
    ).rejects.toThrow("REDIRECT:/login");
  });

  it("blocks unsupported replace file types before storage writes", async () => {
    const supabase = createSupabaseClientMock({
      brandAssetRow: createBrandAssetRow(),
    });
    mocks.createClient.mockResolvedValue(supabase as never);

    await expect(
      replaceBrandAssetAction(
        createReplaceFormData({
          assetId: "asset-existing",
          file: createFile("brand-brief.pdf", "application/pdf"),
        }),
      ),
    ).rejects.toThrow(
      "REDIRECT:/dashboard/branding?error=brand-asset-file-type-not-supported",
    );

    expect(supabase.storageUploads).toHaveLength(0);
    expect(supabase.updates).toHaveLength(0);
  });

  it("blocks SVG replace attempts before storage writes", async () => {
    const supabase = createSupabaseClientMock({
      brandAssetRow: createBrandAssetRow(),
    });
    mocks.createClient.mockResolvedValue(supabase as never);

    await expect(
      replaceBrandAssetAction(
        createReplaceFormData({
          assetId: "asset-existing",
          file: createFile("brand-mark.svg", "image/svg+xml"),
        }),
      ),
    ).rejects.toThrow(
      "REDIRECT:/dashboard/branding?error=brand-asset-svg-not-supported",
    );

    expect(supabase.storageUploads).toHaveLength(0);
    expect(supabase.updates).toHaveLength(0);
  });

  it("returns a secret-safe storage failure during replace", async () => {
    const supabase = createSupabaseClientMock({
      brandAssetRow: createBrandAssetRow(),
      uploadError: new Error("storage internals"),
    });
    mocks.createClient.mockResolvedValue(supabase as never);

    await expect(
      replaceBrandAssetAction(
        createReplaceFormData({
          assetId: "asset-existing",
          file: createImageFile("replacement-logo.png", "image/png"),
        }),
      ),
    ).rejects.toThrow(
      "REDIRECT:/dashboard/branding?error=brand-asset-replace-upload-failed",
    );

    expect(supabase.updates).toHaveLength(0);
    expect(supabase.storageRemoves).toHaveLength(0);
  });

  it("surfaces DB update failures after replace upload without deleting old or new objects", async () => {
    const supabase = createSupabaseClientMock({
      brandAssetRow: createBrandAssetRow(),
      updateError: new Error("db exploded"),
    });
    mocks.createClient.mockResolvedValue(supabase as never);

    await expect(
      replaceBrandAssetAction(
        createReplaceFormData({
          assetId: "asset-existing",
          file: createImageFile("replacement-logo.png", "image/png"),
        }),
      ),
    ).rejects.toThrow(
      "REDIRECT:/dashboard/branding?error=brand-asset-replace-persist-failed",
    );

    expect(supabase.storageUploads).toHaveLength(1);
    expect(supabase.storageRemoves).toHaveLength(0);
    expect(supabase.updates).toHaveLength(1);
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

function createReplaceFormData({
  assetId,
  file,
}: {
  assetId: string;
  file: File;
}) {
  const formData = new FormData();
  formData.set("assetId", assetId);
  formData.set("assetFile", file);
  return formData;
}

function createFile(name: string, type: string, content: BlobPart = "content") {
  return new File([content], name, { type });
}

function createImageFile(
  name: string,
  type: "image/jpeg" | "image/png" | "image/webp",
) {
  const contents = {
    "image/jpeg": toArrayBuffer([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43]),
    "image/png": toArrayBuffer([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]),
    "image/webp": toArrayBuffer([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ]),
  } satisfies Record<typeof type, ArrayBuffer>;

  return createFile(name, type, contents[type]);
}

function toArrayBuffer(bytes: number[]): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

function createSupabaseClientMock({
  brandAssetRow = createBrandAssetRow(),
  brandAssetLookupError = null,
  insertError = null,
  removeError = null,
  uploadError = null,
  updateError = null,
  user = {
    id: "11111111-1111-4111-8111-111111111111",
  },
  userError = null,
}: {
  brandAssetRow?: {
    asset_type: string;
    id: string;
    metadata: Record<string, unknown> | null;
    storage_path: string | null;
    user_id: string;
  } | null;
  brandAssetLookupError?: unknown;
  insertError?: unknown;
  removeError?: unknown;
  uploadError?: unknown;
  updateError?: unknown;
  user?: { id: string } | null;
  userError?: unknown;
} = {}) {
  const inserts: Array<Record<string, unknown>> = [];
  const selects: Array<{
    columns: string;
    filters: Array<{ column: string; value: unknown }>;
  }> = [];
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
  const updates: Array<Record<string, unknown>> = [];

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
      select: vi.fn((columns: string) => ({
        eq: vi.fn((firstColumn: string, firstValue: unknown) => ({
          eq: vi.fn((secondColumn: string, secondValue: unknown) => ({
            maybeSingle: vi.fn(async () => {
              const filters = [
                { column: firstColumn, value: firstValue },
                { column: secondColumn, value: secondValue },
              ];
              const filterMap = new Map(
                filters.map(({ column, value }) => [column, value]),
              );
              selects.push({
                columns,
                filters,
              });

              if (brandAssetLookupError) {
                return {
                  data: null,
                  error: brandAssetLookupError,
                };
              }

              if (
                !brandAssetRow ||
                firstColumn !== "id" ||
                secondColumn !== "user_id" ||
                filterMap.get("id") !== brandAssetRow.id ||
                filterMap.get("user_id") !== brandAssetRow.user_id
              ) {
                return {
                  data: null,
                  error: null,
                };
              }

              return {
                data: {
                  asset_type: brandAssetRow.asset_type,
                  metadata: brandAssetRow.metadata,
                },
                error: null,
              };
            }),
          })),
        })),
      })),
      update: vi.fn((payload: Record<string, unknown>) => {
        updates.push(payload);

        return {
          eq: vi.fn((firstColumn: string, firstValue: unknown) => ({
            eq: vi.fn((secondColumn: string, secondValue: unknown) => ({
              select: vi.fn((_columns: string) => ({
                maybeSingle: vi.fn(async () => ({
                  data:
                    updateError ||
                    !brandAssetRow ||
                    firstColumn !== "id" ||
                    secondColumn !== "user_id" ||
                    brandAssetRow.id !== firstValue ||
                    brandAssetRow.user_id !== secondValue
                      ? null
                      : { id: brandAssetRow.id },
                  error:
                    updateError ||
                    !brandAssetRow ||
                    firstColumn !== "id" ||
                    secondColumn !== "user_id" ||
                    brandAssetRow.id !== firstValue ||
                    brandAssetRow.user_id !== secondValue
                      ? (updateError ??
                        new Error("brand asset update target missing"))
                      : null,
                })),
              })),
            })),
          })),
        };
      }),
    })),
    inserts,
    selects,
    storage: {
      from: vi.fn((bucket: string) => ({
        remove: vi.fn(async (paths: Array<string | undefined>) => {
          storageRemoves.push({
            bucket,
            paths,
          });

          return {
            data: removeError ? null : {},
            error: removeError,
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
    updates,
  };
}

function createBrandAssetRow() {
  return {
    asset_type: "logo",
    id: "asset-existing",
    metadata: {
      origin: "seeded",
      upload: {
        content_type: "image/png",
        file_extension: "png",
        file_size_bytes: 2048,
        stored_filename: "old-logo.png",
      },
    },
    storage_path:
      "11111111-1111-4111-8111-111111111111/logo/asset-existing/old-logo.png",
    user_id: "11111111-1111-4111-8111-111111111111",
  };
}
