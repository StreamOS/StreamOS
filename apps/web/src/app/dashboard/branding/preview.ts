import {
  BRANDING_DASHBOARD_PREVIEW_TTL_SECONDS,
  type BrandingDashboardPreview,
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

  if (!isPreviewableBrandingAssetPath(storage.path)) {
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

  if (!isTenantScopedBrandingStoragePath(storagePath, userId)) {
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
