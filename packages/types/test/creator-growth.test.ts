import assert from "node:assert/strict";
import test from "node:test";

import {
  CREATOR_GROWTH_INTELLIGENCE_CATEGORIES,
  CREATOR_GROWTH_RECOMMENDATION_STATUSES,
  CREATOR_GROWTH_RECOMMENDATION_TYPES,
  type CreatorGrowthIntelligence,
  type CreatorGrowthIntelligenceReadModel,
} from "../src/creator-growth.js";

const sampleIntelligence = {
  channelId: "44444444-4444-4444-8444-444444444444",
  confidence: 87,
  contentJobId: "22222222-2222-4222-8222-222222222222",
  contentPublicationId: null,
  createdAt: "2026-06-25T10:00:00.000Z",
  creatorId: "11111111-1111-4111-8111-111111111111",
  evidence: {
    topKeywords: ["ranked clutch", "aim routine"],
    watchTimeMinutes: 1440,
  },
  id: "33333333-3333-4333-8333-333333333333",
  intelligenceCategory: "channel_seo",
  metadata: {
    origin: "automation-service",
  },
  metricsSnapshotId: "55555555-5555-4555-8555-555555555555",
  platform: "twitch",
  rationale: "Title and metadata under-index the strongest stream keywords.",
  recommendationStatus: "needs_review",
  recommendationType: "title",
  score: 84,
  summary: "The current title misses the highest-value SEO phrase cluster.",
  title: "Tune the stream title for keyword recall",
  updatedAt: "2026-06-25T10:05:00.000Z",
  userId: "11111111-1111-4111-8111-111111111111",
} satisfies CreatorGrowthIntelligence;

const sampleReadModel = {
  coverage: {
    channels: 1,
    contentJobs: 1,
    contentPublications: 0,
    creators: 1,
    metricsSnapshots: 1,
  },
  items: [sampleIntelligence],
  summary: {
    averageConfidence: 87,
    averageScore: 84,
    growthOpportunityCount: 1,
    lastUpdatedAt: "2026-06-25T10:05:00.000Z",
    platformFitCount: 0,
    reviewQueueCount: 1,
    seoHealthScore: 84,
    signalCount: 1,
    sourceLinkedCount: 1,
  },
} satisfies CreatorGrowthIntelligenceReadModel;

void test("creator growth intelligence contract keeps the review-oriented enums stable", () => {
  assert.deepEqual(CREATOR_GROWTH_INTELLIGENCE_CATEGORIES, [
    "channel_seo",
    "content_metadata",
    "publish_timing",
    "platform_fit",
    "engagement_opportunity",
  ]);
  assert.deepEqual(CREATOR_GROWTH_RECOMMENDATION_TYPES, [
    "title",
    "description",
    "tags",
    "hashtags",
    "thumbnail_prompt",
    "schedule_hint",
    "platform_positioning",
  ]);
  assert.deepEqual(CREATOR_GROWTH_RECOMMENDATION_STATUSES, [
    "needs_review",
    "approved",
    "rejected",
    "needs_changes",
  ]);
});

void test("creator growth intelligence read model remains tenant scoped and reviewable", () => {
  assert.equal(
    sampleIntelligence.userId,
    "11111111-1111-4111-8111-111111111111",
  );
  assert.equal(sampleIntelligence.recommendationStatus, "needs_review");
  assert.equal(sampleIntelligence.score, 84);
  assert.equal(sampleReadModel.summary.reviewQueueCount, 1);
  assert.equal(sampleReadModel.coverage.metricsSnapshots, 1);
  assert.equal(sampleReadModel.summary.sourceLinkedCount, 1);
});
