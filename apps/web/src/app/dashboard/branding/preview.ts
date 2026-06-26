import {
  BRANDING_DASHBOARD_PREVIEW_TTL_SECONDS,
  type BrandingDashboardPreview,
} from "@streamos/types";
import { createClient } from "@/lib/supabase/server";

const BRAND_ASSET_STORAGE_BUCKET = "brand-assets";
const PREVIEWABLE_IMAGE_EXTENSIONS = new Set(["jpeg", "jpg", "png", "webp"]);
const BLOCKED_IMAGE_EXTENSIONS = new Set(["svg"]);

type BrandingPreviewStorageClient = Pick<
  Awaited<ReturnType<typeof createClient>>,
  "storage"
>;

export async function createBrandingAssetPreview({
  client,
  storageBucket,
  storagePath,
  ttlSeconds = BRANDING_DASHBOARD_PREVIEW_TTL_SECONDS,
  userId,
}: {
  client: BrandingPreviewStorageClient;
  storageBucket: string | null;
  storagePath: string | null;
  ttlSeconds?: number;
  userId: string;
}): Promise<BrandingDashboardPreview> {
  const storage = parsePreviewStorage({
    storageBucket,
    storagePath,
    userId,
  });

  if (!storage.ok) {
    return {
      expiresAt: null,
      reason: storage.reason,
      status: "unavailable",
      url: null,
    };
  }

  if (!isPreviewableImagePath(storage.path)) {
    return {
      expiresAt: null,
      reason: "unsupported_file_type",
      status: "unsupported",
      url: null,
    };
  }

  try {
    const { data, error } = await client.storage
      .from(storage.bucket)
      .createSignedUrl(storage.path, ttlSeconds);

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
      reason: "invalid_storage_metadata" | "missing_storage";
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
      reason: "invalid_storage_metadata",
    };
  }

  if (!isTenantScopedStoragePath(storagePath, userId)) {
    return {
      ok: false,
      reason: "invalid_storage_metadata",
    };
  }

  return {
    bucket: BRAND_ASSET_STORAGE_BUCKET,
    ok: true,
    path: storagePath,
  };
}

function isTenantScopedStoragePath(
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

function isPreviewableImagePath(storagePath: string): boolean {
  const extension = storagePath.split(".").at(-1)?.toLowerCase() ?? "";

  if (!extension || BLOCKED_IMAGE_EXTENSIONS.has(extension)) {
    return false;
  }

  return PREVIEWABLE_IMAGE_EXTENSIONS.has(extension);
}
