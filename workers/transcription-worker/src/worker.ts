import {
  CLIP_GENERATION_JOB_NAME,
  type ClipGenerationJobData,
} from "@streamos/types";
import { getClipGenerationJobId } from "@streamos/queue";
import type { Job, JobsOptions } from "bullmq";

import type { AutomationTranscriptionResponse } from "./automationClient.js";
import { transcriptionTriggerJobDataSchema } from "./jobSchema.js";
import type { JobStatusStore } from "./statusStore.js";

export type TranscriptionAutomationClient = {
  processTranscription(payload: {
    asset_url: string;
    channel_id?: string;
    creator_id?: string;
    job_id: string;
    language: string;
    source_platform: string;
    stream_id: string;
  }): Promise<AutomationTranscriptionResponse>;
};

export type ProcessTranscriptionJobOptions = {
  automationClient: TranscriptionAutomationClient;
  clipGenerationQueue?: TranscriptionClipGenerationQueue;
  statusStore: JobStatusStore;
};

export type TranscriptionClipGenerationQueue = {
  add(
    name: typeof CLIP_GENERATION_JOB_NAME,
    data: ClipGenerationJobData,
    opts: JobsOptions,
  ): Promise<unknown>;
};

const clipGenerationJobOptions: JobsOptions = {
  attempts: 3,
  backoff: {
    delay: 30_000,
    type: "exponential",
  },
  removeOnComplete: {
    age: 86_400,
    count: 1_000,
  },
  removeOnFail: {
    age: 604_800,
  },
};

export async function processTranscriptionJob(
  job: Pick<Job, "attemptsMade" | "data" | "id" | "opts">,
  {
    automationClient,
    clipGenerationQueue,
    statusStore,
  }: ProcessTranscriptionJobOptions,
): Promise<AutomationTranscriptionResponse> {
  const payload = transcriptionTriggerJobDataSchema.parse(job.data);
  const jobId = String(job.id ?? `transcription-${payload.stream_id}`);
  let result: AutomationTranscriptionResponse;

  try {
    await statusStore.update(jobId, payload, { status: "running" });

    result = await automationClient.processTranscription({
      asset_url: payload.vod_asset_url,
      channel_id: payload.channel_id,
      creator_id: payload.creator_id,
      job_id: jobId,
      language: payload.language,
      source_platform: payload.platform,
      stream_id: payload.stream_id,
    });

    await statusStore.update(jobId, payload, {
      result: {
        model: result.model,
        provider: result.provider,
        segments: result.segments,
        transcript: result.transcript,
      },
      status: "done",
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    const hasRemainingAttempts = hasRemainingBullMqAttempts(job);

    await statusStore.update(jobId, payload, {
      error_message: errorMessage,
      result: hasRemainingAttempts
        ? undefined
        : {
            error: errorMessage,
          },
      status: hasRemainingAttempts ? "pending" : "failed",
    });
    throw error;
  }

  if (clipGenerationQueue) {
    const clipPayload: ClipGenerationJobData = {
      creator_id: payload.creator_id,
      requested_by: payload.user_id,
      source_platform: payload.platform,
      source_url: payload.vod_asset_url,
      stream_id: payload.stream_id,
      transcript: result.transcript,
    };
    const clipJobId = getClipGenerationJobId(payload.stream_id);

    await clipGenerationQueue.add(CLIP_GENERATION_JOB_NAME, clipPayload, {
      ...clipGenerationJobOptions,
      jobId: clipJobId,
    });

    await statusStore.enqueueClipGeneration?.(clipJobId, clipPayload);
  }

  return result;
}
function hasRemainingBullMqAttempts(
  job: Pick<Job, "attemptsMade" | "opts">,
): boolean {
  const attempts =
    typeof job.opts.attempts === "number" && job.opts.attempts > 0
      ? job.opts.attempts
      : 1;

  return job.attemptsMade + 1 < attempts;
}
