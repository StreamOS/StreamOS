import type { TranscriptionTriggerJobData } from "@streamos/types";
import type { JobsOptions } from "bullmq";
import { Queue } from "bullmq";
import { getTranscriptionTriggerJobId } from "@streamos/queue";
import {
  type PublicHttpsAssetResolver,
  validatePublicHttpsAssetUrl,
} from "@streamos/utils";
import { z } from "zod";

import { createRedisConnectionOptions } from "./redisConnection.js";

export const TRANSCRIPTION_TRIGGER_JOB_NAME = "transcription.trigger";
export const DEFAULT_TRANSCRIPTION_QUEUE_NAME = "streamos-transcription";
export { getTranscriptionTriggerJobId };

export const streamEndedPayloadSchema = z.object({
  user_id: z.string().uuid(),
  stream_id: z.string().uuid(),
  platform: z.enum(["twitch", "youtube", "tiktok", "kick"]),
  creator_id: z.string().uuid().optional(),
  channel_id: z.string().uuid().optional(),
  vod_asset_url: z.string().url(),
  ended_at: z.string().datetime().optional(),
  language: z.string().trim().min(1).default("auto"),
});

export type TranscriptionQueueJob = {
  id?: string | number;
};

export type TranscriptionQueue = {
  add(
    name: typeof TRANSCRIPTION_TRIGGER_JOB_NAME,
    data: TranscriptionTriggerJobData,
    opts: JobsOptions,
  ): Promise<TranscriptionQueueJob>;
  close?(): Promise<void>;
};

export type EnqueuedTranscriptionTriggerJob = {
  jobId: string;
  streamId: string;
  queueJobId: string;
};

const transcriptionTriggerJobOptions: JobsOptions = {
  attempts: 5,
  backoff: {
    type: "exponential",
    delay: 60_000,
  },
  removeOnComplete: {
    age: 259_200,
    count: 2_000,
  },
  removeOnFail: {
    age: 604_800,
  },
};

export async function enqueueTranscriptionTriggerJob(
  queue: TranscriptionQueue,
  payload: z.input<typeof streamEndedPayloadSchema>,
  options?: {
    assetUrlResolver?: PublicHttpsAssetResolver;
  },
): Promise<EnqueuedTranscriptionTriggerJob> {
  const parsedPayload = streamEndedPayloadSchema.parse(payload);
  await validatePublicHttpsAssetUrl(
    parsedPayload.vod_asset_url,
    options?.assetUrlResolver,
  );

  const data: TranscriptionTriggerJobData = {
    ...parsedPayload,
    trigger: "stream_ended",
  };
  const jobId = getTranscriptionTriggerJobId(data.stream_id);
  const job = await queue.add(TRANSCRIPTION_TRIGGER_JOB_NAME, data, {
    ...transcriptionTriggerJobOptions,
    jobId,
  });

  return {
    jobId,
    streamId: data.stream_id,
    queueJobId: String(job.id ?? jobId),
  };
}

export function createBullMqTranscriptionQueue(options?: {
  queueName?: string;
  redisUrl?: string;
}): TranscriptionQueue {
  const redisUrl = options?.redisUrl ?? process.env.REDIS_URL;

  if (!redisUrl) {
    throw new Error(
      "REDIS_URL is required to create the BullMQ transcription queue.",
    );
  }

  return new Queue<
    TranscriptionTriggerJobData,
    void,
    typeof TRANSCRIPTION_TRIGGER_JOB_NAME
  >(
    options?.queueName ??
      process.env.TRANSCRIPTION_QUEUE_NAME ??
      process.env.QUEUE_DEFAULT_NAME ??
      DEFAULT_TRANSCRIPTION_QUEUE_NAME,
    { connection: createRedisConnectionOptions(redisUrl) },
  );
}
