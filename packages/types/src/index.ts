export const AUTH_ERROR_CODES = [
  "callback_exchange_failed",
  "confirmation_failed",
  "invalid_credentials",
  "invalid_email",
  "missing_callback_params",
  "password_mismatch",
  "password_reset_failed",
  "password_update_failed",
  "profile_bootstrap_failed",
  "reset_session_required",
  "session_expired",
  "signup_failed",
  "supabase_not_configured",
  "unauthorized",
] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

export type AuthError = {
  code: AuthErrorCode;
  message: string;
  status: number;
};

export type AuthMessageCode =
  | "check_email"
  | "email_confirmed"
  | "password_reset_sent"
  | "password_updated";

export type UserProfile = {
  id: string;
  userId: string;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DashboardAuthUser = {
  id: string;
  email: string | null;
  emailConfirmedAt: string | null;
  profileCreated: boolean;
};

export const SUPPORTED_PROVIDERS = [
  "twitch",
  "youtube",
  "tiktok",
  "kick",
] as const;

export type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

export type MetricsSnapshot = {
  user_id: string;
  channel_id: string;
  provider: SupportedProvider;
  snapshot_at: string;
  followers: number | null;
  views: number | null;
  subscribers: number | null;
  peak_viewers: number | null;
  data: Record<string, unknown>;
};

export type MetricsSyncRequest = {
  providers: SupportedProvider[];
};

export type MetricsSyncErrorCode =
  | "CONNECTION_NOT_FOUND"
  | "DB_WRITE_FAILED"
  | "PROVIDER_FETCH_FAILED"
  | "RATE_LIMITED"
  | "TOKEN_DECRYPT_FAILED"
  | "TOKEN_REFRESH_FAILED";

export type MetricsSyncFailure = {
  provider: SupportedProvider;
  reason: string;
  code: MetricsSyncErrorCode;
};

export type MetricsSyncResponse = {
  synced: SupportedProvider[];
  failed: MetricsSyncFailure[];
};

export const STREAM_PLATFORMS = [
  "twitch",
  "youtube",
  "tiktok",
  "kick",
] as const;

export type StreamPlatform = (typeof STREAM_PLATFORMS)[number];

export const CREATOR_PRIMARY_LANGUAGES = ["DE", "EN", "Other"] as const;

export type CreatorPrimaryLanguage = (typeof CREATOR_PRIMARY_LANGUAGES)[number];

export type OnboardingStep = 0 | 1 | 2 | 3;

export type CreatorProfile = {
  id: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  primaryLanguage: CreatorPrimaryLanguage;
  onboardingStep: OnboardingStep;
  onboardingCompleted: boolean;
  createdAt: string;
  updatedAt: string;
};

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
  | "repurposing"
  | "clip_scoring"
  | "title_generation";
export type ContentJobStatus =
  | "pending"
  | "running"
  | "processing"
  | "done"
  | "completed"
  | "failed"
  | "cancelled";
export type VodAssetStatus =
  | "ingested"
  | "transcribing"
  | "transcribed"
  | "failed";
export type StreamHighlightSource = "transcript" | "clip_scoring" | "manual";
export type ClipStatus =
  | "pending"
  | "draft"
  | "queued"
  | "rendering"
  | "ready"
  | "failed"
  | "published";
export type ClipExportStatus = Exclude<ClipStatus, "pending">;
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
  | "tip"
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
  | "void"
  | "disputed"
  | "refunded"
  | "failed";
export type MonetizationSummaryPeriod = "daily" | "weekly";

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

export type OAuthProvider = Exclude<StreamPlatform, "twitch">;

export type OAuthErrorCode =
  | "invalid_state"
  | "oauth_exchange_failed"
  | "oauth_setup_missing"
  | "provider_not_supported"
  | "token_persistence_failed"
  | "user_handoff_invalid";

export type OAuthProviderProfile = {
  provider: OAuthProvider;
  providerAccountId: string;
  displayName: string;
  avatarUrl: string | null;
  handle: string | null;
  followerCount: number;
};

export type OAuthConnectionResult = {
  channelId: string;
  connectionId: string;
  expiresAt: string | null;
  profile: OAuthProviderProfile;
  scopes: string[];
};

export type GatewayHandoffTokenClaims = {
  creator_id: string;
  user_id: string;
  userid: string;
};

export type GatewayConnectResponse = {
  gateway_url: string;
  handoff_token: string;
};

export type GatewayHandoffSessionResponse = {
  expires_in: number;
  gateway_session_token: string;
};

export type GatewayHandoffErrorCode =
  | "handoff_invalid"
  | "handoff_missing"
  | "handoff_setup_missing";

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
  provider: StreamPlatform;
  streamId: string;
  platformStreamId: string;
  startedAt: string | null;
  endedAt: string | null;
  title: string | null;
  gameName: string | null;
  viewerPeak: number | null;
  status: "live" | "updated" | "ended" | "published";
  peakViewers: number | null;
  averageViewers: number | null;
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
  clipUrl: string | null;
  thumbnailUrl: string | null;
  sourceStartSeconds: number | null;
  sourceEndSeconds: number | null;
  viralityScore: number | null;
  viralScore: number | null;
  durationSeconds: number | null;
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
  channelId: string;
  streamId: string | null;
  provider: StreamPlatform;
  eventType: MonetizationEventType;
  status: MonetizationEventStatus;
  source: string;
  externalEventId: string | null;
  providerEventId: string | null;
  rawEventId: string | null;
  amountCents: number;
  currency: string;
  quantity: number;
  payerHandle: string | null;
  sponsorName: string | null;
  occurredAt: string;
  ingestedAt: string;
  rawPayload: Record<string, unknown>;
  attribution: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type MonetizationSummary = {
  id: string;
  userId: string;
  creatorId: string | null;
  channelId: string;
  provider: StreamPlatform;
  period: MonetizationSummaryPeriod;
  periodStart: string;
  periodEnd: string;
  currency: string;
  grossAmountCents: number;
  netAmountCents: number;
  eventCount: number;
  subscriptionCount: number;
  tipCount: number;
  donationCount: number;
  adRevenueCount: number;
  sponsorshipCount: number;
  merchSaleCount: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ContentJob = {
  id: string;
  userId: string;
  streamId: string | null;
  channelId: string | null;
  queueJobId: string | null;
  jobType: ContentJobType;
  type: ContentJobType;
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
