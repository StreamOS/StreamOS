import type { Tables } from "@streamos/database";
import {
  BRANDING_DASHBOARD_ASSET_LIMIT,
  BRANDING_DASHBOARD_FEED_FILTER_OWNERSHIP,
  type BrandAssetStatus,
  type BrandAssetType,
  type BrandingDashboardAsset,
  type BrandingDashboardFeedCursor,
  type BrandingDashboardFeedServerFilters,
  type BrandingDashboardFeedServerSort,
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

const BRANDING_DASHBOARD_DEFAULT_SERVER_SORT = "updated_desc";
const BRANDING_DASHBOARD_MAX_WINDOWS = 5;

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
    | "preview_capability_status"
    | "status"
    | "storage_bucket"
    | "storage_path"
    | "upload_metadata_status"
    | "updated_at"
  >,
  "asset_type" | "status"
> & {
  asset_type: string;
  status: string;
};
type BrandingDashboardBaseAsset = Omit<BrandingDashboardAsset, "futureActions">;

type ChannelRow = Pick<Tables<"channels">, "display_name" | "id" | "platform">;
type BrandingDashboardServerQuery = {
  assetType: BrandAssetType | null;
  sort: BrandingDashboardFeedServerSort;
  status: BrandAssetStatus | null;
};

export async function getBrandingDashboardData({
  assetType = null,
  cursor = null,
  cursorServerFilters = null,
  cursorServerSort = null,
  serverSort = BRANDING_DASHBOARD_DEFAULT_SERVER_SORT,
  status = null,
  windowCount = 1,
}: {
  assetType?: string | null;
  cursor?: BrandingDashboardFeedCursor | null;
  cursorServerFilters?: BrandingDashboardFeedServerFilters | null;
  cursorServerSort?: BrandingDashboardFeedServerSort | null;
  serverSort?: BrandingDashboardFeedServerSort;
  status?: string | null;
  windowCount?: number;
} = {}): Promise<BrandingDashboardModel> {
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

  const loadedWindows = await loadBrandingAssetWindows({
    cursorServerFilters,
    cursor,
    cursorServerSort,
    query: {
      assetType: assetType as BrandAssetType | null,
      sort: serverSort,
      status: status as BrandAssetStatus | null,
    },
    supabase,
    userId: userData.user.id,
    windowCount,
  });

  if (loadedWindows.state === "load-failed") {
    return createEmptyBrandingDashboardModel(userData.user.id, "load-failed");
  }

  const visibleRows = loadedWindows.items;

  if (visibleRows.length === 0) {
    return createEmptyBrandingDashboardModel(userData.user.id, "ready", [], {
      serverFilters: buildBrandingServerFilters({
        assetType: assetType as BrandAssetType | null,
        sort: serverSort,
        status: status as BrandAssetStatus | null,
      }),
      serverSort,
    });
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
    feed: buildBrandingDashboardFeedMetadata({
      hasMore: loadedWindows.hasMore,
      lastVisibleRow: loadedWindows.lastVisibleRow,
      loadedCount: visibleRows.length,
      query: loadedWindows.query,
    }),
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

async function loadBrandingAssetWindows({
  cursorServerFilters,
  cursor,
  cursorServerSort,
  query,
  supabase,
  userId,
  windowCount,
}: {
  cursorServerFilters: BrandingDashboardFeedServerFilters | null;
  cursor: BrandingDashboardFeedCursor | null;
  cursorServerSort: BrandingDashboardFeedServerSort | null;
  query: BrandingDashboardServerQuery;
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  windowCount: number;
}): Promise<
  | {
      hasMore: boolean;
      items: BrandAssetRow[];
      lastVisibleRow: BrandAssetRow | null;
      query: BrandingDashboardServerQuery;
      state: "ready";
    }
  | {
      state: "load-failed";
    }
> {
  const effectiveWindowCount =
    cursor &&
    isValidBrandingCursorForSort(cursor, query.sort) &&
    cursorServerSort === query.sort &&
    brandingServerFiltersEqual(
      cursorServerFilters,
      buildBrandingServerFilters(query),
    )
      ? clampBrandingWindowCount(windowCount)
      : 1;
  const loadedRows: BrandAssetRow[] = [];
  let currentCursor: BrandingDashboardFeedCursor | null = null;
  let currentWindow = 1;
  let lastWindow: Awaited<ReturnType<typeof fetchBrandingAssetWindow>> | null =
    null;

  while (currentWindow <= effectiveWindowCount) {
    lastWindow = await fetchBrandingAssetWindow({
      cursor: currentCursor,
      query,
      supabase,
      userId,
    });

    if (lastWindow.state === "load-failed") {
      return lastWindow;
    }

    loadedRows.push(...lastWindow.items);

    if (currentWindow === effectiveWindowCount) {
      break;
    }

    if (!lastWindow.hasMore || !lastWindow.nextCursor || !cursor) {
      return {
        hasMore: lastWindow.hasMore,
        items: loadedRows,
        lastVisibleRow: lastWindow.lastVisibleRow,
        query,
        state: "ready",
      };
    }

    if (
      currentWindow === effectiveWindowCount - 1 &&
      !brandingCursorEquals(lastWindow.nextCursor, cursor)
    ) {
      return await loadBrandingAssetWindows({
        cursorServerFilters: null,
        cursor: null,
        cursorServerSort: null,
        query,
        supabase,
        userId,
        windowCount: 1,
      });
    }

    currentCursor = lastWindow.nextCursor;
    currentWindow += 1;
  }

  return {
    hasMore: lastWindow?.hasMore ?? false,
    items: loadedRows,
    lastVisibleRow: lastWindow?.lastVisibleRow ?? null,
    query,
    state: "ready",
  };
}

async function fetchBrandingAssetWindow({
  cursor,
  query,
  supabase,
  userId,
}: {
  cursor: BrandingDashboardFeedCursor | null;
  query: BrandingDashboardServerQuery;
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
}): Promise<
  | {
      hasMore: boolean;
      items: BrandAssetRow[];
      lastVisibleRow: BrandAssetRow | null;
      nextCursor: BrandingDashboardFeedCursor | null;
      state: "ready";
    }
  | {
      state: "load-failed";
    }
> {
  let request = supabase
    .from("brand_assets")
    .select(
      "asset_type,channel_id,created_at,description,id,metadata,name,preview_capability_status,status,storage_bucket,storage_path,upload_metadata_status,updated_at",
    )
    .eq("user_id", userId);

  if (query.assetType) {
    request = request.eq("asset_type", query.assetType);
  }

  if (query.status) {
    request = request.eq("status", query.status);
  }

  request = applyBrandingSortOrders(request, query.sort);

  if (cursor && isValidBrandingCursorForSort(cursor, query.sort)) {
    request = request.or(buildBrandingCursorFilter(cursor, query.sort));
  }

  const { data, error } = await request.limit(
    BRANDING_DASHBOARD_ASSET_LIMIT + 1,
  );

  if (error || !data) {
    return {
      state: "load-failed",
    };
  }

  const rows = data as BrandAssetRow[];
  const items = rows.slice(0, BRANDING_DASHBOARD_ASSET_LIMIT);
  const lastVisibleRow = items.at(-1) ?? null;
  const hasMore = rows.length > BRANDING_DASHBOARD_ASSET_LIMIT;

  return {
    hasMore,
    items,
    lastVisibleRow,
    nextCursor: hasMore
      ? buildBrandingFeedCursor(lastVisibleRow, query.sort)
      : null,
    state: "ready",
  };
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

function buildBrandingDashboardFeedMetadata({
  hasMore,
  lastVisibleRow,
  loadedCount,
  query,
}: {
  hasMore: boolean;
  lastVisibleRow: BrandAssetRow | null;
  loadedCount: number;
  query: BrandingDashboardServerQuery;
}): BrandingDashboardFeedMetadata {
  return {
    filterOwnership: BRANDING_DASHBOARD_FEED_FILTER_OWNERSHIP,
    hasMore,
    limit: BRANDING_DASHBOARD_ASSET_LIMIT,
    nextCursor: hasMore
      ? buildBrandingFeedCursor(lastVisibleRow, query.sort)
      : null,
    returnedCount: loadedCount,
    serverFilters: buildBrandingServerFilters(query),
    scope: hasMore ? "loaded_sample" : "full_result",
    serverSort: query.sort,
  };
}

function brandingCursorEquals(
  left: BrandingDashboardFeedCursor,
  right: BrandingDashboardFeedCursor,
): boolean {
  return (
    left.assetType === right.assetType &&
    left.createdAt === right.createdAt &&
    left.id === right.id &&
    left.status === right.status &&
    left.updatedAt === right.updatedAt
  );
}

function clampBrandingWindowCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    return 1;
  }

  return Math.min(value, BRANDING_DASHBOARD_MAX_WINDOWS);
}

function buildBrandingServerFilters(
  query: BrandingDashboardServerQuery,
): BrandingDashboardFeedServerFilters {
  return {
    assetType: query.assetType,
    status: query.status,
  };
}

function brandingServerFiltersEqual(
  left: BrandingDashboardFeedServerFilters | null,
  right: BrandingDashboardFeedServerFilters,
): boolean {
  return (
    (left?.assetType ?? null) === right.assetType &&
    (left?.status ?? null) === right.status
  );
}

function buildBrandingFeedCursor(
  row: BrandAssetRow | null,
  sort: BrandingDashboardFeedServerSort,
): BrandingDashboardFeedCursor | null {
  if (!row) {
    return null;
  }

  return {
    assetType: sort === "asset_type" ? row.asset_type : null,
    createdAt: sort === "created_desc" ? row.created_at : null,
    id: row.id,
    status: sort === "status" ? row.status : null,
    updatedAt:
      sort === "updated_desc" || sort === "asset_type" || sort === "status"
        ? row.updated_at
        : null,
  };
}

function applyBrandingSortOrders<
  TQuery extends {
    order: (
      column: string,
      options?: {
        ascending?: boolean;
      },
    ) => TQuery;
  },
>(request: TQuery, sort: BrandingDashboardFeedServerSort): TQuery {
  switch (sort) {
    case "asset_type":
      return request
        .order("asset_type", { ascending: true })
        .order("updated_at", { ascending: false })
        .order("id", { ascending: true });
    case "created_desc":
      return request
        .order("created_at", { ascending: false })
        .order("id", { ascending: true });
    case "status":
      return request
        .order("status", { ascending: true })
        .order("updated_at", { ascending: false })
        .order("id", { ascending: true });
    case "updated_desc":
      return request
        .order("updated_at", { ascending: false })
        .order("id", { ascending: true });
  }
}

function buildBrandingCursorFilter(
  cursor: BrandingDashboardFeedCursor,
  sort: BrandingDashboardFeedServerSort,
): string {
  switch (sort) {
    case "asset_type":
      return `asset_type.gt.${cursor.assetType},and(asset_type.eq.${cursor.assetType},updated_at.lt.${cursor.updatedAt}),and(asset_type.eq.${cursor.assetType},updated_at.eq.${cursor.updatedAt},id.gt.${cursor.id})`;
    case "created_desc":
      return `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.gt.${cursor.id})`;
    case "status":
      return `status.gt.${cursor.status},and(status.eq.${cursor.status},updated_at.lt.${cursor.updatedAt}),and(status.eq.${cursor.status},updated_at.eq.${cursor.updatedAt},id.gt.${cursor.id})`;
    case "updated_desc":
      return `updated_at.lt.${cursor.updatedAt},and(updated_at.eq.${cursor.updatedAt},id.gt.${cursor.id})`;
  }
}

function isValidBrandingCursorForSort(
  cursor: BrandingDashboardFeedCursor,
  sort: BrandingDashboardFeedServerSort,
): boolean {
  switch (sort) {
    case "asset_type":
      return cursor.assetType !== null && cursor.updatedAt !== null;
    case "created_desc":
      return cursor.createdAt !== null;
    case "status":
      return cursor.status !== null && cursor.updatedAt !== null;
    case "updated_desc":
      return cursor.updatedAt !== null;
  }
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
    derivedStatuses: {
      previewCapabilityStatus: row.preview_capability_status,
      uploadMetadataStatus: row.upload_metadata_status,
    },
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
