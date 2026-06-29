import type { ClipGenerationJobData } from "@streamos/types";
import type { JobsOptions } from "bullmq";
import { Queue } from "bullmq";
import { getClipGenerationJobId } from "@streamos/queue";
import {
  type PublicHttpsAssetResolver,
  validatePublicHttpsAssetUrl,
} from "@streamos/utils";
import { z } from "zod";

import { createRedisConnectionOptions } from "./redisConnection.js";

export type { ClipGenerationJobData };
export { getClipGenerationJobId };

export const CLIP_GENERATION_JOB_NAME = "clip.generate";
export const DEFAULT_CLIP_GENERATION_QUEUE_NAME = "streamos-clip-generation";

export const clipGenerationPayloadSchema = z.object({
  stream_id: z.string().uuid(),
  creator_id: z.string().uuid().optional(),
  source_platform: z.enum(["twitch", "youtube", "tiktok", "kick"]),
  source_url: z.string().url(),
  requested_by: z.string().uuid(),
  transcript: z.string().trim().min(1).max(60_000),
}) satisfies z.ZodType<ClipGenerationJobData>;

export type ClipGenerationQueueJob = {
  id?: string | number;
};

export type ClipGenerationQueue = {
  add(
    name: typeof CLIP_GENERATION_JOB_NAME,
    data: ClipGenerationJobData,
    opts: JobsOptions,
  ): Promise<ClipGenerationQueueJob>;
  close?(): Promise<void>;
};

export type EnqueuedClipGenerationJob = {
  jobId: string;
  streamId: string;
  queueJobId: string;
};

const clipGenerationJobOptions: JobsOptions = {
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

export async function enqueueClipGenerationJob(
  queue: ClipGenerationQueue,
  payload: ClipGenerationJobData,
  options?: {
    assetUrlResolver?: PublicHttpsAssetResolver;
  },
): Promise<EnqueuedClipGenerationJob> {
  const data = clipGenerationPayloadSchema.parse(payload);
  await validatePublicHttpsAssetUrl(data.source_url, options?.assetUrlResolver);

  const jobId = getClipGenerationJobId(data.stream_id);
  const job = await queue.add(CLIP_GENERATION_JOB_NAME, data, {
    ...clipGenerationJobOptions,
    jobId,
  });

  return {
    jobId,
    streamId: data.stream_id,
    queueJobId: String(job.id ?? jobId),
  };
}

export function createBullMqClipGenerationQueue(options?: {
  queueName?: string;
  redisUrl?: string;
}): ClipGenerationQueue {
  const redisUrl = options?.redisUrl ?? process.env.REDIS_URL;

  if (!redisUrl) {
    throw new Error(
      "REDIS_URL is required to create the BullMQ clip-generation queue.",
    );
  }

  return new Queue<
    ClipGenerationJobData,
    void,
    typeof CLIP_GENERATION_JOB_NAME
  >(
    options?.queueName ??
      process.env.CLIP_GENERATION_QUEUE_NAME ??
      process.env.QUEUE_DEFAULT_NAME ??
      DEFAULT_CLIP_GENERATION_QUEUE_NAME,
    { connection: createRedisConnectionOptions(redisUrl) },
  );
}
