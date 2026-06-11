import type { BrandAssetStatus, Json } from "@streamos/database";
import { z } from "zod";
import { brandAssetStatusValues, brandAssetTypeLabels } from "./brand-kit";

export const brandAssetUploadTypeValues = [
  "logo",
  "banner",
  "overlay",
] as const;

export const brandAssetUploadAccept = ".png,.jpg,.jpeg,.webp,.gif,.svg,.avif";

export const brandAssetUploadTypeLabels = {
  banner: brandAssetTypeLabels.banner,
  logo: brandAssetTypeLabels.logo,
  overlay: brandAssetTypeLabels.overlay,
} as const;

const brandAssetUploadFormSchema = z.object({
  assetType: z.enum(brandAssetUploadTypeValues),
  name: z.string().trim().min(1).max(160),
  status: z.enum(brandAssetStatusValues),
});

export type BrandAssetUploadType = (typeof brandAssetUploadTypeValues)[number];

export type BrandAssetUploadFormValues = {
  assetType: BrandAssetUploadType;
  config: Record<string, Json>;
  file: File;
  name: string;
  status: BrandAssetStatus;
};

export type BrandAssetUploadParseResult =
  | {
      ok: true;
      values: BrandAssetUploadFormValues;
    }
  | {
      error:
        | "invalid-brand-asset-file"
        | "invalid-brand-asset-upload-config"
        | "invalid-brand-asset-upload-form";
      ok: false;
    };

export function parseBrandAssetUploadFormData(
  formData: FormData,
): BrandAssetUploadParseResult {
  const parsedValues = brandAssetUploadFormSchema.safeParse({
    assetType: String(formData.get("assetType") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim(),
    status: String(formData.get("status") ?? "").trim(),
  });

  if (!parsedValues.success) {
    return {
      error: "invalid-brand-asset-upload-form",
      ok: false,
    };
  }

  const file = formData.get("file");

  if (!(file instanceof File) || file.size <= 0) {
    return {
      error: "invalid-brand-asset-file",
      ok: false,
    };
  }

  if (file.size > 10 * 1024 * 1024) {
    return {
      error: "invalid-brand-asset-file",
      ok: false,
    };
  }

  if (!isSupportedBrandAssetMimeType(file.type, file.name)) {
    return {
      error: "invalid-brand-asset-file",
      ok: false,
    };
  }

  const parsedConfig = parseUploadConfigJson(
    String(formData.get("configJson") ?? "").trim(),
  );

  if (!parsedConfig.ok) {
    return parsedConfig;
  }

  return {
    ok: true,
    values: {
      assetType: parsedValues.data.assetType,
      config: parsedConfig.values,
      file,
      name: parsedValues.data.name,
      status: parsedValues.data.status,
    },
  };
}

export function buildBrandAssetStoragePath({
  assetType,
  fileName,
  userId,
  uploadId,
}: {
  assetType: BrandAssetUploadType;
  fileName: string;
  uploadId: string;
  userId: string;
}) {
  return [
    userId,
    assetType,
    uploadId,
    `${uploadId}-${sanitizeBrandAssetFileName(fileName)}`,
  ].join("/");
}

export function buildBrandAssetUploadMetadata({
  assetType,
  file,
  storagePath,
}: {
  assetType: BrandAssetUploadType;
  file: File;
  storagePath: string;
}): Record<string, Json> {
  return {
    asset_type: assetType,
    file_name: file.name,
    mime_type: file.type || "application/octet-stream",
    size_bytes: file.size,
    source: "upload",
    storage_path: storagePath,
  };
}

function isSupportedBrandAssetMimeType(fileType: string, fileName: string) {
  if (
    fileType &&
    [
      "image/avif",
      "image/gif",
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/svg+xml",
      "image/webp",
    ].includes(fileType)
  ) {
    return true;
  }

  const extension = fileName.split(".").pop()?.toLowerCase();

  return (
    extension === "avif" ||
    extension === "gif" ||
    extension === "jpeg" ||
    extension === "jpg" ||
    extension === "png" ||
    extension === "svg" ||
    extension === "webp"
  );
}

function parseUploadConfigJson(configJson: string):
  | {
      error: "invalid-brand-asset-upload-config";
      ok: false;
    }
  | {
      ok: true;
      values: Record<string, Json>;
    } {
  if (!configJson) {
    return {
      ok: true,
      values: {},
    };
  }

  try {
    const parsed = JSON.parse(configJson) as unknown;

    if (!isPlainObject(parsed)) {
      return {
        error: "invalid-brand-asset-upload-config",
        ok: false,
      };
    }

    return {
      ok: true,
      values: parsed as Record<string, Json>,
    };
  } catch {
    return {
      error: "invalid-brand-asset-upload-config",
      ok: false,
    };
  }
}

function sanitizeBrandAssetFileName(fileName: string): string {
  const normalized = fileName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "");

  return normalized || "asset";
}

function isPlainObject(value: unknown): value is Record<string, Json> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
