import type { StreamPlatform } from "@streamos/types";
import { z } from "zod";

export type AutomationClipAnalysisRequest = {
  asset_id: string;
  source_platform: StreamPlatform;
  transcript: string;
};

export type AutomationClipAnalysisResponse = {
  asset_id: string;
  source_platform: StreamPlatform;
  virality_score: number;
  recommended_formats: string[];
  highlights: string[];
  title_suggestions: string[];
  repurpose_summary: string;
  provider: string;
};

const automationClipAnalysisResponseSchema = z.object({
  asset_id: z.string().trim().min(1),
  source_platform: z.enum(["twitch", "youtube", "tiktok", "kick"]),
  virality_score: z.number().int().min(1).max(100),
  recommended_formats: z.array(z.string().trim().min(1)).min(1).max(5),
  highlights: z.array(z.string().trim().min(1)).max(5),
  title_suggestions: z.array(z.string().trim().min(1)).max(5),
  repurpose_summary: z.string().trim().min(1),
  provider: z.string().trim().min(1),
}) satisfies z.ZodType<AutomationClipAnalysisResponse>;

export type AutomationClientOptions = {
  automationServiceUrl: string;
  fetchFn?: typeof fetch;
};

export function createAutomationClient({
  automationServiceUrl,
  fetchFn = fetch,
}: AutomationClientOptions) {
  const endpoint = new URL("/clips/analyze", automationServiceUrl);

  return {
    async analyzeClip(
      payload: AutomationClipAnalysisRequest,
    ): Promise<AutomationClipAnalysisResponse> {
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
          `automation-service clip analysis failed with ${response.status}: ${errorBody}`,
        );
      }

      return automationClipAnalysisResponseSchema.parse(await response.json());
    },
  };
}
