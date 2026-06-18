import type { TranscriptionTriggerJobData } from "@streamos/types";
import type {
  RepurposingPlanJobPayload,
  RepurposingPlanQueueJobPayload,
} from "@streamos/types/jobs";
import { z } from "zod";

export const CLIP_GENERATION_JOB_NAME = "clip.generate";
export const TRANSCRIPTION_TRIGGER_JOB_NAME = "transcription.trigger";
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

export const clipGenerationPayloadSchema = z.object({
  stream_id: z.string().trim().min(1),
  creator_id: z.string().trim().min(1).optional(),
  source_platform: z.enum(["twitch", "youtube", "tiktok", "kick"]),
  source_url: z.string().url(),
  requested_by: z.string().trim().min(1),
  transcript: z.string().trim().min(1).max(60_000),
});

export type ClipGenerationJobData = z.infer<typeof clipGenerationPayloadSchema>;

export const transcriptionTriggerJobDataSchema = z.object({
  user_id: z.string().uuid(),
  stream_id: z.string().uuid(),
  platform: z.enum(["twitch", "youtube", "tiktok", "kick"]),
  creator_id: z.string().uuid().optional(),
  channel_id: z.string().uuid().optional(),
  vod_asset_url: z.string().url(),
  ended_at: z.string().datetime().optional(),
  language: z.string().trim().min(1).default("auto"),
  trigger: z.literal("stream_ended"),
}) satisfies z.ZodType<TranscriptionTriggerJobData, z.ZodTypeDef, unknown>;

export const repurposingPlanJobPayloadSchema = z.object({
  auto_repurpose_enabled: z.literal(true),
  brand_profile_id: z.string().trim().min(1).optional(),
  channel_id: z.string().trim().min(1),
  content_policy_profile: z.string().trim().min(1).optional(),
  creator_id: z.string().trim().min(1).optional(),
  enrichment_status: z.literal("asset_available"),
  manual_review_required: z.literal(true),
  published_at: z.string().trim().min(1).optional(),
  source_event_type: z.literal("video.published"),
  source_provider: z.enum(supportedMediaProviders),
  source_video_id: z.string().trim().min(1),
  source_video_title: z.string().trim().min(1).optional(),
  stream_id: z.string().trim().min(1),
  target_platforms: z.array(z.enum(supportedMediaProviders)).min(1).optional(),
  updated_at: z.string().trim().min(1).optional(),
  user_id: z.string().uuid(),
  vod_asset_url: z.string().url(),
  workflow: z.literal("repurposing_plan"),
}) satisfies z.ZodType<RepurposingPlanJobPayload, z.ZodTypeDef, unknown>;

export const repurposingPlanQueueJobPayloadSchema = z.object({
  asset_reference: repurposingAssetReferenceSchema.optional(),
  brand_context: z.record(z.unknown()).optional(),
  content_job_id: z.string().uuid(),
  content_policy_hints: z.record(z.unknown()).optional(),
  language: z.string().trim().min(1).optional(),
  locale: z.string().trim().min(1).optional(),
  manual_review_required: z.literal(true),
  provider: z.enum(supportedMediaProviders),
  provider_video_id: z.string().trim().min(1).optional(),
  queue_job_id: z.string().trim().min(1).max(220),
  source_event_type: z.literal("video.published"),
  source_metadata: repurposingPlanJobPayloadSchema,
  target_platforms: z.array(z.enum(supportedMediaProviders)).min(1).optional(),
  transcript_reference: repurposingTranscriptReferenceSchema.optional(),
  user_id: z.string().uuid(),
}) satisfies z.ZodType<RepurposingPlanQueueJobPayload, z.ZodTypeDef, unknown>;
