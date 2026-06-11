import { describe, expect, it } from "vitest";
import {
  buildBrandAssetStoragePath,
  buildBrandAssetUploadMetadata,
  parseBrandAssetUploadFormData,
} from "./brand-asset-upload";

describe("brand asset upload helpers", () => {
  it("parses valid upload form data", () => {
    const formData = new FormData();
    formData.set("assetType", "logo");
    formData.set("configJson", '{"placement":"bottom-left"}');
    formData.set(
      "file",
      new File(["logo"], "Stream Logo.svg", { type: "image/svg+xml" }),
    );
    formData.set("name", "Stream Logo");
    formData.set("status", "active");

    const result = parseBrandAssetUploadFormData(formData);

    expect(result).toEqual({
      ok: true,
      values: {
        assetType: "logo",
        config: {
          placement: "bottom-left",
        },
        file: expect.any(File),
        name: "Stream Logo",
        status: "active",
      },
    });
  });

  it("rejects unsupported upload files", () => {
    const formData = new FormData();
    formData.set("assetType", "overlay");
    formData.set(
      "file",
      new File(["text"], "notes.txt", { type: "text/plain" }),
    );
    formData.set("name", "Overlay");
    formData.set("status", "draft");

    const result = parseBrandAssetUploadFormData(formData);

    expect(result).toEqual({
      error: "invalid-brand-asset-file",
      ok: false,
    });
  });

  it("builds stable storage metadata and path", () => {
    const path = buildBrandAssetStoragePath({
      assetType: "banner",
      fileName: "Summer Banner 2026.png",
      uploadId: "11111111-1111-4111-8111-111111111111",
      userId: "user-1",
    });

    expect(path).toBe(
      "user-1/banner/11111111-1111-4111-8111-111111111111/11111111-1111-4111-8111-111111111111-summer-banner-2026.png",
    );

    expect(
      buildBrandAssetUploadMetadata({
        assetType: "banner",
        file: new File(["banner"], "Summer Banner 2026.png", {
          type: "image/png",
        }),
        storagePath: path,
      }),
    ).toMatchObject({
      asset_type: "banner",
      file_name: "Summer Banner 2026.png",
      mime_type: "image/png",
      source: "upload",
      storage_path: path,
    });
  });
});
