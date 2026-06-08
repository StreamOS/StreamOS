export const JOB_TYPE_DB_VALUES = [
  "transcription",
  "repurposing",
  "clip_scoring",
  "title_generation",
] as const;

export type JobTypeDb = (typeof JOB_TYPE_DB_VALUES)[number];

export enum JobType {
  TRANSCRIPTION = "TRANSCRIPTION",
  REPURPOSING = "REPURPOSING",
  CLIP_SCORING = "CLIP_SCORING",
  TITLE_GENERATION = "TITLE_GENERATION",
}

export const JOB_TYPES = Object.values(JobType);

export const JOB_TYPE_DB_MAP: Record<JobType, JobTypeDb> = {
  [JobType.TRANSCRIPTION]: "transcription",
  [JobType.REPURPOSING]: "repurposing",
  [JobType.CLIP_SCORING]: "clip_scoring",
  [JobType.TITLE_GENERATION]: "title_generation",
};

export const JOB_TYPE_DOMAIN_MAP: Record<JobTypeDb, JobType> = {
  transcription: JobType.TRANSCRIPTION,
  repurposing: JobType.REPURPOSING,
  clip_scoring: JobType.CLIP_SCORING,
  title_generation: JobType.TITLE_GENERATION,
};

export function toDbJobType(type: JobType): JobTypeDb {
  return JOB_TYPE_DB_MAP[type];
}

export function toDomainJobType(type: JobTypeDb): JobType {
  return JOB_TYPE_DOMAIN_MAP[type];
}

export const JOB_STATUS_DB_VALUES = [
  "pending",
  "running",
  "processing",
  "done",
  "completed",
  "failed",
  "cancelled",
] as const;

export type JobStatusDb = (typeof JOB_STATUS_DB_VALUES)[number];

export enum JobStatus {
  PENDING = "PENDING",
  RUNNING = "RUNNING",
  PROCESSING = "PROCESSING",
  DONE = "DONE",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}

export const JOB_STATUSES = Object.values(JobStatus);

export const JOB_STATUS_DB_MAP: Record<JobStatus, JobStatusDb> = {
  [JobStatus.PENDING]: "pending",
  [JobStatus.RUNNING]: "running",
  [JobStatus.PROCESSING]: "processing",
  [JobStatus.DONE]: "done",
  [JobStatus.COMPLETED]: "completed",
  [JobStatus.FAILED]: "failed",
  [JobStatus.CANCELLED]: "cancelled",
};

export const JOB_STATUS_DOMAIN_MAP: Record<JobStatusDb, JobStatus> = {
  pending: JobStatus.PENDING,
  running: JobStatus.RUNNING,
  processing: JobStatus.PROCESSING,
  done: JobStatus.DONE,
  completed: JobStatus.COMPLETED,
  failed: JobStatus.FAILED,
  cancelled: JobStatus.CANCELLED,
};

export function toDbJobStatus(status: JobStatus): JobStatusDb {
  return JOB_STATUS_DB_MAP[status];
}

export function toDomainJobStatus(status: JobStatusDb): JobStatus {
  return JOB_STATUS_DOMAIN_MAP[status];
}

export const SUPPORTED_MEDIA_PROVIDERS = [
  "twitch",
  "youtube",
  "tiktok",
  "kick",
] as const;

export type SupportedProvider = (typeof SUPPORTED_MEDIA_PROVIDERS)[number];

export type WebhookMediaJobType = "STREAM_ONLINE" | "NEW_VIDEO_PUBLISHED";

export interface ContentJob {
  id: string;
  user_id: string;
  type: JobTypeDb;
  provider: SupportedProvider;
  status: JobStatusDb;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  retry_count: number;
  max_retries: number;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface StreamOnlineJobPayload {
  type: "STREAM_ONLINE";
  provider: "twitch";
  userId: string;
  channelId: string;
  streamId: string;
  startedAt: string;
  enqueuedAt: string;
  vodLookupAttempt?: number;
}

export interface NewVideoPublishedJobPayload {
  type: "NEW_VIDEO_PUBLISHED";
  provider: "youtube";
  userId: string;
  channelId: string;
  videoId: string;
  title?: string;
  publishedAt?: string;
  enqueuedAt: string;
}

export interface AutomationCallbackPayload {
  contentJobId: string;
  status: "completed" | "failed";
  result?: Record<string, unknown>;
  error?: string;
}

export type WebhookMediaJobPayload =
  | StreamOnlineJobPayload
  | NewVideoPublishedJobPayload;
