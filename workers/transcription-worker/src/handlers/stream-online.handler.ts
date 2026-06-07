import type { Job, JobsOptions } from "bullmq";

import type { AutomationAsyncJobResponse } from "../automationClient.js";
import type { ContentJobStore } from "../contentJobStore.js";
import type { StreamOnlinePayload } from "../mediaJobSchema.js";
import { VodNotReadyError } from "../providerClients.js";

export type StreamOnlineAutomationClient = {
  enqueueTranscription(payload: {
    contentJobId: string;
    provider: "twitch";
    streamId: string;
    userId: string;
    vodUrl: string;
  }): Promise<AutomationAsyncJobResponse>;
};

export type TwitchVodClient = {
  resolveLatestVodUrl(channelId: string): Promise<string>;
};

export type DelayedMediaQueue = {
  add(
    name: string,
    data: Record<string, unknown>,
    opts: JobsOptions,
  ): Promise<unknown>;
};

export type StreamOnlineHandlerOptions = {
  automationClient: StreamOnlineAutomationClient;
  contentJobStore: ContentJobStore;
  delayMs?: number;
  maxVodLookupRetries?: number;
  mediaQueue?: DelayedMediaQueue;
  now?: () => Date;
  twitchClient: TwitchVodClient;
};

const DEFAULT_VOD_LOOKUP_DELAY_MS = 5 * 60 * 1000;
const DEFAULT_MAX_VOD_LOOKUP_RETRIES = 3;

export async function handleStreamOnlineJob(
  job: Pick<Job<StreamOnlinePayload>, "data" | "id" | "name" | "opts">,
  {
    automationClient,
    contentJobStore,
    delayMs = DEFAULT_VOD_LOOKUP_DELAY_MS,
    maxVodLookupRetries = DEFAULT_MAX_VOD_LOOKUP_RETRIES,
    mediaQueue,
    now = () => new Date(),
    twitchClient,
  }: StreamOnlineHandlerOptions,
): Promise<void> {
  const startedAt = now();
  const payload = job.data;
  const contentJob = await contentJobStore.create({
    jobType: "transcription",
    payload: {
      channelId: payload.channelId,
      provider: payload.provider,
      startedAt: payload.startedAt,
      streamId: payload.streamId,
    },
    queueJobId: getContentQueueJobId(job.id, payload),
    userId: payload.userId,
  });

  try {
    const vodUrl = await twitchClient.resolveLatestVodUrl(payload.channelId);
    const automationJob = await automationClient.enqueueTranscription({
      contentJobId: contentJob.id,
      provider: "twitch",
      streamId: payload.streamId,
      userId: payload.userId,
      vodUrl,
    });

    await contentJobStore.update({
      id: contentJob.id,
      result: { automationJobId: automationJob.jobId },
      startedAt: now().toISOString(),
      status: "processing",
    });

    logInfo({
      contentJobId: contentJob.id,
      durationMs: now().getTime() - startedAt.getTime(),
      message: "stream_online_job_processing_started",
      provider: payload.provider,
      userId: payload.userId,
    });
  } catch (error) {
    if (error instanceof VodNotReadyError) {
      await handleVodNotReady({
        contentJobId: contentJob.id,
        contentJobStore,
        delayMs,
        error,
        job,
        maxVodLookupRetries,
        mediaQueue,
        now,
        payload,
      });
      return;
    }

    await markFailed({
      contentJobId: contentJob.id,
      contentJobStore,
      error,
      now,
    });
  }
}

async function handleVodNotReady({
  contentJobId,
  contentJobStore,
  delayMs,
  error,
  job,
  maxVodLookupRetries,
  mediaQueue,
  now,
  payload,
}: {
  contentJobId: string;
  contentJobStore: ContentJobStore;
  delayMs: number;
  error: Error;
  job: Pick<Job<StreamOnlinePayload>, "data" | "id" | "name" | "opts">;
  maxVodLookupRetries: number;
  mediaQueue?: DelayedMediaQueue;
  now: () => Date;
  payload: StreamOnlinePayload;
}): Promise<void> {
  const nextAttempt = (payload.vodLookupAttempt ?? 0) + 1;

  if (nextAttempt >= maxVodLookupRetries) {
    await markFailed({
      contentJobId,
      contentJobStore,
      error: new Error(
        `${error.message} Max VOD lookup retries exhausted (${maxVodLookupRetries}).`,
      ),
      now,
    });
    return;
  }

  if (!mediaQueue) {
    await markFailed({
      contentJobId,
      contentJobStore,
      error: new Error("Media queue is unavailable for delayed VOD retry."),
      now,
    });
    return;
  }

  await mediaQueue.add(
    job.name,
    {
      ...job.data,
      vodLookupAttempt: nextAttempt,
    },
    {
      ...job.opts,
      delay: delayMs,
      jobId: `${String(job.id ?? payload.streamId)}:vod-retry:${nextAttempt}`,
    },
  );
}

async function markFailed({
  contentJobId,
  contentJobStore,
  error,
  now,
}: {
  contentJobId: string;
  contentJobStore: ContentJobStore;
  error: unknown;
  now: () => Date;
}): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);

  await contentJobStore.update({
    completedAt: now().toISOString(),
    errorMessage: message,
    id: contentJobId,
    result: { error: message },
    status: "failed",
  });
}

function getContentQueueJobId(
  jobId: string | number | undefined,
  payload: StreamOnlinePayload,
): string {
  return `media:${String(jobId ?? payload.streamId)}:transcription`;
}

function logInfo(input: {
  contentJobId: string;
  durationMs: number;
  message: string;
  provider: string;
  userId: string;
}): void {
  console.info(
    JSON.stringify({
      level: "info",
      ...input,
    }),
  );
}
