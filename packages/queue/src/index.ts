import { Queue, type JobsOptions } from "bullmq";
import { Redis } from "ioredis";
import { assertRedisTls } from "@streamos/redis";
import type {
  PublicationExecutionJobPayload,
  PublicationReconciliationJobPayload,
  RepurposingPlanQueueJobPayload,
} from "@streamos/types/jobs";

export const STREAM_JOB_QUEUE_NAME = "streamos-media";
export const TRANSCRIPTION_TRIGGER_JOB_NAME = "transcription.trigger";
export const CLIP_GENERATION_JOB_NAME = "clip.generate";
export const REPURPOSING_QUEUE_NAME = "streamos-repurposing";
export const REPURPOSING_PLAN_JOB_NAME = "repurposing.plan";
export const PUBLICATION_QUEUE_NAME = "streamos-publishing";
export const PUBLICATION_EXECUTION_JOB_NAME = "publication.publish";
export const PUBLICATION_RECONCILE_JOB_NAME = "publication.reconcile";
export const VIDEO_PUBLISHED_ENRICHMENT_STATUSES = [
  "asset_available",
  "enrichment_required",
  "enrichment_retryable",
  "enrichment_failed",
  "unsupported",
] as const;

export const STREAMOS_JOB_TYPES = [
  "stream.online",
  "stream.offline",
  "stream.update",
  "video.published",
  "channel.update",
] as const;

export type StreamOSJobType = (typeof STREAMOS_JOB_TYPES)[number];
export type VideoPublishedEnrichmentStatus =
  (typeof VIDEO_PUBLISHED_ENRICHMENT_STATUSES)[number];

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
  enrichmentStatus?: VideoPublishedEnrichmentStatus;
  raw: Record<string, unknown>;
  receivedAt: string;
};

export type StreamJobQueue = Queue<StreamOSJob, void, StreamOSJobType>;
export type RepurposingPlanQueue = Queue<
  RepurposingPlanQueueJobPayload,
  void,
  typeof REPURPOSING_PLAN_JOB_NAME
>;
export type PublicationQueue = Queue<
  PublicationExecutionJobPayload | PublicationReconciliationJobPayload,
  void,
  typeof PUBLICATION_EXECUTION_JOB_NAME | typeof PUBLICATION_RECONCILE_JOB_NAME
>;

export type RepurposingPlanQueueJobData = RepurposingPlanQueueJobPayload;
export type PublicationExecutionQueueJobData = PublicationExecutionJobPayload;
export type PublicationReconciliationQueueJobData =
  PublicationReconciliationJobPayload;

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

export function getRepurposingPlanJobId(contextId: string): string {
  return getDeterministicJobId("repurposing-plan", contextId);
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

export const REPURPOSING_PLAN_JOB_OPTIONS: JobsOptions = {
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

type StreamJobQueueState = {
  connection?: Redis;
  queue?: StreamJobQueue;
  shutdownHookRegistered?: boolean;
};

type RepurposingPlanQueueState = {
  connection?: Redis;
  queue?: RepurposingPlanQueue;
  shutdownHookRegistered?: boolean;
};

type PublicationQueueState = {
  connection?: Redis;
  queue?: PublicationQueue;
  shutdownHookRegistered?: boolean;
};

const globalQueueState = globalThis as typeof globalThis & {
  __streamosStreamJobQueueState?: StreamJobQueueState;
  __streamosRepurposingPlanQueueState?: RepurposingPlanQueueState;
  __streamosPublicationQueueState?: PublicationQueueState;
};

function getQueueState(): StreamJobQueueState {
  globalQueueState.__streamosStreamJobQueueState ??= {};
  return globalQueueState.__streamosStreamJobQueueState;
}

function getRepurposingPlanQueueState(): RepurposingPlanQueueState {
  globalQueueState.__streamosRepurposingPlanQueueState ??= {};
  return globalQueueState.__streamosRepurposingPlanQueueState;
}

function getPublicationQueueState(): PublicationQueueState {
  globalQueueState.__streamosPublicationQueueState ??= {};
  return globalQueueState.__streamosPublicationQueueState;
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

function registerRepurposingPlanShutdownHook(): void {
  const state = getRepurposingPlanQueueState();

  if (state.shutdownHookRegistered || typeof process === "undefined") {
    return;
  }

  const close = () => {
    void closeRepurposingPlanQueue().catch((error) => {
      console.error("[streamos-repurposing-queue] shutdown failed", error);
    });
  };

  process.once("beforeExit", close);
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
  state.shutdownHookRegistered = true;
}

function registerPublicationShutdownHook(): void {
  const state = getPublicationQueueState();

  if (state.shutdownHookRegistered || typeof process === "undefined") {
    return;
  }

  const close = () => {
    void closePublicationQueue().catch((error) => {
      console.error("[streamos-publishing-queue] shutdown failed", error);
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

export function getRepurposingPlanQueue(options?: {
  queueName?: string;
  redisUrl?: string;
}): RepurposingPlanQueue {
  const state = getRepurposingPlanQueueState();

  if (state.queue) {
    return state.queue;
  }

  const redisUrl = options?.redisUrl ?? getRedisUrl();
  const connection = createRedisConnection(redisUrl);
  const queue = new Queue<
    RepurposingPlanQueueJobPayload,
    void,
    typeof REPURPOSING_PLAN_JOB_NAME
  >(
    options?.queueName ??
      process.env.REPURPOSING_QUEUE_NAME?.trim() ??
      process.env.QUEUE_DEFAULT_NAME?.trim() ??
      REPURPOSING_QUEUE_NAME,
    {
      connection,
      defaultJobOptions: REPURPOSING_PLAN_JOB_OPTIONS,
    },
  );

  state.connection = connection;
  state.queue = queue;
  registerRepurposingPlanShutdownHook();

  return queue;
}

export function getPublicationQueue(options?: {
  queueName?: string;
  redisUrl?: string;
}): PublicationQueue {
  const state = getPublicationQueueState();

  if (state.queue) {
    return state.queue;
  }

  const redisUrl = options?.redisUrl ?? getRedisUrl();
  const connection = createRedisConnection(redisUrl);
  const queue = new Queue<
    PublicationExecutionJobPayload | PublicationReconciliationJobPayload,
    void,
    | typeof PUBLICATION_EXECUTION_JOB_NAME
    | typeof PUBLICATION_RECONCILE_JOB_NAME
  >(
    options?.queueName ??
      process.env.PUBLICATION_QUEUE_NAME?.trim() ??
      process.env.QUEUE_DEFAULT_NAME?.trim() ??
      PUBLICATION_QUEUE_NAME,
    {
      connection,
      defaultJobOptions: PUBLICATION_JOB_OPTIONS,
    },
  );

  state.connection = connection;
  state.queue = queue;
  registerPublicationShutdownHook();

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

export async function dispatchRepurposingPlanJob(
  job: RepurposingPlanQueueJobPayload,
): Promise<RepurposingPlanQueueJobPayload> {
  const queue = getRepurposingPlanQueue();

  await queue.add(REPURPOSING_PLAN_JOB_NAME, job, {
    ...REPURPOSING_PLAN_JOB_OPTIONS,
    jobId: job.queue_job_id,
  });

  return job;
}

export async function dispatchPublicationExecutionJob(
  job: PublicationExecutionJobPayload,
): Promise<PublicationExecutionJobPayload> {
  const queue = getPublicationQueue();

  await queue.add(PUBLICATION_EXECUTION_JOB_NAME, job, {
    ...PUBLICATION_JOB_OPTIONS,
    jobId: getPublicationExecutionJobId(job.content_publication_id),
  });

  return job;
}

export async function dispatchPublicationReconciliationJob(
  job: PublicationReconciliationJobPayload,
): Promise<PublicationReconciliationJobPayload> {
  const queue = getPublicationQueue();

  await queue.add(PUBLICATION_RECONCILE_JOB_NAME, job, {
    ...PUBLICATION_JOB_OPTIONS,
    jobId: getPublicationReconciliationJobId(job.content_publication_id),
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

export async function closeRepurposingPlanQueue(): Promise<void> {
  const state = getRepurposingPlanQueueState();
  const queue = state.queue;
  const connection = state.connection;

  state.queue = undefined;
  state.connection = undefined;

  await queue?.close();
  connection?.disconnect();
}

export async function closePublicationQueue(): Promise<void> {
  const state = getPublicationQueueState();
  const queue = state.queue;
  const connection = state.connection;

  state.queue = undefined;
  state.connection = undefined;

  await queue?.close();
  connection?.disconnect();
}

export const PUBLICATION_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: {
    delay: 60_000,
    type: "exponential",
  },
  removeOnComplete: {
    age: 86_400,
    count: 1_000,
  },
  removeOnFail: {
    age: 604_800,
  },
};

export function getPublicationExecutionJobId(
  contentPublicationId: string,
): string {
  return getDeterministicJobId("publication-execution", contentPublicationId);
}

export function getPublicationReconciliationJobId(
  contentPublicationId: string,
): string {
  return getDeterministicJobId("publication-reconcile", contentPublicationId);
}
