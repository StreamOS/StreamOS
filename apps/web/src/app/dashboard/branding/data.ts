import type { Tables } from "@streamos/database";
import type { BrandAssetRow } from "./brand-kit";
import { createBrandAssetSignedPreviewUrl } from "./brand-asset-storage";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

type StoredBrandAssetRow = Pick<
  Tables<"brand_assets">,
  | "asset_type"
  | "config"
  | "created_at"
  | "description"
  | "id"
  | "metadata"
  | "name"
  | "status"
  | "storage_bucket"
  | "storage_path"
  | "updated_at"
>;

export type BrandKitDashboardData = {
  activeAssets: number;
  archivedAssets: number;
  assets: BrandAssetRow[];
  draftAssets: number;
  error: "load-failed" | null;
  totalAssets: number;
  userId: string | null;
};

export async function getBrandKitDashboardData(): Promise<BrandKitDashboardData> {
  if (!isSupabaseConfigured()) {
    return createEmptyDashboardData(null);
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return createEmptyDashboardData(null);
  }

  const { data, error } = await supabase
    .from("brand_assets")
    .select(
      "asset_type,config,created_at,description,id,metadata,name,status,storage_bucket,storage_path,updated_at",
    )
    .eq("user_id", userData.user.id)
    .order("updated_at", { ascending: false })
    .limit(24);

  if (error) {
    return {
      ...createEmptyDashboardData(userData.user.id),
      error: "load-failed",
    };
  }

  const rows = (data ?? []) as StoredBrandAssetRow[];
  const assets = await Promise.all(
    rows.map(async (asset) => {
      const { storage_bucket, storage_path, ...brandAsset } = asset;
      const preview = await createBrandAssetSignedPreviewUrl({
        client: supabase,
        storageBucket: storage_bucket,
        storagePath: storage_path,
        userId: userData.user.id,
      });

      return {
        ...brandAsset,
        hasStoredFile:
          preview.previewStatus === "available" ||
          preview.previewStatus === "storage_error",
        previewStatus: preview.previewStatus,
        previewUrl: preview.previewUrl,
      } satisfies BrandAssetRow;
    }),
  );

  return {
    activeAssets: assets.filter((asset) => asset.status === "active").length,
    archivedAssets: assets.filter((asset) => asset.status === "archived")
      .length,
    assets,
    draftAssets: assets.filter((asset) => asset.status === "draft").length,
    error: null,
    totalAssets: assets.length,
    userId: userData.user.id,
  };
}

function createEmptyDashboardData(
  userId: string | null,
): BrandKitDashboardData {
  return {
    activeAssets: 0,
    archivedAssets: 0,
    assets: [],
    draftAssets: 0,
    error: null,
    totalAssets: 0,
    userId,
  };
}
