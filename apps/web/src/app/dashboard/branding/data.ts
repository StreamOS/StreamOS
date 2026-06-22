import type { BrandAssetRow } from "./brand-kit";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

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
      "asset_type,config,created_at,description,id,metadata,name,status,updated_at",
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

  const assets = (data ?? []) as BrandAssetRow[];

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
