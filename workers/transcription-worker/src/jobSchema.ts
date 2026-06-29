import type { TranscriptionTriggerJobData } from "@streamos/types";
import { z } from "zod";

export const STREAM_PLATFORMS = [
  "twitch",
  "youtube",
  "tiktok",
  "kick",
] as const;
export const TRANSCRIPTION_TRIGGER_JOB_NAME = "transcription.trigger";

export const transcriptionTriggerJobDataSchema = z.object({
  user_id: z.string().uuid(),
  stream_id: z.string().uuid(),
  platform: z.enum(STREAM_PLATFORMS),
  creator_id: z.string().uuid().optional(),
  channel_id: z.string().uuid().optional(),
  vod_asset_url: z.string().url(),
  ended_at: z.string().datetime().optional(),
  language: z.string().trim().min(1).default("auto"),
  trigger: z.literal("stream_ended"),
}) satisfies z.ZodType<TranscriptionTriggerJobData>;
