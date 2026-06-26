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
export const BRANDING_DASHBOARD_PREVIEW_CAPABILITY_STATUSES = [
  "previewable",
  "unsupported",
  "missing_storage",
  "invalid_storage",
] as const;
export const BRANDING_DASHBOARD_DERIVED_STATUS_QUERY_GATE_BLOCKERS = [
  "requires_hosted_migration_evidence",
  "requires_server_filter_activation",
] as const;

export type BrandingDashboardLookupSource =
  (typeof BRANDING_DASHBOARD_LOOKUP_SOURCES)[number];
export type BrandingDashboardFeedScope =
  (typeof BRANDING_DASHBOARD_FEED_SCOPES)[number];
export type BrandingDashboardFeedServerSort =
  (typeof BRANDING_DASHBOARD_FEED_SERVER_SORTS)[number];
export type BrandingDashboardFeedFilterOwner = "client_window" | "server_query";
export type BrandingDashboardDerivedStatusOwner = "server_managed";
export type BrandingDashboardPreviewFilter =
  (typeof BRANDING_DASHBOARD_PREVIEW_FILTERS)[number];
export type BrandingDashboardMetadataFilter =
  (typeof BRANDING_DASHBOARD_METADATA_FILTERS)[number];
export type BrandingDashboardPreviewCapabilityStatus =
  (typeof BRANDING_DASHBOARD_PREVIEW_CAPABILITY_STATUSES)[number];
export type BrandingDashboardDerivedStatusQueryGateBlocker =
  (typeof BRANDING_DASHBOARD_DERIVED_STATUS_QUERY_GATE_BLOCKERS)[number];

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

export type BrandingDashboardDerivedStatuses = Readonly<{
  previewCapabilityStatus: BrandingDashboardPreviewCapabilityStatus;
  uploadMetadataStatus: BrandingDashboardUploadMetadataStatus;
}>;

export type BrandingDashboardDerivedStatusOwnership = Readonly<{
  previewCapabilityStatus: "server_managed";
  uploadMetadataStatus: "server_managed";
}>;

export const BRANDING_DASHBOARD_DERIVED_STATUS_OWNERSHIP = {
  previewCapabilityStatus: "server_managed",
  uploadMetadataStatus: "server_managed",
} as const satisfies BrandingDashboardDerivedStatusOwnership;

export type BrandingDashboardDerivedStatusQueryGateReadiness = Readonly<{
  hostedIndexReady: false;
  hostedMigrationReady: false;
  repoReady: true;
  serverFilterReady: false;
}>;

export const BRANDING_DASHBOARD_DERIVED_STATUS_QUERY_GATE_READINESS = {
  hostedIndexReady: false,
  hostedMigrationReady: false,
  repoReady: true,
  serverFilterReady: false,
} as const satisfies BrandingDashboardDerivedStatusQueryGateReadiness;

export type BrandingDashboardDerivedStatusQueryGate = Readonly<{
  blockedBy: readonly BrandingDashboardDerivedStatusQueryGateBlocker[];
  historicalBackfill: "generated_columns";
  indexesReady: true;
  readiness: BrandingDashboardDerivedStatusQueryGateReadiness;
  metadataServerQueryable: false;
  previewServerQueryable: false;
}>;

export const BRANDING_DASHBOARD_DERIVED_STATUS_QUERY_GATE = {
  blockedBy: [
    "requires_hosted_migration_evidence",
    "requires_server_filter_activation",
  ],
  historicalBackfill: "generated_columns",
  indexesReady: true,
  readiness: BRANDING_DASHBOARD_DERIVED_STATUS_QUERY_GATE_READINESS,
  metadataServerQueryable: false,
  previewServerQueryable: false,
} as const satisfies BrandingDashboardDerivedStatusQueryGate;

export type BrandingDashboardAsset = {
  assetType: BrandAssetType | string;
  channelId: string | null;
  createdAt: string;
  description: string | null;
  derivedStatuses: BrandingDashboardDerivedStatuses;
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

export type BrandingDashboardFeedClientFilters = {
  metadata: BrandingDashboardMetadataFilter;
  preview: BrandingDashboardPreviewFilter;
};

export type BrandingDashboardFeedFilterOwnership = Readonly<{
  assetType: "server_query";
  metadata: "client_window";
  preview: "client_window";
  status: "server_query";
}>;

export const BRANDING_DASHBOARD_FEED_FILTER_OWNERSHIP = {
  assetType: "server_query",
  metadata: "client_window",
  preview: "client_window",
  status: "server_query",
} as const satisfies BrandingDashboardFeedFilterOwnership;

type BrandingDashboardTypeAssert<T extends true> = T;
type BrandingDashboardTypeEqual<TLeft, TRight> =
  (<TValue>() => TValue extends TLeft ? 1 : 2) extends <
    TValue,
  >() => TValue extends TRight ? 1 : 2
    ? true
    : false;

type _BrandingDashboardFeedFilterOwnershipAssertions = [
  BrandingDashboardTypeAssert<
    BrandingDashboardTypeEqual<
      BrandingDashboardFeedFilterOwnership["assetType"],
      "server_query"
    >
  >,
  BrandingDashboardTypeAssert<
    BrandingDashboardTypeEqual<
      BrandingDashboardFeedFilterOwnership["metadata"],
      "client_window"
    >
  >,
  BrandingDashboardTypeAssert<
    BrandingDashboardTypeEqual<
      BrandingDashboardFeedFilterOwnership["preview"],
      "client_window"
    >
  >,
  BrandingDashboardTypeAssert<
    BrandingDashboardTypeEqual<
      BrandingDashboardFeedFilterOwnership["status"],
      "server_query"
    >
  >,
];

type _BrandingDashboardDerivedStatusOwnershipAssertions = [
  BrandingDashboardTypeAssert<
    BrandingDashboardTypeEqual<
      BrandingDashboardDerivedStatusOwnership["previewCapabilityStatus"],
      "server_managed"
    >
  >,
  BrandingDashboardTypeAssert<
    BrandingDashboardTypeEqual<
      BrandingDashboardDerivedStatusOwnership["uploadMetadataStatus"],
      "server_managed"
    >
  >,
];

type _BrandingDashboardDerivedStatusQueryGateAssertions = [
  BrandingDashboardTypeAssert<
    BrandingDashboardTypeEqual<
      BrandingDashboardDerivedStatusQueryGate["historicalBackfill"],
      "generated_columns"
    >
  >,
  BrandingDashboardTypeAssert<
    BrandingDashboardTypeEqual<
      BrandingDashboardDerivedStatusQueryGate["indexesReady"],
      true
    >
  >,
  BrandingDashboardTypeAssert<
    BrandingDashboardTypeEqual<
      BrandingDashboardDerivedStatusQueryGate["readiness"]["hostedIndexReady"],
      false
    >
  >,
  BrandingDashboardTypeAssert<
    BrandingDashboardTypeEqual<
      BrandingDashboardDerivedStatusQueryGate["readiness"]["hostedMigrationReady"],
      false
    >
  >,
  BrandingDashboardTypeAssert<
    BrandingDashboardTypeEqual<
      BrandingDashboardDerivedStatusQueryGate["readiness"]["repoReady"],
      true
    >
  >,
  BrandingDashboardTypeAssert<
    BrandingDashboardTypeEqual<
      BrandingDashboardDerivedStatusQueryGate["readiness"]["serverFilterReady"],
      false
    >
  >,
  BrandingDashboardTypeAssert<
    BrandingDashboardTypeEqual<
      BrandingDashboardDerivedStatusQueryGate["metadataServerQueryable"],
      false
    >
  >,
  BrandingDashboardTypeAssert<
    BrandingDashboardTypeEqual<
      BrandingDashboardDerivedStatusQueryGate["previewServerQueryable"],
      false
    >
  >,
];

export type BrandingDashboardFeedMetadata = {
  derivedStatusQueryGate: BrandingDashboardDerivedStatusQueryGate;
  filterOwnership: BrandingDashboardFeedFilterOwnership;
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
