import type {
  BrandAssetStatus,
  BrandAssetType,
  StreamPlatform,
} from "./index.js";

export const BRANDING_DASHBOARD_ASSET_LIMIT = 12;
export const BRANDING_DASHBOARD_PREVIEW_TTL_SECONDS = 60;

export const BRANDING_DASHBOARD_LOOKUP_SOURCES = ["channels"] as const;

export type BrandingDashboardLookupSource =
  (typeof BRANDING_DASHBOARD_LOOKUP_SOURCES)[number];

export type BrandingDashboardLookupIssue = {
  code: "load-failed";
  source: BrandingDashboardLookupSource;
};

export type BrandingDashboardStorageState = "attached" | "incomplete" | "none";

export type BrandingDashboardPreviewStatus =
  | "available"
  | "failed"
  | "unavailable"
  | "unsupported";

export type BrandingDashboardPreviewReason =
  | "invalid_storage_metadata"
  | "missing_storage"
  | "signing_failed"
  | "unsupported_file_type";

export type BrandingDashboardPreview = {
  expiresAt: string | null;
  reason: BrandingDashboardPreviewReason | null;
  status: BrandingDashboardPreviewStatus;
  url: string | null;
};

export type BrandingDashboardAsset = {
  assetType: BrandAssetType | string;
  channelId: string | null;
  createdAt: string;
  description: string | null;
  id: string;
  name: string;
  platform: StreamPlatform | null;
  preview: BrandingDashboardPreview;
  status: BrandAssetStatus | string;
  storageState: BrandingDashboardStorageState;
  updatedAt: string;
  usageContext: string | null;
};

export type BrandingDashboardDistributionItem = {
  count: number;
  key: string;
};

export type BrandingDashboardFeedMetadata = {
  hasMore: boolean;
  limit: number;
  returnedCount: number;
};

export type BrandingDashboardCoverage = {
  attachedStorageCount: number;
  channelContextCount: number;
  incompleteStorageCount: number;
  platformCount: number;
  typeCount: number;
};

export type BrandingDashboardSummary = {
  activeAssets: number;
  archivedAssets: number;
  draftAssets: number;
  latestUpdatedAt: string | null;
  missingBrandKit: boolean;
  totalAssets: number;
  unknownTypeCount: number;
};

export type BrandingDashboardReadModel = {
  coverage: BrandingDashboardCoverage;
  feed: BrandingDashboardFeedMetadata;
  items: BrandingDashboardAsset[];
  lookupIssues: BrandingDashboardLookupIssue[];
  summary: BrandingDashboardSummary;
  typeDistribution: BrandingDashboardDistributionItem[];
};
