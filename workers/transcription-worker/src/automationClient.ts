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

export type AutomationClientOptions = {
  automationServiceUrl: string;
  fetchFn?: typeof fetch;
};

export function createAutomationClient({
  automationServiceUrl,
  fetchFn = fetch,
}: AutomationClientOptions) {
  const endpoint = new URL("/transcriptions/process", automationServiceUrl);

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
  };
}
