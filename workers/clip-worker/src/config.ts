export const DEFAULT_CLIP_GENERATION_QUEUE_NAME = "streamos-clip-generation";

export type WorkerConfig = {
  automationServiceUrl: string;
  concurrency: number;
  queueName: string;
  redisUrl: string;
  supabaseServiceRoleKey: string;
  supabaseUrl: string;
};

function requireEnv(
  source: NodeJS.ProcessEnv,
  name: string,
  fallback?: string,
): string {
  const value = source[name]?.trim() || fallback?.trim();

  if (!value) {
    throw new Error(`${name} is required for clip-worker.`);
  }

  return value;
}

function parseConcurrency(value: string | undefined): number {
  const parsedValue = Number(value ?? "2");

  if (!Number.isInteger(parsedValue) || parsedValue < 1 || parsedValue > 25) {
    throw new Error(
      "CLIP_WORKER_CONCURRENCY must be an integer between 1 and 25.",
    );
  }

  return parsedValue;
}

export function loadWorkerConfig(
  source: NodeJS.ProcessEnv = process.env,
): WorkerConfig {
  return {
    automationServiceUrl: requireEnv(source, "AUTOMATION_SERVICE_URL"),
    concurrency: parseConcurrency(source.CLIP_WORKER_CONCURRENCY),
    queueName:
      source.CLIP_GENERATION_QUEUE_NAME?.trim() ||
      source.QUEUE_DEFAULT_NAME?.trim() ||
      DEFAULT_CLIP_GENERATION_QUEUE_NAME,
    redisUrl: requireEnv(source, "REDIS_URL"),
    supabaseServiceRoleKey: requireEnv(source, "SUPABASE_SERVICE_ROLE_KEY"),
    supabaseUrl: requireEnv(
      source,
      "SUPABASE_URL",
      source.NEXT_PUBLIC_SUPABASE_URL,
    ),
  };
}
