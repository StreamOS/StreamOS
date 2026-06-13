import express from "express";
import type { Router } from "express";
import { z } from "zod";
import type { ClipGenerationJobData } from "@streamos/types";

import { clipGenerationPayloadSchema } from "../jobs/clipGenerationQueue.js";
import {
  createSupabaseRestClient,
  patchSupabaseRows,
  upsertSupabaseRow,
  type SupabaseRestClient,
} from "../lib/supabaseRest.js";

const manualRetryPayloadSchema = z.object({
  job_id: z.string().uuid(),
  max_retries: z.number().int().min(1).max(100),
  user_id: z.string().uuid(),
});

export const clipGenerationRequestSchema = clipGenerationPayloadSchema.extend({
  category: z.string().trim().max(180).nullable().optional(),
  channel_id: z.string().uuid().optional(),
  chat_activity: z.enum(["high", "medium", "low"]).optional(),
});

export type ClipGenerationRequest = z.infer<typeof clipGenerationRequestSchema>;

export function createContentJobsRouter({
  fetchImpl = fetch,
}: {
  fetchImpl?: typeof fetch;
} = {}): Router {
  const router = express.Router();

  router.post("/retry", async (request, response) => {
    const parsedPayload = manualRetryPayloadSchema.safeParse(request.body);

    if (!parsedPayload.success) {
      response.status(400).json({
        error: "invalid_content_job_retry_payload",
        issues: parsedPayload.error.issues,
      });
      return;
    }

    let supabase: SupabaseRestClient;

    try {
      supabase = createSupabaseRestClient({ fetchImpl });
    } catch (error) {
      response.status(503).json({
        error: "supabase_not_configured",
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    try {
      await requestContentJobRetry({
        input: parsedPayload.data,
        supabase,
      });

      response.status(202).json({
        job_id: parsedPayload.data.job_id,
        status: "retry_requested",
      });
    } catch (error) {
      response.status(502).json({
        error: "content_job_retry_failed",
        message:
          error instanceof Error
            ? error.message
            : "Content job retry could not be requested.",
      });
    }
  });

  return router;
}

export function getClipQueuePayload(
  input: ClipGenerationRequest,
): ClipGenerationJobData {
  return {
    creator_id: input.creator_id,
    requested_by: input.requested_by,
    source_platform: input.source_platform,
    source_url: input.source_url,
    stream_id: input.stream_id,
    transcript: input.transcript,
  };
}

export async function upsertClipContentJob({
  errorMessage,
  input,
  queueJobId,
  result,
  status,
  supabase,
}: {
  errorMessage: string | null;
  input: ClipGenerationRequest;
  queueJobId: string;
  result: Record<string, unknown> | null;
  status: "failed" | "pending";
  supabase: SupabaseRestClient;
}): Promise<void> {
  await upsertSupabaseRow({
    client: supabase,
    onConflict: "queue_job_id",
    payload: {
      channel_id: input.channel_id ?? null,
      error_message: errorMessage,
      job_type: "clip_scoring",
      next_retry_at: null,
      payload: {
        ...getClipQueuePayload(input),
        category: input.category ?? null,
        chat_activity: input.chat_activity ?? "medium",
      },
      queue_job_id: queueJobId,
      result,
      status,
      stream_id: input.stream_id,
      type: "clip_scoring",
      user_id: input.requested_by,
    },
    table: "content_jobs",
  });
}

async function requestContentJobRetry({
  input,
  supabase,
}: {
  input: z.infer<typeof manualRetryPayloadSchema>;
  supabase: SupabaseRestClient;
}): Promise<void> {
  await patchSupabaseRows({
    client: supabase,
    params: {
      id: `eq.${input.job_id}`,
      status: "eq.failed",
      user_id: `eq.${input.user_id}`,
    },
    payload: {
      error_message: "Manual retry requested.",
      max_retries: input.max_retries,
      next_retry_at: null,
      updated_at: new Date().toISOString(),
    },
    table: "content_jobs",
  });
}
