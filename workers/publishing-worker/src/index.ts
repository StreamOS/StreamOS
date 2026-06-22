import { Worker } from "bullmq";

import { loadWorkerConfig } from "./config.js";
import {
  PUBLICATION_EXECUTION_JOB_NAME,
  PUBLICATION_RECONCILE_JOB_NAME,
  PUBLICATION_QUEUE_NAME,
} from "./jobSchema.js";
import { createRedisConnectionOptions } from "./redisConnection.js";
import { createSupabasePublicationStore } from "./publicationStore.js";
import {
  processPublicationExecutionJob,
  processPublicationReconciliationJob,
} from "./worker.js";

const config = loadWorkerConfig();
const publicationStore = createSupabasePublicationStore({
  serviceRoleKey: config.supabaseServiceRoleKey,
  supabaseUrl: config.supabaseUrl,
});

const worker = new Worker(
  config.publicationQueueName,
  (job) => {
    if (job.name === PUBLICATION_EXECUTION_JOB_NAME) {
      return processPublicationExecutionJob(job, {
        publicationStore,
        workerConfig: config,
      });
    }

    if (job.name === PUBLICATION_RECONCILE_JOB_NAME) {
      return processPublicationReconciliationJob(job, {
        publicationStore,
        workerConfig: config,
      });
    }

    throw new Error(`Unsupported publication job name: ${job.name}`);
  },
  {
    concurrency: config.concurrency,
    connection: createRedisConnectionOptions(config.redisUrl),
  },
);

worker.on("completed", (job) => {
  console.log(`publication job completed: ${job.name}:${job.id}`);
});

worker.on("failed", (job, error) => {
  console.error(`publication job failed: ${job?.name}:${job?.id}`, error);
});

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  console.log(`received ${signal}; closing publishing-worker`);
  await worker.close();
  process.exit(0);
}

process.on("SIGINT", (signal) => void shutdown(signal));
process.on("SIGTERM", (signal) => void shutdown(signal));

console.log("publishing-worker started", {
  concurrency: config.concurrency,
  publicationJobName: PUBLICATION_EXECUTION_JOB_NAME,
  queue: config.publicationQueueName || PUBLICATION_QUEUE_NAME,
});
