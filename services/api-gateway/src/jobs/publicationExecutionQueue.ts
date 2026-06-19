import type { JobsOptions } from "bullmq";
import { Queue } from "bullmq";
import {
  getPublicationExecutionJobId,
  getPublicationReconciliationJobId,
} from "@streamos/queue";
import type {
  PublicationExecutionJobPayload,
  PublicationReconciliationJobPayload,
} from "@streamos/types/jobs";
import { z } from "zod";

import { createRedisConnectionOptions } from "./redisConnection.js";

export const PUBLICATION_EXECUTION_JOB_NAME = "publication.publish";
export const PUBLICATION_RECONCILE_JOB_NAME = "publication.reconcile";
export const DEFAULT_PUBLICATION_QUEUE_NAME = "streamos-publishing";
export { getPublicationExecutionJobId } from "@streamos/queue";
export { getPublicationReconciliationJobId } from "@streamos/queue";

export const publicationExecutionPayloadSchema = z.object({
  content_publication_id: z.string().uuid(),
  target_platform: z.enum(["youtube", "tiktok"]),
  user_id: z.string().uuid(),
}) satisfies z.ZodType<PublicationExecutionJobPayload, z.ZodTypeDef, unknown>;

export const publicationReconciliationPayloadSchema =
  publicationExecutionPayloadSchema satisfies z.ZodType<
    PublicationReconciliationJobPayload,
    z.ZodTypeDef,
    unknown
  >;

export type PublicationExecutionQueueJob = {
  id?: string | number;
};

export type PublicationExecutionQueue = {
  add(
    name:
      | typeof PUBLICATION_EXECUTION_JOB_NAME
      | typeof PUBLICATION_RECONCILE_JOB_NAME,
    data: PublicationExecutionJobPayload | PublicationReconciliationJobPayload,
    opts: JobsOptions,
  ): Promise<PublicationExecutionQueueJob>;
  close?(): Promise<void>;
};

export type EnqueuedPublicationExecutionJob = {
  jobId: string;
  publicationId: string;
  queueJobId: string;
  targetPlatform: "youtube" | "tiktok";
};

export type EnqueuedPublicationReconciliationJob = {
  jobId: string;
  publicationId: string;
  queueJobId: string;
  targetPlatform: "youtube" | "tiktok";
};

const publicationExecutionJobOptions: JobsOptions = {
  attempts: 5,
  backoff: {
    type: "exponential",
    delay: 60_000,
  },
  removeOnComplete: {
    age: 86_400,
    count: 1_000,
  },
  removeOnFail: {
    age: 604_800,
  },
};

export async function enqueuePublicationExecutionJob(
  queue: PublicationExecutionQueue,
  payload: PublicationExecutionJobPayload,
): Promise<EnqueuedPublicationExecutionJob> {
  const data = publicationExecutionPayloadSchema.parse(payload);
  const jobId = getPublicationExecutionJobId(data.content_publication_id);
  const job = await queue.add(PUBLICATION_EXECUTION_JOB_NAME, data, {
    ...publicationExecutionJobOptions,
    jobId,
  });

  return {
    jobId,
    publicationId: data.content_publication_id,
    queueJobId: String(job.id ?? jobId),
    targetPlatform: data.target_platform,
  };
}

export async function enqueuePublicationReconciliationJob(
  queue: PublicationExecutionQueue,
  payload: PublicationReconciliationJobPayload,
): Promise<EnqueuedPublicationReconciliationJob> {
  const data = publicationReconciliationPayloadSchema.parse(payload);
  const jobId = getPublicationReconciliationJobId(data.content_publication_id);
  const job = await queue.add(PUBLICATION_RECONCILE_JOB_NAME, data, {
    ...publicationExecutionJobOptions,
    jobId,
  });

  return {
    jobId,
    publicationId: data.content_publication_id,
    queueJobId: String(job.id ?? jobId),
    targetPlatform: data.target_platform,
  };
}

export function createBullMqPublicationExecutionQueue(options?: {
  queueName?: string;
  redisUrl?: string;
}): PublicationExecutionQueue {
  const redisUrl = options?.redisUrl ?? process.env.REDIS_URL;

  if (!redisUrl) {
    throw new Error(
      "REDIS_URL is required to create the BullMQ publication queue.",
    );
  }

  return new Queue<
    PublicationExecutionJobPayload | PublicationReconciliationJobPayload,
    void,
    | typeof PUBLICATION_EXECUTION_JOB_NAME
    | typeof PUBLICATION_RECONCILE_JOB_NAME
  >(
    options?.queueName ??
      process.env.PUBLICATION_QUEUE_NAME ??
      process.env.QUEUE_DEFAULT_NAME ??
      DEFAULT_PUBLICATION_QUEUE_NAME,
    { connection: createRedisConnectionOptions(redisUrl) },
  );
}
