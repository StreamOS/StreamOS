import type {
  CLIP_GENERATION_JOB_NAME,
  ClipGenerationJobData,
} from "@streamos/types";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";

import { createAutomationClient } from "./automationClient.js";
import { loadWorkerConfig } from "./config.js";
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

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  console.log(`received ${signal}; closing transcription-worker`);
  clearInterval(heartbeat);
  await worker.close();
  await clipGenerationQueue.close();
  heartbeatRedis.disconnect();
  process.exit(0);
}

process.on("SIGINT", (signal) => void shutdown(signal));
process.on("SIGTERM", (signal) => void shutdown(signal));
