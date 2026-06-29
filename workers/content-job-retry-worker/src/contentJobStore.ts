import { z } from "zod";

export const retryableContentJobSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  stream_id: z.string().uuid().nullable(),
  queue_job_id: z.string().nullable(),
  job_type: z.enum([
    "transcription",
    "repurposing",
    "clip_scoring",
    "title_generation",
  ]),
  status: z.literal("failed"),
  payload: z.unknown(),
  error_message: z.string().nullable(),
  result: z.record(z.string(), z.unknown()).nullable().optional(),
  retry_count: z.number().int().min(0),
  max_retries: z.number().int().min(0).max(25),
  next_retry_at: z.string().nullable(),
});

export type RetryableContentJob = z.infer<typeof retryableContentJobSchema>;

export type ClaimContentJobInput = {
  job: RetryableContentJob;
  now: Date;
  queueJobId: string;
  retryCount: number;
};

export type MarkRequeueFailedInput = {
  errorMessage: string;
  jobId: string;
  now: Date;
  nextRetryAt: Date | null;
  queueJobId: string;
};

export type MarkUnretryableInput = {
  errorMessage: string;
  job: RetryableContentJob;
  now: Date;
};

export type ContentJobRetryStore = {
  claimForRetry(input: ClaimContentJobInput): Promise<boolean>;
  listFailedJobs(now: Date): Promise<RetryableContentJob[]>;
  markRequeueFailed(input: MarkRequeueFailedInput): Promise<void>;
  markUnretryable(input: MarkUnretryableInput): Promise<void>;
};

export type SupabaseContentJobRetryStoreOptions = {
  batchSize: number;
  fetchFn?: typeof fetch;
  serviceRoleKey: string;
  supabaseUrl: string;
};

function getSupabaseHeaders(serviceRoleKey: string): Record<string, string> {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

async function readJsonOrThrow<T>({
  response,
  schema,
}: {
  response: Response;
  schema: z.ZodType<T>;
}): Promise<T> {
  const data = await response.json();
  return schema.parse(data);
}

export function createSupabaseContentJobRetryStore({
  batchSize,
  fetchFn = fetch,
  serviceRoleKey,
  supabaseUrl,
}: SupabaseContentJobRetryStoreOptions): ContentJobRetryStore {
  return {
    async claimForRetry({
      job,
      now,
      queueJobId,
      retryCount,
    }: ClaimContentJobInput): Promise<boolean> {
      const endpoint = new URL("/rest/v1/content_jobs", supabaseUrl);
      endpoint.searchParams.set("id", `eq.${job.id}`);
      endpoint.searchParams.set("status", "eq.failed");
      endpoint.searchParams.set("retry_count", `eq.${job.retry_count}`);
      endpoint.searchParams.set("select", "id,retry_count,queue_job_id,status");

      const response = await fetchFn(endpoint, {
        body: JSON.stringify({
          error_message: null,
          last_retried_at: now.toISOString(),
          next_retry_at: null,
          queue_job_id: queueJobId,
          result: null,
          retry_count: retryCount,
          status: "pending",
          updated_at: now.toISOString(),
        }),
        headers: {
          ...getSupabaseHeaders(serviceRoleKey),
          Prefer: "return=representation",
        },
        method: "PATCH",
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `Supabase content_jobs retry claim failed with ${response.status}: ${errorBody}`,
        );
      }

      const rows = await readJsonOrThrow({
        response,
        schema: z.array(
          z.object({
            id: z.string().uuid(),
          }),
        ),
      });

      return rows.length === 1;
    },

    async listFailedJobs(now: Date): Promise<RetryableContentJob[]> {
      const endpoint = new URL("/rest/v1/content_jobs", supabaseUrl);
      endpoint.searchParams.set(
        "select",
        [
          "id",
          "user_id",
          "stream_id",
          "queue_job_id",
          "job_type",
          "status",
          "payload",
          "error_message",
          "result",
          "retry_count",
          "max_retries",
          "next_retry_at",
        ].join(","),
      );
      endpoint.searchParams.set("status", "eq.failed");
      endpoint.searchParams.set(
        "or",
        `(next_retry_at.is.null,next_retry_at.lte.${now.toISOString()})`,
      );
      endpoint.searchParams.set("order", "updated_at.asc");
      endpoint.searchParams.set("limit", String(batchSize));

      const response = await fetchFn(endpoint, {
        headers: getSupabaseHeaders(serviceRoleKey),
        method: "GET",
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `Supabase failed content_jobs fetch failed with ${response.status}: ${errorBody}`,
        );
      }

      return readJsonOrThrow({
        response,
        schema: z.array(retryableContentJobSchema),
      });
    },

    async markRequeueFailed({
      errorMessage,
      jobId,
      nextRetryAt,
      now,
      queueJobId,
    }: MarkRequeueFailedInput): Promise<void> {
      const endpoint = new URL("/rest/v1/content_jobs", supabaseUrl);
      endpoint.searchParams.set("id", `eq.${jobId}`);
      endpoint.searchParams.set("queue_job_id", `eq.${queueJobId}`);

      const response = await fetchFn(endpoint, {
        body: JSON.stringify({
          error_message: errorMessage,
          next_retry_at: nextRetryAt?.toISOString() ?? null,
          result: { error: errorMessage },
          status: "failed",
          updated_at: now.toISOString(),
        }),
        headers: {
          ...getSupabaseHeaders(serviceRoleKey),
          Prefer: "return=minimal",
        },
        method: "PATCH",
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `Supabase content_jobs requeue failure update failed with ${response.status}: ${errorBody}`,
        );
      }
    },

    async markUnretryable({
      errorMessage,
      job,
      now,
    }: MarkUnretryableInput): Promise<void> {
      const endpoint = new URL("/rest/v1/content_jobs", supabaseUrl);
      endpoint.searchParams.set("id", `eq.${job.id}`);
      endpoint.searchParams.set("status", "eq.failed");

      const response = await fetchFn(endpoint, {
        body: JSON.stringify({
          error_message: errorMessage,
          next_retry_at: null,
          result:
            job.result && typeof job.result === "object"
              ? { ...job.result, error: errorMessage }
              : { error: errorMessage },
          retry_count: job.max_retries,
          updated_at: now.toISOString(),
        }),
        headers: {
          ...getSupabaseHeaders(serviceRoleKey),
          Prefer: "return=minimal",
        },
        method: "PATCH",
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `Supabase content_jobs unretryable update failed with ${response.status}: ${errorBody}`,
        );
      }
    },
  };
}
