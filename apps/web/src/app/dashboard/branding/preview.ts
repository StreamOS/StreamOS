import {
  BRANDING_DASHBOARD_PREVIEW_TTL_SECONDS,
  type BrandingDashboardPreviewCapabilityStatus,
  type BrandingDashboardPreview,
  type BrandingDashboardUploadMetadata,
} from "@streamos/types";
import type {
  BRANDING_DASHBOARD_UPLOAD_ALLOWED_EXTENSIONS,
  BRANDING_DASHBOARD_UPLOAD_ALLOWED_MIME_TYPES,
} from "@streamos/types";
import type { createClient } from "@/lib/supabase/server";
import {
  BRAND_ASSET_STORAGE_BUCKET,
  isPreviewableBrandingAssetPath,
  isTenantScopedBrandingStoragePath,
} from "./storage";

type BrandingPreviewStorageClient = Pick<
  Awaited<ReturnType<typeof createClient>>,
  "storage"
>;

export async function createBrandingAssetPreview({
  client,
  storageBucket,
  storagePath,
  ttlSeconds = BRANDING_DASHBOARD_PREVIEW_TTL_SECONDS,
  uploadMetadata,
  userId,
}: {
  client: BrandingPreviewStorageClient;
  storageBucket: string | null;
  storagePath: string | null;
  ttlSeconds?: number;
  uploadMetadata: BrandingDashboardUploadMetadata;
  userId: string;
}): Promise<BrandingDashboardPreview> {
  const previewCapabilityStatus = resolveBrandingAssetPreviewCapability({
    storageBucket,
    storagePath,
    uploadMetadata,
    userId,
  });

  if (previewCapabilityStatus !== "previewable") {
    return createUnavailablePreviewFromCapability(previewCapabilityStatus);
  }

  try {
    const { data, error } = await client.storage
      .from(BRAND_ASSET_STORAGE_BUCKET)
      .createSignedUrl(storagePath as string, ttlSeconds);

    if (error || !data?.signedUrl) {
      return {
        expiresAt: null,
        reason: "signing_failed",
        status: "failed",
        url: null,
      };
    }

    return {
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      reason: null,
      status: "available",
      url: data.signedUrl,
    };
  } catch {
    return {
      expiresAt: null,
      reason: "signing_failed",
      status: "failed",
      url: null,
    };
  }
}

export function resolveBrandingAssetPreviewCapability({
  storageBucket,
  storagePath,
  uploadMetadata,
  userId,
}: {
  storageBucket: string | null;
  storagePath: string | null;
  uploadMetadata: BrandingDashboardUploadMetadata;
  userId: string;
}): BrandingDashboardPreviewCapabilityStatus {
  const storage = parsePreviewStorage({
    storageBucket,
    storagePath,
    userId,
  });

  if (!storage.ok) {
    return storage.reason;
  }

  return isPreviewableBrandingAsset({
    storagePath: storage.path,
    uploadMetadata,
  })
    ? "previewable"
    : "unsupported";
}

function createUnavailablePreviewFromCapability(
  previewCapabilityStatus: Exclude<
    BrandingDashboardPreviewCapabilityStatus,
    "previewable"
  >,
): BrandingDashboardPreview {
  switch (previewCapabilityStatus) {
    case "missing_storage":
      return {
        expiresAt: null,
        reason: "missing_storage",
        status: "unavailable",
        url: null,
      };
    case "invalid_storage":
      return {
        expiresAt: null,
        reason: "invalid_storage_metadata",
        status: "unavailable",
        url: null,
      };
    case "unsupported":
      return {
        expiresAt: null,
        reason: "unsupported_file_type",
        status: "unsupported",
        url: null,
      };
  }
}

function parsePreviewStorage({
  storageBucket,
  storagePath,
  userId,
}: {
  storageBucket: string | null;
  storagePath: string | null;
  userId: string;
}):
  | {
      bucket: typeof BRAND_ASSET_STORAGE_BUCKET;
      ok: true;
      path: string;
    }
  | {
      ok: false;
      reason: "invalid_storage" | "missing_storage";
    } {
  if (!storageBucket && !storagePath) {
    return {
      ok: false,
      reason: "missing_storage",
    };
  }

  if (storageBucket !== BRAND_ASSET_STORAGE_BUCKET || !storagePath) {
    return {
      ok: false,
      reason: "invalid_storage",
    };
  }

  if (!isTenantScopedBrandingStoragePath(storagePath, userId)) {
    return {
      ok: false,
      reason: "invalid_storage",
    };
  }

  return {
    bucket: BRAND_ASSET_STORAGE_BUCKET,
    ok: true,
    path: storagePath,
  };
}

const PREVIEWABLE_MIME_EXTENSION_MAP: Record<
  (typeof BRANDING_DASHBOARD_UPLOAD_ALLOWED_MIME_TYPES)[number],
  ReadonlyArray<(typeof BRANDING_DASHBOARD_UPLOAD_ALLOWED_EXTENSIONS)[number]>
> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
};

function isPreviewableBrandingAsset({
  storagePath,
  uploadMetadata,
}: {
  storagePath: string;
  uploadMetadata: BrandingDashboardUploadMetadata;
}): boolean {
  if (!isPreviewableBrandingAssetPath(storagePath)) {
    return false;
  }

  const pathExtension = readStoragePathExtension(storagePath);

  if (pathExtension === null) {
    return false;
  }

  if (uploadMetadata.status === "available") {
    return isSupportedMetadataPreviewCombination({
      contentType: uploadMetadata.contentType,
      fileExtension: uploadMetadata.fileExtension,
      pathExtension,
    });
  }

  if (uploadMetadata.status === "invalid") {
    return false;
  }

  return true;
}

function isSupportedMetadataPreviewCombination({
  contentType,
  fileExtension,
  pathExtension,
}: {
  contentType: string | null;
  fileExtension: string | null;
  pathExtension: string;
}): boolean {
  if (!contentType || !fileExtension) {
    return false;
  }

  const normalizedContentType = contentType.toLowerCase();

  if (!Object.hasOwn(PREVIEWABLE_MIME_EXTENSION_MAP, normalizedContentType)) {
    return false;
  }

  const normalizedExtension = fileExtension.toLowerCase();

  return (
    normalizedExtension === pathExtension &&
    PREVIEWABLE_MIME_EXTENSION_MAP[
      normalizedContentType as keyof typeof PREVIEWABLE_MIME_EXTENSION_MAP
    ].includes(normalizedExtension as never)
  );
}

function readStoragePathExtension(storagePath: string): string | null {
  const basename = storagePath.split("/").at(-1)?.trim() ?? "";
  const extension = basename.split(".").at(-1)?.toLowerCase() ?? "";

  if (!extension || extension === basename.toLowerCase()) {
    return null;
  }

  return extension;
}
