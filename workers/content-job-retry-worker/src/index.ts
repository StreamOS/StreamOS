import { loadRetryWorkerConfig } from "./config.js";
import { createSupabaseContentJobRetryStore } from "./contentJobStore.js";
import { createBullMqContentJobRetryQueues } from "./retryQueues.js";
import { retryFailedContentJobs } from "./retryWorker.js";

const config = loadRetryWorkerConfig();
const store = createSupabaseContentJobRetryStore({
  batchSize: config.batchSize,
  serviceRoleKey: config.supabaseServiceRoleKey,
  supabaseUrl: config.supabaseUrl,
});
const queues = createBullMqContentJobRetryQueues({
  clipGenerationQueueName: config.clipGenerationQueueName,
  redisUrl: config.redisUrl,
  transcriptionQueueName: config.transcriptionQueueName,
});

let isRunning = false;
let isShuttingDown = false;

async function tick(): Promise<void> {
  if (isRunning || isShuttingDown) {
    return;
  }

  isRunning = true;

  try {
    const result = await retryFailedContentJobs({
      bullMqAttempts: config.bullMqAttempts,
      bullMqBackoffMs: config.bullMqBackoffMs,
      queues,
      store,
    });

    if (result.scanned > 0) {
      console.log("content-job retry tick", result);
    }
  } catch (error) {
    console.error("content-job retry tick failed", error);
  } finally {
    isRunning = false;
  }
}

const interval = setInterval(() => void tick(), config.pollIntervalMs);
void tick();

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  console.log(`received ${signal}; closing content-job-retry-worker`);
  isShuttingDown = true;
  clearInterval(interval);
  await queues.close();
  process.exit(0);
}

process.on("SIGINT", (signal) => void shutdown(signal));
process.on("SIGTERM", (signal) => void shutdown(signal));
