import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTENT_PERFORMANCE_ANALYTICS_FEED_LIMIT,
  CONTENT_PERFORMANCE_COVERAGE_STATUSES,
  CONTENT_PERFORMANCE_LOOKUP_SOURCES,
  CONTENT_PERFORMANCE_METRIC_AVAILABILITIES,
  type ContentPerformanceReadModel,
} from "../src/content-performance-analytics.js";

const sampleReadModel = {
  coverage: {
    linkedItems: 1,
    metricsOnlyItems: 0,
    metricsSnapshots: 1,
    platforms: 1,
    publicationOnlyItems: 0,
    publications: 1,
    publishedPublications: 1,
    scheduledPublications: 0,
  },
  feed: {
    hasMore: false,
    limit: CONTENT_PERFORMANCE_ANALYTICS_FEED_LIMIT,
    returnedCount: 1,
  },
  items: [
    {
      channelDisplayName: "NovaPlays Live",
      channelId: "11111111-1111-4111-8111-111111111111",
      contentJobId: "22222222-2222-4222-8222-222222222222",
      contentTitle: "Launch short for ranked highlights",
      coverageStatus: "linked",
      ctr: {
        availability: "not_tracked",
        value: null,
      },
      engagementRate: {
        availability: "available",
        value: 7.8,
      },
      id: "publication:33333333-3333-4333-8333-333333333333",
      kind: "publication",
      metricsSnapshotId: "44444444-4444-4444-8444-444444444444",
      platform: "youtube",
      primaryTimestamp: "2026-06-25T10:30:00.000Z",
      publicationId: "33333333-3333-4333-8333-333333333333",
      publicationStatus: "published",
      publishedAt: "2026-06-25T10:00:00.000Z",
      requestedAt: "2026-06-25T09:45:00.000Z",
      scheduleStatus: "completed",
      scheduledAt: null,
      snapshotCapturedAt: "2026-06-25T10:30:00.000Z",
      views: {
        availability: "available",
        value: 18400,
      },
      watchTimeMinutes: {
        availability: "available",
        value: 920,
      },
    },
  ],
  lookupIssues: [],
  platformComparison: [
    {
      ctr: {
        availability: "not_tracked",
        value: null,
      },
      engagementRate: {
        availability: "available",
        value: 7.8,
      },
      itemCount: 1,
      latestSnapshotAt: "2026-06-25T10:30:00.000Z",
      linkedCount: 1,
      metricsOnlyCount: 0,
      platform: "youtube",
      publicationCount: 1,
      publicationOnlyCount: 0,
      publishedCount: 1,
      scheduledCount: 0,
      views: {
        availability: "available",
        value: 18400,
      },
      watchTimeMinutes: {
        availability: "available",
        value: 920,
      },
    },
  ],
  summary: {
    averageEngagementRate: {
      availability: "available",
      value: 7.8,
    },
    itemCount: 1,
    latestActivityAt: "2026-06-25T10:30:00.000Z",
    latestSnapshotAt: "2026-06-25T10:30:00.000Z",
    linkedCount: 1,
    metricsOnlyCount: 0,
    platformCount: 1,
    publicationCount: 1,
    publicationOnlyCount: 0,
    sampleMetricsCount: 1,
    totalViews: {
      availability: "available",
      value: 18400,
    },
    totalWatchTimeMinutes: {
      availability: "available",
      value: 920,
    },
  },
} satisfies ContentPerformanceReadModel;

void test("content performance analytics contract keeps analytics enums stable", () => {
  assert.deepEqual(CONTENT_PERFORMANCE_METRIC_AVAILABILITIES, [
    "available",
    "not_tracked",
    "unavailable",
  ]);
  assert.deepEqual(CONTENT_PERFORMANCE_COVERAGE_STATUSES, [
    "linked",
    "metrics_only",
    "publication_only",
  ]);
  assert.deepEqual(CONTENT_PERFORMANCE_LOOKUP_SOURCES, [
    "channels",
    "contentJobs",
    "metricsSnapshots",
    "platformConnections",
    "publications",
  ]);
});

void test("content performance analytics read model remains sample-scoped and explicit about unavailable metrics", () => {
  assert.equal(CONTENT_PERFORMANCE_ANALYTICS_FEED_LIMIT, 12);
  assert.equal(sampleReadModel.feed.limit, 12);
  assert.equal(sampleReadModel.lookupIssues.length, 0);
  assert.equal(sampleReadModel.items[0]?.coverageStatus, "linked");
  assert.equal(sampleReadModel.items[0]?.ctr.availability, "not_tracked");
  assert.equal(sampleReadModel.items[0]?.engagementRate.value, 7.8);
  assert.equal(sampleReadModel.summary.totalViews.value, 18400);
  assert.equal(sampleReadModel.coverage.metricsSnapshots, 1);
  assert.equal(sampleReadModel.platformComparison[0]?.publishedCount, 1);
});
