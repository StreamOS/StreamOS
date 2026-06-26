import { z } from "zod";
import {
  BRANDING_DASHBOARD_UPLOAD_ALLOWED_EXTENSIONS,
  BRANDING_DASHBOARD_UPLOAD_ALLOWED_MIME_TYPES,
  BRANDING_DASHBOARD_UPLOAD_MAX_FILE_SIZE_BYTES,
  type BrandAssetType,
} from "@streamos/types";

export const BRAND_ASSET_STORAGE_BUCKET = "brand-assets";
export const BRANDING_ASSET_TYPE_VALUES = [
  "overlay",
  "alert",
  "logo",
  "banner",
  "panel",
  "emote",
  "color_palette",
  "typography",
  "scene",
] as const satisfies readonly BrandAssetType[];

const BLOCKED_EXTENSIONS = new Set(["svg"]);
const ALLOWED_EXTENSION_SET = new Set(
  BRANDING_DASHBOARD_UPLOAD_ALLOWED_EXTENSIONS,
);
const ALLOWED_MIME_TYPE_SET = new Set(
  BRANDING_DASHBOARD_UPLOAD_ALLOWED_MIME_TYPES,
);
const MIME_EXTENSION_MAP: Record<
  (typeof BRANDING_DASHBOARD_UPLOAD_ALLOWED_MIME_TYPES)[number],
  ReadonlyArray<(typeof BRANDING_DASHBOARD_UPLOAD_ALLOWED_EXTENSIONS)[number]>
> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
};

type BrandingUploadValues = {
  assetId: string;
  assetType: BrandAssetType;
  description: string | null;
  file: File;
  fileExtension: (typeof BRANDING_DASHBOARD_UPLOAD_ALLOWED_EXTENSIONS)[number];
  name: string;
  storedFilename: string;
};

export type BrandingUploadParseResult =
  | {
      error:
        | "brand-asset-file-extension-mismatch"
        | "brand-asset-file-extension-missing"
        | "brand-asset-file-required"
        | "brand-asset-file-too-large"
        | "brand-asset-file-type-missing"
        | "brand-asset-file-type-not-supported"
        | "brand-asset-svg-not-supported"
        | "invalid-brand-asset-form";
      ok: false;
    }
  | {
      ok: true;
      values: BrandingUploadValues;
    };

const uploadFormSchema = z.object({
  assetType: z.enum(BRANDING_ASSET_TYPE_VALUES),
  description: z.string().trim().max(1000).optional(),
  id: z.string().uuid(),
  name: z.string().trim().max(160).optional(),
});

export function parseBrandingAssetUploadFormData(
  formData: FormData,
  createAssetId: () => string,
): BrandingUploadParseResult {
  const file = formData.get("assetFile");

  if (!(file instanceof File) || file.size === 0) {
    return {
      error: "brand-asset-file-required",
      ok: false,
    };
  }

  if (file.size > BRANDING_DASHBOARD_UPLOAD_MAX_FILE_SIZE_BYTES) {
    return {
      error: "brand-asset-file-too-large",
      ok: false,
    };
  }

  if (!file.type) {
    return {
      error: "brand-asset-file-type-missing",
      ok: false,
    };
  }

  const extension = readFileExtension(file.name);

  if (!extension) {
    return {
      error: "brand-asset-file-extension-missing",
      ok: false,
    };
  }

  if (BLOCKED_EXTENSIONS.has(extension)) {
    return {
      error: "brand-asset-svg-not-supported",
      ok: false,
    };
  }

  if (!ALLOWED_MIME_TYPE_SET.has(file.type as never)) {
    return {
      error: "brand-asset-file-type-not-supported",
      ok: false,
    };
  }

  if (!ALLOWED_EXTENSION_SET.has(extension as never)) {
    return {
      error: "brand-asset-file-type-not-supported",
      ok: false,
    };
  }

  if (
    !MIME_EXTENSION_MAP[file.type as keyof typeof MIME_EXTENSION_MAP].includes(
      extension as never,
    )
  ) {
    return {
      error: "brand-asset-file-extension-mismatch",
      ok: false,
    };
  }

  const storedFilename = sanitizeBrandingAssetFilename(file.name);

  if (!storedFilename) {
    return {
      error: "brand-asset-file-extension-missing",
      ok: false,
    };
  }

  const parsed = uploadFormSchema.safeParse({
    assetType: String(formData.get("assetType") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    id: createAssetId(),
    name: String(formData.get("name") ?? "").trim() || undefined,
  });

  if (!parsed.success) {
    return {
      error: "invalid-brand-asset-form",
      ok: false,
    };
  }

  return {
    ok: true,
    values: {
      assetId: parsed.data.id,
      assetType: parsed.data.assetType,
      description: parsed.data.description || null,
      file,
      fileExtension:
        extension as (typeof BRANDING_DASHBOARD_UPLOAD_ALLOWED_EXTENSIONS)[number],
      name:
        parsed.data.name ?? titleFromFilename(storedFilename) ?? "Brand Asset",
      storedFilename,
    },
  };
}

export function buildBrandingAssetStoragePath({
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

export function isTenantScopedBrandingStoragePath(
  storagePath: string,
  userId: string,
): boolean {
  if (
    storagePath.startsWith("/") ||
    storagePath.includes("\\") ||
    storagePath.includes("://") ||
    storagePath.includes("?") ||
    storagePath.includes("#")
  ) {
    return false;
  }

  const segments = storagePath.split("/");

  return (
    segments.length >= 4 &&
    segments[0] === userId &&
    segments.every(
      (segment) => segment.length > 0 && segment !== "." && segment !== "..",
    )
  );
}

export function isPreviewableBrandingAssetPath(storagePath: string): boolean {
  const extension = readFileExtension(storagePath);

  return (
    extension !== null &&
    !BLOCKED_EXTENSIONS.has(extension) &&
    ALLOWED_EXTENSION_SET.has(extension as never)
  );
}

function sanitizeBrandingAssetFilename(filename: string): string | null {
  const normalized = filename.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const basename =
    normalized
      .split(/[/\\]+/)
      .at(-1)
      ?.trim() ?? "";
  const extension = readFileExtension(basename);

  if (!extension || !ALLOWED_EXTENSION_SET.has(extension as never)) {
    return null;
  }

  const nameWithoutExtension = basename.slice(0, -(extension.length + 1));
  const safeName = nameWithoutExtension
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/[._-]{2,}/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 80);

  if (!safeName) {
    return null;
  }

  return `${safeName}.${extension}`;
}

function readFileExtension(filename: string): string | null {
  const basename =
    filename
      .split(/[/\\]+/)
      .at(-1)
      ?.trim() ?? "";
  const extension = basename.split(".").at(-1)?.toLowerCase() ?? "";

  if (!extension || extension === basename.toLowerCase()) {
    return null;
  }

  return extension;
}

function titleFromFilename(filename: string): string | null {
  const extension = filename.split(".").at(-1)?.toLowerCase() ?? "";
  const name =
    extension && filename.toLowerCase() !== extension
      ? filename.slice(0, -(extension.length + 1))
      : filename;
  const title = name.replace(/[-_]+/g, " ").trim();

  return title.length > 0 ? title : null;
}
