import { createHash } from "node:crypto";
import { Queue, type JobsOptions } from "bullmq";
import { Redis } from "ioredis";
import { assertRedisTls, parseRedisConnectionOptions } from "@streamos/redis";
import type {
  MetricsSyncJobData,
  MetricsSyncQueuedResponse,
  SupportedProvider,
} from "@streamos/types";
import { SUPPORTED_PROVIDERS } from "@streamos/types";

export const STREAM_JOB_QUEUE_NAME = "streamos-media";

export const STREAMOS_JOB_TYPES = [
  "stream.online",
  "stream.offline",
  "stream.update",
  "video.published",
  "channel.update",
] as const;

export type StreamOSJobType = (typeof STREAMOS_JOB_TYPES)[number];

export type StreamProvider = "twitch" | "youtube";

export type StreamOSJob = {
  id: string;
  type: StreamOSJobType;
  provider: StreamProvider;
  channelId: string;
  enqueuedAt?: string;
  streamId?: string;
  userId?: string;
  videoId?: string;
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

export const METRICS_SYNC_JOB_NAME = "metrics.sync";
export const DEFAULT_METRICS_SYNC_QUEUE_NAME = "streamos-metrics-sync";

export type BullMqMetricsSyncQueue = Queue<
  MetricsSyncJobData,
  MetricsSyncQueuedResponse,
  typeof METRICS_SYNC_JOB_NAME
>;

export type MetricsSyncQueue = {
  add(
    name: typeof METRICS_SYNC_JOB_NAME,
    data: MetricsSyncJobData,
    opts: JobsOptions,
  ): Promise<{ id?: string | number }>;
  name?: string;
};

export const METRICS_SYNC_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 30_000,
  },
  removeOnComplete: {
    age: 86_400,
    count: 1_000,
  },
  removeOnFail: {
    age: 604_800,
  },
};

export function getMetricsSyncJobId(
  userId: string,
  providers: SupportedProvider[],
): string {
  const normalizedUserId = userId.trim();

  if (!normalizedUserId) {
    throw new Error("metrics sync job ID requires a non-empty user ID.");
  }

  const normalizedProviders = normalizeMetricsSyncProviders(providers);
  const key = [normalizedUserId, ...normalizedProviders].join(":");

  return getDeterministicJobId("metrics-sync", key);
}

export function normalizeMetricsSyncProviders(
  providers: SupportedProvider[],
): SupportedProvider[] {
  return SUPPORTED_PROVIDERS.filter((provider) => providers.includes(provider));
}

export async function enqueueMetricsSyncJob(
  queue: MetricsSyncQueue,
  payload: MetricsSyncJobData,
): Promise<MetricsSyncQueuedResponse> {
  const providers = normalizeMetricsSyncProviders(payload.providers);

  if (providers.length === 0) {
    throw new Error("metrics sync requires at least one supported provider.");
  }

  const jobData: MetricsSyncJobData = {
    providers,
    user_id: payload.user_id.trim(),
  };

  if (!jobData.user_id) {
    throw new Error("metrics sync requires a non-empty user ID.");
  }

  const jobId = getMetricsSyncJobId(jobData.user_id, jobData.providers);
  const job = await queue.add(METRICS_SYNC_JOB_NAME, jobData, {
    ...METRICS_SYNC_JOB_OPTIONS,
    jobId,
  });

  return {
    job_id: jobId,
    providers: jobData.providers,
    queue_job_id: String(job.id ?? jobId),
    status: "queued",
  };
}

export function createBullMqMetricsSyncQueue(options?: {
  queueName?: string;
  redisUrl?: string;
}): MetricsSyncQueue {
  const redisUrl = options?.redisUrl ?? process.env.REDIS_URL;

  if (!redisUrl) {
    throw new Error(
      "REDIS_URL is required to create the BullMQ metrics sync queue.",
    );
  }

  return new Queue<
    MetricsSyncJobData,
    MetricsSyncQueuedResponse,
    typeof METRICS_SYNC_JOB_NAME
  >(
    options?.queueName ??
      process.env.METRICS_SYNC_QUEUE_NAME ??
      process.env.QUEUE_DEFAULT_NAME ??
      DEFAULT_METRICS_SYNC_QUEUE_NAME,
    { connection: createRedisConnectionOptions(redisUrl) },
  ) as MetricsSyncQueue;
}

type MetricsSyncQueueState = {
  connection?: Redis;
  queue?: BullMqMetricsSyncQueue;
  shutdownHookRegistered?: boolean;
};

const globalMetricsSyncQueueState = globalThis as typeof globalThis & {
  __streamosMetricsSyncQueueState?: MetricsSyncQueueState;
};

function getMetricsSyncQueueState(): MetricsSyncQueueState {
  globalMetricsSyncQueueState.__streamosMetricsSyncQueueState ??= {};
  return globalMetricsSyncQueueState.__streamosMetricsSyncQueueState;
}

function registerMetricsSyncShutdownHook(): void {
  const state = getMetricsSyncQueueState();

  if (state.shutdownHookRegistered || typeof process === "undefined") {
    return;
  }

  const close = () => {
    void closeMetricsSyncQueue().catch((error) => {
      console.error("[streamos-queue] metrics sync shutdown failed", error);
    });
  };

  process.once("beforeExit", close);
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
  state.shutdownHookRegistered = true;
}

export function getMetricsSyncQueue(options?: {
  queueName?: string;
  redisUrl?: string;
}): BullMqMetricsSyncQueue {
  const state = getMetricsSyncQueueState();

  if (state.queue) {
    return state.queue;
  }

  const redisUrl = options?.redisUrl ?? getRedisUrl();
  const connection = createRedisConnection(redisUrl);
  const queue = new Queue<
    MetricsSyncJobData,
    MetricsSyncQueuedResponse,
    typeof METRICS_SYNC_JOB_NAME
  >(
    options?.queueName ??
      process.env.METRICS_SYNC_QUEUE_NAME?.trim() ??
      process.env.QUEUE_DEFAULT_NAME?.trim() ??
      DEFAULT_METRICS_SYNC_QUEUE_NAME,
    {
      connection,
      defaultJobOptions: METRICS_SYNC_JOB_OPTIONS,
    },
  );

  state.connection = connection;
  state.queue = queue;
  registerMetricsSyncShutdownHook();

  return queue;
}

export async function closeMetricsSyncQueue(): Promise<void> {
  const state = getMetricsSyncQueueState();
  const queue = state.queue;
  const connection = state.connection;

  state.queue = undefined;
  state.connection = undefined;

  await queue?.close();
  connection?.disconnect();
}

export function getDeterministicJobId(prefix: string, value: string): string {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new Error(`${prefix} job ID requires a non-empty source value.`);
  }

  const digest = createHash("sha256")
    .update(normalizedValue)
    .digest("base64url");

  return `${prefix}-${digest}`;
}

export function createRedisConnectionOptions(
  redisUrl: string,
): ReturnType<typeof parseRedisConnectionOptions> {
  return parseRedisConnectionOptions(redisUrl);
}
