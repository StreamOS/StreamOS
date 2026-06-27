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

type BrandingReplaceValues = {
  assetId: string;
  file: File;
  fileExtension: (typeof BRANDING_DASHBOARD_UPLOAD_ALLOWED_EXTENSIONS)[number];
  storedFilename: string;
};

export type BrandingUploadMetadata = {
  content_type: string;
  file_extension: (typeof BRANDING_DASHBOARD_UPLOAD_ALLOWED_EXTENSIONS)[number];
  file_size_bytes: number;
  stored_filename: string;
};

type BrandingParsedFile = {
  file: File;
  fileExtension: (typeof BRANDING_DASHBOARD_UPLOAD_ALLOWED_EXTENSIONS)[number];
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

export type BrandingReplaceParseResult =
  | {
      error:
        | "brand-asset-file-extension-mismatch"
        | "brand-asset-file-extension-missing"
        | "brand-asset-file-required"
        | "brand-asset-file-too-large"
        | "brand-asset-file-type-missing"
        | "brand-asset-file-type-not-supported"
        | "brand-asset-replace-target-invalid"
        | "brand-asset-svg-not-supported";
      ok: false;
    }
  | {
      ok: true;
      values: BrandingReplaceValues;
    };

const uploadFormSchema = z.object({
  assetType: z.enum(BRANDING_ASSET_TYPE_VALUES),
  description: z.string().trim().max(1000).optional(),
  id: z.string().uuid(),
  name: z.string().trim().max(160).optional(),
});

const replaceFormSchema = z.object({
  assetId: z.string().trim().min(1),
});

export async function parseBrandingAssetUploadFormData(
  formData: FormData,
  createAssetId: () => string,
): Promise<BrandingUploadParseResult> {
  const parsedFile = await parseBrandingAssetFile(formData);

  if (!parsedFile.ok) {
    return parsedFile;
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
      file: parsedFile.values.file,
      fileExtension: parsedFile.values.fileExtension,
      name:
        parsed.data.name ??
        titleFromFilename(parsedFile.values.storedFilename) ??
        "Brand Asset",
      storedFilename: parsedFile.values.storedFilename,
    },
  };
}

export async function parseBrandingAssetReplaceFormData(
  formData: FormData,
): Promise<BrandingReplaceParseResult> {
  const parsedFile = await parseBrandingAssetFile(formData);

  if (!parsedFile.ok) {
    return parsedFile;
  }

  const parsed = replaceFormSchema.safeParse({
    assetId: String(formData.get("assetId") ?? "").trim(),
  });

  if (!parsed.success) {
    return {
      error: "brand-asset-replace-target-invalid",
      ok: false,
    };
  }

  return {
    ok: true,
    values: {
      assetId: parsed.data.assetId,
      file: parsedFile.values.file,
      fileExtension: parsedFile.values.fileExtension,
      storedFilename: parsedFile.values.storedFilename,
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

export function buildBrandingAssetReplacementStoragePath({
  assetId,
  assetType,
  filename,
  replacementId,
  userId,
}: {
  assetId: string;
  assetType: BrandAssetType;
  filename: string;
  replacementId: string;
  userId: string;
}) {
  return `${userId}/${assetType}/${assetId}/replacements/${replacementId}-${filename}`;
}

export function buildBrandingAssetUploadMetadata({
  file,
  fileExtension,
  storedFilename,
}: {
  file: File;
  fileExtension: (typeof BRANDING_DASHBOARD_UPLOAD_ALLOWED_EXTENSIONS)[number];
  storedFilename: string;
}): BrandingUploadMetadata {
  return {
    content_type: file.type,
    file_extension: fileExtension,
    file_size_bytes: file.size,
    stored_filename: storedFilename,
  };
}

export function mergeBrandingAssetMetadataWithUpload(
  metadata: unknown,
  uploadMetadata: BrandingUploadMetadata,
): Record<string, unknown> {
  const baseMetadata = isPlainObject(metadata) ? { ...metadata } : {};
  return {
    ...baseMetadata,
    upload: uploadMetadata,
  };
}

async function parseBrandingAssetFile(formData: FormData): Promise<
  | { ok: true; values: BrandingParsedFile }
  | {
      error:
        | "brand-asset-file-extension-mismatch"
        | "brand-asset-file-extension-missing"
        | "brand-asset-file-required"
        | "brand-asset-file-too-large"
        | "brand-asset-file-type-missing"
        | "brand-asset-file-type-not-supported"
        | "brand-asset-svg-not-supported";
      ok: false;
    }
> {
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

  const matchesFileSignature = await fileMatchesAllowedSignature(
    file,
    file.type as keyof typeof MIME_EXTENSION_MAP,
  );

  if (!matchesFileSignature) {
    return {
      error: "brand-asset-file-type-not-supported",
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

  return {
    ok: true,
    values: {
      file,
      fileExtension:
        extension as (typeof BRANDING_DASHBOARD_UPLOAD_ALLOWED_EXTENSIONS)[number],
      storedFilename,
    },
  };
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

async function fileMatchesAllowedSignature(
  file: File,
  mimeType: keyof typeof MIME_EXTENSION_MAP,
): Promise<boolean> {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());

  switch (mimeType) {
    case "image/png":
      return matchesPngSignature(bytes);
    case "image/jpeg":
      return matchesJpegSignature(bytes);
    case "image/webp":
      return matchesWebpSignature(bytes);
    default:
      return false;
  }
}

function matchesPngSignature(bytes: Uint8Array): boolean {
  return hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

function matchesJpegSignature(bytes: Uint8Array): boolean {
  return hasPrefix(bytes, [0xff, 0xd8, 0xff]);
}

function matchesWebpSignature(bytes: Uint8Array): boolean {
  return (
    hasPrefix(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes.length >= 12 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

function hasPrefix(bytes: Uint8Array, expected: number[]): boolean {
  return (
    bytes.length >= expected.length &&
    expected.every((byte, index) => bytes[index] === byte)
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
