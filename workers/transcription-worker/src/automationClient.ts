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

export type AutomationServiceErrorDetails = {
  code: string;
  httpStatus: number;
  provider?: string;
  retryAfterSeconds?: number;
  retryable: boolean;
  upstreamStatus?: number;
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
}) satisfies z.ZodType<AutomationTranscriptionResponse>;

const automationServiceStructuredErrorSchema = z.object({
  code: z.string().trim().min(1),
  message: z.string().trim().min(1),
  provider: z.string().trim().min(1).optional(),
  retry_after_seconds: z.number().int().nonnegative().nullable().optional(),
  retryable: z.boolean().optional(),
  upstream_status: z.number().int().nonnegative().optional(),
});

const automationServiceErrorEnvelopeSchema = z.object({
  detail: z.union([
    z.string().trim().min(1),
    automationServiceStructuredErrorSchema,
  ]),
});

export class AutomationServiceError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly provider?: string;
  readonly retryAfterSeconds?: number;
  readonly retryable: boolean;
  readonly upstreamStatus?: number;

  constructor(message: string, details: AutomationServiceErrorDetails) {
    super(message);
    this.name = "AutomationServiceError";
    this.code = details.code;
    this.httpStatus = details.httpStatus;
    this.provider = details.provider;
    this.retryAfterSeconds = details.retryAfterSeconds;
    this.retryable = details.retryable;
    this.upstreamStatus = details.upstreamStatus;
  }
}

export function isAutomationServiceError(
  value: unknown,
): value is AutomationServiceError {
  return value instanceof AutomationServiceError;
}

function buildStructuredAutomationServiceError({
  detail,
  httpStatus,
}: {
  detail: z.infer<typeof automationServiceStructuredErrorSchema>;
  httpStatus: number;
}): AutomationServiceError {
  const metadata = [
    detail.provider ? `provider=${detail.provider}` : null,
    typeof detail.upstream_status === "number"
      ? `upstream_status=${detail.upstream_status}`
      : null,
    typeof detail.retry_after_seconds === "number"
      ? `retry_after_seconds=${detail.retry_after_seconds}`
      : null,
  ].filter(Boolean);

  return new AutomationServiceError(
    `${detail.code}: ${detail.message}${
      metadata.length > 0 ? ` (${metadata.join(", ")})` : ""
    }`,
    {
      code: detail.code,
      httpStatus,
      provider: detail.provider,
      retryAfterSeconds: detail.retry_after_seconds ?? undefined,
      retryable: detail.retryable ?? false,
      upstreamStatus: detail.upstream_status,
    },
  );
}

function parseAutomationServiceError(
  httpStatus: number,
  rawBody: string,
): AutomationServiceError {
  try {
    const parsed = automationServiceErrorEnvelopeSchema.parse(
      JSON.parse(rawBody),
    );

    if (typeof parsed.detail === "string") {
      return new AutomationServiceError(parsed.detail, {
        code: "automation_service_http_error",
        httpStatus,
        retryable: httpStatus >= 500 && httpStatus < 600,
      });
    }

    return buildStructuredAutomationServiceError({
      detail: parsed.detail,
      httpStatus,
    });
  } catch {
    return new AutomationServiceError(
      `automation-service transcription failed with ${httpStatus}: ${rawBody}`,
      {
        code: "automation_service_http_error",
        httpStatus,
        retryable: httpStatus >= 500 && httpStatus < 600,
      },
    );
  }
}

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
        throw parseAutomationServiceError(response.status, errorBody);
      }

      return automationTranscriptionResponseSchema.parse(await response.json());
    },
  };
}
