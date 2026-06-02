import type { TranscriptionTriggerJobData } from "@streamos/types";
import { z } from "zod";

export const CLIP_GENERATION_JOB_NAME = "clip.generate";
export const TRANSCRIPTION_TRIGGER_JOB_NAME = "transcription.trigger";

export const clipGenerationPayloadSchema = z.object({
  stream_id: z.string().trim().min(1),
  creator_id: z.string().trim().min(1).optional(),
  source_url: z.string().url().optional(),
  requested_by: z.string().trim().min(1).optional(),
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
