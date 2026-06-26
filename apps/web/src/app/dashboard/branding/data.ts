import type { Tables } from "@streamos/database";
import {
  BRANDING_DASHBOARD_ASSET_LIMIT,
  type BrandingDashboardAsset,
  type BrandingDashboardLookupIssue,
} from "@streamos/types";
import {
  buildBrandingDashboardModel,
  createEmptyBrandingDashboardModel,
  type BrandingDashboardModel,
} from "@/components/modules/BrandingDashboardConsole.utils";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

type BrandAssetRow = Omit<
  Pick<
    Tables<"brand_assets">,
    | "asset_type"
    | "channel_id"
    | "created_at"
    | "description"
    | "id"
    | "name"
    | "status"
    | "storage_bucket"
    | "storage_path"
    | "updated_at"
  >,
  "asset_type" | "status"
> & {
  asset_type: string;
  status: string;
};

type ChannelRow = Pick<Tables<"channels">, "display_name" | "id" | "platform">;

export async function getBrandingDashboardData(): Promise<BrandingDashboardModel> {
  if (!isSupabaseConfigured()) {
    return createEmptyBrandingDashboardModel(null, "disabled");
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return createEmptyBrandingDashboardModel(
      null,
      userError ? "auth-failed" : "unauthorized",
    );
  }

  const { data, error } = await supabase
    .from("brand_assets")
    .select(
      "asset_type,channel_id,created_at,description,id,name,status,storage_bucket,storage_path,updated_at",
    )
    .eq("user_id", userData.user.id)
    .order("updated_at", { ascending: false })
    .limit(BRANDING_DASHBOARD_ASSET_LIMIT + 1);

  if (error || !data) {
    return createEmptyBrandingDashboardModel(userData.user.id, "load-failed");
  }

  const rows = data as BrandAssetRow[];
  const visibleRows = rows.slice(0, BRANDING_DASHBOARD_ASSET_LIMIT);

  if (visibleRows.length === 0) {
    return createEmptyBrandingDashboardModel(userData.user.id, "ready");
  }

  const { channelsById, issues } = await loadChannels({
    channelIds: uniqueIds(visibleRows.map((row) => row.channel_id)),
    supabase,
    userId: userData.user.id,
  });

  return buildBrandingDashboardModel({
    feed: {
      hasMore: rows.length > BRANDING_DASHBOARD_ASSET_LIMIT,
      limit: BRANDING_DASHBOARD_ASSET_LIMIT,
      returnedCount: visibleRows.length,
    },
    items: visibleRows.map((row) => normalizeBrandAsset(row, channelsById)),
    lookupIssues: issues,
    state: "ready",
    userId: userData.user.id,
  });
}

async function loadChannels({
  channelIds,
  supabase,
  userId,
}: {
  channelIds: string[];
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
}): Promise<{
  channelsById: Map<string, ChannelRow>;
  issues: BrandingDashboardLookupIssue[];
}> {
  if (channelIds.length === 0) {
    return {
      channelsById: new Map(),
      issues: [],
    };
  }

  const { data, error } = await supabase
    .from("channels")
    .select("display_name,id,platform")
    .eq("user_id", userId)
    .in("id", channelIds);

  if (error || !data) {
    return {
      channelsById: new Map(),
      issues: [
        {
          code: "load-failed",
          source: "channels",
        },
      ],
    };
  }

  return {
    channelsById: new Map(
      (data as ChannelRow[]).map((channel) => [channel.id, channel]),
    ),
    issues: [],
  };
}

function normalizeBrandAsset(
  row: BrandAssetRow,
  channelsById: Map<string, ChannelRow>,
): BrandingDashboardAsset {
  const channel =
    row.channel_id !== null ? (channelsById.get(row.channel_id) ?? null) : null;

  return {
    assetType: row.asset_type,
    channelId: row.channel_id,
    createdAt: row.created_at,
    description: row.description,
    id: row.id,
    name: row.name,
    platform: channel?.platform ?? null,
    status: row.status,
    storageState: resolveStorageState(row.storage_bucket, row.storage_path),
    updatedAt: row.updated_at,
    usageContext: channel?.display_name ?? null,
  };
}

function resolveStorageState(
  bucket: string | null,
  path: string | null,
): BrandingDashboardAsset["storageState"] {
  if (!bucket && !path) {
    return "none";
  }

  if (
    bucket === "brand-assets" &&
    typeof path === "string" &&
    path.length > 0
  ) {
    return "attached";
  }

  return "incomplete";
}

function uniqueIds(values: Array<string | null>): string[] {
  return [
    ...new Set(values.filter((value): value is string => value !== null)),
  ];
}
