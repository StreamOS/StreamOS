import {
  BRANDING_DASHBOARD_ASSET_LIMIT,
  type BrandingDashboardAsset,
  type BrandingDashboardCoverage,
  type BrandingDashboardDistributionItem,
  type BrandingDashboardFeedMetadata,
  type BrandingDashboardLookupIssue,
  type BrandingDashboardReadModel,
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

export function buildBrandingDashboardModel({
  feed,
  items,
  lookupIssues,
  state,
  userId,
}: {
  feed: BrandingDashboardFeedMetadata;
  items: BrandingDashboardAsset[];
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
    items,
    lookupIssues,
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

function buildTypeDistribution(
  items: BrandingDashboardAsset[],
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
  items: BrandingDashboardAsset[],
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

function isBrandKitMissing(items: BrandingDashboardAsset[]): boolean {
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
