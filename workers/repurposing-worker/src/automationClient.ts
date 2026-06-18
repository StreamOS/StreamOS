import type { SupportedProvider } from "@streamos/types";
import { z } from "zod";

export type RepurposingPlanAssetReference = {
  kind?: string;
  status?: string;
  url: string;
};

export type RepurposingPlanTranscriptReference = {
  language?: string;
  queue_job_id?: string;
  stream_id?: string;
  transcript_id?: string;
};

export type RepurposingPlanAutomationRequest = {
  asset_reference?: RepurposingPlanAssetReference;
  brand_context?: Record<string, unknown>;
  content_job_id: string;
  content_policy_hints?: Record<string, unknown>;
  language?: string;
  locale?: string;
  manual_review_required: true;
  provider: SupportedProvider;
  provider_video_id?: string;
  queue_job_id: string;
  source_event_type: "video.published";
  source_metadata: Record<string, unknown>;
  target_platforms?: SupportedProvider[];
  transcript_reference?: RepurposingPlanTranscriptReference;
  user_id: string;
};

export type RepurposingPlanAutomationResponse = {
  captions: string[];
  confidence: number;
  content_job_id: string;
  descriptions: string[];
  hashtag_sets: string[][];
  hook_ideas: string[];
  manual_review_required: true;
  model: string;
  provider: string;
  queue_job_id: string;
  review_notes: string[];
  short_form_plan: string;
  title_suggestions: string[];
  warnings: string[];
};

const automationPlanResponseSchema = z.object({
  captions: z.array(z.string().trim().min(1)).max(10),
  confidence: z.number().int().min(1).max(100),
  content_job_id: z.string().trim().min(1),
  descriptions: z.array(z.string().trim().min(1)).max(10),
  hashtag_sets: z
    .array(z.array(z.string().trim().min(1)).min(1).max(12))
    .max(8),
  hook_ideas: z.array(z.string().trim().min(1)).max(10),
  manual_review_required: z.literal(true),
  model: z.string().trim().min(1),
  provider: z.string().trim().min(1),
  queue_job_id: z.string().trim().min(1),
  review_notes: z.array(z.string().trim().min(1)).max(10),
  short_form_plan: z.string().trim().min(1),
  title_suggestions: z.array(z.string().trim().min(1)).max(10),
  warnings: z.array(z.string().trim().min(1)).max(10),
}) satisfies z.ZodType<
  RepurposingPlanAutomationResponse,
  z.ZodTypeDef,
  unknown
>;

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

export type AutomationServiceErrorDetails = {
  code: string;
  httpStatus: number;
  provider?: string;
  retryAfterSeconds?: number;
  retryable: boolean;
  upstreamStatus?: number;
};

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

export class ProviderRateLimitError extends Error {
  readonly provider: string;
  readonly retryAfterSeconds: number | null;
  readonly upstreamStatus: number;

  constructor({
    message,
    provider,
    retryAfterSeconds,
    upstreamStatus = 429,
  }: {
    message: string;
    provider: string;
    retryAfterSeconds: number | null;
    upstreamStatus?: number;
  }) {
    super(message);
    this.name = "ProviderRateLimitError";
    this.provider = provider;
    this.retryAfterSeconds = retryAfterSeconds;
    this.upstreamStatus = upstreamStatus;
  }
}

export class ProviderModelUnavailableError extends Error {
  readonly provider: string;
  readonly upstreamStatus: number;

  constructor({
    message,
    provider,
    upstreamStatus,
  }: {
    message: string;
    provider: string;
    upstreamStatus: number;
  }) {
    super(message);
    this.name = "ProviderModelUnavailableError";
    this.provider = provider;
    this.upstreamStatus = upstreamStatus;
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
        code:
          httpStatus >= 500
            ? "model_unavailable"
            : httpStatus >= 400
              ? "invalid_input"
              : "automation_service_http_error",
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
      `automation-service repurposing failed with ${httpStatus}: ${rawBody}`,
      {
        code:
          httpStatus >= 500
            ? "model_unavailable"
            : httpStatus >= 400
              ? "invalid_input"
              : "automation_service_http_error",
        httpStatus,
        retryable: httpStatus >= 500 && httpStatus < 600,
      },
    );
  }
}

function parseAutomationServiceStructuredErrorDetail(
  rawBody: string,
): z.infer<typeof automationServiceStructuredErrorSchema> | null {
  try {
    const parsed = automationServiceErrorEnvelopeSchema.parse(
      JSON.parse(rawBody),
    );

    if (typeof parsed.detail === "string") {
      return null;
    }

    return parsed.detail;
  } catch {
    return null;
  }
}

export type RepurposingAutomationClientOptions = {
  automationServiceUrl: string;
  fetchFn?: typeof fetch;
};

export function createAutomationClient({
  automationServiceUrl,
  fetchFn = fetch,
}: RepurposingAutomationClientOptions) {
  const endpoint = new URL("/repurposing/plan", automationServiceUrl);

  return {
    async planRepurposing(
      payload: RepurposingPlanAutomationRequest,
    ): Promise<RepurposingPlanAutomationResponse> {
      const response = await fetchFn(endpoint, {
        body: JSON.stringify(payload),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      if (!response.ok) {
        const errorBody = await response.text();
        const structuredError =
          parseAutomationServiceStructuredErrorDetail(errorBody);

        if (
          structuredError?.code === "provider_rate_limited" ||
          response.status === 429
        ) {
          throw new ProviderRateLimitError({
            message:
              structuredError?.message ??
              "Upstream repurposing provider rate limited the request.",
            provider: structuredError?.provider ?? "openai",
            retryAfterSeconds:
              structuredError?.retry_after_seconds ??
              _parseRetryAfterSeconds(response.headers.get("retry-after")),
            upstreamStatus: structuredError?.upstream_status ?? response.status,
          });
        }

        if (response.status >= 500 && response.status < 600) {
          throw new ProviderModelUnavailableError({
            message: `Upstream repurposing provider returned ${response.status}.`,
            provider: "openai",
            upstreamStatus: response.status,
          });
        }

        throw parseAutomationServiceError(response.status, errorBody);
      }

      return automationPlanResponseSchema.parse(await response.json());
    },
  };
}

function _parseRetryAfterSeconds(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return null;
  }

  const parsedValue = Number(normalizedValue);

  if (Number.isInteger(parsedValue) && parsedValue >= 0) {
    return parsedValue;
  }

  return null;
}
