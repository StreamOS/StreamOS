import { createHash } from "node:crypto";

export const CHAT_ACTIVITY_VALUES = ["high", "medium", "low"] as const;

export type ChatActivity = (typeof CHAT_ACTIVITY_VALUES)[number];

export type ClipAnalysisFormValues = {
  category: string | null;
  chatActivity: ChatActivity;
  sourceUrl: string;
};

export type ClipGenerationQueuePayload = {
  creator_id: string;
  requested_by: string;
  source_url: string;
  stream_id: string;
};

export function parseClipAnalysisFormData(
  formData: FormData,
): ClipAnalysisFormValues {
  const sourceUrl = String(formData.get("vodUrl") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const chatActivityValue = String(formData.get("chatActivity") ?? "medium");
  const chatActivity = CHAT_ACTIVITY_VALUES.includes(
    chatActivityValue as ChatActivity,
  )
    ? (chatActivityValue as ChatActivity)
    : "medium";

  const parsedUrl = new URL(sourceUrl);

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("VOD URL must use http or https.");
  }

  return {
    category: category || null,
    chatActivity,
    sourceUrl: parsedUrl.toString(),
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
  sourceUrl,
  streamId,
}: {
  creatorId: string;
  requestedBy: string;
  sourceUrl: string;
  streamId: string;
}): ClipGenerationQueuePayload {
  return {
    creator_id: creatorId,
    requested_by: requestedBy,
    source_url: sourceUrl,
    stream_id: streamId,
  };
}

function hashUrlSafe(value: string): string {
  return createHash("sha256").update(value.trim()).digest("base64url");
}
