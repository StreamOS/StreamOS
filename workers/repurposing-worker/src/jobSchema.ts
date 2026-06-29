import { z } from "zod";

import type { RepurposingPlanQueueJobPayload } from "@streamos/types/jobs";

export const REPURPOSING_PLAN_JOB_NAME = "repurposing.plan";

const supportedMediaProviders = [
  "twitch",
  "youtube",
  "tiktok",
  "kick",
] as const;

const repurposingAssetReferenceSchema = z.object({
  kind: z.string().trim().min(1).optional(),
  status: z.string().trim().min(1).optional(),
  url: z.string().url(),
});

const repurposingTranscriptReferenceSchema = z.object({
  language: z.string().trim().min(1).optional(),
  queue_job_id: z.string().trim().min(1).optional(),
  stream_id: z.string().trim().min(1).optional(),
  transcript_id: z.string().trim().min(1).optional(),
});

export const repurposingPlanJobDataSchema = z.object({
  asset_reference: repurposingAssetReferenceSchema.optional(),
  brand_context: z.record(z.string(), z.unknown()).optional(),
  content_job_id: z.string().uuid(),
  content_policy_hints: z.record(z.string(), z.unknown()).optional(),
  language: z.string().trim().min(1).optional(),
  locale: z.string().trim().min(1).optional(),
  manual_review_required: z.literal(true),
  provider: z.enum(supportedMediaProviders),
  provider_video_id: z.string().trim().min(1).optional(),
  queue_job_id: z.string().trim().min(1).max(220),
  source_event_type: z.literal("video.published"),
  source_metadata: z.record(z.string(), z.unknown()),
  target_platforms: z.array(z.enum(supportedMediaProviders)).min(1).optional(),
  transcript_reference: repurposingTranscriptReferenceSchema.optional(),
  user_id: z.string().uuid(),
}) satisfies z.ZodType<RepurposingPlanQueueJobPayload>;

export type RepurposingPlanQueueJobData = z.infer<
  typeof repurposingPlanJobDataSchema
>;
