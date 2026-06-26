import type { Tables } from "@streamos/database";
import {
  BRANDING_DASHBOARD_ASSET_LIMIT,
  type BrandingDashboardAsset,
  type BrandingDashboardFeedMetadata,
  type BrandingDashboardLookupIssue,
  type BrandingDashboardPreview,
  type BrandingDashboardUploadMetadata,
} from "@streamos/types";
import {
  buildBrandingDashboardModel,
  createEmptyBrandingDashboardModel,
  type BrandingDashboardModel,
} from "@/components/modules/BrandingDashboardConsole.utils";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { createBrandingAssetPreview } from "./preview";

type BrandAssetRow = Omit<
  Pick<
    Tables<"brand_assets">,
    | "asset_type"
    | "channel_id"
    | "created_at"
    | "description"
    | "id"
    | "metadata"
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
type BrandingDashboardBaseAsset = Omit<BrandingDashboardAsset, "futureActions">;

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
      "asset_type,channel_id,created_at,description,id,metadata,name,status,storage_bucket,storage_path,updated_at",
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
  const previewsByAssetId = new Map(
    await Promise.all(
      visibleRows.map(
        async (row) =>
          [
            row.id,
            await createBrandingAssetPreview({
              client: supabase,
              storageBucket: row.storage_bucket,
              storagePath: row.storage_path,
              uploadMetadata: parseBrandAssetUploadMetadata(row.metadata),
              userId: userData.user.id,
            }),
          ] as const,
      ),
    ),
  );

  return buildBrandingDashboardModel({
    feed: buildBrandingDashboardFeedMetadata(visibleRows, rows.length),
    items: visibleRows.map((row) =>
      normalizeBrandAsset(
        row,
        channelsById,
        previewsByAssetId.get(row.id) ?? {
          expiresAt: null,
          reason: "signing_failed",
          status: "failed",
          url: null,
        },
      ),
    ),
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

function buildBrandingDashboardFeedMetadata(
  visibleRows: BrandAssetRow[],
  totalFetchedRowCount: number,
): BrandingDashboardFeedMetadata {
  const hasMore = totalFetchedRowCount > BRANDING_DASHBOARD_ASSET_LIMIT;
  const lastVisibleRow = visibleRows.at(-1) ?? null;

  return {
    hasMore,
    limit: BRANDING_DASHBOARD_ASSET_LIMIT,
    nextCursor:
      hasMore && lastVisibleRow
        ? {
            id: lastVisibleRow.id,
            updatedAt: lastVisibleRow.updated_at,
          }
        : null,
    returnedCount: visibleRows.length,
    scope: hasMore ? "loaded_sample" : "full_result",
    serverSort: "updated_desc" as const,
  };
}

function normalizeBrandAsset(
  row: BrandAssetRow,
  channelsById: Map<string, ChannelRow>,
  preview: BrandingDashboardPreview,
): BrandingDashboardBaseAsset {
  const channel =
    row.channel_id !== null ? (channelsById.get(row.channel_id) ?? null) : null;
  const uploadMetadata = parseBrandAssetUploadMetadata(row.metadata);

  return {
    assetType: row.asset_type,
    channelId: row.channel_id,
    createdAt: row.created_at,
    description: row.description,
    id: row.id,
    name: row.name,
    platform: channel?.platform ?? null,
    preview,
    status: row.status,
    storageState: resolveStorageState(row.storage_bucket, row.storage_path),
    uploadMetadata,
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

function parseBrandAssetUploadMetadata(
  metadata: Tables<"brand_assets">["metadata"],
): BrandingDashboardUploadMetadata {
  if (!isPlainObject(metadata)) {
    return createUnavailableUploadMetadata();
  }

  if (!Object.hasOwn(metadata, "upload")) {
    return createUnavailableUploadMetadata();
  }

  const upload = metadata.upload;

  if (!isPlainObject(upload)) {
    return createInvalidUploadMetadata();
  }

  let hasInvalidField = false;
  let hasMissingField = false;

  const contentType = readOptionalUploadString(upload, "content_type");
  if (contentType === INVALID_UPLOAD_STRING) {
    hasInvalidField = true;
  } else if (contentType === null) {
    hasMissingField = true;
  }

  const fileExtension = readOptionalUploadString(upload, "file_extension");
  if (fileExtension === INVALID_UPLOAD_STRING) {
    hasInvalidField = true;
  } else if (fileExtension === null) {
    hasMissingField = true;
  }

  const fileSizeBytes = readOptionalUploadFileSize(upload, "file_size_bytes");
  if (fileSizeBytes === INVALID_UPLOAD_NUMBER) {
    hasInvalidField = true;
  } else if (fileSizeBytes === null) {
    hasMissingField = true;
  }

  const storedFilename = readOptionalUploadStoredFilename(
    upload,
    "stored_filename",
  );
  if (storedFilename === INVALID_UPLOAD_STRING) {
    hasInvalidField = true;
  } else if (storedFilename === null) {
    hasMissingField = true;
  }

  if (hasInvalidField) {
    return {
      contentType: normalizeUploadString(contentType),
      fileExtension: normalizeUploadExtension(fileExtension),
      fileSizeBytes: normalizeUploadFileSize(fileSizeBytes),
      status: "invalid",
      storedFilename: normalizeUploadString(storedFilename),
    };
  }

  if (hasMissingField) {
    return {
      contentType: normalizeUploadString(contentType),
      fileExtension: normalizeUploadExtension(fileExtension),
      fileSizeBytes: normalizeUploadFileSize(fileSizeBytes),
      status: "unavailable",
      storedFilename: normalizeUploadString(storedFilename),
    };
  }

  return {
    contentType: normalizeUploadString(contentType),
    fileExtension: normalizeUploadExtension(fileExtension),
    fileSizeBytes: normalizeUploadFileSize(fileSizeBytes),
    status: "available",
    storedFilename: normalizeUploadString(storedFilename),
  };
}

const INVALID_UPLOAD_STRING = Symbol("invalid-upload-string");
const INVALID_UPLOAD_NUMBER = Symbol("invalid-upload-number");

function createUnavailableUploadMetadata(): BrandingDashboardUploadMetadata {
  return {
    contentType: null,
    fileExtension: null,
    fileSizeBytes: null,
    status: "unavailable",
    storedFilename: null,
  };
}

function createInvalidUploadMetadata(): BrandingDashboardUploadMetadata {
  return {
    contentType: null,
    fileExtension: null,
    fileSizeBytes: null,
    status: "invalid",
    storedFilename: null,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOptionalUploadString(
  value: Record<string, unknown>,
  key: string,
): string | null | typeof INVALID_UPLOAD_STRING {
  if (!Object.hasOwn(value, key) || value[key] == null) {
    return null;
  }

  if (typeof value[key] !== "string") {
    return INVALID_UPLOAD_STRING;
  }

  const normalized = value[key].trim();
  return normalized.length > 0 ? normalized : INVALID_UPLOAD_STRING;
}

function readOptionalUploadFileSize(
  value: Record<string, unknown>,
  key: string,
): number | null | typeof INVALID_UPLOAD_NUMBER {
  if (!Object.hasOwn(value, key) || value[key] == null) {
    return null;
  }

  if (
    typeof value[key] !== "number" ||
    !Number.isSafeInteger(value[key]) ||
    value[key] <= 0
  ) {
    return INVALID_UPLOAD_NUMBER;
  }

  return value[key];
}

function readOptionalUploadStoredFilename(
  value: Record<string, unknown>,
  key: string,
): string | null | typeof INVALID_UPLOAD_STRING {
  const rawValue = readOptionalUploadString(value, key);

  if (rawValue === null || rawValue === INVALID_UPLOAD_STRING) {
    return rawValue;
  }

  if (
    rawValue.includes("/") ||
    rawValue.includes("\\") ||
    rawValue.includes("://") ||
    rawValue.includes("?") ||
    rawValue.includes("#")
  ) {
    return INVALID_UPLOAD_STRING;
  }

  return rawValue;
}

function normalizeUploadString(
  value: string | null | typeof INVALID_UPLOAD_STRING,
): string | null {
  return value === INVALID_UPLOAD_STRING ? null : value;
}

function normalizeUploadExtension(
  value: string | null | typeof INVALID_UPLOAD_STRING,
): string | null {
  return value === INVALID_UPLOAD_STRING || value === null
    ? null
    : value.toLowerCase();
}

function normalizeUploadFileSize(
  value: number | null | typeof INVALID_UPLOAD_NUMBER,
): number | null {
  return value === INVALID_UPLOAD_NUMBER ? null : value;
}
