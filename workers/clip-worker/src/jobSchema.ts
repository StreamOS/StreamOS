import type { ClipGenerationJobData } from "@streamos/types";
import { z } from "zod";

export const CLIP_GENERATION_JOB_NAME = "clip.generate";
export const STREAM_PLATFORMS = [
  "twitch",
  "youtube",
  "tiktok",
  "kick",
] as const;

export const clipGenerationJobDataSchema = z.object({
  stream_id: z.string().uuid(),
  creator_id: z.string().uuid().optional(),
  requested_by: z.string().uuid(),
  source_platform: z.enum(STREAM_PLATFORMS),
  source_url: z.string().url(),
  transcript: z.string().trim().min(1).max(60_000),
}) satisfies z.ZodType<ClipGenerationJobData, z.ZodTypeDef, unknown>;
