import type { ClipGenerationJobData, ContentJobStatus } from "@streamos/types";

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
  const contentJobsEndpoint = new URL(
    "/rest/v1/content_jobs?on_conflict=queue_job_id",
    supabaseUrl,
  );
  const transcriptsEndpoint = new URL(
    "/rest/v1/stream_transcripts",
    supabaseUrl,
  );
  const highlightsEndpoint = new URL(
    "/rest/v1/stream_highlights?on_conflict=user_id,stream_id,source,source_queue_job_id,rank",
    supabaseUrl,
  );
  const clipsEndpoint = new URL(
    "/rest/v1/clips?on_conflict=user_id,stream_id,source_queue_job_id,title",
    supabaseUrl,
  );
  const clipExportsEndpoint = new URL(
    "/rest/v1/clip_exports?on_conflict=clip_id,user_id,export_format",
    supabaseUrl,
  );
  const minimalHeaders = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=minimal",
  };
  const representationHeaders = {
    ...minimalHeaders,
    Prefer: "resolution=merge-duplicates,return=representation",
  };
  const readHeaders = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };

  return {
    async update(
      jobId: string,
      payload: ClipGenerationJobData,
      patch: ContentJobPatch,
    ): Promise<void> {
      await writeJson(fetchFn, contentJobsEndpoint, minimalHeaders, {
        error_message: patch.error_message ?? null,
        job_type: "clip_scoring",
        payload,
        queue_job_id: jobId,
        result: patch.result ?? null,
        status: patch.status,
        stream_id: payload.stream_id,
        updated_at: new Date().toISOString(),
        user_id: payload.requested_by,
      });

      if (patch.status === "done" && isClipAnalysisResult(patch.result)) {
        const transcriptId = await findTranscriptId(
          fetchFn,
          transcriptsEndpoint,
          readHeaders,
          {
            streamId: payload.stream_id,
            userId: payload.requested_by,
          },
        );
        const highlights = await upsertHighlights(
          fetchFn,
          highlightsEndpoint,
          representationHeaders,
          {
            jobId,
            payload,
            result: patch.result,
            transcriptId,
          },
        );
        const clip = await upsertClip(
          fetchFn,
          clipsEndpoint,
          representationHeaders,
          {
            highlightId: highlights[0]?.id ?? null,
            jobId,
            payload,
            result: patch.result,
          },
        );

        await upsertClipExports(fetchFn, clipExportsEndpoint, minimalHeaders, {
          clipId: clip.id,
          payload,
          result: patch.result,
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

async function writeJsonReturningFirst<T extends { id: string }>(
  fetchFn: typeof fetch,
  endpoint: URL,
  headers: Record<string, string>,
  body: Record<string, unknown>,
): Promise<T> {
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

  const responseBody = (await response.json()) as unknown;

  if (
    !Array.isArray(responseBody) ||
    typeof responseBody[0]?.id !== "string"
  ) {
    throw new Error(`Supabase ${endpoint.pathname} did not return a row id.`);
  }

  return responseBody[0] as T;
}

async function findTranscriptId(
  fetchFn: typeof fetch,
  baseEndpoint: URL,
  headers: Record<string, string>,
  params: { streamId: string; userId: string },
): Promise<string | null> {
  const endpoint = new URL(baseEndpoint);
  endpoint.searchParams.set("select", "id");
  endpoint.searchParams.set("user_id", `eq.${params.userId}`);
  endpoint.searchParams.set("stream_id", `eq.${params.streamId}`);
  endpoint.searchParams.set("order", "updated_at.desc");
  endpoint.searchParams.set("limit", "1");

  const response = await fetchFn(endpoint, {
    headers,
    method: "GET",
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Supabase ${endpoint.pathname} read failed with ${response.status}: ${errorBody}`,
    );
  }

  const rows = (await response.json()) as unknown;

  if (!Array.isArray(rows) || typeof rows[0]?.id !== "string") {
    return null;
  }

  return rows[0].id;
}

async function upsertHighlights(
  fetchFn: typeof fetch,
  endpoint: URL,
  headers: Record<string, string>,
  options: {
    jobId: string;
    payload: ClipGenerationJobData;
    result: ClipAnalysisResult;
    transcriptId: string | null;
  },
): Promise<Array<{ id: string }>> {
  const summaries =
    options.result.highlights.length > 0
      ? options.result.highlights
      : [options.result.repurpose_summary];

  const rows: Array<{ id: string }> = [];

  for (const [index, summary] of summaries.entries()) {
    rows.push(
      await writeJsonReturningFirst(fetchFn, endpoint, headers, {
        metadata: {
          provider: options.result.provider,
          recommended_formats: options.result.recommended_formats,
          source_platform: options.result.source_platform,
          title_suggestions: options.result.title_suggestions,
        },
        rank: index + 1,
        score: options.result.virality_score,
        source: "clip_scoring",
        source_queue_job_id: options.jobId,
        stream_id: options.payload.stream_id,
        summary,
        title: options.result.title_suggestions[index] ?? null,
        transcript_id: options.transcriptId,
        updated_at: new Date().toISOString(),
        user_id: options.payload.requested_by,
      }),
    );
  }

  return rows;
}

async function upsertClip(
  fetchFn: typeof fetch,
  endpoint: URL,
  headers: Record<string, string>,
  options: {
    highlightId: string | null;
    jobId: string;
    payload: ClipGenerationJobData;
    result: ClipAnalysisResult;
  },
): Promise<{ id: string }> {
  return writeJsonReturningFirst(fetchFn, endpoint, headers, {
    description: options.result.repurpose_summary,
    highlight_id: options.highlightId,
    metadata: {
      provider: options.result.provider,
      recommended_formats: options.result.recommended_formats,
      source_platform: options.result.source_platform,
    },
    source_queue_job_id: options.jobId,
    source_url: options.payload.source_url,
    status: "draft",
    stream_id: options.payload.stream_id,
    title:
      options.result.title_suggestions[0] ??
      `Draft clip from ${options.payload.source_platform}`,
    updated_at: new Date().toISOString(),
    user_id: options.payload.requested_by,
    virality_score: options.result.virality_score,
  });
}

async function upsertClipExports(
  fetchFn: typeof fetch,
  endpoint: URL,
  headers: Record<string, string>,
  options: {
    clipId: string;
    payload: ClipGenerationJobData;
    result: ClipAnalysisResult;
  },
): Promise<void> {
  for (const format of options.result.recommended_formats) {
    await writeJson(fetchFn, endpoint, headers, {
      clip_id: options.clipId,
      export_format: normalizeExportFormat(format),
      metadata: {
        recommended_format: format,
        source_platform: options.result.source_platform,
      },
      status: "draft",
      target_platform: inferTargetPlatform(format),
      updated_at: new Date().toISOString(),
      user_id: options.payload.requested_by,
    });
  }
}

type ClipAnalysisResult = {
  asset_id: unknown;
  highlights: string[];
  provider: string;
  recommended_formats: string[];
  repurpose_summary: string;
  source_platform: unknown;
  title_suggestions: string[];
  virality_score: number;
};

function isClipAnalysisResult(
  result: Record<string, unknown> | undefined,
): result is ClipAnalysisResult {
  return (
    Array.isArray(result?.highlights) &&
    result.highlights.every((item) => typeof item === "string") &&
    typeof result.provider === "string" &&
    Array.isArray(result.recommended_formats) &&
    result.recommended_formats.every((item) => typeof item === "string") &&
    typeof result.repurpose_summary === "string" &&
    Array.isArray(result.title_suggestions) &&
    result.title_suggestions.every((item) => typeof item === "string") &&
    typeof result.virality_score === "number"
  );
}

function normalizeExportFormat(format: string) {
  return format.trim().toLowerCase().replaceAll(/[^a-z0-9]+/g, "_").replaceAll(
    /^_|_$/g,
    "",
  );
}

function inferTargetPlatform(format: string) {
  const normalizedFormat = normalizeExportFormat(format);

  if (normalizedFormat.includes("tiktok")) {
    return "tiktok";
  }

  if (
    normalizedFormat.includes("short") ||
    normalizedFormat.includes("youtube")
  ) {
    return "youtube";
  }

  if (normalizedFormat.includes("twitch")) {
    return "twitch";
  }

  if (normalizedFormat.includes("kick")) {
    return "kick";
  }

  return null;
}
