import { Worker } from "bullmq";

import { createAutomationClient } from "./automationClient.js";
import { loadWorkerConfig } from "./config.js";
import { createRedisConnectionOptions } from "./redisConnection.js";
import { createSupabaseJobStatusStore } from "./statusStore.js";
import { processClipGenerationJob } from "./worker.js";

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
  (job) => processClipGenerationJob(job, { automationClient, statusStore }),
  {
    concurrency: config.concurrency,
    connection: createRedisConnectionOptions(config.redisUrl),
  },
);

worker.on("completed", (job) => {
  console.log(`clip generation job completed: ${job.id}`);
});

worker.on("failed", (job, error) => {
  console.error(`clip generation job failed: ${job?.id}`, error);
});

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  console.log(`received ${signal}; closing clip-worker`);
  await worker.close();
  process.exit(0);
}

process.on("SIGINT", (signal) => void shutdown(signal));
process.on("SIGTERM", (signal) => void shutdown(signal));
