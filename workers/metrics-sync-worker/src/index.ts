import { Worker } from "bullmq";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@streamos/database";
import { createRedisConnectionOptions } from "@streamos/queue";
import type { MetricsSyncJobData } from "@streamos/types";

import { loadWorkerConfig } from "./config.js";
import {
  processMetricsSyncJob,
  type MetricsSyncJobResult,
} from "./providerMetrics.js";

const config = loadWorkerConfig();
const supabase = createClient<Database>(
  config.supabaseUrl,
  config.supabaseServiceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        "X-Client-Info": "streamos-metrics-sync-worker",
      },
    },
  },
);

const worker = new Worker<MetricsSyncJobData, MetricsSyncJobResult>(
  config.queueName,
  (job) =>
    processMetricsSyncJob(job.data, {
      env: config,
      supabase,
    }),
  {
    concurrency: config.concurrency,
    connection: createRedisConnectionOptions(config.redisUrl),
  },
);

worker.on("completed", (job, result) => {
  console.log(
    JSON.stringify({
      event: "metrics_sync_job_completed",
      job_id: job.id,
      failed: result?.failed.length ?? 0,
      synced: result?.synced ?? [],
    }),
  );
});

worker.on("failed", (job, error) => {
  console.error(
    JSON.stringify({
      event: "metrics_sync_job_failed",
      job_id: job?.id,
      error: error instanceof Error ? error.message : "Unknown error",
    }),
  );
});

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  console.log(`received ${signal}; closing metrics-sync-worker`);
  await worker.close();
  process.exit(0);
}

process.on("SIGINT", (signal) => void shutdown(signal));
process.on("SIGTERM", (signal) => void shutdown(signal));
