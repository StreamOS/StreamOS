import type {
  BrandAssetStatus,
  BrandAssetType,
  StreamPlatform,
} from "./index.js";

export const BRANDING_DASHBOARD_ASSET_LIMIT = 12;
export const BRANDING_DASHBOARD_PREVIEW_TTL_SECONDS = 60;
export const BRANDING_DASHBOARD_UPLOAD_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
export const BRANDING_DASHBOARD_UPLOAD_ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;
export const BRANDING_DASHBOARD_UPLOAD_ALLOWED_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "webp",
] as const;
export const BRANDING_DASHBOARD_MUTATION_ACTIONS = [
  "replace",
  "delete",
  "orphan_cleanup",
] as const;
export const BRANDING_DASHBOARD_MUTATION_BLOCK_REASONS = [
  "requires_db_storage_consistency",
  "requires_new_asset_row_strategy",
  "requires_scoped_manual_cleanup",
] as const;

export const BRANDING_DASHBOARD_LOOKUP_SOURCES = ["channels"] as const;
export const BRANDING_DASHBOARD_FEED_SCOPES = [
  "full_result",
  "loaded_sample",
] as const;
export const BRANDING_DASHBOARD_FEED_SERVER_SORTS = [
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

export type BrandingDashboardLookupSource =
  (typeof BRANDING_DASHBOARD_LOOKUP_SOURCES)[number];
export type BrandingDashboardFeedScope =
  (typeof BRANDING_DASHBOARD_FEED_SCOPES)[number];
export type BrandingDashboardFeedServerSort =
  (typeof BRANDING_DASHBOARD_FEED_SERVER_SORTS)[number];
export type BrandingDashboardPreviewFilter =
  (typeof BRANDING_DASHBOARD_PREVIEW_FILTERS)[number];
export type BrandingDashboardMetadataFilter =
  (typeof BRANDING_DASHBOARD_METADATA_FILTERS)[number];

export type BrandingDashboardLookupIssue = {
  code: "load-failed";
  source: BrandingDashboardLookupSource;
};

export type BrandingDashboardStorageState = "attached" | "incomplete" | "none";
export type BrandingDashboardMutationAction =
  (typeof BRANDING_DASHBOARD_MUTATION_ACTIONS)[number];
export type BrandingDashboardMutationBlockReason =
  (typeof BRANDING_DASHBOARD_MUTATION_BLOCK_REASONS)[number];
export type BrandingDashboardFutureAction = {
  action: BrandingDashboardMutationAction;
  available: false;
  reason: BrandingDashboardMutationBlockReason;
};
export type BrandingDashboardMutationContract = {
  delete: BrandingDashboardFutureAction;
  orphan_cleanup: BrandingDashboardFutureAction;
  replace: BrandingDashboardFutureAction;
};

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

export type BrandingDashboardUploadMetadataStatus =
  | "available"
  | "invalid"
  | "unavailable";

export type BrandingDashboardUploadMetadata = {
  contentType: string | null;
  fileExtension: string | null;
  fileSizeBytes: number | null;
  status: BrandingDashboardUploadMetadataStatus;
  storedFilename: string | null;
};

export type BrandingDashboardAsset = {
  assetType: BrandAssetType | string;
  channelId: string | null;
  createdAt: string;
  description: string | null;
  futureActions: BrandingDashboardFutureAction[];
  id: string;
  name: string;
  platform: StreamPlatform | null;
  preview: BrandingDashboardPreview;
  status: BrandAssetStatus | string;
  storageState: BrandingDashboardStorageState;
  uploadMetadata: BrandingDashboardUploadMetadata;
  updatedAt: string;
  usageContext: string | null;
};

export type BrandingDashboardDistributionItem = {
  count: number;
  key: string;
};

export type BrandingDashboardFeedCursor = {
  assetType: string | null;
  createdAt: string | null;
  id: string;
  status: string | null;
  updatedAt: string | null;
};

export type BrandingDashboardFeedServerFilters = {
  assetType: BrandAssetType | string | null;
  status: BrandAssetStatus | string | null;
};

export type BrandingDashboardFeedMetadata = {
  hasMore: boolean;
  limit: number;
  nextCursor: BrandingDashboardFeedCursor | null;
  returnedCount: number;
  serverFilters: BrandingDashboardFeedServerFilters;
  scope: BrandingDashboardFeedScope;
  serverSort: BrandingDashboardFeedServerSort;
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
  mutationContract: BrandingDashboardMutationContract;
  summary: BrandingDashboardSummary;
  typeDistribution: BrandingDashboardDistributionItem[];
};
