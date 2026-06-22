import { describe, expect, it } from "vitest";

import {
  BRAND_ASSET_MAX_FILE_SIZE_BYTES,
  BRAND_ASSET_SIGNED_PREVIEW_TTL_SECONDS,
  buildBrandAssetStoragePath,
  createBrandAssetSignedPreviewUrl,
  parseBrandAssetUploadFormData,
  parseBrandAssetPreviewStorage,
  sanitizeBrandAssetFilename,
} from "./brand-asset-storage";

describe("brand asset storage helpers", () => {
  it.each([
    ["image/png", "overlay.png"],
    ["image/jpeg", "overlay.jpg"],
    ["image/jpeg", "overlay.jpeg"],
    ["image/webp", "overlay.webp"],
  ])("accepts %s files with matching extensions", (type, filename) => {
    const parsed = parseBrandAssetUploadFormData(
      createUploadFormData({
        file: new File(["safe"], filename, { type }),
      }),
      () => "22222222-2222-4222-8222-222222222222",
    );

    expect(parsed).toMatchObject({
      ok: true,
      values: {
        assetId: "22222222-2222-4222-8222-222222222222",
        assetType: "logo",
        name: "Neon Logo",
        sanitizedFilename: filename,
        status: "draft",
      },
    });
  });

  it("rejects oversized files", () => {
    const parsed = parseBrandAssetUploadFormData(
      createUploadFormData({
        file: new File(
          [new Uint8Array(BRAND_ASSET_MAX_FILE_SIZE_BYTES + 1)],
          "oversized.png",
          { type: "image/png" },
        ),
      }),
      () => "22222222-2222-4222-8222-222222222222",
    );

    expect(parsed).toEqual({
      error: "brand-asset-file-too-large",
      ok: false,
    });
  });

  it.each([
    ["image/svg+xml", "logo.svg"],
    ["image/gif", "animated.gif"],
    ["text/html", "index.html"],
    ["application/pdf", "brief.pdf"],
    ["application/octet-stream", "unknown.bin"],
  ])("rejects unsupported %s files", (type, filename) => {
    const parsed = parseBrandAssetUploadFormData(
      createUploadFormData({
        file: new File(["unsafe"], filename, { type }),
      }),
      () => "22222222-2222-4222-8222-222222222222",
    );

    expect(parsed).toEqual({
      error: "brand-asset-file-type-not-supported",
      ok: false,
    });
  });

  it("rejects MIME and extension mismatches", () => {
    const parsed = parseBrandAssetUploadFormData(
      createUploadFormData({
        file: new File(["mismatch"], "logo.jpg", { type: "image/png" }),
      }),
      () => "22222222-2222-4222-8222-222222222222",
    );

    expect(parsed).toEqual({
      error: "brand-asset-file-extension-mismatch",
      ok: false,
    });
  });

  it("sanitizes path-like filenames without trusting user input", () => {
    expect(sanitizeBrandAssetFilename("../Fancy Logo Final!!.PNG")).toBe(
      "fancy-logo-final.png",
    );
  });

  it("builds tenant-scoped storage paths with the user id as first segment", () => {
    expect(
      buildBrandAssetStoragePath({
        assetId: "22222222-2222-4222-8222-222222222222",
        assetType: "logo",
        filename: "fancy-logo.png",
        userId: "11111111-1111-4111-8111-111111111111",
      }),
    ).toBe(
      "11111111-1111-4111-8111-111111111111/logo/22222222-2222-4222-8222-222222222222/fancy-logo.png",
    );
  });

  it("creates short-lived signed preview URLs for tenant-scoped brand assets", async () => {
    const client = createPreviewStorageClientMock({
      signedUrl: "https://storage.example/signed-preview",
    });

    await expect(
      createBrandAssetSignedPreviewUrl({
        client,
        storageBucket: "brand-assets",
        storagePath:
          "11111111-1111-4111-8111-111111111111/logo/22222222-2222-4222-8222-222222222222/neon-logo.png",
        userId: "11111111-1111-4111-8111-111111111111",
      }),
    ).resolves.toEqual({
      previewStatus: "available",
      previewUrl: "https://storage.example/signed-preview",
    });
    expect(client.signedUrlRequests).toEqual([
      {
        bucket: "brand-assets",
        expiresIn: BRAND_ASSET_SIGNED_PREVIEW_TTL_SECONDS,
        path: "11111111-1111-4111-8111-111111111111/logo/22222222-2222-4222-8222-222222222222/neon-logo.png",
      },
    ]);
  });

  it("rejects tenant-mismatched preview storage paths before signing", async () => {
    const client = createPreviewStorageClientMock({
      signedUrl: "https://storage.example/signed-preview",
    });

    await expect(
      createBrandAssetSignedPreviewUrl({
        client,
        storageBucket: "brand-assets",
        storagePath:
          "99999999-9999-4999-8999-999999999999/logo/22222222-2222-4222-8222-222222222222/neon-logo.png",
        userId: "11111111-1111-4111-8111-111111111111",
      }),
    ).resolves.toEqual({
      previewStatus: "invalid_storage_metadata",
      previewUrl: null,
    });
    expect(client.signedUrlRequests).toHaveLength(0);
  });

  it("does not sign previews for missing storage paths or wrong buckets", async () => {
    const client = createPreviewStorageClientMock({
      signedUrl: "https://storage.example/signed-preview",
    });

    expect(
      parseBrandAssetPreviewStorage({
        storageBucket: null,
        storagePath: null,
        userId: "11111111-1111-4111-8111-111111111111",
      }),
    ).toEqual({
      ok: false,
      status: "no_preview",
    });

    await expect(
      createBrandAssetSignedPreviewUrl({
        client,
        storageBucket: "public-assets",
        storagePath:
          "11111111-1111-4111-8111-111111111111/logo/22222222-2222-4222-8222-222222222222/neon-logo.png",
        userId: "11111111-1111-4111-8111-111111111111",
      }),
    ).resolves.toEqual({
      previewStatus: "invalid_storage_metadata",
      previewUrl: null,
    });
    expect(client.signedUrlRequests).toHaveLength(0);
  });

  it("sanitizes storage signing failures into a generic preview status", async () => {
    const client = createPreviewStorageClientMock({
      error: { message: "private storage implementation detail" },
      signedUrl: null,
    });

    await expect(
      createBrandAssetSignedPreviewUrl({
        client,
        storageBucket: "brand-assets",
        storagePath:
          "11111111-1111-4111-8111-111111111111/logo/22222222-2222-4222-8222-222222222222/neon-logo.png",
        userId: "11111111-1111-4111-8111-111111111111",
      }),
    ).resolves.toEqual({
      previewStatus: "storage_error",
      previewUrl: null,
    });
  });
});

function createUploadFormData({ file }: { file: File }) {
  const formData = new FormData();

  formData.set("assetFile", file);
  formData.set("assetType", "logo");
  formData.set("name", "Neon Logo");
  formData.set("status", "draft");

  return formData;
}

function createPreviewStorageClientMock({
  error = null,
  signedUrl,
}: {
  error?: unknown;
  signedUrl: string | null;
}) {
  const signedUrlRequests: Array<{
    bucket: string;
    expiresIn: number;
    path: string;
  }> = [];

  return {
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
            error,
          };
        },
      }),
    },
  };
}
