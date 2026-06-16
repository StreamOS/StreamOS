import { assertPrivateAutomationServiceUrl } from "../../../scripts/lib/private-automation-url.cjs";

export const DEFAULT_TRANSCRIPTION_QUEUE_NAME = "streamos-transcription";
export const DEFAULT_CLIP_GENERATION_QUEUE_NAME = "streamos-clip-generation";
export const DEFAULT_MEDIA_QUEUE_NAME = "streamos-media";

export type WorkerConfig = {
  automationServiceUrl: string;
  clipGenerationQueueName: string;
  concurrency: number;
  mediaQueueName: string;
  queueName: string;
  redisUrl: string;
  supabaseServiceRoleKey: string;
  supabaseUrl: string;
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
    throw new Error(`${name} is required for transcription-worker.`);
  }

  return value;
}

function parseConcurrency(value: string | undefined): number {
  const parsedValue = Number(value ?? "2");

  if (!Number.isInteger(parsedValue) || parsedValue < 1 || parsedValue > 25) {
    throw new Error(
      "TRANSCRIPTION_WORKER_CONCURRENCY must be an integer between 1 and 25.",
    );
  }

  return parsedValue;
}

export function loadWorkerConfig(
  source: NodeJS.ProcessEnv = process.env,
): WorkerConfig {
  return {
    automationServiceUrl: assertPrivateAutomationServiceUrl(
      requireEnv(source, "AUTOMATION_SERVICE_URL"),
      {
        consumerName: "transcription-worker",
      },
    ),
    clipGenerationQueueName:
      source.CLIP_GENERATION_QUEUE_NAME?.trim() ||
      DEFAULT_CLIP_GENERATION_QUEUE_NAME,
    concurrency: parseConcurrency(source.TRANSCRIPTION_WORKER_CONCURRENCY),
    mediaQueueName:
      source.QUEUE_DEFAULT_NAME?.trim() ||
      source.STREAM_JOB_QUEUE_NAME?.trim() ||
      DEFAULT_MEDIA_QUEUE_NAME,
    queueName:
      source.TRANSCRIPTION_QUEUE_NAME?.trim() ||
      DEFAULT_TRANSCRIPTION_QUEUE_NAME,
    redisUrl: requireEnv(source, "REDIS_URL"),
    supabaseServiceRoleKey: requireEnv(source, "SUPABASE_SERVICE_ROLE_KEY"),
    supabaseUrl: requireEnv(
      source,
      "SUPABASE_URL",
      source.NEXT_PUBLIC_SUPABASE_URL,
    ),
    twitchClientId: source.TWITCH_CLIENT_ID?.trim() || undefined,
    twitchClientSecret: source.TWITCH_CLIENT_SECRET?.trim() || undefined,
    youtubeClientId: source.YOUTUBE_CLIENT_ID?.trim() || undefined,
    youtubeClientSecret: source.YOUTUBE_CLIENT_SECRET?.trim() || undefined,
  };
}
