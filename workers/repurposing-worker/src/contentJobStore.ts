import { z } from "zod";

import type {
  ContentJobStatus,
  RepurposingPlanFailureResult,
  RepurposingPlanResult,
} from "@streamos/types";
import type { RepurposingPlanJobPayload } from "@streamos/types/jobs";

const repurposingContentJobRowSchema = z.object({
  id: z.string().uuid(),
  job_type: z.literal("repurposing"),
  max_retries: z.number().int().min(0).max(25),
  payload: z.record(z.unknown()),
  queue_job_id: z.string().trim().min(1),
  retry_count: z.number().int().min(0),
  started_at: z.string().nullable(),
  status: z.enum(["pending", "running", "processing", "done", "failed"]),
  user_id: z.string().uuid(),
});

export type RepurposingContentJobRow = z.infer<
  typeof repurposingContentJobRowSchema
> & {
  payload: RepurposingPlanJobPayload;
};

export type RepurposingPlanContentJobPatch = {
  completed_at?: string | null;
  error_message?: string | null;
  last_retried_at?: string | null;
  max_retries?: number;
  next_retry_at?: string | null;
  result?: RepurposingPlanResult | RepurposingPlanFailureResult | null;
  retry_count?: number;
  started_at?: string | null;
  status: ContentJobStatus;
};

export type RepurposingPlanContentJobStore = {
  loadById(input: {
    contentJobId: string;
    queueJobId: string;
    userId: string;
  }): Promise<RepurposingContentJobRow | null>;
  updateById(
    contentJobId: string,
    patch: RepurposingPlanContentJobPatch,
  ): Promise<void>;
};

export type SupabaseRepurposingPlanStoreOptions = {
  fetchFn?: typeof fetch;
  serviceRoleKey: string;
  supabaseUrl: string;
};

export function createSupabaseRepurposingPlanStore({
  fetchFn = fetch,
  serviceRoleKey,
  supabaseUrl,
}: SupabaseRepurposingPlanStoreOptions): RepurposingPlanContentJobStore {
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=minimal",
  };

  return {
    async loadById({
      contentJobId,
      queueJobId,
      userId,
    }): Promise<RepurposingContentJobRow | null> {
      const endpoint = new URL("/rest/v1/content_jobs", supabaseUrl);
      endpoint.searchParams.set("id", `eq.${contentJobId}`);
      endpoint.searchParams.set("queue_job_id", `eq.${queueJobId}`);
      endpoint.searchParams.set("user_id", `eq.${userId}`);
      endpoint.searchParams.set(
        "select",
        "id,job_type,max_retries,payload,queue_job_id,retry_count,started_at,status,user_id",
      );

      const response = await fetchFn(endpoint, {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        method: "GET",
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `Supabase content_jobs repurposing lookup failed with ${response.status}: ${errorBody}`,
        );
      }

      const rows = (await response.json()) as unknown;
      const parsedRows = z
        .array(repurposingContentJobRowSchema)
        .safeParse(rows);

      if (!parsedRows.success) {
        throw new Error(
          `Supabase content_jobs repurposing lookup returned invalid rows: ${parsedRows.error.message}`,
        );
      }

      const row = parsedRows.data[0];

      if (!row) {
        return null;
      }

      return {
        ...row,
        payload: row.payload as RepurposingPlanJobPayload,
      };
    },

    async updateById(
      contentJobId: string,
      patch: RepurposingPlanContentJobPatch,
    ): Promise<void> {
      const endpoint = new URL("/rest/v1/content_jobs", supabaseUrl);
      endpoint.searchParams.set("id", `eq.${contentJobId}`);

      const body: Record<string, unknown> = {
        ...(patch.completed_at !== undefined
          ? { completed_at: patch.completed_at }
          : {}),
        ...(patch.error_message !== undefined
          ? { error_message: patch.error_message }
          : {}),
        ...(patch.last_retried_at !== undefined
          ? { last_retried_at: patch.last_retried_at }
          : {}),
        ...(patch.max_retries !== undefined
          ? { max_retries: patch.max_retries }
          : {}),
        ...(patch.next_retry_at !== undefined
          ? { next_retry_at: patch.next_retry_at }
          : {}),
        ...(patch.result !== undefined ? { result: patch.result } : {}),
        ...(patch.retry_count !== undefined
          ? { retry_count: patch.retry_count }
          : {}),
        ...(patch.started_at !== undefined
          ? { started_at: patch.started_at }
          : {}),
        status: patch.status,
        updated_at: new Date().toISOString(),
      };

      const response = await fetchFn(endpoint, {
        body: JSON.stringify(body),
        headers,
        method: "PATCH",
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `Supabase content_jobs repurposing update failed with ${response.status}: ${errorBody}`,
        );
      }
    },
  };
}
