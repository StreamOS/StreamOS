import { pathToFileURL } from "node:url";
import { Queue, Worker, type Job, type JobsOptions } from "bullmq";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  STREAM_JOB_QUEUE_NAME,
  TRANSCRIPTION_TRIGGER_JOB_NAME,
  getTranscriptionTriggerJobId,
  type StreamOSJob,
  type StreamOSJobType,
  type StreamProvider,
} from "@streamos/queue";

import { createRedisConnectionOptions } from "./redisConnection.js";

const DEFAULT_TRANSCRIPTION_QUEUE_NAME = "streamos-transcription";
const REPURPOSING_NOT_IMPLEMENTED_MESSAGE =
  "video.published does not have a canonical repurposing contract yet.";

const transcriptionTriggerJobOptions: JobsOptions = {
  attempts: 5,
  backoff: {
    type: "exponential",
    delay: 60_000,
  },
  removeOnComplete: {
    age: 259_200,
    count: 2_000,
  },
  removeOnFail: {
    age: 604_800,
  },
};

type WorkerConfig = {
  alertWebhookUrl?: string;
  concurrency: number;
  queueName: string;
  redisUrl: string;
  supabaseServiceRoleKey: string;
  supabaseUrl: string;
  transcriptionQueueName: string;
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

type StreamRecordWithChannel = StreamRecord & {
  channel: ChannelRecord;
};

type ContentJobType = "repurposing" | "transcription";
type ContentJobStatus = "failed" | "pending";

type TranscriptionTriggerPayload = {
  user_id: string;
  stream_id: string;
  platform: StreamProvider;
  creator_id?: string;
  channel_id?: string;
  vod_asset_url: string;
  ended_at?: string;
  language: string;
  trigger: "stream_ended";
};

type StreamJobStore = {
  findStreamByInternalId(
    streamId: string,
  ): Promise<StreamRecordWithChannel | null>;
  findStreamForChannelEvent(
    channel: ChannelRecord,
    event: StreamOSJob,
  ): Promise<StreamRecord | null>;
  markStreamEnded(input: {
    endedAt: string;
    stream: StreamRecord;
    userId: string;
  }): Promise<void>;
  resolveChannelByExternalId(input: {
    externalChannelId: string;
    provider: StreamProvider;
  }): Promise<ChannelRecord | null>;
  touchChannel(input: {
    channelId: string;
    updatedAt: string;
    userId: string;
  }): Promise<void>;
  updateStreamDetails(input: {
    event: StreamOSJob;
    stream: StreamRecord;
    userId: string;
  }): Promise<void>;
  updateContentJobByQueueId(input: {
    errorMessage?: string | null;
    queueJobId: string;
    result?: Record<string, unknown> | null;
    status: ContentJobStatus;
  }): Promise<void>;
  upsertContentJob(input: {
    channelId: string;
    errorMessage?: string | null;
    jobType: ContentJobType;
    payload: Record<string, unknown>;
    queueJobId: string;
    result?: Record<string, unknown> | null;
    status: ContentJobStatus;
    streamId: string | null;
    userId: string;
  }): Promise<void>;
  upsertStream(
    channel: ChannelRecord,
    event: StreamOSJob,
    status: "ended" | "live" | "published" | "updated",
  ): Promise<StreamRecord>;
};

type TranscriptionQueueJob = {
  id?: string | number;
};

type TranscriptionQueue = {
  add(
    name: typeof TRANSCRIPTION_TRIGGER_JOB_NAME,
    data: TranscriptionTriggerPayload,
    opts: JobsOptions,
  ): Promise<TranscriptionQueueJob>;
  close?(): Promise<void>;
};

type ProcessStreamJobDependencies = {
  store: StreamJobStore;
  transcriptionQueue: TranscriptionQueue;
};

export class PermanentStreamJobError extends Error {
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

export function loadWorkerConfig(
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
    transcriptionQueueName:
      source.TRANSCRIPTION_QUEUE_NAME?.trim() ||
      DEFAULT_TRANSCRIPTION_QUEUE_NAME,
  };
}

function createSupabaseAdmin(config: WorkerConfig): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function createTranscriptionQueue(config: WorkerConfig): TranscriptionQueue {
  return new Queue<
    TranscriptionTriggerPayload,
    void,
    typeof TRANSCRIPTION_TRIGGER_JOB_NAME
  >(config.transcriptionQueueName, {
    connection: createRedisConnectionOptions(config.redisUrl),
    defaultJobOptions: transcriptionTriggerJobOptions,
  });
}

function getPlatformStreamId(event: StreamOSJob): string {
  return event.streamId ?? event.videoId ?? event.id;
}

function getRepurposingFailureJobId(streamId: string): string {
  return `repurposing-${streamId}`;
}

function buildTranscriptionTriggerPayload({
  channel,
  event,
  stream,
}: {
  channel: ChannelRecord;
  event: StreamOSJob;
  stream: StreamRecord;
}): TranscriptionTriggerPayload {
  if (!event.vodAssetUrl) {
    throw new PermanentStreamJobError(
      "stream.offline cannot queue transcription without vodAssetUrl.",
    );
  }

  return {
    user_id: channel.user_id,
    stream_id: stream.id,
    platform: event.provider,
    creator_id: channel.creator_id || undefined,
    channel_id: channel.id,
    vod_asset_url: event.vodAssetUrl,
    ended_at: event.endedAt ?? event.receivedAt,
    language: event.language?.trim() || "auto",
    trigger: "stream_ended",
  };
}

function requireExternalChannelId(event: StreamOSJob): string {
  if (!event.channelId?.trim()) {
    throw new PermanentStreamJobError(
      `stream job ${event.type} is missing an external channelId.`,
    );
  }

  return event.channelId;
}

export function createSupabaseStreamJobStore(
  supabase: SupabaseClient,
): StreamJobStore {
  return {
    async findStreamByInternalId(
      streamId: string,
    ): Promise<StreamRecordWithChannel | null> {
      const { data: stream, error: streamError } = await supabase
        .from("streams")
        .select("id,user_id,channel_id,platform_stream_id")
        .eq("id", streamId)
        .maybeSingle();

      if (streamError) {
        throw new Error(`Stream lookup failed: ${streamError.message}`);
      }

      if (!stream) {
        return null;
      }

      const { data: channel, error: channelError } = await supabase
        .from("channels")
        .select(
          "id,user_id,creator_id,platform,external_channel_id,display_name",
        )
        .eq("id", stream.channel_id)
        .maybeSingle();

      if (channelError) {
        throw new Error(`Channel lookup failed: ${channelError.message}`);
      }

      if (!channel) {
        throw new PermanentStreamJobError(
          `No channel found for stream id=${streamId}.`,
        );
      }

      return {
        ...(stream as StreamRecord),
        channel: channel as ChannelRecord,
      };
    },

    async findStreamForChannelEvent(
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
    },

    async markStreamEnded({
      endedAt,
      stream,
      userId,
    }: {
      endedAt: string;
      stream: StreamRecord;
      userId: string;
    }): Promise<void> {
      const { error } = await supabase
        .from("streams")
        .update({
          ended_at: endedAt,
          status: "ended",
        })
        .eq("id", stream.id)
        .eq("user_id", userId);

      if (error) {
        throw new Error(`Stream offline update failed: ${error.message}`);
      }
    },

    async resolveChannelByExternalId({
      externalChannelId,
      provider,
    }: {
      externalChannelId: string;
      provider: StreamProvider;
    }): Promise<ChannelRecord | null> {
      const { data, error } = await supabase
        .from("channels")
        .select(
          "id,user_id,creator_id,platform,external_channel_id,display_name",
        )
        .eq("platform", provider)
        .eq("external_channel_id", externalChannelId)
        .maybeSingle();

      if (error) {
        throw new Error(`Channel lookup failed: ${error.message}`);
      }

      return (data as ChannelRecord | null) ?? null;
    },

    async touchChannel({
      channelId,
      updatedAt,
      userId,
    }: {
      channelId: string;
      updatedAt: string;
      userId: string;
    }): Promise<void> {
      const { error } = await supabase
        .from("channels")
        .update({
          updated_at: updatedAt,
        })
        .eq("id", channelId)
        .eq("user_id", userId);

      if (error) {
        throw new Error(`Channel update failed: ${error.message}`);
      }
    },

    async updateStreamDetails({
      event,
      stream,
      userId,
    }: {
      event: StreamOSJob;
      stream: StreamRecord;
      userId: string;
    }): Promise<void> {
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
        .eq("user_id", userId);

      if (error) {
        throw new Error(`Stream update failed: ${error.message}`);
      }
    },

    async updateContentJobByQueueId({
      errorMessage,
      queueJobId,
      result,
      status,
    }: {
      errorMessage?: string | null;
      queueJobId: string;
      result?: Record<string, unknown> | null;
      status: ContentJobStatus;
    }): Promise<void> {
      const { error } = await supabase
        .from("content_jobs")
        .update({
          error_message: errorMessage ?? null,
          result: result ?? null,
          status,
          updated_at: new Date().toISOString(),
        })
        .eq("queue_job_id", queueJobId);

      if (error) {
        throw new Error(`Content job update failed: ${error.message}`);
      }
    },

    async upsertContentJob({
      channelId,
      errorMessage,
      jobType,
      payload,
      queueJobId,
      result,
      status,
      streamId,
      userId,
    }: {
      channelId: string;
      errorMessage?: string | null;
      jobType: ContentJobType;
      payload: Record<string, unknown>;
      queueJobId: string;
      result?: Record<string, unknown> | null;
      status: ContentJobStatus;
      streamId: string | null;
      userId: string;
    }): Promise<void> {
      const { error } = await supabase.from("content_jobs").upsert(
        {
          user_id: userId,
          channel_id: channelId,
          stream_id: streamId,
          queue_job_id: queueJobId,
          job_type: jobType,
          type: jobType,
          status,
          error_message: errorMessage ?? null,
          result: result ?? null,
          payload,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "queue_job_id" },
      );

      if (error) {
        throw new Error(`Content job upsert failed: ${error.message}`);
      }
    },

    async upsertStream(
      channel: ChannelRecord,
      event: StreamOSJob,
      status: "ended" | "live" | "published" | "updated",
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
    },
  };
}

async function resolveOfflineStreamContext(
  store: StreamJobStore,
  event: StreamOSJob,
): Promise<StreamRecordWithChannel> {
  if (event.internalStreamId) {
    const stream = await store.findStreamByInternalId(event.internalStreamId);

    if (stream) {
      return stream;
    }

    throw new PermanentStreamJobError(
      `No stream found for internalStreamId=${event.internalStreamId}.`,
    );
  }

  const channel = await store.resolveChannelByExternalId({
    externalChannelId: requireExternalChannelId(event),
    provider: event.provider,
  });

  if (!channel) {
    throw new PermanentStreamJobError(
      `No ${event.provider} channel found for external_channel_id=${event.channelId}.`,
    );
  }

  const existingStream = await store.findStreamForChannelEvent(channel, event);
  const stream =
    existingStream ?? (await store.upsertStream(channel, event, "ended"));

  return {
    ...stream,
    channel,
  };
}

async function handleStreamOnline(
  store: StreamJobStore,
  event: StreamOSJob,
): Promise<void> {
  const channel = await store.resolveChannelByExternalId({
    externalChannelId: requireExternalChannelId(event),
    provider: event.provider,
  });

  if (!channel) {
    throw new PermanentStreamJobError(
      `No ${event.provider} channel found for external_channel_id=${event.channelId}.`,
    );
  }

  await store.upsertStream(channel, event, "live");
}

async function handleStreamOffline(
  { store, transcriptionQueue }: ProcessStreamJobDependencies,
  event: StreamOSJob,
): Promise<void> {
  const streamWithChannel = await resolveOfflineStreamContext(store, event);
  const endedAt = event.endedAt ?? event.receivedAt;

  await store.markStreamEnded({
    endedAt,
    stream: streamWithChannel,
    userId: streamWithChannel.channel.user_id,
  });

  if (!event.vodAssetUrl) {
    return;
  }

  const payload = buildTranscriptionTriggerPayload({
    channel: streamWithChannel.channel,
    event,
    stream: streamWithChannel,
  });
  const queueJobId = getTranscriptionTriggerJobId(streamWithChannel.id);

  await store.upsertContentJob({
    channelId: streamWithChannel.channel.id,
    jobType: "transcription",
    payload,
    queueJobId,
    status: "pending",
    streamId: streamWithChannel.id,
    userId: streamWithChannel.channel.user_id,
  });

  try {
    await transcriptionQueue.add(TRANSCRIPTION_TRIGGER_JOB_NAME, payload, {
      ...transcriptionTriggerJobOptions,
      jobId: queueJobId,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Transcription trigger enqueue failed.";

    await store.updateContentJobByQueueId({
      errorMessage,
      queueJobId,
      result: { error: errorMessage },
      status: "failed",
    });

    throw error;
  }
}

async function handleStreamUpdate(
  store: StreamJobStore,
  event: StreamOSJob,
): Promise<void> {
  const channel = await store.resolveChannelByExternalId({
    externalChannelId: requireExternalChannelId(event),
    provider: event.provider,
  });

  if (!channel) {
    throw new PermanentStreamJobError(
      `No ${event.provider} channel found for external_channel_id=${event.channelId}.`,
    );
  }

  const stream = await store.findStreamForChannelEvent(channel, event);

  if (!stream) {
    await store.upsertStream(channel, event, "updated");
    return;
  }

  await store.updateStreamDetails({
    event,
    stream,
    userId: channel.user_id,
  });
}

async function handleVideoPublished(
  store: StreamJobStore,
  event: StreamOSJob,
): Promise<void> {
  const channel = await store.resolveChannelByExternalId({
    externalChannelId: requireExternalChannelId(event),
    provider: event.provider,
  });

  if (!channel) {
    throw new PermanentStreamJobError(
      `No ${event.provider} channel found for external_channel_id=${event.channelId}.`,
    );
  }

  const stream = await store.upsertStream(channel, event, "published");
  const queueJobId = getRepurposingFailureJobId(stream.id);

  await store.upsertContentJob({
    channelId: channel.id,
    errorMessage: REPURPOSING_NOT_IMPLEMENTED_MESSAGE,
    jobType: "repurposing",
    payload: event,
    queueJobId,
    result: { error: REPURPOSING_NOT_IMPLEMENTED_MESSAGE },
    status: "failed",
    streamId: stream.id,
    userId: channel.user_id,
  });
}

async function handleChannelUpdate(
  store: StreamJobStore,
  event: StreamOSJob,
): Promise<void> {
  const channel = await store.resolveChannelByExternalId({
    externalChannelId: requireExternalChannelId(event),
    provider: event.provider,
  });

  if (!channel) {
    throw new PermanentStreamJobError(
      `No ${event.provider} channel found for external_channel_id=${event.channelId}.`,
    );
  }

  await store.touchChannel({
    channelId: channel.id,
    updatedAt: event.receivedAt,
    userId: channel.user_id,
  });
}

export async function processStreamJob(
  job: Pick<
    Job<StreamOSJob, void, StreamOSJobType>,
    "data" | "discard" | "id" | "name"
  >,
  dependencies: ProcessStreamJobDependencies,
): Promise<void> {
  const event = job.data;

  try {
    switch (event.type) {
      case "stream.online":
        await handleStreamOnline(dependencies.store, event);
        break;
      case "stream.offline":
        await handleStreamOffline(dependencies, event);
        break;
      case "stream.update":
        await handleStreamUpdate(dependencies.store, event);
        break;
      case "video.published":
        await handleVideoPublished(dependencies.store, event);
        break;
      case "channel.update":
        await handleChannelUpdate(dependencies.store, event);
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

export async function main(): Promise<void> {
  const config = loadWorkerConfig();
  const supabase = createSupabaseAdmin(config);
  const store = createSupabaseStreamJobStore(supabase);
  const transcriptionQueue = createTranscriptionQueue(config);
  const worker = new Worker<StreamOSJob, void, StreamOSJobType>(
    config.queueName,
    async (job) => processStreamJob(job, { store, transcriptionQueue }),
    {
      connection: createRedisConnectionOptions(config.redisUrl),
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
    await transcriptionQueue.close?.();
    process.exit(0);
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  console.info("[stream-job-worker] started", {
    concurrency: config.concurrency,
    queue: config.queueName,
    transcriptionQueue: config.transcriptionQueueName,
  });
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  void main().catch((error) => {
    console.error("[stream-job-worker] startup failed", error);
    process.exit(1);
  });
}

export { REPURPOSING_NOT_IMPLEMENTED_MESSAGE };
