import { pathToFileURL } from "node:url";
import { Queue, Worker, type Job, type JobsOptions } from "bullmq";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  STREAM_JOB_QUEUE_NAME,
  REPURPOSING_PLAN_JOB_NAME,
  REPURPOSING_PLAN_JOB_OPTIONS,
  REPURPOSING_QUEUE_NAME,
  TRANSCRIPTION_TRIGGER_JOB_NAME,
  getRepurposingPlanJobId,
  getTranscriptionTriggerJobId,
  type StreamOSJob,
  type StreamOSJobType,
  type StreamProvider,
  type RepurposingPlanQueueJobData,
} from "@streamos/queue";
import {
  SUPPORTED_MEDIA_PROVIDERS,
  type RepurposingPlanJobPayload,
  type SupportedProvider as SupportedMediaProvider,
} from "@streamos/types/jobs";
import {
  type PublicHttpsAssetResolver,
  UnsafePublicHttpsAssetUrlError,
  validatePublicHttpsAssetUrl,
} from "@streamos/utils";

import { createRedisConnectionOptions } from "./redisConnection.js";

const DEFAULT_TRANSCRIPTION_QUEUE_NAME = "streamos-transcription";

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
  repurposingQueueName: string;
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

type PlatformConnectionRecord = {
  channel_id: string | null;
  creator_id: string;
  metadata: Record<string, unknown>;
  user_id: string;
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

type ContentJobRecord = {
  id: string;
  queue_job_id: string | null;
  status: string;
};

type StreamLifecycleRecord = {
  ended_at: string | null;
  id: string;
  status: string;
};

type ContentJobType = "transcription" | "repurposing";
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
  resolvePlatformConnectionByExternalId(input: {
    externalChannelId: string;
    provider: StreamProvider;
  }): Promise<PlatformConnectionRecord | null>;
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
  }): Promise<ContentJobRecord>;
  upsertStream(
    channel: ChannelRecord,
    event: StreamOSJob,
    status: "ended" | "live" | "published" | "updated",
  ): Promise<StreamRecord>;
};

type TranscriptionQueueJob = {
  id?: string | number;
};

type RepurposingPlanQueueJob = {
  id?: string | number;
};

type RepurposingPlanSettings = {
  brandProfileId?: string;
  contentPolicyProfile?: string;
  targetPlatforms?: SupportedMediaProvider[];
};

type TranscriptionQueue = {
  add(
    name: typeof TRANSCRIPTION_TRIGGER_JOB_NAME,
    data: TranscriptionTriggerPayload,
    opts: JobsOptions,
  ): Promise<TranscriptionQueueJob>;
  close?(): Promise<void>;
};

type RepurposingPlanQueue = {
  add(
    name: typeof REPURPOSING_PLAN_JOB_NAME,
    data: RepurposingPlanQueueJobData,
    opts: JobsOptions,
  ): Promise<RepurposingPlanQueueJob>;
  close?(): Promise<void>;
};

type ProcessStreamJobDependencies = {
  assetUrlResolver?: PublicHttpsAssetResolver;
  store: StreamJobStore;
  repurposingQueue: RepurposingPlanQueue;
  transcriptionQueue: TranscriptionQueue;
};

export class PermanentStreamJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentStreamJobError";
  }
}

async function assertPublicAssetUrl(
  rawUrl: string,
  resolver?: PublicHttpsAssetResolver,
): Promise<void> {
  try {
    await validatePublicHttpsAssetUrl(rawUrl, resolver);
  } catch (error) {
    if (error instanceof UnsafePublicHttpsAssetUrlError) {
      throw new PermanentStreamJobError(error.message);
    }

    throw error;
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
    repurposingQueueName:
      source.REPURPOSING_QUEUE_NAME?.trim() || REPURPOSING_QUEUE_NAME,
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

function createRepurposingPlanQueue(
  config: WorkerConfig,
): RepurposingPlanQueue {
  return new Queue<
    RepurposingPlanQueueJobData,
    void,
    typeof REPURPOSING_PLAN_JOB_NAME
  >(config.repurposingQueueName, {
    connection: createRedisConnectionOptions(config.redisUrl),
    defaultJobOptions: REPURPOSING_PLAN_JOB_OPTIONS,
  });
}

function getPlatformStreamId(event: StreamOSJob): string {
  return event.streamId ?? event.videoId ?? event.id;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : undefined;
}

function toSupportedMediaProviders(
  value: unknown,
): SupportedMediaProvider[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized = value
    .map((item) => toNonEmptyString(item))
    .filter(
      (item): item is SupportedMediaProvider =>
        typeof item === "string" &&
        SUPPORTED_MEDIA_PROVIDERS.includes(item as SupportedMediaProvider),
    );

  if (normalized.length !== value.length || normalized.length === 0) {
    return null;
  }

  return Array.from(new Set(normalized));
}

function resolveRepurposingPlanSettings(
  metadata: Record<string, unknown>,
): RepurposingPlanSettings | null {
  const repurposing = metadata.repurposing;

  if (!isRecord(repurposing) || repurposing.auto_repurpose_enabled !== true) {
    return null;
  }

  const targetPlatforms =
    repurposing.target_platforms === undefined
      ? undefined
      : toSupportedMediaProviders(repurposing.target_platforms);

  if (repurposing.target_platforms !== undefined && !targetPlatforms) {
    return null;
  }

  const brandProfileId = toNonEmptyString(repurposing.brand_profile_id);
  const contentPolicyProfile = toNonEmptyString(
    repurposing.content_policy_profile,
  );

  return {
    ...(targetPlatforms ? { targetPlatforms } : {}),
    ...(brandProfileId ? { brandProfileId } : {}),
    ...(contentPolicyProfile ? { contentPolicyProfile } : {}),
  };
}

function buildRepurposingPlanPayload({
  channel,
  event,
  settings,
  stream,
}: {
  channel: ChannelRecord;
  event: StreamOSJob;
  settings: RepurposingPlanSettings;
  stream: StreamRecord;
}): RepurposingPlanJobPayload {
  if (!event.vodAssetUrl?.trim()) {
    throw new PermanentStreamJobError(
      "video.published requires vodAssetUrl when enrichmentStatus=asset_available.",
    );
  }

  return {
    auto_repurpose_enabled: true,
    brand_profile_id: settings.brandProfileId,
    channel_id: channel.id,
    content_policy_profile: settings.contentPolicyProfile,
    creator_id: channel.creator_id || undefined,
    enrichment_status: "asset_available",
    manual_review_required: true,
    published_at: event.publishedAt ?? event.receivedAt,
    source_event_type: "video.published",
    source_provider: event.provider,
    source_video_id: event.videoId ?? event.id,
    source_video_title: event.title ?? undefined,
    stream_id: stream.id,
    target_platforms: settings.targetPlatforms,
    updated_at: event.updatedAt ?? event.receivedAt,
    user_id: channel.user_id,
    vod_asset_url: event.vodAssetUrl,
    workflow: "repurposing_plan",
  };
}

function buildRepurposingPlanQueuePayload({
  contentJobId,
  event,
  queueJobId,
  settings,
  stream,
  sourceMetadata,
}: {
  contentJobId: string;
  event: StreamOSJob;
  queueJobId: string;
  settings: RepurposingPlanSettings;
  stream: StreamRecord;
  sourceMetadata: RepurposingPlanJobPayload;
}): RepurposingPlanQueueJobData {
  const assetUrl = event.vodAssetUrl?.trim();

  return {
    asset_reference: assetUrl
      ? {
          kind: "vod",
          status: "asset_available",
          url: assetUrl,
        }
      : undefined,
    brand_context: settings.brandProfileId
      ? {
          brand_profile_id: settings.brandProfileId,
        }
      : undefined,
    content_job_id: contentJobId,
    content_policy_hints: settings.contentPolicyProfile
      ? {
          content_policy_profile: settings.contentPolicyProfile,
        }
      : undefined,
    language: event.language?.trim() || undefined,
    locale: event.language?.trim() || undefined,
    manual_review_required: true,
    provider: event.provider,
    provider_video_id: event.videoId ?? event.id,
    queue_job_id: queueJobId,
    source_event_type: "video.published",
    source_metadata: sourceMetadata,
    target_platforms: settings.targetPlatforms,
    transcript_reference: undefined,
    user_id: stream.user_id,
  };
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
      const { data, error } = await supabase
        .from("streams")
        .update({
          ended_at: endedAt,
          status: "ended",
        })
        .eq("id", stream.id)
        .eq("user_id", userId)
        .select("id,status,ended_at")
        .maybeSingle<StreamLifecycleRecord>();

      if (error) {
        throw new Error(`Stream offline update failed: ${error.message}`);
      }

      if (!data) {
        throw new Error(
          `Stream offline update matched no rows for stream_id=${stream.id}.`,
        );
      }

      if (data.status !== "ended") {
        throw new Error(
          `Stream offline update did not persist status=ended for stream_id=${stream.id}. Got status=${data.status}.`,
        );
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

    async resolvePlatformConnectionByExternalId({
      externalChannelId,
      provider,
    }: {
      externalChannelId: string;
      provider: StreamProvider;
    }): Promise<PlatformConnectionRecord | null> {
      const { data, error } = await supabase
        .from("platform_connections")
        .select("user_id,creator_id,channel_id,metadata")
        .eq("platform", provider)
        .eq("provider_account_id", externalChannelId)
        .maybeSingle();

      if (error) {
        throw new Error(`Platform connection lookup failed: ${error.message}`);
      }

      if (!data) {
        return null;
      }

      return {
        channel_id: data.channel_id ?? null,
        creator_id: data.creator_id,
        metadata: isRecord(data.metadata) ? data.metadata : {},
        user_id: data.user_id,
      };
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
      const { data, error } = await supabase
        .from("content_jobs")
        .update({
          error_message: errorMessage ?? null,
          result: result ?? null,
          status,
          updated_at: new Date().toISOString(),
        })
        .eq("queue_job_id", queueJobId)
        .select("id,queue_job_id,status")
        .maybeSingle<ContentJobRecord>();

      if (error) {
        throw new Error(`Content job update failed: ${error.message}`);
      }

      if (!data) {
        throw new Error(
          `Content job update matched no rows for queue_job_id=${queueJobId}.`,
        );
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
    }): Promise<ContentJobRecord> {
      const { data, error } = await supabase
        .from("content_jobs")
        .upsert(
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
        )
        .select("id,queue_job_id,status")
        .maybeSingle<ContentJobRecord>();

      if (error) {
        throw new Error(`Content job upsert failed: ${error.message}`);
      }

      if (!data) {
        throw new Error(
          `Content job upsert returned no row for queue_job_id=${queueJobId}.`,
        );
      }

      if (data.queue_job_id !== queueJobId) {
        throw new Error(
          `Content job upsert returned queue_job_id=${String(data.queue_job_id)} for expected queue_job_id=${queueJobId}.`,
        );
      }

      return data;
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
  { assetUrlResolver, store, transcriptionQueue }: ProcessStreamJobDependencies,
  event: StreamOSJob,
): Promise<void> {
  console.info("[stream-job-worker] stream.offline received", {
    hasVodAssetUrl: Boolean(event.vodAssetUrl),
    id: event.id,
    internalStreamId: event.internalStreamId ?? null,
    provider: event.provider,
    streamId: event.streamId ?? null,
    userId: event.userId ?? null,
  });

  const streamWithChannel = await resolveOfflineStreamContext(store, event);
  const endedAt = event.endedAt ?? event.receivedAt;

  await store.markStreamEnded({
    endedAt,
    stream: streamWithChannel,
    userId: streamWithChannel.channel.user_id,
  });

  console.info("[stream-job-worker] stream.offline materialized", {
    endedAt,
    streamId: streamWithChannel.id,
    status: "ended",
  });

  if (!event.vodAssetUrl) {
    console.warn("[stream-job-worker] stream.offline skipped downstream", {
      reason: "missing_vod_asset_url",
      streamId: streamWithChannel.id,
    });
    return;
  }

  await assertPublicAssetUrl(event.vodAssetUrl, assetUrlResolver);

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

  console.info("[stream-job-worker] content job upserted", {
    queueJobId,
    streamId: streamWithChannel.id,
  });

  try {
    await transcriptionQueue.add(TRANSCRIPTION_TRIGGER_JOB_NAME, payload, {
      ...transcriptionTriggerJobOptions,
      jobId: queueJobId,
    });

    console.info("[stream-job-worker] downstream transcription enqueued", {
      queue: TRANSCRIPTION_TRIGGER_JOB_NAME,
      queueJobId,
      streamId: streamWithChannel.id,
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
  { assetUrlResolver, repurposingQueue, store }: ProcessStreamJobDependencies,
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

  if (event.enrichmentStatus !== "asset_available") {
    console.info(
      "[stream-job-worker] video.published skipped repurposing plan",
      {
        reason: event.enrichmentStatus ?? "missing_enrichment_status",
        streamId: stream.id,
      },
    );
    return;
  }

  const connection = await store.resolvePlatformConnectionByExternalId({
    externalChannelId: requireExternalChannelId(event),
    provider: event.provider,
  });

  if (!connection) {
    console.info(
      "[stream-job-worker] video.published skipped repurposing plan",
      {
        reason: "missing_platform_connection",
        streamId: stream.id,
      },
    );
    return;
  }

  const settings = resolveRepurposingPlanSettings(connection.metadata);

  if (!settings) {
    console.info(
      "[stream-job-worker] video.published skipped repurposing plan",
      {
        reason: "repurposing_not_enabled",
        streamId: stream.id,
      },
    );
    return;
  }

  if (!event.vodAssetUrl?.trim()) {
    throw new PermanentStreamJobError(
      "video.published requires vodAssetUrl when enrichmentStatus=asset_available.",
    );
  }

  await assertPublicAssetUrl(event.vodAssetUrl, assetUrlResolver);

  const queueJobId = getRepurposingPlanJobId(stream.id);
  const contentJobPayload = buildRepurposingPlanPayload({
    channel,
    event,
    settings,
    stream,
  });

  const contentJob = await store.upsertContentJob({
    channelId: channel.id,
    jobType: "repurposing",
    payload: contentJobPayload,
    queueJobId,
    status: "pending",
    streamId: stream.id,
    userId: channel.user_id,
  });

  const repurposingQueuePayload = buildRepurposingPlanQueuePayload({
    contentJobId: contentJob.id,
    event,
    queueJobId,
    settings,
    stream,
    sourceMetadata: contentJobPayload,
  });

  try {
    await repurposingQueue.add(
      REPURPOSING_PLAN_JOB_NAME,
      repurposingQueuePayload,
      {
        ...REPURPOSING_PLAN_JOB_OPTIONS,
        jobId: queueJobId,
      },
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Repurposing queue dispatch failed.";

    await store.updateContentJobByQueueId({
      errorMessage,
      queueJobId,
      result: {
        error: errorMessage,
        error_code: "repurposing_queue_enqueue_failed",
        retryable: false,
      },
      status: "failed",
    });

    throw error;
  }

  console.info("[stream-job-worker] repurposing plan upserted", {
    queueJobId,
    contentJobId: contentJob.id,
    streamId: stream.id,
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
        await handleVideoPublished(dependencies, event);
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
  const repurposingQueue = createRepurposingPlanQueue(config);
  const transcriptionQueue = createTranscriptionQueue(config);
  const worker = new Worker<StreamOSJob, void, StreamOSJobType>(
    config.queueName,
    async (job) =>
      processStreamJob(job, {
        repurposingQueue,
        store,
        transcriptionQueue,
      }),
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
    await repurposingQueue.close?.();
    await transcriptionQueue.close?.();
    process.exit(0);
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  console.info("[stream-job-worker] started", {
    concurrency: config.concurrency,
    repurposingQueue: config.repurposingQueueName,
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
