import { describe, expect, it } from "vitest";

import {
  BRAND_ASSET_MAX_FILE_SIZE_BYTES,
  buildBrandAssetStoragePath,
  parseBrandAssetUploadFormData,
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
});

function createUploadFormData({ file }: { file: File }) {
  const formData = new FormData();

  formData.set("assetFile", file);
  formData.set("assetType", "logo");
  formData.set("name", "Neon Logo");
  formData.set("status", "draft");

  return formData;
}
