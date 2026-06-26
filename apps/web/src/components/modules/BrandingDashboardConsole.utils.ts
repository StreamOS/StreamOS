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
      returnedCount: 0,
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
      return "Metadata unavailable";
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
