import type { Job } from "bullmq";

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
  statusStore: JobStatusStore;
};

export async function processTranscriptionJob(
  job: Pick<Job, "data" | "id">,
  { automationClient, statusStore }: ProcessTranscriptionJobOptions,
): Promise<AutomationTranscriptionResponse> {
  const payload = transcriptionTriggerJobDataSchema.parse(job.data);
  const jobId = String(job.id ?? `transcription-${payload.stream_id}`);

  try {
    await statusStore.update(jobId, payload, { status: "running" });

    const result = await automationClient.processTranscription({
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
        segments: result.segments,
        transcript: result.transcript,
      },
      status: "done",
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    await statusStore.update(jobId, payload, {
      error_message: errorMessage,
      result: {
        error: errorMessage,
      },
      status: "failed",
    });
    throw error;
  }
}
