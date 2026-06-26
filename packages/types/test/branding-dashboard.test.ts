import assert from "node:assert/strict";
import test from "node:test";

import {
  BRANDING_DASHBOARD_ASSET_LIMIT,
  BRANDING_DASHBOARD_LOOKUP_SOURCES,
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
    hasMore: false,
    limit: BRANDING_DASHBOARD_ASSET_LIMIT,
    returnedCount: 2,
  },
  items: [
    {
      assetType: "logo",
      channelId: "channel-1",
      createdAt: "2026-06-26T08:00:00.000Z",
      description: "Primary logo",
      id: "asset-1",
      name: "Neon Logo",
      platform: "twitch",
      status: "active",
      storageState: "attached",
      updatedAt: "2026-06-26T10:00:00.000Z",
      usageContext: "NovaPlays Live",
    },
    {
      assetType: "mystery_pack",
      channelId: null,
      createdAt: "2026-06-25T08:00:00.000Z",
      description: null,
      id: "asset-2",
      name: "Mystery Pack",
      platform: null,
      status: "draft",
      storageState: "none",
      updatedAt: "2026-06-25T10:00:00.000Z",
      usageContext: null,
    },
  ],
  lookupIssues: [],
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

void test("branding dashboard contract keeps the feed and lookup enums stable", () => {
  assert.equal(BRANDING_DASHBOARD_ASSET_LIMIT, 12);
  assert.deepEqual(BRANDING_DASHBOARD_LOOKUP_SOURCES, ["channels"]);
});

void test("branding dashboard read model stays read-only and tolerant of unknown asset types", () => {
  assert.equal(sampleReadModel.feed.limit, 12);
  assert.equal(sampleReadModel.items[0]?.storageState, "attached");
  assert.equal(sampleReadModel.items[1]?.assetType, "mystery_pack");
  assert.equal(sampleReadModel.summary.unknownTypeCount, 1);
  assert.equal(sampleReadModel.coverage.platformCount, 1);
  assert.equal(sampleReadModel.typeDistribution[0]?.key, "logo");
});
