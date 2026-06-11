import { DEFAULT_METRICS_SYNC_QUEUE_NAME } from "@streamos/queue";

export type WorkerConfig = {
  concurrency: number;
  kickClientId?: string;
  kickClientSecret?: string;
  queueName: string;
  redisUrl: string;
  supabaseServiceRoleKey: string;
  supabaseUrl: string;
  tiktokClientKey?: string;
  tiktokClientSecret?: string;
  twitchClientId?: string;
  twitchClientSecret?: string;
  youtubeClientId?: string;
  youtubeClientSecret?: string;
};

function requireEnv(
  source: NodeJS.ProcessEnv,
  name: string,
  fallback?: string,
): string {
  const value = source[name]?.trim() || fallback?.trim();

  if (!value) {
    throw new Error(`${name} is required for metrics-sync-worker.`);
  }

  return value;
}

function parseConcurrency(value: string | undefined): number {
  const parsedValue = Number(value ?? "2");

  if (!Number.isInteger(parsedValue) || parsedValue < 1 || parsedValue > 25) {
    throw new Error(
      "METRICS_SYNC_WORKER_CONCURRENCY must be an integer between 1 and 25.",
    );
  }

  return parsedValue;
}

export function loadWorkerConfig(
  source: NodeJS.ProcessEnv = process.env,
): WorkerConfig {
  return {
    concurrency: parseConcurrency(source.METRICS_SYNC_WORKER_CONCURRENCY),
    kickClientId: source.KICK_CLIENT_ID?.trim() || undefined,
    kickClientSecret: source.KICK_CLIENT_SECRET?.trim() || undefined,
    queueName:
      source.METRICS_SYNC_QUEUE_NAME?.trim() ||
      source.QUEUE_DEFAULT_NAME?.trim() ||
      DEFAULT_METRICS_SYNC_QUEUE_NAME,
    redisUrl: requireEnv(source, "REDIS_URL"),
    supabaseServiceRoleKey: requireEnv(source, "SUPABASE_SERVICE_ROLE_KEY"),
    supabaseUrl: requireEnv(
      source,
      "SUPABASE_URL",
      source.NEXT_PUBLIC_SUPABASE_URL,
    ),
    tiktokClientKey: source.TIKTOK_CLIENT_KEY?.trim() || undefined,
    tiktokClientSecret: source.TIKTOK_CLIENT_SECRET?.trim() || undefined,
    twitchClientId: source.TWITCH_CLIENT_ID?.trim() || undefined,
    twitchClientSecret: source.TWITCH_CLIENT_SECRET?.trim() || undefined,
    youtubeClientId: source.YOUTUBE_CLIENT_ID?.trim() || undefined,
    youtubeClientSecret: source.YOUTUBE_CLIENT_SECRET?.trim() || undefined,
  };
}
