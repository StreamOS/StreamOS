import type { ContentJobStatus } from "@streamos/types";

import type { ClipGenerationJobData } from "./jobSchema.js";

export type ContentJobPatch = {
  error_message?: string;
  result?: Record<string, unknown>;
  status: ContentJobStatus;
};

export type JobStatusStore = {
  update(
    jobId: string,
    payload: ClipGenerationJobData,
    patch: ContentJobPatch,
  ): Promise<void>;
};

export type SupabaseJobStatusStoreOptions = {
  fetchFn?: typeof fetch;
  serviceRoleKey: string;
  supabaseUrl: string;
};

export function createSupabaseJobStatusStore({
  fetchFn = fetch,
  serviceRoleKey,
  supabaseUrl,
}: SupabaseJobStatusStoreOptions): JobStatusStore {
  const endpoint = new URL(
    "/rest/v1/content_jobs?on_conflict=queue_job_id",
    supabaseUrl,
  );

  return {
    async update(
      jobId: string,
      payload: ClipGenerationJobData,
      patch: ContentJobPatch,
    ): Promise<void> {
      const response = await fetchFn(endpoint, {
        body: JSON.stringify({
          error_message: patch.error_message ?? null,
          job_type: "clip_scoring",
          payload,
          queue_job_id: jobId,
          result: patch.result ?? null,
          status: patch.status,
          stream_id: payload.stream_id,
          updated_at: new Date().toISOString(),
          user_id: payload.requested_by,
        }),
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        method: "POST",
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `Supabase content_jobs update failed with ${response.status}: ${errorBody}`,
        );
      }
    },
  };
}
