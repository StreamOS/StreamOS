import type {
  BrandAssetStatus,
  BrandAssetType,
  Json,
} from "@streamos/database";
import { z } from "zod";

import { brandAssetStatusValues, brandAssetTypeValues } from "./brand-kit";

export const BRAND_ASSETS_STORAGE_BUCKET = "brand-assets";
export const BRAND_ASSET_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
export const BRAND_ASSET_SIGNED_PREVIEW_TTL_SECONDS = 5 * 60;

const allowedImageTypes = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
} as const;

type AllowedImageMimeType = keyof typeof allowedImageTypes;

export type BrandAssetUploadValues = {
  assetId: string;
  assetType: BrandAssetType;
  config: Record<string, Json>;
  description: string | null;
  file: File;
  name: string;
  sanitizedFilename: string;
  status: BrandAssetStatus;
};

export type BrandAssetUploadParseResult =
  | {
      ok: true;
      values: BrandAssetUploadValues;
    }
  | {
      error:
        | "brand-asset-file-extension-mismatch"
        | "brand-asset-file-required"
        | "brand-asset-file-too-large"
        | "brand-asset-file-type-not-supported"
        | "invalid-brand-asset-filename"
        | "invalid-brand-kit-form";
      ok: false;
    };

export type BrandAssetPreviewStatus =
  | "available"
  | "invalid_storage_metadata"
  | "no_preview"
  | "storage_error";

export type BrandAssetSignedPreview = {
  previewStatus: BrandAssetPreviewStatus;
  previewUrl: string | null;
};

export type BrandAssetPreviewStorageClient = {
  storage: {
    from: (bucket: string) => {
      createSignedUrl: (
        path: string,
        expiresIn: number,
      ) => Promise<{
        data: { signedUrl?: string | null } | null;
        error: unknown;
      }>;
    };
  };
};

const uploadFormSchema = z.object({
  assetType: z.enum(brandAssetTypeValues),
  description: z.string().trim().max(1000).optional(),
  id: z.string().uuid(),
  name: z.string().trim().max(160).optional(),
  status: z.enum(brandAssetStatusValues).default("draft"),
});

export function parseBrandAssetUploadFormData(
  formData: FormData,
  createAssetId: () => string,
): BrandAssetUploadParseResult {
  const file = formData.get("assetFile");

  if (!(file instanceof File) || file.size === 0) {
    return {
      error: "brand-asset-file-required",
      ok: false,
    };
  }

  if (file.size > BRAND_ASSET_MAX_FILE_SIZE_BYTES) {
    return {
      error: "brand-asset-file-too-large",
      ok: false,
    };
  }

  if (!isAllowedImageMimeType(file.type)) {
    return {
      error: "brand-asset-file-type-not-supported",
      ok: false,
    };
  }

  const sanitizedFilename = sanitizeBrandAssetFilename(file.name);

  if (!sanitizedFilename) {
    return {
      error: "invalid-brand-asset-filename",
      ok: false,
    };
  }

  const extension = getFileExtension(sanitizedFilename);

  if (!allowedImageTypes[file.type].includes(extension as never)) {
    return {
      error: "brand-asset-file-extension-mismatch",
      ok: false,
    };
  }

  const parsed = uploadFormSchema.safeParse({
    assetType: String(formData.get("assetType") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    id: createAssetId(),
    name: String(formData.get("name") ?? "").trim() || undefined,
    status: String(formData.get("status") ?? "draft").trim() || "draft",
  });

  if (!parsed.success) {
    return {
      error: "invalid-brand-kit-form",
      ok: false,
    };
  }

  return {
    ok: true,
    values: {
      assetId: parsed.data.id,
      assetType: parsed.data.assetType,
      config: {
        file: {
          contentType: file.type,
          originalFilename: file.name,
          size: file.size,
        },
      },
      description: parsed.data.description || null,
      file,
      name:
        parsed.data.name ??
        titleFromFilename(sanitizedFilename) ??
        "Brand Asset",
      sanitizedFilename,
      status: parsed.data.status,
    },
  };
}

export function buildBrandAssetStoragePath({
  assetId,
  assetType,
  filename,
  userId,
}: {
  assetId: string;
  assetType: BrandAssetType;
  filename: string;
  userId: string;
}) {
  return `${userId}/${assetType}/${assetId}/${filename}`;
}

export async function createBrandAssetSignedPreviewUrl({
  client,
  storageBucket,
  storagePath,
  ttlSeconds = BRAND_ASSET_SIGNED_PREVIEW_TTL_SECONDS,
  userId,
}: {
  client: BrandAssetPreviewStorageClient;
  storageBucket: string | null;
  storagePath: string | null;
  ttlSeconds?: number;
  userId: string;
}): Promise<BrandAssetSignedPreview> {
  const storage = parseBrandAssetPreviewStorage({
    storageBucket,
    storagePath,
    userId,
  });

  if (!storage.ok) {
    return {
      previewStatus: storage.status,
      previewUrl: null,
    };
  }

  const { data, error } = await client.storage
    .from(storage.bucket)
    .createSignedUrl(storage.path, ttlSeconds);

  if (error || !data?.signedUrl) {
    return {
      previewStatus: "storage_error",
      previewUrl: null,
    };
  }

  return {
    previewStatus: "available",
    previewUrl: data.signedUrl,
  };
}

export function parseBrandAssetPreviewStorage({
  storageBucket,
  storagePath,
  userId,
}:
  | {
      storageBucket: string | null;
      storagePath: string | null;
      userId: string;
    }
  | {
      storageBucket?: string | null;
      storagePath?: string | null;
      userId: string;
    }):
  | {
      bucket: typeof BRAND_ASSETS_STORAGE_BUCKET;
      ok: true;
      path: string;
    }
  | {
      ok: false;
      status: Exclude<BrandAssetPreviewStatus, "available" | "storage_error">;
    } {
  if (!storageBucket && !storagePath) {
    return {
      ok: false,
      status: "no_preview",
    };
  }

  if (storageBucket !== BRAND_ASSETS_STORAGE_BUCKET || !storagePath) {
    return {
      ok: false,
      status: "invalid_storage_metadata",
    };
  }

  if (!isTenantScopedStoragePath(storagePath, userId)) {
    return {
      ok: false,
      status: "invalid_storage_metadata",
    };
  }

  return {
    bucket: BRAND_ASSETS_STORAGE_BUCKET,
    ok: true,
    path: storagePath,
  };
}

export function sanitizeBrandAssetFilename(filename: string) {
  const normalized = filename.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const segments = normalized.split(/[/\\]+/);
  const basename = segments.at(-1)?.trim() ?? "";
  const extension = getFileExtension(basename);

  if (!extension) {
    return null;
  }

  const nameWithoutExtension = basename.slice(0, -(extension.length + 1));
  const safeName = nameWithoutExtension
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 120);

  if (!safeName) {
    return null;
  }

  return `${safeName}.${extension}`;
}

function isTenantScopedStoragePath(storagePath: string, userId: string) {
  if (
    storagePath.startsWith("/") ||
    storagePath.includes("\\") ||
    storagePath.includes("://")
  ) {
    return false;
  }

  const segments = storagePath.split("/");

  return (
    segments.length >= 4 &&
    segments[0] === userId &&
    segments.every((segment) => segment.length > 0 && segment !== "..")
  );
}

function isAllowedImageMimeType(type: string): type is AllowedImageMimeType {
  return Object.hasOwn(allowedImageTypes, type);
}

function getFileExtension(filename: string) {
  const extension = filename.split(".").at(-1)?.toLowerCase() ?? "";
  return extension === filename.toLowerCase() ? "" : extension;
}

function titleFromFilename(filename: string) {
  const extension = getFileExtension(filename);
  const name = extension
    ? filename.slice(0, -(extension.length + 1))
    : filename;
  const title = name.replace(/[-_]+/g, " ").trim();

  return title.length > 0 ? title : null;
}
