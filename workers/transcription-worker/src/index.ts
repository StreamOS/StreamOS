import type {
  CLIP_GENERATION_JOB_NAME,
  ClipGenerationJobData,
} from "@streamos/types";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";

import { createAutomationClient } from "./automationClient.js";
import { loadWorkerConfig } from "./config.js";
import { createContentJobStore } from "./contentJobStore.js";
import { handleStreamOnlineJob } from "./handlers/stream-online.handler.js";
import { handleVideoPublishedJob } from "./handlers/video-published.handler.js";
import {
  mediaJobPayloadSchema,
  type MediaJobPayload,
} from "./mediaJobSchema.js";
import { createTwitchClient, createYouTubeClient } from "./providerClients.js";
import { createRedisConnectionOptions } from "./redisConnection.js";
import { createSupabaseJobStatusStore } from "./statusStore.js";
import { processTranscriptionJob } from "./worker.js";

const config = loadWorkerConfig();
const automationClient = createAutomationClient({
  automationServiceUrl: config.automationServiceUrl,
});
const statusStore = createSupabaseJobStatusStore({
  serviceRoleKey: config.supabaseServiceRoleKey,
  supabaseUrl: config.supabaseUrl,
});
const contentJobStore = createContentJobStore({
  serviceRoleKey: config.supabaseServiceRoleKey,
  supabaseUrl: config.supabaseUrl,
});
const redisConnection = createRedisConnectionOptions(config.redisUrl);
const heartbeatRedis = new Redis(config.redisUrl, {
  enableReadyCheck: true,
  maxRetriesPerRequest: null,
});
const clipGenerationQueue = new Queue<
  ClipGenerationJobData,
  void,
  typeof CLIP_GENERATION_JOB_NAME
>(config.clipGenerationQueueName, {
  connection: redisConnection,
});
const mediaQueue = new Queue<MediaJobPayload>(config.mediaQueueName, {
  connection: redisConnection,
});
const twitchClient = createTwitchClient({
  clientId: config.twitchClientId,
  clientSecret: config.twitchClientSecret,
  tokenCache: heartbeatRedis,
});
const youtubeClient = createYouTubeClient({
  clientId: config.youtubeClientId,
  clientSecret: config.youtubeClientSecret,
  store: contentJobStore,
});

const worker = new Worker(
  config.queueName,
  (job) =>
    processTranscriptionJob(job, {
      automationClient,
      clipGenerationQueue,
      statusStore,
    }),
  {
    concurrency: config.concurrency,
    connection: redisConnection,
  },
);

const mediaWorker = new Worker<unknown>(
  config.mediaQueueName,
  async (job) => {
    const payload = mediaJobPayloadSchema.safeParse(job.data);

    if (!payload.success) {
      console.warn(
        JSON.stringify({
          level: "warn",
          message: "unknown_media_job_payload",
          jobId: job.id,
          issues: payload.error.issues,
        }),
      );
      return;
    }

    switch (payload.data.type) {
      case "STREAM_ONLINE":
        await handleStreamOnlineJob(
          {
            data: payload.data,
            id: job.id,
            name: job.name,
            opts: job.opts,
          },
          {
            automationClient,
            contentJobStore,
            mediaQueue,
            twitchClient,
          },
        );
        return;
      case "NEW_VIDEO_PUBLISHED":
        await handleVideoPublishedJob(
          {
            data: payload.data,
            id: job.id,
          },
          {
            automationClient,
            contentJobStore,
            youtubeClient,
          },
        );
        return;
    }
  },
  {
    concurrency: config.concurrency,
    connection: redisConnection,
  },
);

const heartbeat = setInterval(() => {
  void heartbeatRedis
    .set("worker:transcription:heartbeat", new Date().toISOString(), "EX", 90)
    .catch((error) => {
      console.error("transcription-worker heartbeat failed", error);
    });
}, 30_000);

worker.on("completed", (job) => {
  console.log(`transcription job completed: ${job.id}`);
});

worker.on("failed", (job, error) => {
  console.error(`transcription job failed: ${job?.id}`, error);
});

mediaWorker.on("completed", (job) => {
  console.log(`media job completed: ${job.id}`);
});

mediaWorker.on("failed", (job, error) => {
  console.error(`media job failed: ${job?.id}`, error);
});

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  console.log(`received ${signal}; closing transcription-worker`);
  clearInterval(heartbeat);
  await worker.close();
  await mediaWorker.close();
  await mediaQueue.close();
  await clipGenerationQueue.close();
  heartbeatRedis.disconnect();
  process.exit(0);
}

process.on("SIGINT", (signal) => void shutdown(signal));
process.on("SIGTERM", (signal) => void shutdown(signal));
