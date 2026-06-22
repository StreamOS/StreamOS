import { PUBLICATION_QUEUE_NAME } from "@streamos/queue";

export type PublishingSchedulerWorkerConfig = {
  batchSize: number;
  claimTimeoutMs: number;
  publicationQueueName: string;
  pollIntervalMs: number;
  redisUrl: string;
  supabaseServiceRoleKey: string;
  supabaseUrl: string;
};

const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_CLAIM_TIMEOUT_MS = 300_000;
const DEFAULT_POLL_INTERVAL_MS = 30_000;

function requireEnv(
  source: NodeJS.ProcessEnv,
  name: string,
  fallback?: string,
): string {
  const value = source[name]?.trim() || fallback?.trim();

  if (!value) {
    throw new Error(`${name} is required for publishing-scheduler-worker.`);
  }

  return value;
}

function parseIntegerOption({
  max,
  min,
  name,
  source,
  value,
}: {
  max: number;
  min: number;
  name: string;
  source: string | undefined;
  value: string;
}): number {
  const parsedValue = Number(source ?? value);

  if (
    !Number.isInteger(parsedValue) ||
    parsedValue < min ||
    parsedValue > max
  ) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }

  return parsedValue;
}

export function loadPublishingSchedulerWorkerConfig(
  source: NodeJS.ProcessEnv = process.env,
): PublishingSchedulerWorkerConfig {
  return {
    batchSize: parseIntegerOption({
      max: 100,
      min: 1,
      name: "PUBLISHING_SCHEDULER_WORKER_BATCH_SIZE",
      source: source.PUBLISHING_SCHEDULER_WORKER_BATCH_SIZE,
      value: String(DEFAULT_BATCH_SIZE),
    }),
    claimTimeoutMs: parseIntegerOption({
      max: 3_600_000,
      min: 60_000,
      name: "PUBLISHING_SCHEDULER_WORKER_CLAIM_TIMEOUT_MS",
      source: source.PUBLISHING_SCHEDULER_WORKER_CLAIM_TIMEOUT_MS,
      value: String(DEFAULT_CLAIM_TIMEOUT_MS),
    }),
    publicationQueueName:
      source.PUBLICATION_QUEUE_NAME?.trim() || PUBLICATION_QUEUE_NAME,
    pollIntervalMs: parseIntegerOption({
      max: 3_600_000,
      min: 5_000,
      name: "PUBLISHING_SCHEDULER_WORKER_POLL_INTERVAL_MS",
      source: source.PUBLISHING_SCHEDULER_WORKER_POLL_INTERVAL_MS,
      value: String(DEFAULT_POLL_INTERVAL_MS),
    }),
    redisUrl: requireEnv(source, "REDIS_URL"),
    supabaseServiceRoleKey: requireEnv(source, "SUPABASE_SERVICE_ROLE_KEY"),
    supabaseUrl: requireEnv(
      source,
      "SUPABASE_URL",
      source.NEXT_PUBLIC_SUPABASE_URL,
    ),
  };
}
