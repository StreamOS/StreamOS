export type RetryWorkerConfig = {
  batchSize: number;
  bullMqAttempts: number;
  bullMqBackoffMs: number;
  clipGenerationQueueName: string;
  pollIntervalMs: number;
  redisUrl: string;
  supabaseServiceRoleKey: string;
  supabaseUrl: string;
  transcriptionQueueName: string;
};

export const DEFAULT_CLIP_GENERATION_QUEUE_NAME = "streamos-clip-generation";
export const DEFAULT_TRANSCRIPTION_QUEUE_NAME = "streamos-transcription";

function requireEnv(
  source: NodeJS.ProcessEnv,
  name: string,
  fallback?: string,
): string {
  const value = source[name]?.trim() || fallback?.trim();

  if (!value) {
    throw new Error(`${name} is required for content-job-retry-worker.`);
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

export function loadRetryWorkerConfig(
  source: NodeJS.ProcessEnv = process.env,
): RetryWorkerConfig {
  return {
    batchSize: parseIntegerOption({
      max: 100,
      min: 1,
      name: "CONTENT_JOB_RETRY_WORKER_BATCH_SIZE",
      source: source.CONTENT_JOB_RETRY_WORKER_BATCH_SIZE,
      value: "25",
    }),
    bullMqAttempts: parseIntegerOption({
      max: 10,
      min: 1,
      name: "CONTENT_JOB_RETRY_ATTEMPTS",
      source: source.CONTENT_JOB_RETRY_ATTEMPTS,
      value: "3",
    }),
    bullMqBackoffMs: parseIntegerOption({
      max: 3_600_000,
      min: 1_000,
      name: "CONTENT_JOB_RETRY_BACKOFF_MS",
      source: source.CONTENT_JOB_RETRY_BACKOFF_MS,
      value: "30000",
    }),
    clipGenerationQueueName:
      source.CLIP_GENERATION_QUEUE_NAME?.trim() ||
      source.QUEUE_DEFAULT_NAME?.trim() ||
      DEFAULT_CLIP_GENERATION_QUEUE_NAME,
    pollIntervalMs: parseIntegerOption({
      max: 3_600_000,
      min: 5_000,
      name: "CONTENT_JOB_RETRY_WORKER_POLL_INTERVAL_MS",
      source: source.CONTENT_JOB_RETRY_WORKER_POLL_INTERVAL_MS,
      value: "60000",
    }),
    redisUrl: requireEnv(source, "REDIS_URL"),
    supabaseServiceRoleKey: requireEnv(source, "SUPABASE_SERVICE_ROLE_KEY"),
    supabaseUrl: requireEnv(
      source,
      "SUPABASE_URL",
      source.NEXT_PUBLIC_SUPABASE_URL,
    ),
    transcriptionQueueName:
      source.TRANSCRIPTION_QUEUE_NAME?.trim() ||
      source.QUEUE_DEFAULT_NAME?.trim() ||
      DEFAULT_TRANSCRIPTION_QUEUE_NAME,
  };
}
