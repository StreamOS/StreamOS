import type { Job } from "bullmq";

import type { AutomationClipAnalysisResponse } from "./automationClient.js";
import { clipGenerationJobDataSchema } from "./jobSchema.js";
import type { JobStatusStore } from "./statusStore.js";

export type ClipAutomationClient = {
  analyzeClip(payload: {
    asset_id: string;
    source_platform: "twitch" | "youtube" | "tiktok" | "kick";
    transcript: string;
  }): Promise<AutomationClipAnalysisResponse>;
};

export type ProcessClipGenerationJobOptions = {
  automationClient: ClipAutomationClient;
  statusStore: JobStatusStore;
};

export async function processClipGenerationJob(
  job: Pick<Job, "attemptsMade" | "data" | "id" | "opts">,
  { automationClient, statusStore }: ProcessClipGenerationJobOptions,
): Promise<AutomationClipAnalysisResponse> {
  const payload = clipGenerationJobDataSchema.parse(job.data);
  const jobId = String(job.id ?? `clip-generation-${payload.stream_id}`);

  try {
    await statusStore.update(jobId, payload, { status: "running" });

    const result = await automationClient.analyzeClip({
      asset_id: payload.stream_id,
      source_platform: payload.source_platform,
      transcript: payload.transcript,
    });

    await statusStore.update(jobId, payload, {
      result: {
        asset_id: result.asset_id,
        highlights: result.highlights,
        provider: result.provider,
        recommended_formats: result.recommended_formats,
        repurpose_summary: result.repurpose_summary,
        source_platform: result.source_platform,
        title_suggestions: result.title_suggestions,
        virality_score: result.virality_score,
      },
      status: "done",
    });

    return result;
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
