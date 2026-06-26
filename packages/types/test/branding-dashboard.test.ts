import assert from "node:assert/strict";
import test from "node:test";

import {
  BRANDING_DASHBOARD_ASSET_LIMIT,
  BRANDING_DASHBOARD_DERIVED_STATUS_OWNERSHIP,
  BRANDING_DASHBOARD_DERIVED_STATUS_QUERY_GATE,
  BRANDING_DASHBOARD_DERIVED_STATUS_QUERY_GATE_BLOCKERS,
  BRANDING_DASHBOARD_FEED_SCOPES,
  BRANDING_DASHBOARD_FEED_FILTER_OWNERSHIP,
  BRANDING_DASHBOARD_FEED_SERVER_SORTS,
  BRANDING_DASHBOARD_LOOKUP_SOURCES,
  BRANDING_DASHBOARD_METADATA_FILTERS,
  BRANDING_DASHBOARD_MUTATION_ACTIONS,
  BRANDING_DASHBOARD_MUTATION_BLOCK_REASONS,
  BRANDING_DASHBOARD_PREVIEW_CAPABILITY_STATUSES,
  BRANDING_DASHBOARD_PREVIEW_TTL_SECONDS,
  BRANDING_DASHBOARD_PREVIEW_FILTERS,
  BRANDING_DASHBOARD_UPLOAD_ALLOWED_EXTENSIONS,
  BRANDING_DASHBOARD_UPLOAD_ALLOWED_MIME_TYPES,
  BRANDING_DASHBOARD_UPLOAD_MAX_FILE_SIZE_BYTES,
  type BrandingDashboardReadModel,
} from "../src/branding-dashboard.js";

const sampleReadModel = {
  coverage: {
    attachedStorageCount: 1,
    channelContextCount: 1,
    incompleteStorageCount: 0,
    platformCount: 1,
    typeCount: 2,
  },
  feed: {
    derivedStatusQueryGate: BRANDING_DASHBOARD_DERIVED_STATUS_QUERY_GATE,
    filterOwnership: BRANDING_DASHBOARD_FEED_FILTER_OWNERSHIP,
    hasMore: false,
    limit: BRANDING_DASHBOARD_ASSET_LIMIT,
    nextCursor: null,
    returnedCount: 2,
    serverFilters: {
      assetType: null,
      status: null,
    },
    scope: "full_result",
    serverSort: "updated_desc",
  },
  items: [
    {
      assetType: "logo",
      channelId: "channel-1",
      createdAt: "2026-06-26T08:00:00.000Z",
      description: "Primary logo",
      derivedStatuses: {
        previewCapabilityStatus: "previewable",
        uploadMetadataStatus: "available",
      },
      futureActions: [
        {
          action: "replace",
          available: false,
          reason: "requires_new_asset_row_strategy",
        },
        {
          action: "delete",
          available: false,
          reason: "requires_db_storage_consistency",
        },
      ],
      id: "asset-1",
      name: "Neon Logo",
      platform: "twitch",
      preview: {
        expiresAt: "2026-06-26T10:01:00.000Z",
        reason: null,
        status: "available",
        url: "https://signed.example/preview-1",
      },
      status: "active",
      storageState: "attached",
      uploadMetadata: {
        contentType: "image/png",
        fileExtension: "png",
        fileSizeBytes: 2048,
        status: "available",
        storedFilename: "neon-logo.png",
      },
      updatedAt: "2026-06-26T10:00:00.000Z",
      usageContext: "NovaPlays Live",
    },
    {
      assetType: "mystery_pack",
      channelId: null,
      createdAt: "2026-06-25T08:00:00.000Z",
      description: null,
      derivedStatuses: {
        previewCapabilityStatus: "unsupported",
        uploadMetadataStatus: "unavailable",
      },
      futureActions: [
        {
          action: "replace",
          available: false,
          reason: "requires_new_asset_row_strategy",
        },
        {
          action: "delete",
          available: false,
          reason: "requires_db_storage_consistency",
        },
      ],
      id: "asset-2",
      name: "Mystery Pack",
      platform: null,
      preview: {
        expiresAt: null,
        reason: "unsupported_file_type",
        status: "unsupported",
        url: null,
      },
      status: "draft",
      storageState: "none",
      uploadMetadata: {
        contentType: null,
        fileExtension: null,
        fileSizeBytes: null,
        status: "unavailable",
        storedFilename: null,
      },
      updatedAt: "2026-06-25T10:00:00.000Z",
      usageContext: null,
    },
  ],
  lookupIssues: [],
  mutationContract: {
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
  },
  summary: {
    activeAssets: 1,
    archivedAssets: 0,
    draftAssets: 1,
    latestUpdatedAt: "2026-06-26T10:00:00.000Z",
    missingBrandKit: false,
    totalAssets: 2,
    unknownTypeCount: 1,
  },
  typeDistribution: [
    {
      count: 1,
      key: "logo",
    },
    {
      count: 1,
      key: "mystery_pack",
    },
  ],
} satisfies BrandingDashboardReadModel;

void test("branding dashboard contract keeps the feed enums and exact filter ownership stable", () => {
  assert.equal(BRANDING_DASHBOARD_ASSET_LIMIT, 12);
  assert.equal(BRANDING_DASHBOARD_PREVIEW_TTL_SECONDS, 60);
  assert.equal(BRANDING_DASHBOARD_UPLOAD_MAX_FILE_SIZE_BYTES, 5 * 1024 * 1024);
  assert.deepEqual(BRANDING_DASHBOARD_UPLOAD_ALLOWED_MIME_TYPES, [
    "image/png",
    "image/jpeg",
    "image/webp",
  ]);
  assert.deepEqual(BRANDING_DASHBOARD_UPLOAD_ALLOWED_EXTENSIONS, [
    "png",
    "jpg",
    "jpeg",
    "webp",
  ]);
  assert.deepEqual(BRANDING_DASHBOARD_MUTATION_ACTIONS, [
    "replace",
    "delete",
    "orphan_cleanup",
  ]);
  assert.deepEqual(BRANDING_DASHBOARD_MUTATION_BLOCK_REASONS, [
    "requires_db_storage_consistency",
    "requires_new_asset_row_strategy",
    "requires_scoped_manual_cleanup",
  ]);
  assert.deepEqual(BRANDING_DASHBOARD_LOOKUP_SOURCES, ["channels"]);
  assert.deepEqual(BRANDING_DASHBOARD_FEED_SCOPES, [
    "full_result",
    "loaded_sample",
  ]);
  assert.deepEqual(BRANDING_DASHBOARD_FEED_SERVER_SORTS, [
    "updated_desc",
    "created_desc",
    "asset_type",
    "status",
  ]);
  assert.deepEqual(BRANDING_DASHBOARD_FEED_FILTER_OWNERSHIP, {
    assetType: "server_query",
    metadata: "client_window",
    preview: "client_window",
    status: "server_query",
  });
  assert.deepEqual(
    Object.keys(BRANDING_DASHBOARD_FEED_FILTER_OWNERSHIP).sort(),
    ["assetType", "metadata", "preview", "status"],
  );
  assert.deepEqual(BRANDING_DASHBOARD_DERIVED_STATUS_OWNERSHIP, {
    previewCapabilityStatus: "server_managed",
    uploadMetadataStatus: "server_managed",
  });
  assert.deepEqual(BRANDING_DASHBOARD_DERIVED_STATUS_QUERY_GATE, {
    blockedBy: ["requires_server_filter_activation"],
    historicalBackfill: "generated_columns",
    indexesReady: true,
    metadataServerQueryable: false,
    previewServerQueryable: false,
  });
  assert.deepEqual(BRANDING_DASHBOARD_DERIVED_STATUS_QUERY_GATE_BLOCKERS, [
    "requires_server_filter_activation",
  ]);
  assert.deepEqual(BRANDING_DASHBOARD_PREVIEW_CAPABILITY_STATUSES, [
    "previewable",
    "unsupported",
    "missing_storage",
    "invalid_storage",
  ]);
  assert.equal(
    BRANDING_DASHBOARD_PREVIEW_CAPABILITY_STATUSES.includes(
      "signing_failed" as never,
    ),
    false,
  );
  assert.deepEqual(BRANDING_DASHBOARD_PREVIEW_FILTERS, [
    "all",
    "available",
    "unavailable",
  ]);
  assert.deepEqual(BRANDING_DASHBOARD_METADATA_FILTERS, [
    "all",
    "available",
    "invalid",
    "unavailable",
  ]);
});

void test("branding dashboard read model stays read-only and tolerant of unknown asset types", () => {
  assert.equal(sampleReadModel.feed.limit, 12);
  assert.equal(sampleReadModel.feed.scope, "full_result");
  assert.equal(sampleReadModel.feed.serverSort, "updated_desc");
  assert.equal(sampleReadModel.feed.nextCursor, null);
  assert.deepEqual(sampleReadModel.feed.derivedStatusQueryGate, {
    blockedBy: ["requires_server_filter_activation"],
    historicalBackfill: "generated_columns",
    indexesReady: true,
    metadataServerQueryable: false,
    previewServerQueryable: false,
  });
  assert.deepEqual(sampleReadModel.feed.filterOwnership, {
    assetType: "server_query",
    metadata: "client_window",
    preview: "client_window",
    status: "server_query",
  });
  assert.deepEqual(sampleReadModel.feed.serverFilters, {
    assetType: null,
    status: null,
  });
  assert.equal(sampleReadModel.items[0]?.storageState, "attached");
  assert.equal(sampleReadModel.items[0]?.futureActions[0]?.available, false);
  assert.equal(
    sampleReadModel.items[0]?.derivedStatuses.previewCapabilityStatus,
    "previewable",
  );
  assert.equal(
    sampleReadModel.items[0]?.derivedStatuses.uploadMetadataStatus,
    "available",
  );
  assert.equal(sampleReadModel.items[0]?.preview.status, "available");
  assert.equal(
    sampleReadModel.items[0]?.uploadMetadata.contentType,
    "image/png",
  );
  assert.equal(sampleReadModel.items[0]?.uploadMetadata.status, "available");
  assert.equal(sampleReadModel.items[1]?.assetType, "mystery_pack");
  assert.equal(
    sampleReadModel.items[1]?.preview.reason,
    "unsupported_file_type",
  );
  assert.equal(
    sampleReadModel.items[1]?.derivedStatuses.previewCapabilityStatus,
    "unsupported",
  );
  assert.equal(sampleReadModel.items[1]?.uploadMetadata.status, "unavailable");
  assert.equal(sampleReadModel.summary.unknownTypeCount, 1);
  assert.equal(sampleReadModel.coverage.platformCount, 1);
  assert.equal(sampleReadModel.typeDistribution[0]?.key, "logo");
  assert.equal(sampleReadModel.mutationContract.delete.available, false);
  assert.equal(sampleReadModel.mutationContract.replace.action, "replace");
  assert.equal(sampleReadModel.mutationContract["delete"].action, "delete");
  assert.equal(
    sampleReadModel.mutationContract["orphan_cleanup"].reason,
    "requires_scoped_manual_cleanup",
  );
  assert.equal(
    Object.hasOwn(sampleReadModel.mutationContract, "orphanCleanup"),
    false,
  );
});
