import { Queue, type JobsOptions } from "bullmq";
import type { TranscriptionTriggerJobData } from "@streamos/types";

import type {
  ClipGenerationJobData,
  TRANSCRIPTION_TRIGGER_JOB_NAME,
} from "./jobSchemas.js";
import { CLIP_GENERATION_JOB_NAME } from "./jobSchemas.js";
import { createRedisConnectionOptions } from "./redisConnection.js";

export type RetryQueueJob =
  | {
      data: ClipGenerationJobData;
      name: typeof CLIP_GENERATION_JOB_NAME;
      queue: "clip_generation";
    }
  | {
      data: TranscriptionTriggerJobData;
      name: typeof TRANSCRIPTION_TRIGGER_JOB_NAME;
      queue: "transcription";
    };

export type AddRetryQueueJobInput = RetryQueueJob & {
  backoffMs: number;
  bullMqAttempts: number;
  queueJobId: string;
};

export type ContentJobRetryQueues = {
  add(input: AddRetryQueueJobInput): Promise<void>;
  close(): Promise<void>;
};

function createRetryJobOptions({
  backoffMs,
  bullMqAttempts,
  queueJobId,
}: {
  backoffMs: number;
  bullMqAttempts: number;
  queueJobId: string;
}): JobsOptions {
  return {
    attempts: bullMqAttempts,
    backoff: {
      delay: backoffMs,
      type: "exponential",
    },
    jobId: queueJobId,
    removeOnComplete: {
      age: 86_400,
      count: 1_000,
    },
    removeOnFail: {
      age: 604_800,
    },
  };
}

export function createBullMqContentJobRetryQueues({
  clipGenerationQueueName,
  redisUrl,
  transcriptionQueueName,
}: {
  clipGenerationQueueName: string;
  redisUrl: string;
  transcriptionQueueName: string;
}): ContentJobRetryQueues {
  const connection = createRedisConnectionOptions(redisUrl);
  const clipGenerationQueue = new Queue(clipGenerationQueueName, {
    connection,
  });
  const transcriptionQueue = new Queue(transcriptionQueueName, {
    connection,
  });

  return {
    async add(input: AddRetryQueueJobInput): Promise<void> {
      const options = createRetryJobOptions(input);

      if (input.queue === "clip_generation") {
        await clipGenerationQueue.add(input.name, input.data, options);
        return;
      }

      await transcriptionQueue.add(input.name, input.data, options);
    },

    async close(): Promise<void> {
      await Promise.all([
        clipGenerationQueue.close(),
        transcriptionQueue.close(),
      ]);
    },
  };
}
