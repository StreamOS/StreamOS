import { createHash } from "node:crypto";

export const CHAT_ACTIVITY_VALUES = ["high", "medium", "low"] as const;
export const CLIP_SOURCE_PLATFORM_VALUES = [
  "twitch",
  "youtube",
  "tiktok",
  "kick",
] as const;

export type ChatActivity = (typeof CHAT_ACTIVITY_VALUES)[number];
export type ClipSourcePlatform = (typeof CLIP_SOURCE_PLATFORM_VALUES)[number];

export type ClipAnalysisFormValues = {
  category: string | null;
  chatActivity: ChatActivity;
  sourcePlatform: ClipSourcePlatform;
  sourceUrl: string;
  transcript: string;
};

export type ClipGenerationQueuePayload = {
  creator_id: string;
  requested_by: string;
  source_platform: ClipSourcePlatform;
  source_url: string;
  stream_id: string;
  transcript: string;
};

export function parseClipAnalysisFormData(
  formData: FormData,
): ClipAnalysisFormValues {
  const sourceUrl = String(formData.get("vodUrl") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const chatActivityValue = String(formData.get("chatActivity") ?? "medium");
  const sourcePlatformValue = String(formData.get("sourcePlatform") ?? "");
  const transcript = String(formData.get("transcript") ?? "").trim();
  const chatActivity = CHAT_ACTIVITY_VALUES.includes(
    chatActivityValue as ChatActivity,
  )
    ? (chatActivityValue as ChatActivity)
    : "medium";
  const sourcePlatform = CLIP_SOURCE_PLATFORM_VALUES.includes(
    sourcePlatformValue as ClipSourcePlatform,
  )
    ? (sourcePlatformValue as ClipSourcePlatform)
    : "twitch";

  const parsedUrl = new URL(sourceUrl);

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("VOD URL must use http or https.");
  }

  if (!transcript) {
    throw new Error("Transcript is required for clip analysis.");
  }

  if (transcript.length > 60_000) {
    throw new Error("Transcript must be 60000 characters or fewer.");
  }

  return {
    category: category || null,
    chatActivity,
    sourcePlatform,
    sourceUrl: parsedUrl.toString(),
    transcript,
  };
}

export function getClipPlatformStreamId(sourceUrl: string): string {
  return `vod-${hashUrlSafe(sourceUrl).slice(0, 32)}`;
}

export function getClipGenerationQueueJobId(streamId: string): string {
  const normalizedStreamId = streamId.trim();

  if (!normalizedStreamId) {
    throw new Error("Clip generation job ID requires a stream ID.");
  }

  return `clip-generation-${hashUrlSafe(normalizedStreamId)}`;
}

export function buildClipGenerationQueuePayload({
  creatorId,
  requestedBy,
  sourcePlatform,
  sourceUrl,
  streamId,
  transcript,
}: {
  creatorId: string;
  requestedBy: string;
  sourcePlatform: ClipSourcePlatform;
  sourceUrl: string;
  streamId: string;
  transcript: string;
}): ClipGenerationQueuePayload {
  return {
    creator_id: creatorId,
    requested_by: requestedBy,
    source_platform: sourcePlatform,
    source_url: sourceUrl,
    stream_id: streamId,
    transcript,
  };
}

function hashUrlSafe(value: string): string {
  return createHash("sha256").update(value.trim()).digest("base64url");
}
