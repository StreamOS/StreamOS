import type { StreamPlatform } from "./index.js";

export const CREATOR_GROWTH_INTELLIGENCE_CATEGORIES = [
  "channel_seo",
  "content_metadata",
  "publish_timing",
  "platform_fit",
  "engagement_opportunity",
] as const;

export type CreatorGrowthIntelligenceCategory =
  (typeof CREATOR_GROWTH_INTELLIGENCE_CATEGORIES)[number];

export const CREATOR_GROWTH_RECOMMENDATION_TYPES = [
  "title",
  "description",
  "tags",
  "hashtags",
  "thumbnail_prompt",
  "schedule_hint",
  "platform_positioning",
] as const;

export type CreatorGrowthRecommendationType =
  (typeof CREATOR_GROWTH_RECOMMENDATION_TYPES)[number];

export const CREATOR_GROWTH_RECOMMENDATION_STATUSES = [
  "needs_review",
  "approved",
  "rejected",
  "needs_changes",
] as const;

export type CreatorGrowthRecommendationStatus =
  (typeof CREATOR_GROWTH_RECOMMENDATION_STATUSES)[number];

export type CreatorGrowthIntelligence = {
  channelId: string | null;
  confidence: number | null;
  contentJobId: string | null;
  contentPublicationId: string | null;
  createdAt: string;
  creatorId: string | null;
  evidence: Record<string, unknown>;
  id: string;
  intelligenceCategory: CreatorGrowthIntelligenceCategory;
  metadata: Record<string, unknown>;
  metricsSnapshotId: string | null;
  platform: StreamPlatform | null;
  rationale: string | null;
  recommendationStatus: CreatorGrowthRecommendationStatus;
  recommendationType: CreatorGrowthRecommendationType;
  score: number | null;
  summary: string;
  title: string;
  updatedAt: string;
  userId: string;
};

export type CreatorGrowthIntelligenceCoverage = {
  channels: number;
  contentJobs: number;
  contentPublications: number;
  creators: number;
  metricsSnapshots: number;
};

export type CreatorGrowthIntelligenceSummary = {
  averageConfidence: number | null;
  averageScore: number | null;
  growthOpportunityCount: number;
  lastUpdatedAt: string | null;
  platformFitCount: number;
  reviewQueueCount: number;
  seoHealthScore: number | null;
  signalCount: number;
  sourceLinkedCount: number;
};

export type CreatorGrowthIntelligenceReadModel = {
  coverage: CreatorGrowthIntelligenceCoverage;
  items: CreatorGrowthIntelligence[];
  summary: CreatorGrowthIntelligenceSummary;
};
