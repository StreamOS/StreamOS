import { Queue, type JobsOptions } from "bullmq";
import { Redis } from "ioredis";
import { assertRedisTls } from "@streamos/redis";

export const STREAM_JOB_QUEUE_NAME = "streamos-media";
export const TRANSCRIPTION_TRIGGER_JOB_NAME = "transcription.trigger";
export const CLIP_GENERATION_JOB_NAME = "clip.generate";

export const STREAMOS_JOB_TYPES = [
  "stream.online",
  "stream.offline",
  "stream.update",
  "video.published",
  "channel.update",
] as const;

export type StreamOSJobType = (typeof STREAMOS_JOB_TYPES)[number];

export type StreamProvider = "twitch" | "youtube" | "tiktok" | "kick";

export type StreamOSJob = {
  id: string;
  type: StreamOSJobType;
  provider: StreamProvider;
  channelId?: string;
  enqueuedAt?: string;
  internalStreamId?: string;
  language?: string;
  streamId?: string;
  userId?: string;
  videoId?: string;
  vodAssetUrl?: string;
  title?: string;
  gameName?: string;
  viewerCount?: number;
  viewerPeak?: number;
  startedAt?: string;
  endedAt?: string;
  publishedAt?: string;
  updatedAt?: string;
  thumbnailUrl?: string;
  raw: Record<string, unknown>;
  receivedAt: string;
};

export type StreamJobQueue = Queue<StreamOSJob, void, StreamOSJobType>;

function sanitizeDeterministicSegment(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-");
}

function getDeterministicJobId(prefix: string, streamId: string): string {
  return `${prefix}-${sanitizeDeterministicSegment(streamId)}`;
}

export function getTranscriptionTriggerJobId(streamId: string): string {
  return getDeterministicJobId("transcription-trigger", streamId);
}

export function getClipGenerationJobId(streamId: string): string {
  return getDeterministicJobId("clip-generation", streamId);
}

export const STREAM_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 5_000,
  },
  removeOnComplete: 100,
  removeOnFail: 500,
};

type StreamJobQueueState = {
  connection?: Redis;
  queue?: StreamJobQueue;
  shutdownHookRegistered?: boolean;
};

const globalQueueState = globalThis as typeof globalThis & {
  __streamosStreamJobQueueState?: StreamJobQueueState;
};

function getQueueState(): StreamJobQueueState {
  globalQueueState.__streamosStreamJobQueueState ??= {};
  return globalQueueState.__streamosStreamJobQueueState;
}

function getRedisUrl(source: NodeJS.ProcessEnv = process.env): string {
  const redisUrl = source.REDIS_URL?.trim();

  if (!redisUrl) {
    throw new Error("REDIS_URL is required for stream job queue dispatch.");
  }

  const parsedUrl = new URL(redisUrl);

  if (parsedUrl.protocol !== "redis:" && parsedUrl.protocol !== "rediss:") {
    throw new Error("REDIS_URL must use redis:// or rediss://.");
  }

  assertRedisTls(redisUrl);

  return redisUrl;
}

function createRedisConnection(redisUrl: string): Redis {
  return new Redis(redisUrl, {
    enableReadyCheck: true,
    lazyConnect: true,
    maxRetriesPerRequest: null,
  });
}

function registerShutdownHook(): void {
  const state = getQueueState();

  if (state.shutdownHookRegistered || typeof process === "undefined") {
    return;
  }

  const close = () => {
    void closeStreamJobQueue().catch((error) => {
      console.error("[streamos-queue] shutdown failed", error);
    });
  };

  process.once("beforeExit", close);
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
  state.shutdownHookRegistered = true;
}

export function getStreamJobQueue(options?: {
  queueName?: string;
  redisUrl?: string;
}): StreamJobQueue {
  const state = getQueueState();

  if (state.queue) {
    return state.queue;
  }

  const redisUrl = options?.redisUrl ?? getRedisUrl();
  const connection = createRedisConnection(redisUrl);
  const queue = new Queue<StreamOSJob, void, StreamOSJobType>(
    options?.queueName ??
      process.env.QUEUE_DEFAULT_NAME?.trim() ??
      process.env.STREAM_JOB_QUEUE_NAME?.trim() ??
      STREAM_JOB_QUEUE_NAME,
    {
      connection,
      defaultJobOptions: STREAM_JOB_OPTIONS,
    },
  );

  state.connection = connection;
  state.queue = queue;
  registerShutdownHook();

  return queue;
}

export async function dispatchStreamOSJob(
  job: StreamOSJob,
): Promise<StreamOSJob> {
  const queue = getStreamJobQueue();

  await queue.add(job.type, job, {
    ...STREAM_JOB_OPTIONS,
    jobId: job.id,
  });

  return job;
}

export async function closeStreamJobQueue(): Promise<void> {
  const state = getQueueState();
  const queue = state.queue;
  const connection = state.connection;

  state.queue = undefined;
  state.connection = undefined;

  await queue?.close();
  connection?.disconnect();
}
