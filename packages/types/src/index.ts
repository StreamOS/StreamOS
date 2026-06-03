export const STREAM_PLATFORMS = [
  "twitch",
  "youtube",
  "tiktok",
  "kick",
] as const;

export type StreamPlatform = (typeof STREAM_PLATFORMS)[number];

export const TRANSCRIPTION_TRIGGER_JOB_NAME = "transcription.trigger";
export const DEFAULT_TRANSCRIPTION_QUEUE_NAME = "streamos-transcription";
export const CLIP_GENERATION_JOB_NAME = "clip.generate";
export const DEFAULT_CLIP_GENERATION_QUEUE_NAME = "streamos-clip-generation";

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

export type ClipGenerationJobData = {
  stream_id: string;
  creator_id?: string;
  requested_by: string;
  source_platform: StreamPlatform;
  source_url: string;
  transcript: string;
};

export type ConnectionStatus = "connected" | "expired" | "revoked" | "pending";
export type ContentJobType =
  | "transcription"
  | "clip_scoring"
  | "title_generation";
export type ContentJobStatus = "pending" | "running" | "done" | "failed";
export type VodAssetStatus =
  | "ingested"
  | "transcribing"
  | "transcribed"
  | "failed";
export type StreamHighlightSource = "transcript" | "clip_scoring" | "manual";
export type ClipStatus =
  | "draft"
  | "queued"
  | "rendering"
  | "ready"
  | "failed"
  | "published";
export type ClipExportStatus = ClipStatus;
export type BrandAssetType =
  | "overlay"
  | "alert"
  | "logo"
  | "banner"
  | "panel"
  | "emote"
  | "color_palette"
  | "typography"
  | "scene";
export type BrandAssetStatus = "draft" | "active" | "archived";
export type MonetizationEventType =
  | "subscription"
  | "membership"
  | "donation"
  | "bits"
  | "ad_revenue"
  | "merch_sale"
  | "sponsorship"
  | "affiliate"
  | "other";
export type MonetizationEventStatus =
  | "pending"
  | "confirmed"
  | "disputed"
  | "refunded"
  | "failed";

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

export type VodAsset = {
  id: string;
  userId: string;
  streamId: string;
  platform: StreamPlatform;
  sourceUrl: string;
  externalAssetId: string | null;
  status: VodAssetStatus;
  durationSeconds: number | null;
  ingestedAt: string;
  transcribedAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type StreamTranscript = {
  id: string;
  userId: string;
  streamId: string;
  vodAssetId: string | null;
  language: string;
  provider: string;
  model: string;
  transcriptText: string;
  segments: TranscriptionSegment[];
  createdAt: string;
  updatedAt: string;
};

export type StreamHighlight = {
  id: string;
  userId: string;
  streamId: string;
  transcriptId: string | null;
  sourceQueueJobId: string | null;
  source: StreamHighlightSource;
  rank: number;
  score: number | null;
  title: string | null;
  summary: string;
  sourceStartSeconds: number | null;
  sourceEndSeconds: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type Clip = {
  id: string;
  userId: string;
  streamId: string;
  highlightId: string | null;
  sourceQueueJobId: string | null;
  title: string;
  description: string | null;
  sourceUrl: string | null;
  sourceStartSeconds: number | null;
  sourceEndSeconds: number | null;
  viralityScore: number | null;
  status: ClipStatus;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ClipExport = {
  id: string;
  userId: string;
  clipId: string;
  targetPlatform: StreamPlatform | null;
  exportFormat: string;
  status: ClipExportStatus;
  renderUrl: string | null;
  publishedUrl: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type BrandAsset = {
  id: string;
  userId: string;
  creatorId: string | null;
  channelId: string | null;
  assetType: BrandAssetType;
  status: BrandAssetStatus;
  name: string;
  description: string | null;
  storageBucket: string | null;
  storagePath: string | null;
  publicUrl: string | null;
  config: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type MonetizationEvent = {
  id: string;
  userId: string;
  creatorId: string | null;
  channelId: string | null;
  streamId: string | null;
  platform: StreamPlatform | null;
  eventType: MonetizationEventType;
  status: MonetizationEventStatus;
  source: string;
  externalEventId: string | null;
  amountCents: number;
  currency: string;
  quantity: number;
  payerHandle: string | null;
  sponsorName: string | null;
  occurredAt: string;
  metadata: Record<string, unknown>;
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
