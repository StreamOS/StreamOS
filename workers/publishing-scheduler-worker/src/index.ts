import { getPublicationQueue, closePublicationQueue } from "@streamos/queue";

import { loadPublishingSchedulerWorkerConfig } from "./config.js";
import { createSupabasePublishingSchedulerStore } from "./publicationSchedulerStore.js";
import { runPublishingSchedulerTick } from "./scheduler.js";

const config = loadPublishingSchedulerWorkerConfig();
const publicationQueue = getPublicationQueue({
  redisUrl: config.redisUrl,
  queueName: config.publicationQueueName,
});
const store = createSupabasePublishingSchedulerStore({
  serviceRoleKey: config.supabaseServiceRoleKey,
  supabaseUrl: config.supabaseUrl,
});

let isRunning = false;
let isShuttingDown = false;

async function tick(): Promise<void> {
  if (isRunning || isShuttingDown) {
    return;
  }

  isRunning = true;

  try {
    const result = await runPublishingSchedulerTick({
      batchSize: config.batchSize,
      claimTimeoutMs: config.claimTimeoutMs,
      queue: publicationQueue,
      store,
      workerId: "publishing-scheduler-worker",
    });

    if (result.scanned > 0) {
      console.log("publishing-scheduler-worker tick", result);
    }
  } catch (error) {
    console.error("publishing-scheduler-worker tick failed", error);
  } finally {
    isRunning = false;
  }
}

const interval = setInterval(() => void tick(), config.pollIntervalMs);
void tick();

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  console.log(`received ${signal}; closing publishing-scheduler-worker`);
  isShuttingDown = true;
  clearInterval(interval);
  await closePublicationQueue();
  process.exit(0);
}

process.on("SIGINT", (signal) => void shutdown(signal));
process.on("SIGTERM", (signal) => void shutdown(signal));
