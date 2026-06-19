export const DEFAULT_PUBLICATION_QUEUE_NAME = "streamos-publishing";

export type WorkerConfig = {
  appEncryptionKey: string;
  concurrency: number;
  publicationQueueName: string;
  redisUrl: string;
  supabaseServiceRoleKey: string;
  supabaseUrl: string;
  tiktokClientKey: string;
  tiktokClientSecret: string;
  youtubeClientId: string;
  youtubeClientSecret: string;
};

function requireEnv(
  source: NodeJS.ProcessEnv,
  name: string,
  fallback?: string,
): string {
  const value = source[name]?.trim() || fallback?.trim();

  if (!value) {
    throw new Error(`${name} is required for publishing-worker.`);
  }

  return value;
}

function parseConcurrency(value: string | undefined): number {
  const parsedValue = Number(value ?? "1");

  if (!Number.isInteger(parsedValue) || parsedValue < 1 || parsedValue > 25) {
    throw new Error(
      "PUBLISHING_WORKER_CONCURRENCY must be an integer between 1 and 25.",
    );
  }

  return parsedValue;
}

export function loadWorkerConfig(
  source: NodeJS.ProcessEnv = process.env,
): WorkerConfig {
  return {
    appEncryptionKey: requireEnv(source, "APP_ENCRYPTION_KEY"),
    concurrency: parseConcurrency(source.PUBLISHING_WORKER_CONCURRENCY),
    publicationQueueName:
      source.PUBLICATION_QUEUE_NAME?.trim() || DEFAULT_PUBLICATION_QUEUE_NAME,
    redisUrl: requireEnv(source, "REDIS_URL"),
    supabaseServiceRoleKey: requireEnv(source, "SUPABASE_SERVICE_ROLE_KEY"),
    supabaseUrl: requireEnv(
      source,
      "SUPABASE_URL",
      source.NEXT_PUBLIC_SUPABASE_URL,
    ),
    tiktokClientKey: requireEnv(source, "TIKTOK_CLIENT_KEY"),
    tiktokClientSecret: requireEnv(source, "TIKTOK_CLIENT_SECRET"),
    youtubeClientId: requireEnv(source, "YOUTUBE_CLIENT_ID"),
    youtubeClientSecret: requireEnv(source, "YOUTUBE_CLIENT_SECRET"),
  };
}
