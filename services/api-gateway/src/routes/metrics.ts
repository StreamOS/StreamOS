import { createHash, randomUUID } from "node:crypto";
import express from "express";
import type { Request, Response, Router } from "express";
import { z } from "zod";

import type { MetricsSyncProvider } from "@streamos/types";

import {
  GatewayError,
  isGatewayError,
  serializeGatewayError,
} from "../lib/gateway-error.js";
import { syncNonTwitchMetrics } from "../metrics/sync.js";

const metricsSyncRequestSchema = z.object({
  creatorId: z.string().trim().min(1),
  provider: z.enum(["youtube", "tiktok", "kick"]),
  userId: z.string().trim().min(1),
});

export type CreateMetricsSyncRouterOptions = {
  fetchImpl?: typeof fetch;
};

export function createMetricsSyncRouter({
  fetchImpl = fetch,
}: CreateMetricsSyncRouterOptions = {}): Router {
  const router = express.Router();

  router.post("/sync", (request, response, next) => {
    void handleMetricsSync(request, response, next, fetchImpl);
  });

  return router;
}

async function handleMetricsSync(
  request: Request,
  response: Response,
  next: (error?: unknown) => void,
  fetchImpl: typeof fetch,
): Promise<void> {
  const startedAt = Date.now();

  try {
    const payload = metricsSyncRequestSchema.parse(request.body);

    const result = await syncNonTwitchMetrics({
      creatorId: payload.creatorId,
      fetchImpl,
      provider: payload.provider as MetricsSyncProvider,
      userId: payload.userId,
    });

    response.status(200).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      response.status(400).json(
        serializeGatewayError(
          new GatewayError({
            code: "INVALID_REQUEST_BODY",
            message:
              "Request body must include userId, creatorId, and provider.",
            retryable: false,
            statusCode: 400,
          }),
        ),
      );
      return;
    }

    if (isGatewayError(error)) {
      logMetricsSyncError({
        durationMs: Date.now() - startedAt,
        error,
        userId: getUserIdForLogs(request.body),
      });

      if (error.retryAfterSeconds) {
        response.setHeader("Retry-After", String(error.retryAfterSeconds));
      } else if (error.statusCode === 502) {
        response.setHeader("Retry-After", "60");
      }

      response.status(error.statusCode).json(serializeGatewayError(error));
      return;
    }

    const gatewayError = new GatewayError({
      code: "INTERNAL_ERROR",
      message:
        error instanceof Error
          ? error.message
          : "Unexpected metrics sync failure.",
      retryable: false,
      statusCode: 500,
    });

    logMetricsSyncError({
      durationMs: Date.now() - startedAt,
      error: gatewayError,
      userId: getUserIdForLogs(request.body),
    });

    next(gatewayError);
  }
}

function getUserIdForLogs(body: unknown): string {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "unknown";
  }

  const userId = (body as Record<string, unknown>).userId;

  if (typeof userId !== "string" || userId.length === 0) {
    return "unknown";
  }

  return createHash("sha256").update(userId).digest("hex").slice(0, 16);
}

function logMetricsSyncError({
  durationMs,
  error,
  userId,
}: {
  durationMs: number;
  error: GatewayError;
  userId: string;
}) {
  if (process.env.NODE_ENV === "test" || error.statusCode < 500) {
    return;
  }

  console.error(
    JSON.stringify({
      code: error.code,
      durationMs,
      errorId: randomUUID(),
      level: "error",
      provider: error.provider,
      service: "api-gateway",
      userId,
    }),
  );
}
