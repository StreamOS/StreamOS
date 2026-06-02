export const STREAM_PLATFORMS = [
  "twitch",
  "youtube",
  "tiktok",
  "kick",
] as const;

export type StreamPlatform = (typeof STREAM_PLATFORMS)[number];

export const TRANSCRIPTION_TRIGGER_JOB_NAME = "transcription.trigger";
export const DEFAULT_TRANSCRIPTION_QUEUE_NAME = "streamos-transcription";

export type TranscriptionTriggerJobData = {
  user_id: string;
  stream_id: string;
  platform: StreamPlatform;
  creator_id?: string;
  channel_id?: string;
  vod_asset_url: string;
  ended_at?: string;
  language: string;
  trigger: "stream_ended";
};

export type ConnectionStatus = "connected" | "expired" | "revoked" | "pending";
export type ContentJobType =
  | "transcription"
  | "clip_scoring"
  | "title_generation";
export type ContentJobStatus = "pending" | "running" | "done" | "failed";

export type TranscriptionSegment = {
  end: number;
  start: number;
  text: string;
};

export type TranscriptionJobResult = {
  segments: TranscriptionSegment[];
  transcript: string;
};

export type FailedContentJobResult = {
  error: string;
};

export type Creator = {
  id: string;
  ownerId: string;
  displayName: string;
  handle: string | null;
  niche: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ConnectedPlatform = {
  id: StreamPlatform;
  displayName: string;
  followerCount: number;
  connectedAt: string | null;
};

export type PlatformConnection = {
  id: string;
  creatorId: string;
  channelId: string | null;
  platform: StreamPlatform;
  providerAccountId: string;
  scopes: string[];
  expiresAt: string | null;
  connectedAt: string;
  status: ConnectionStatus;
};

export type CreatorMetric = {
  id: string;
  creatorId: string;
  channelId: string;
  platform: StreamPlatform;
  capturedAt: string;
  viewerCount: number;
  followerCount: number;
  watchTimeMinutes: number;
  revenueCents: number;
  engagementRate: number | null;
};

export type Stream = {
  id: string;
  userId: string;
  channelId: string;
  platformStreamId: string;
  startedAt: string | null;
  endedAt: string | null;
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ContentJob = {
  id: string;
  userId: string;
  streamId: string | null;
  queueJobId: string | null;
  jobType: ContentJobType;
  status: ContentJobStatus;
  payload: Record<string, unknown>;
  result:
    | TranscriptionJobResult
    | FailedContentJobResult
    | Record<string, unknown>
    | null;
  errorMessage: string | null;
  retryCount: number;
  maxRetries: number;
  lastRetriedAt: string | null;
  nextRetryAt: string | null;
  createdAt: string;
  updatedAt: string;
};
