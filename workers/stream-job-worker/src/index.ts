import { Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  STREAM_JOB_QUEUE_NAME,
  type StreamOSJob,
  type StreamOSJobType,
} from "@streamos/queue";
import { assertRedisTls } from "@streamos/redis";

type WorkerConfig = {
  alertWebhookUrl?: string;
  concurrency: number;
  queueName: string;
  redisUrl: string;
  supabaseServiceRoleKey: string;
  supabaseUrl: string;
};

type ChannelRecord = {
  id: string;
  user_id: string;
  creator_id: string;
  platform: string;
  external_channel_id: string | null;
  display_name: string;
};

type StreamRecord = {
  id: string;
  user_id: string;
  channel_id: string;
  platform_stream_id: string;
};

type ContentJobType = "transcription" | "clip_scoring" | "title_generation";

class PermanentStreamJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentStreamJobError";
  }
}

function requireEnv(
  source: NodeJS.ProcessEnv,
  name: string,
  fallback?: string,
): string {
  const value = source[name]?.trim() || fallback?.trim();

  if (!value) {
    throw new Error(`${name} is required for stream-job-worker.`);
  }

  return value;
}

function parseConcurrency(value: string | undefined): number {
  const parsedValue = Number(value ?? "5");

  if (!Number.isInteger(parsedValue) || parsedValue < 1 || parsedValue > 50) {
    throw new Error(
      "STREAM_JOB_WORKER_CONCURRENCY must be an integer between 1 and 50.",
    );
  }

  return parsedValue;
}

function loadWorkerConfig(
  source: NodeJS.ProcessEnv = process.env,
): WorkerConfig {
  return {
    alertWebhookUrl: source.STREAM_JOB_ALERT_WEBHOOK_URL?.trim() || undefined,
    concurrency: parseConcurrency(source.STREAM_JOB_WORKER_CONCURRENCY),
    queueName:
      source.STREAM_JOB_QUEUE_NAME?.trim() ||
      source.QUEUE_DEFAULT_NAME?.trim() ||
      STREAM_JOB_QUEUE_NAME,
    redisUrl: requireEnv(source, "REDIS_URL"),
    supabaseServiceRoleKey: requireEnv(source, "SUPABASE_SERVICE_ROLE_KEY"),
    supabaseUrl: requireEnv(
      source,
      "SUPABASE_URL",
      source.NEXT_PUBLIC_SUPABASE_URL,
    ),
  };
}

function createRedisConnection(redisUrl: string): Redis {
  const url = new URL(redisUrl);

  if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
    throw new Error("REDIS_URL must use redis:// or rediss://.");
  }

  assertRedisTls(redisUrl);

  return new Redis(redisUrl, {
    enableReadyCheck: true,
    maxRetriesPerRequest: null,
  });
}

function createSupabaseAdmin(config: WorkerConfig): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function resolveChannel(
  supabase: SupabaseClient,
  event: StreamOSJob,
): Promise<ChannelRecord> {
  const { data, error } = await supabase
    .from("channels")
    .select("id,user_id,creator_id,platform,external_channel_id,display_name")
    .eq("platform", event.provider)
    .eq("external_channel_id", event.channelId)
    .maybeSingle();

  if (error) {
    throw new Error(`Channel lookup failed: ${error.message}`);
  }

  if (!data) {
    throw new PermanentStreamJobError(
      `No ${event.provider} channel found for external_channel_id=${event.channelId}.`,
    );
  }

  return data as ChannelRecord;
}

function getPlatformStreamId(event: StreamOSJob): string {
  return event.streamId ?? event.videoId ?? event.id;
}

async function upsertStream(
  supabase: SupabaseClient,
  channel: ChannelRecord,
  event: StreamOSJob,
  status: "live" | "updated" | "ended" | "published",
): Promise<StreamRecord> {
  const platformStreamId = getPlatformStreamId(event);
  const { data, error } = await supabase
    .from("streams")
    .upsert(
      {
        user_id: channel.user_id,
        channel_id: channel.id,
        provider: event.provider,
        stream_id: platformStreamId,
        platform_stream_id: platformStreamId,
        title: event.title ?? null,
        game_name: event.gameName ?? null,
        viewer_peak: event.viewerPeak ?? event.viewerCount ?? null,
        peak_viewers: event.viewerPeak ?? event.viewerCount ?? null,
        started_at: event.startedAt ?? event.publishedAt ?? null,
        ended_at: event.endedAt ?? null,
        status,
      },
      { onConflict: "channel_id,platform_stream_id" },
    )
    .select("id,user_id,channel_id,platform_stream_id")
    .single();

  if (error) {
    throw new Error(`Stream upsert failed: ${error.message}`);
  }

  return data as StreamRecord;
}

async function findStreamForEvent(
  supabase: SupabaseClient,
  channel: ChannelRecord,
  event: StreamOSJob,
): Promise<StreamRecord | null> {
  let query = supabase
    .from("streams")
    .select("id,user_id,channel_id,platform_stream_id")
    .eq("channel_id", channel.id)
    .eq("user_id", channel.user_id);

  if (event.streamId) {
    query = query.eq("platform_stream_id", event.streamId);
  } else {
    query = query.is("ended_at", null).order("started_at", {
      ascending: false,
      nullsFirst: false,
    });
  }

  const { data, error } = await query.limit(1).maybeSingle();

  if (error) {
    throw new Error(`Stream lookup failed: ${error.message}`);
  }

  return (data as StreamRecord | null) ?? null;
}

async function insertContentJob({
  channel,
  event,
  jobType,
  stream,
  supabase,
}: {
  channel: ChannelRecord;
  event: StreamOSJob;
  jobType: ContentJobType;
  stream: StreamRecord | null;
  supabase: SupabaseClient;
}): Promise<void> {
  const { error } = await supabase.from("content_jobs").upsert(
    {
      user_id: channel.user_id,
      channel_id: channel.id,
      stream_id: stream?.id ?? null,
      queue_job_id: `stream-webhook:${event.id}:${jobType}`,
      job_type: jobType,
      type: jobType,
      status: "pending",
      payload: event,
    },
    { onConflict: "queue_job_id" },
  );

  if (error) {
    throw new Error(`Content job upsert failed: ${error.message}`);
  }
}

async function handleStreamOnline(
  supabase: SupabaseClient,
  event: StreamOSJob,
): Promise<void> {
  const channel = await resolveChannel(supabase, event);
  await upsertStream(supabase, channel, event, "live");
}

async function handleStreamOffline(
  supabase: SupabaseClient,
  event: StreamOSJob,
): Promise<void> {
  const channel = await resolveChannel(supabase, event);
  let stream = await findStreamForEvent(supabase, channel, event);

  if (!stream) {
    stream = await upsertStream(supabase, channel, event, "ended");
  }

  const { error } = await supabase
    .from("streams")
    .update({
      ended_at: event.endedAt ?? event.receivedAt,
      status: "ended",
    })
    .eq("id", stream.id)
    .eq("user_id", channel.user_id);

  if (error) {
    throw new Error(`Stream offline update failed: ${error.message}`);
  }

  await insertContentJob({
    channel,
    event,
    jobType: "transcription",
    stream,
    supabase,
  });
}

async function handleStreamUpdate(
  supabase: SupabaseClient,
  event: StreamOSJob,
): Promise<void> {
  const channel = await resolveChannel(supabase, event);
  const stream = await findStreamForEvent(supabase, channel, event);

  if (!stream) {
    await upsertStream(supabase, channel, event, "updated");
    return;
  }

  const { error } = await supabase
    .from("streams")
    .update({
      title: event.title ?? null,
      game_name: event.gameName ?? null,
      viewer_peak: event.viewerPeak ?? event.viewerCount ?? null,
      peak_viewers: event.viewerPeak ?? event.viewerCount ?? null,
      status: "updated",
    })
    .eq("id", stream.id)
    .eq("user_id", channel.user_id);

  if (error) {
    throw new Error(`Stream update failed: ${error.message}`);
  }
}

async function handleVideoPublished(
  supabase: SupabaseClient,
  event: StreamOSJob,
): Promise<void> {
  const channel = await resolveChannel(supabase, event);
  const stream = await upsertStream(supabase, channel, event, "published");

  await insertContentJob({
    channel,
    event,
    jobType: "clip_scoring",
    stream,
    supabase,
  });
}

async function handleChannelUpdate(
  supabase: SupabaseClient,
  event: StreamOSJob,
): Promise<void> {
  const channel = await resolveChannel(supabase, event);
  const { error } = await supabase
    .from("channels")
    .update({
      updated_at: event.receivedAt,
    })
    .eq("id", channel.id)
    .eq("user_id", channel.user_id);

  if (error) {
    throw new Error(`Channel update failed: ${error.message}`);
  }
}

async function processStreamJob(
  supabase: SupabaseClient,
  job: Job<StreamOSJob, void, StreamOSJobType>,
): Promise<void> {
  const event = job.data;

  try {
    switch (event.type) {
      case "stream.online":
        await handleStreamOnline(supabase, event);
        break;
      case "stream.offline":
        await handleStreamOffline(supabase, event);
        break;
      case "stream.update":
        await handleStreamUpdate(supabase, event);
        break;
      case "video.published":
        await handleVideoPublished(supabase, event);
        break;
      case "channel.update":
        await handleChannelUpdate(supabase, event);
        break;
      default:
        throw new PermanentStreamJobError(
          `Unsupported stream job type: ${String(event.type)}`,
        );
    }
  } catch (error) {
    if (error instanceof PermanentStreamJobError) {
      await job.discard();
    }

    throw error;
  }
}

async function sendFailureAlert({
  config,
  error,
  job,
}: {
  config: WorkerConfig;
  error: Error;
  job: Job<StreamOSJob, void, StreamOSJobType> | undefined;
}): Promise<void> {
  if (!config.alertWebhookUrl) {
    return;
  }

  await fetch(config.alertWebhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      service: "stream-job-worker",
      queue: config.queueName,
      job_id: job?.id,
      job_type: job?.name,
      attempts_made: job?.attemptsMade,
      error: error.message,
      failed_at: new Date().toISOString(),
    }),
  });
}

async function main(): Promise<void> {
  const config = loadWorkerConfig();
  const connection = createRedisConnection(config.redisUrl);
  const supabase = createSupabaseAdmin(config);
  const worker = new Worker<StreamOSJob, void, StreamOSJobType>(
    config.queueName,
    async (job) => processStreamJob(supabase, job),
    {
      connection,
      concurrency: config.concurrency,
    },
  );

  worker.on("completed", (job) => {
    console.info("[stream-job-worker] completed", {
      id: job.id,
      type: job.name,
    });
  });

  worker.on("failed", (job, error) => {
    console.error("[stream-job-worker] failed", {
      id: job?.id,
      type: job?.name,
      attemptsMade: job?.attemptsMade,
      error: error.message,
    });

    const attempts = Number(job?.opts.attempts ?? 1);

    if (job && job.attemptsMade < attempts) {
      return;
    }

    void sendFailureAlert({ config, error, job }).catch((alertError) => {
      console.error("[stream-job-worker] alert failed", alertError);
    });
  });

  const shutdown = async (signal: string) => {
    console.info(`[stream-job-worker] ${signal} received, shutting down.`);
    await worker.close();
    connection.disconnect();
    process.exit(0);
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  console.info("[stream-job-worker] started", {
    concurrency: config.concurrency,
    queue: config.queueName,
  });
}

void main().catch((error) => {
  console.error("[stream-job-worker] startup failed", error);
  process.exit(1);
});
