import { timingSafeEqual } from "node:crypto";
import express from "express";
import type { Request, Response, Router } from "express";
import { z } from "zod";

const callbackPayloadSchema = z.object({
  contentJobId: z.string().uuid(),
  error: z.string().trim().optional(),
  result: z.record(z.unknown()).optional(),
  status: z.enum(["completed", "failed"]),
});

const contentJobRowSchema = z.object({
  id: z.string().uuid(),
  job_type: z.string(),
  payload: z.record(z.unknown()),
  type: z.string().nullable().optional(),
  user_id: z.string().uuid(),
});

export type CreateAutomationCallbackRouterOptions = {
  apiGatewaySecret: string | undefined;
  fetchImpl?: typeof fetch;
  serviceRoleKey?: string;
  supabaseUrl?: string;
};

function hasValidSecret(
  receivedSecret: string | string[] | undefined,
  expectedSecret: string | undefined,
): boolean {
  if (!expectedSecret || typeof receivedSecret !== "string") {
    return false;
  }

  const receivedBuffer = Buffer.from(receivedSecret);
  const expectedBuffer = Buffer.from(expectedSecret);

  return (
    receivedBuffer.byteLength === expectedBuffer.byteLength &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

function getSupabaseHeaders(serviceRoleKey: string): Record<string, string> {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

function getStringField(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];

  return typeof value === "string" && value.trim() ? value : undefined;
}

export function createAutomationCallbackRouter({
  apiGatewaySecret,
  fetchImpl = fetch,
  serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY,
  supabaseUrl = process.env.SUPABASE_URL,
}: CreateAutomationCallbackRouterOptions): Router {
  const router = express.Router();

  router.post("/", async (request: Request, response: Response) => {
    if (
      !hasValidSecret(
        request.headers["x-streamos-api-secret"],
        apiGatewaySecret,
      )
    ) {
      response.status(401).json({
        error: "invalid_api_gateway_secret",
        message: "Automation callback secret is invalid.",
      });
      return;
    }

    if (!serviceRoleKey || !supabaseUrl) {
      response.status(503).json({
        error: "supabase_not_configured",
        message: "Supabase service credentials are required for callbacks.",
      });
      return;
    }

    const parsedPayload = callbackPayloadSchema.safeParse(request.body);

    if (!parsedPayload.success) {
      response.status(400).json({
        error: "invalid_automation_callback_payload",
        issues: parsedPayload.error.issues,
      });
      return;
    }

    try {
      const payload = parsedPayload.data;
      const contentJob = await fetchContentJob({
        contentJobId: payload.contentJobId,
        fetchImpl,
        serviceRoleKey,
        supabaseUrl,
      });

      await updateContentJob({
        errorMessage: payload.error ?? null,
        fetchImpl,
        result: payload.result ?? null,
        serviceRoleKey,
        status: payload.status,
        supabaseUrl,
        contentJobId: payload.contentJobId,
      });

      if (payload.status === "completed") {
        await broadcastCompletion({
          contentJob,
          fetchImpl,
          result: payload.result ?? null,
          serviceRoleKey,
          supabaseUrl,
        });
      }

      response.status(202).json({
        contentJobId: payload.contentJobId,
        received: true,
      });
    } catch (error) {
      response.status(502).json({
        error: "automation_callback_update_failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return router;
}

async function fetchContentJob({
  contentJobId,
  fetchImpl,
  serviceRoleKey,
  supabaseUrl,
}: {
  contentJobId: string;
  fetchImpl: typeof fetch;
  serviceRoleKey: string;
  supabaseUrl: string;
}) {
  const endpoint = new URL("/rest/v1/content_jobs", supabaseUrl);
  endpoint.searchParams.set("id", `eq.${contentJobId}`);
  endpoint.searchParams.set("select", "id,user_id,type,job_type,payload");
  endpoint.searchParams.set("limit", "1");

  const response = await fetchImpl(endpoint, {
    headers: getSupabaseHeaders(serviceRoleKey),
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(
      `Supabase content_jobs lookup failed with ${response.status}: ${await response.text()}`,
    );
  }

  const rows = z.array(contentJobRowSchema).parse(await response.json());
  const row = rows[0];

  if (!row) {
    throw new Error(`Content job ${contentJobId} was not found.`);
  }

  return row;
}

async function updateContentJob({
  contentJobId,
  errorMessage,
  fetchImpl,
  result,
  serviceRoleKey,
  status,
  supabaseUrl,
}: {
  contentJobId: string;
  errorMessage: string | null;
  fetchImpl: typeof fetch;
  result: Record<string, unknown> | null;
  serviceRoleKey: string;
  status: "completed" | "failed";
  supabaseUrl: string;
}): Promise<void> {
  const endpoint = new URL("/rest/v1/content_jobs", supabaseUrl);
  endpoint.searchParams.set("id", `eq.${contentJobId}`);

  const response = await fetchImpl(endpoint, {
    body: JSON.stringify({
      completed_at: new Date().toISOString(),
      error_message: errorMessage,
      result,
      status,
      updated_at: new Date().toISOString(),
    }),
    headers: {
      ...getSupabaseHeaders(serviceRoleKey),
      Prefer: "return=minimal",
    },
    method: "PATCH",
  });

  if (!response.ok) {
    throw new Error(
      `Supabase content_jobs callback update failed with ${response.status}: ${await response.text()}`,
    );
  }
}

async function broadcastCompletion({
  contentJob,
  fetchImpl,
  result,
  serviceRoleKey,
  supabaseUrl,
}: {
  contentJob: z.infer<typeof contentJobRowSchema>;
  fetchImpl: typeof fetch;
  result: Record<string, unknown> | null;
  serviceRoleKey: string;
  supabaseUrl: string;
}): Promise<void> {
  const jobType = contentJob.type ?? contentJob.job_type;
  const event =
    jobType === "repurposing" ? "repurposing_ready" : "transcription_ready";
  const endpoint = new URL("/realtime/v1/api/broadcast", supabaseUrl);

  const response = await fetchImpl(endpoint, {
    body: JSON.stringify({
      messages: [
        {
          event,
          payload: {
            contentJobId: contentJob.id,
            result,
            streamId: getStringField(contentJob.payload, "streamId"),
            videoId: getStringField(contentJob.payload, "videoId"),
          },
          topic: `user:${contentJob.user_id}`,
        },
      ],
    }),
    headers: getSupabaseHeaders(serviceRoleKey),
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(
      `Supabase realtime broadcast failed with ${response.status}: ${await response.text()}`,
    );
  }
}
