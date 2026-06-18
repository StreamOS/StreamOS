import { Worker } from "bullmq";

import { createAutomationClient } from "./automationClient.js";
import { loadWorkerConfig } from "./config.js";
import { createRedisConnectionOptions } from "./redisConnection.js";
import { createSupabaseRepurposingPlanStore } from "./contentJobStore.js";
import { processRepurposingPlanJob } from "./worker.js";
import { REPURPOSING_PLAN_JOB_NAME } from "./jobSchema.js";

const config = loadWorkerConfig();
const automationClient = createAutomationClient({
  automationServiceUrl: config.automationServiceUrl,
});
const statusStore = createSupabaseRepurposingPlanStore({
  serviceRoleKey: config.supabaseServiceRoleKey,
  supabaseUrl: config.supabaseUrl,
});

const worker = new Worker(
  config.queueName,
  (job) => processRepurposingPlanJob(job, { automationClient, statusStore }),
  {
    concurrency: config.concurrency,
    connection: createRedisConnectionOptions(config.redisUrl),
  },
);

worker.on("completed", (job) => {
  console.log(`repurposing job completed: ${job.id}`);
});

worker.on("failed", (job, error) => {
  console.error(`repurposing job failed: ${job?.id}`, error);
});

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  console.log(`received ${signal}; closing repurposing-worker`);
  await worker.close();
  process.exit(0);
}

process.on("SIGINT", (signal) => void shutdown(signal));
process.on("SIGTERM", (signal) => void shutdown(signal));

console.log("repurposing-worker started", {
  concurrency: config.concurrency,
  queue: config.queueName,
  repurposingJobName: REPURPOSING_PLAN_JOB_NAME,
});
