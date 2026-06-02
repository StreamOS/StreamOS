import { Worker } from "bullmq";

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

const worker = new Worker(
  config.queueName,
  (job) => processTranscriptionJob(job, { automationClient, statusStore }),
  {
    concurrency: config.concurrency,
    connection: createRedisConnectionOptions(config.redisUrl),
  },
);

worker.on("completed", (job) => {
  console.log(`transcription job completed: ${job.id}`);
});

worker.on("failed", (job, error) => {
  console.error(`transcription job failed: ${job?.id}`, error);
});

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  console.log(`received ${signal}; closing transcription-worker`);
  await worker.close();
  process.exit(0);
}

process.on("SIGINT", (signal) => void shutdown(signal));
process.on("SIGTERM", (signal) => void shutdown(signal));
