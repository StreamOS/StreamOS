import {
  BRANDING_DASHBOARD_ASSET_LIMIT,
  type BrandingDashboardFutureAction,
  type BrandingDashboardMutationBlockReason,
  type BrandingDashboardMutationContract,
  type BrandingDashboardAsset,
  type BrandingDashboardCoverage,
  type BrandingDashboardDistributionItem,
  type BrandingDashboardFeedMetadata,
  type BrandingDashboardLookupIssue,
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
export const BRANDING_DASHBOARD_PREVIEW_FILTERS = [
  "all",
  "available",
  "unavailable",
] as const;
export const BRANDING_DASHBOARD_METADATA_FILTERS = [
  "all",
  "available",
  "invalid",
  "unavailable",
] as const;

export type BrandingDashboardSortOption =
  (typeof BRANDING_DASHBOARD_SORT_OPTIONS)[number];
export type BrandingDashboardPreviewFilter =
  (typeof BRANDING_DASHBOARD_PREVIEW_FILTERS)[number];
export type BrandingDashboardMetadataFilter =
  (typeof BRANDING_DASHBOARD_METADATA_FILTERS)[number];

export type BrandingDashboardViewInput = {
  assetType: string | null;
  detailAssetId: string | null;
  metadata: BrandingDashboardMetadataFilter;
  preview: BrandingDashboardPreviewFilter;
  sort: BrandingDashboardSortOption;
  status: string | null;
};

export type BrandingDashboardViewModel = {
  assetTypeOptions: string[];
  detailAssetId: string | null;
  detailSelection: {
    fellBackToVisibleItem: boolean;
    requestedAssetId: string | null;
  };
  feed: BrandingDashboardModel["feed"] & {
    activeFilters: {
      assetType: string | null;
      metadata: BrandingDashboardMetadataFilter;
      preview: BrandingDashboardPreviewFilter;
      status: string | null;
    };
    activeSort: BrandingDashboardSortOption;
    hasActiveFilters: boolean;
    visibleCount: number;
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
      hasMore: false,
      limit: BRANDING_DASHBOARD_ASSET_LIMIT,
      nextCursor: null,
      returnedCount: 0,
      scope: "full_result",
      serverSort: "updated_desc",
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
    ...new Set(model.items.map((item) => item.assetType)),
  ].sort((left, right) => left.localeCompare(right));
  const statusOptions = [
    ...new Set(model.items.map((item) => item.status)),
  ].sort((left, right) => left.localeCompare(right));
  const assetType =
    input.assetType && assetTypeOptions.includes(input.assetType)
      ? input.assetType
      : null;
  const status =
    input.status && statusOptions.includes(input.status) ? input.status : null;
  const items = [...model.items]
    .filter((item) => (assetType ? item.assetType === assetType : true))
    .filter((item) => (status ? item.status === status : true))
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
    )
    .sort((left, right) => compareBrandingAssets(left, right, input.sort));
  const selectedAsset =
    items.find((item) => item.id === input.detailAssetId) ?? items[0] ?? null;
  const fellBackToVisibleItem =
    input.detailAssetId !== null &&
    selectedAsset !== null &&
    selectedAsset.id !== input.detailAssetId;
  const activeFilters = {
    assetType,
    metadata: input.metadata,
    preview: input.preview,
    status,
  };

  return {
    assetTypeOptions,
    detailAssetId: selectedAsset?.id ?? null,
    detailSelection: {
      fellBackToVisibleItem,
      requestedAssetId: input.detailAssetId,
    },
    feed: {
      ...model.feed,
      activeFilters,
      activeSort: input.sort,
      hasActiveFilters:
        assetType !== null ||
        status !== null ||
        input.preview !== "all" ||
        input.metadata !== "all",
      visibleCount: items.length,
    },
    filters: {
      ...activeFilters,
    },
    items,
    selectedAsset,
    sort: input.sort,
    statusOptions,
  };
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

function compareBrandingAssets(
  left: BrandingDashboardAsset,
  right: BrandingDashboardAsset,
  sort: BrandingDashboardSortOption,
): number {
  switch (sort) {
    case "asset_type":
      return (
        left.assetType.localeCompare(right.assetType) ||
        right.updatedAt.localeCompare(left.updatedAt) ||
        left.id.localeCompare(right.id)
      );
    case "created_desc":
      return (
        right.createdAt.localeCompare(left.createdAt) ||
        right.updatedAt.localeCompare(left.updatedAt) ||
        left.id.localeCompare(right.id)
      );
    case "status":
      return (
        left.status.localeCompare(right.status) ||
        right.updatedAt.localeCompare(left.updatedAt) ||
        left.id.localeCompare(right.id)
      );
    case "updated_desc":
      return (
        right.updatedAt.localeCompare(left.updatedAt) ||
        left.id.localeCompare(right.id)
      );
  }
}

function formatBrandingFileSizeUnit(value: number): string {
  const rounded = value >= 10 ? value.toFixed(0) : value.toFixed(1);
  return rounded.endsWith(".0") ? rounded.slice(0, -2) : rounded;
}
