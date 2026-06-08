import type { StreamPlatform } from "@streamos/types";
import { z } from "zod";

export type AutomationTranscriptionRequest = {
  asset_url: string;
  channel_id?: string;
  creator_id?: string;
  job_id: string;
  language: string;
  source_platform: StreamPlatform;
  stream_id: string;
};

export type AutomationTranscriptionSegment = {
  end: number;
  start: number;
  text: string;
};

export type AutomationTranscriptionResponse = {
  job_id: string;
  language: string;
  model: string;
  provider: string;
  segments: AutomationTranscriptionSegment[];
  stream_id: string;
  transcript: string;
};

export type AutomationAsyncJobResponse = {
  jobId: string;
  status: "queued";
};

const automationTranscriptionSegmentSchema = z.object({
  end: z.number().finite().nonnegative(),
  start: z.number().finite().nonnegative(),
  text: z.string().trim().min(1),
});

const automationTranscriptionResponseSchema = z.object({
  job_id: z.string().trim().min(1),
  language: z.string().trim().min(1),
  model: z.string().trim().min(1),
  provider: z.string().trim().min(1),
  segments: z.array(automationTranscriptionSegmentSchema),
  stream_id: z.string().trim().min(1),
  transcript: z.string().trim().min(1),
}) satisfies z.ZodType<AutomationTranscriptionResponse, z.ZodTypeDef, unknown>;

const automationAsyncJobResponseSchema = z
  .object({
    jobId: z.string().trim().min(1).optional(),
    job_id: z.string().trim().min(1).optional(),
    status: z.literal("queued"),
  })
  .transform((payload) => ({
    jobId: payload.jobId ?? payload.job_id,
    status: payload.status,
  }))
  .pipe(
    z.object({
      jobId: z.string().trim().min(1),
      status: z.literal("queued"),
    }),
  ) satisfies z.ZodType<AutomationAsyncJobResponse, z.ZodTypeDef, unknown>;

export type AutomationClientOptions = {
  automationServiceUrl: string;
  fetchFn?: typeof fetch;
};

export function createAutomationClient({
  automationServiceUrl,
  fetchFn = fetch,
}: AutomationClientOptions) {
  const endpoint = new URL("/transcriptions/process", automationServiceUrl);
  const transcribeEndpoint = new URL("/transcribe", automationServiceUrl);
  const generateTitleEndpoint = new URL(
    "/generate-title",
    automationServiceUrl,
  );

  return {
    async processTranscription(
      payload: AutomationTranscriptionRequest,
    ): Promise<AutomationTranscriptionResponse> {
      const response = await fetchFn(endpoint, {
        body: JSON.stringify(payload),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `automation-service transcription failed with ${response.status}: ${errorBody}`,
        );
      }

      return automationTranscriptionResponseSchema.parse(await response.json());
    },

    async enqueueTranscription(payload: {
      contentJobId: string;
      provider: "twitch";
      streamId: string;
      userId: string;
      vodUrl: string;
    }): Promise<AutomationAsyncJobResponse> {
      return postAsyncJob(fetchFn, transcribeEndpoint, payload);
    },

    async enqueueTitleGeneration(payload: {
      contentJobId: string;
      duration: string | null;
      provider: "youtube";
      tags: string[];
      title?: string;
      userId: string;
      videoId: string;
    }): Promise<AutomationAsyncJobResponse> {
      return postAsyncJob(fetchFn, generateTitleEndpoint, payload);
    },
  };
}

async function postAsyncJob(
  fetchFn: typeof fetch,
  endpoint: URL,
  payload: Record<string, unknown>,
): Promise<AutomationAsyncJobResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetchFn(endpoint, {
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `automation-service ${endpoint.pathname} failed with ${response.status}: ${await response.text()}`,
      );
    }

    return automationAsyncJobResponseSchema.parse(await response.json());
  } finally {
    clearTimeout(timeout);
  }
}
