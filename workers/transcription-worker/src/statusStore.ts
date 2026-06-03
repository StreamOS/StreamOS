import type {
  ContentJobStatus,
  TranscriptionTriggerJobData,
} from "@streamos/types";

export type ContentJobPatch = {
  error_message?: string;
  result?: Record<string, unknown>;
  status: ContentJobStatus;
};

export type JobStatusStore = {
  update(
    jobId: string,
    payload: TranscriptionTriggerJobData,
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
  const contentJobsEndpoint = new URL(
    "/rest/v1/content_jobs?on_conflict=queue_job_id",
    supabaseUrl,
  );
  const vodAssetsEndpoint = new URL(
    "/rest/v1/vod_assets?on_conflict=stream_id,user_id",
    supabaseUrl,
  );
  const transcriptsEndpoint = new URL(
    "/rest/v1/stream_transcripts?on_conflict=stream_id,user_id,language",
    supabaseUrl,
  );
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=minimal",
  };

  return {
    async update(
      jobId: string,
      payload: TranscriptionTriggerJobData,
      patch: ContentJobPatch,
    ): Promise<void> {
      await writeJson(fetchFn, contentJobsEndpoint, headers, {
        error_message: patch.error_message ?? null,
        job_type: "transcription",
        next_retry_at: null,
        payload,
        queue_job_id: jobId,
        result: patch.result ?? null,
        status: patch.status,
        stream_id: payload.stream_id,
        updated_at: new Date().toISOString(),
        user_id: payload.user_id,
      });

      await writeJson(fetchFn, vodAssetsEndpoint, headers, {
        metadata: {
          last_transcription_job_id: jobId,
          trigger: payload.trigger,
        },
        platform: payload.platform,
        source_url: payload.vod_asset_url,
        status: toVodAssetStatus(patch.status),
        stream_id: payload.stream_id,
        transcribed_at:
          patch.status === "done" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
        user_id: payload.user_id,
      });

      if (patch.status === "done" && isTranscriptionResult(patch.result)) {
        await writeJson(fetchFn, transcriptsEndpoint, headers, {
          language: payload.language,
          model: String(patch.result.model ?? "unknown"),
          provider: String(patch.result.provider ?? "unknown"),
          segments: patch.result.segments,
          stream_id: payload.stream_id,
          transcript_text: patch.result.transcript,
          updated_at: new Date().toISOString(),
          user_id: payload.user_id,
        });
      }
    },
  };
}

async function writeJson(
  fetchFn: typeof fetch,
  endpoint: URL,
  headers: Record<string, string>,
  body: Record<string, unknown>,
): Promise<void> {
  const response = await fetchFn(endpoint, {
    body: JSON.stringify(body),
    headers,
    method: "POST",
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Supabase ${endpoint.pathname} write failed with ${response.status}: ${errorBody}`,
    );
  }
}

function toVodAssetStatus(status: ContentJobStatus) {
  if (status === "running") {
    return "transcribing";
  }

  if (status === "done") {
    return "transcribed";
  }

  if (status === "failed") {
    return "failed";
  }

  return "ingested";
}

function isTranscriptionResult(
  result: Record<string, unknown> | undefined,
): result is {
  model?: unknown;
  provider?: unknown;
  segments: unknown[];
  transcript: string;
} {
  return (
    typeof result?.transcript === "string" &&
    result.transcript.trim().length > 0 &&
    Array.isArray(result.segments)
  );
}
