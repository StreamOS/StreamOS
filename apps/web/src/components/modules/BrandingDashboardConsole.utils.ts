import {
  BRANDING_DASHBOARD_ASSET_LIMIT,
  BRANDING_DASHBOARD_DERIVED_STATUS_QUERY_GATE,
  BRANDING_DASHBOARD_FEED_FILTER_OWNERSHIP,
  BRANDING_DASHBOARD_METADATA_FILTERS,
  BRANDING_DASHBOARD_PREVIEW_FILTERS,
  type BrandingDashboardFeedCursor,
  type BrandingDashboardFeedClientFilters,
  type BrandingDashboardFeedServerFilters,
  type BrandingDashboardFeedServerSort,
  type BrandingDashboardFutureAction,
  type BrandingDashboardMutationBlockReason,
  type BrandingDashboardMutationContract,
  type BrandingDashboardAsset,
  type BrandingDashboardCoverage,
  type BrandingDashboardDistributionItem,
  type BrandingDashboardFeedMetadata,
  type BrandingDashboardLookupIssue,
  type BrandingDashboardMetadataFilter as SharedBrandingDashboardMetadataFilter,
  type BrandingDashboardPreviewFilter as SharedBrandingDashboardPreviewFilter,
  type BrandingDashboardPreviewReason,
  type BrandingDashboardPreviewStatus,
  type BrandingDashboardReadModel,
  type BrandingDashboardUploadMetadata,
  type StreamPlatform,
} from "@streamos/types";

export type BrandingDashboardState =
  | "auth-failed"
  | "disabled"
  | "load-failed"
  | "ready"
  | "unauthorized";

export type BrandingDashboardModel = BrandingDashboardReadModel & {
  state: BrandingDashboardState;
  userId: string | null;
};
type BrandingDashboardBaseAsset = Omit<BrandingDashboardAsset, "futureActions">;

export const BRANDING_DASHBOARD_SORT_OPTIONS = [
  "updated_desc",
  "created_desc",
  "asset_type",
  "status",
] as const;
export const BRANDING_DASHBOARD_MAX_WINDOWS = 5;
export {
  BRANDING_DASHBOARD_METADATA_FILTERS,
  BRANDING_DASHBOARD_PREVIEW_FILTERS,
};
export const BRANDING_DASHBOARD_ASSET_TYPE_OPTIONS = [
  "logo",
  "overlay",
  "banner",
  "panel",
  "alert",
  "scene",
  "emote",
  "color_palette",
  "typography",
] as const;
export const BRANDING_DASHBOARD_STATUS_OPTIONS = [
  "active",
  "draft",
  "archived",
] as const;

export type BrandingDashboardSortOption =
  (typeof BRANDING_DASHBOARD_SORT_OPTIONS)[number];
export type BrandingDashboardPreviewFilter =
  SharedBrandingDashboardPreviewFilter;
export type BrandingDashboardMetadataFilter =
  SharedBrandingDashboardMetadataFilter;

export type BrandingDashboardViewInput = {
  assetType: string | null;
  cursorToken: string | null;
  detailAssetId: string | null;
  metadata: BrandingDashboardMetadataFilter;
  preview: BrandingDashboardPreviewFilter;
  sort: BrandingDashboardSortOption;
  status: string | null;
  windowCount: number;
};

export type BrandingDashboardViewModel = {
  assetTypeOptions: string[];
  detailAssetId: string | null;
  detailSelection: {
    fellBackToVisibleItem: boolean;
    requestedAssetId: string | null;
  };
  feed: BrandingDashboardModel["feed"] & {
    clientFilters: BrandingDashboardFeedClientFilters;
    cursorToken: string | null;
    hasActiveClientFilters: boolean;
    hasActiveServerFilters: boolean;
    visibleCount: number;
    windowCount: number;
  };
  filters: {
    assetType: string | null;
    metadata: BrandingDashboardMetadataFilter;
    preview: BrandingDashboardPreviewFilter;
    status: string | null;
  };
  items: BrandingDashboardAsset[];
  selectedAsset: BrandingDashboardAsset | null;
  sort: BrandingDashboardSortOption;
  statusOptions: string[];
};

const knownAssetTypeLabels: Record<string, string> = {
  alert: "Alert",
  banner: "Banner",
  color_palette: "Color Palette",
  emote: "Emote",
  logo: "Logo",
  overlay: "Overlay",
  panel: "Panel",
  scene: "Scene",
  typography: "Typography",
};

const knownStatusLabels: Record<string, string> = {
  active: "Aktiv",
  archived: "Archiviert",
  draft: "Entwurf",
};
const mutationContract: BrandingDashboardMutationContract = {
  delete: {
    action: "delete",
    available: false,
    reason: "requires_db_storage_consistency",
  },
  orphan_cleanup: {
    action: "orphan_cleanup",
    available: false,
    reason: "requires_scoped_manual_cleanup",
  },
  replace: {
    action: "replace",
    available: false,
    reason: "requires_new_asset_row_strategy",
  },
};

export function buildBrandingDashboardModel({
  feed,
  items,
  lookupIssues,
  state,
  userId,
}: {
  feed: BrandingDashboardFeedMetadata;
  items: BrandingDashboardBaseAsset[];
  lookupIssues: BrandingDashboardLookupIssue[];
  state: BrandingDashboardState;
  userId: string | null;
}): BrandingDashboardModel {
  const typeDistribution = buildTypeDistribution(items);
  const coverage = buildCoverage(items);
  const latestUpdatedAt =
    [...items]
      .map((item) => item.updatedAt)
      .sort((left, right) => right.localeCompare(left))[0] ?? null;
  const activeAssets = items.filter((item) => item.status === "active").length;
  const draftAssets = items.filter((item) => item.status === "draft").length;
  const archivedAssets = items.filter(
    (item) => item.status === "archived",
  ).length;

  return {
    coverage,
    feed,
    items: items.map((item) => ({
      ...item,
      futureActions: buildBrandingAssetFutureActions(),
    })),
    lookupIssues,
    mutationContract,
    state,
    summary: {
      activeAssets,
      archivedAssets,
      draftAssets,
      latestUpdatedAt,
      missingBrandKit: isBrandKitMissing(items),
      totalAssets: items.length,
      unknownTypeCount: items.filter(
        (item) => !isKnownAssetType(item.assetType),
      ).length,
    },
    typeDistribution,
    userId,
  };
}

export function createEmptyBrandingDashboardModel(
  userId: string | null,
  state: BrandingDashboardState = "ready",
  lookupIssues: BrandingDashboardLookupIssue[] = [],
  feedOverrides: Partial<BrandingDashboardFeedMetadata> = {},
): BrandingDashboardModel {
  return {
    coverage: {
      attachedStorageCount: 0,
      channelContextCount: 0,
      incompleteStorageCount: 0,
      platformCount: 0,
      typeCount: 0,
    },
    feed: {
      derivedStatusQueryGate: BRANDING_DASHBOARD_DERIVED_STATUS_QUERY_GATE,
      filterOwnership: BRANDING_DASHBOARD_FEED_FILTER_OWNERSHIP,
      hasMore: false,
      limit: BRANDING_DASHBOARD_ASSET_LIMIT,
      nextCursor: null,
      returnedCount: 0,
      serverFilters: {
        assetType: null,
        status: null,
      },
      scope: "full_result",
      serverSort: "updated_desc",
      ...feedOverrides,
    },
    items: [],
    lookupIssues,
    mutationContract,
    state,
    summary: {
      activeAssets: 0,
      archivedAssets: 0,
      draftAssets: 0,
      latestUpdatedAt: null,
      missingBrandKit: true,
      totalAssets: 0,
      unknownTypeCount: 0,
    },
    typeDistribution: [],
    userId,
  };
}

export function buildBrandingDashboardViewModel(
  model: BrandingDashboardModel,
  input: BrandingDashboardViewInput,
): BrandingDashboardViewModel {
  const assetTypeOptions = [
    ...new Set([
      ...BRANDING_DASHBOARD_ASSET_TYPE_OPTIONS,
      ...model.items.map((item) => item.assetType),
    ]),
  ].sort((left, right) => left.localeCompare(right));
  const statusOptions = [
    ...new Set([
      ...BRANDING_DASHBOARD_STATUS_OPTIONS,
      ...model.items.map((item) => item.status),
    ]),
  ].sort((left, right) => left.localeCompare(right));
  const items = [...model.items]
    .filter((item) =>
      input.preview === "available"
        ? item.preview.status === "available"
        : input.preview === "unavailable"
          ? item.preview.status !== "available"
          : true,
    )
    .filter((item) =>
      input.metadata === "all"
        ? true
        : item.uploadMetadata.status === input.metadata,
    );
  const selectedAsset =
    items.find((item) => item.id === input.detailAssetId) ?? items[0] ?? null;
  const fellBackToVisibleItem =
    input.detailAssetId !== null &&
    selectedAsset !== null &&
    selectedAsset.id !== input.detailAssetId;

  return {
    assetTypeOptions,
    detailAssetId: selectedAsset?.id ?? null,
    detailSelection: {
      fellBackToVisibleItem,
      requestedAssetId: input.detailAssetId,
    },
    feed: {
      ...model.feed,
      clientFilters: {
        metadata: input.metadata,
        preview: input.preview,
      },
      cursorToken: input.cursorToken,
      hasActiveClientFilters:
        input.preview !== "all" || input.metadata !== "all",
      hasActiveServerFilters: input.assetType !== null || input.status !== null,
      serverFilters: {
        assetType: input.assetType,
        status: input.status,
      },
      serverSort: input.sort,
      visibleCount: items.length,
      windowCount: input.windowCount,
    },
    filters: {
      assetType: input.assetType,
      metadata: input.metadata,
      preview: input.preview,
      status: input.status,
    },
    items,
    selectedAsset,
    sort: input.sort,
    statusOptions,
  };
}

export function encodeBrandingDashboardCursorToken(input: {
  cursor: BrandingDashboardFeedCursor;
  serverFilters: BrandingDashboardFeedServerFilters;
  serverSort: BrandingDashboardFeedServerSort;
}): string {
  return Buffer.from(JSON.stringify(input), "utf8").toString("base64url");
}

export function decodeBrandingDashboardCursorToken(value: string | null): {
  cursor: BrandingDashboardFeedCursor | null;
  serverFilters: BrandingDashboardFeedServerFilters | null;
  serverSort: BrandingDashboardFeedServerSort | null;
} {
  if (!value) {
    return {
      cursor: null,
      serverFilters: null,
      serverSort: null,
    };
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as {
      cursor?: {
        assetType?: unknown;
        createdAt?: unknown;
        id?: unknown;
        status?: unknown;
        updatedAt?: unknown;
      };
      serverFilters?: {
        assetType?: unknown;
        status?: unknown;
      };
      serverSort?: unknown;
    };

    if (
      !parsed.cursor ||
      typeof parsed.cursor.id !== "string" ||
      !isNullableString(parsed.cursor.assetType) ||
      !isNullableString(parsed.cursor.createdAt) ||
      !isNullableString(parsed.cursor.status) ||
      !isNullableString(parsed.cursor.updatedAt) ||
      !isNullableString(parsed.serverFilters?.assetType) ||
      !isNullableString(parsed.serverFilters?.status) ||
      !isValidCursorDate(parsed.cursor.createdAt) ||
      !isValidCursorDate(parsed.cursor.updatedAt) ||
      !BRANDING_DASHBOARD_SORT_OPTIONS.includes(parsed.serverSort as never) ||
      !isValidCursorForServerSort(
        parsed.cursor as {
          assetType?: string | null;
          createdAt?: string | null;
          status?: string | null;
          updatedAt?: string | null;
        },
        parsed.serverSort as BrandingDashboardFeedServerSort,
      )
    ) {
      return {
        cursor: null,
        serverFilters: null,
        serverSort: null,
      };
    }

    return {
      cursor: {
        assetType: parsed.cursor.assetType ?? null,
        createdAt: parsed.cursor.createdAt ?? null,
        id: parsed.cursor.id,
        status: parsed.cursor.status ?? null,
        updatedAt: parsed.cursor.updatedAt ?? null,
      },
      serverFilters: {
        assetType: parsed.serverFilters?.assetType ?? null,
        status: parsed.serverFilters?.status ?? null,
      },
      serverSort: parsed.serverSort as BrandingDashboardFeedServerSort,
    };
  } catch {
    return {
      cursor: null,
      serverFilters: null,
      serverSort: null,
    };
  }
}

export function formatBrandingAssetTypeLabel(value: string): string {
  if (knownAssetTypeLabels[value]) {
    return knownAssetTypeLabels[value];
  }

  return value
    .replaceAll(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function formatBrandingAssetStatusLabel(value: string): string {
  if (knownStatusLabels[value]) {
    return knownStatusLabels[value];
  }

  return value
    .replaceAll(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function formatBrandingDateTime(value: string | null): string {
  if (!value) {
    return "Nicht verfuegbar";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Nicht verfuegbar";
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(date);
}

export function formatBrandingPlatformLabel(
  platform: StreamPlatform | null,
): string {
  switch (platform) {
    case "kick":
      return "Kick";
    case "tiktok":
      return "TikTok";
    case "twitch":
      return "Twitch";
    case "youtube":
      return "YouTube";
    default:
      return "Kein Plattformkontext";
  }
}

export function formatBrandingStorageStateLabel(
  state: BrandingDashboardAsset["storageState"],
): string {
  switch (state) {
    case "attached":
      return "Private Datei verknuepft";
    case "incomplete":
      return "Storage-Metadaten unvollstaendig";
    case "none":
      return "Nur Metadaten";
  }
}

export function formatBrandingPreviewStatusLabel(
  status: BrandingDashboardPreviewStatus,
): string {
  switch (status) {
    case "available":
      return "Private Preview verfuegbar";
    case "failed":
      return "Preview konnte nicht erzeugt werden";
    case "unsupported":
      return "Preview nicht unterstuetzt";
    case "unavailable":
      return "Preview nicht verfuegbar";
  }
}

export function formatBrandingPreviewReasonLabel(
  reason: BrandingDashboardPreviewReason | null,
): string {
  switch (reason) {
    case "invalid_storage_metadata":
      return "Storage-Metadaten sind nicht tenant-sicher.";
    case "missing_storage":
      return "Es ist kein privater Storage-Pfad verknuepft.";
    case "signing_failed":
      return "Die kurzlebige Preview konnte serverseitig nicht signiert werden.";
    case "unsupported_file_type":
      return "Dieser Dateityp bleibt ohne Sanitizing oder MIME-Contract unpreviewbar.";
    default:
      return "Keine Preview-Metadaten verfuegbar.";
  }
}

export function formatBrandingUploadMetadataStatusLabel(
  metadata: BrandingDashboardUploadMetadata,
): string {
  switch (metadata.status) {
    case "available":
      return "Metadata verfuegbar";
    case "invalid":
      return "Metadata ungueltig";
    case "unavailable":
      return "Metadata nicht verfuegbar";
  }
}

export function formatBrandingUploadMetadataTypeLabel(
  metadata: BrandingDashboardUploadMetadata,
): string {
  if (
    metadata.status !== "available" ||
    !metadata.contentType ||
    !metadata.fileExtension
  ) {
    return formatBrandingUploadMetadataStatusLabel(metadata);
  }

  return `${metadata.fileExtension.toUpperCase()} (${metadata.contentType})`;
}

export function formatBrandingFileSizeLabel(value: number | null): string {
  if (value === null) {
    return "Nicht verfuegbar";
  }

  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${formatBrandingFileSizeUnit(value / 1024)} KB`;
  }

  return `${formatBrandingFileSizeUnit(value / (1024 * 1024))} MB`;
}

export function formatBrandingFutureActionLabel(
  action: BrandingDashboardFutureAction["action"],
): string {
  switch (action) {
    case "delete":
      return "Delete";
    case "orphan_cleanup":
      return "Orphan Cleanup";
    case "replace":
      return "Replace";
  }
}

export function formatBrandingDashboardSortLabel(
  sort: BrandingDashboardSortOption,
): string {
  switch (sort) {
    case "asset_type":
      return "Asset-Typ";
    case "created_desc":
      return "Zuletzt erstellt";
    case "status":
      return "Status";
    case "updated_desc":
      return "Zuletzt aktualisiert";
  }
}

export function formatBrandingDashboardFeedScopeLabel(
  scope: BrandingDashboardModel["feed"]["scope"],
): string {
  switch (scope) {
    case "full_result":
      return "Vollstaendiger Feed";
    case "loaded_sample":
      return "Geladene Stichprobe";
  }
}

export function formatBrandingMutationReasonLabel(
  reason: BrandingDashboardMutationBlockReason,
): string {
  switch (reason) {
    case "requires_db_storage_consistency":
      return "Erfordert eine atomare DB-/Storage-Loeschsemantik, damit keine Row auf fehlende private Dateien zeigt.";
    case "requires_new_asset_row_strategy":
      return "Erfordert einen neuen Asset-Datensatz plus kontrolliertes Umschalten statt unsicherem Update oder Upsert.";
    case "requires_scoped_manual_cleanup":
      return "Bleibt vorerst ein bewusst begrenzter manueller oder spaeter worker-owned Cleanup-Flow ohne globalen Scan.";
  }
}

function buildTypeDistribution(
  items: BrandingDashboardBaseAsset[],
): BrandingDashboardDistributionItem[] {
  const counts = items.reduce<Map<string, number>>((map, item) => {
    map.set(item.assetType, (map.get(item.assetType) ?? 0) + 1);
    return map;
  }, new Map());

  return [...counts.entries()]
    .map(([key, count]) => ({ count, key }))
    .sort(
      (left, right) =>
        right.count - left.count || left.key.localeCompare(right.key),
    );
}

function buildCoverage(
  items: BrandingDashboardBaseAsset[],
): BrandingDashboardCoverage {
  return {
    attachedStorageCount: items.filter(
      (item) => item.storageState === "attached",
    ).length,
    channelContextCount: items.filter((item) => item.channelId !== null).length,
    incompleteStorageCount: items.filter(
      (item) => item.storageState === "incomplete",
    ).length,
    platformCount: new Set(
      items
        .map((item) => item.platform)
        .filter((platform): platform is StreamPlatform => platform !== null),
    ).size,
    typeCount: new Set(items.map((item) => item.assetType)).size,
  };
}

function isBrandKitMissing(items: BrandingDashboardBaseAsset[]): boolean {
  const activeTypes = new Set(
    items
      .filter((item) => item.status === "active")
      .map((item) => item.assetType),
  );

  return !activeTypes.has("logo") || !activeTypes.has("color_palette");
}

function isKnownAssetType(value: string): boolean {
  return Object.hasOwn(knownAssetTypeLabels, value);
}

function buildBrandingAssetFutureActions(): BrandingDashboardFutureAction[] {
  return [mutationContract.replace, mutationContract.delete];
}

function formatBrandingFileSizeUnit(value: number): string {
  const rounded = value >= 10 ? value.toFixed(0) : value.toFixed(1);
  return rounded.endsWith(".0") ? rounded.slice(0, -2) : rounded;
}

function isNullableString(value: unknown): value is string | null | undefined {
  return value == null || typeof value === "string";
}

function isValidCursorDate(value: string | null | undefined): boolean {
  return value == null || !Number.isNaN(new Date(value).getTime());
}

function isValidCursorForServerSort(
  cursor: {
    assetType?: string | null;
    createdAt?: string | null;
    status?: string | null;
    updatedAt?: string | null;
  },
  sort: BrandingDashboardFeedServerSort,
): boolean {
  switch (sort) {
    case "asset_type":
      return (
        typeof cursor.assetType === "string" &&
        typeof cursor.updatedAt === "string"
      );
    case "created_desc":
      return typeof cursor.createdAt === "string";
    case "status":
      return (
        typeof cursor.status === "string" &&
        typeof cursor.updatedAt === "string"
      );
    case "updated_desc":
      return typeof cursor.updatedAt === "string";
  }
}
