import { timingSafeEqual } from "node:crypto";
import express from "express";
import type { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import {
  DEFAULT_METRICS_SYNC_QUEUE_NAME,
  enqueueMetricsSyncJob,
  getMetricsSyncQueue,
  type MetricsSyncQueue,
} from "@streamos/queue";
import { SUPPORTED_PROVIDERS } from "@streamos/types";

const syncRequestSchema = z.object({
  providers: z.array(z.enum(SUPPORTED_PROVIDERS)).min(1),
  user_id: z.string().uuid(),
});

export type CreateMetricsRouterOptions = {
  apiGatewaySecret: string | undefined;
  metricsSyncQueue?: MetricsSyncQueue;
};

function hasValidSecret(
  headerValue: string | string[] | undefined,
  expectedSecret: string | undefined,
): boolean {
  if (!expectedSecret) {
    return true;
  }

  const receivedSecret = Array.isArray(headerValue)
    ? headerValue[0]
    : headerValue;

  if (!receivedSecret) {
    return false;
  }

  const receivedBuffer = Buffer.from(receivedSecret);
  const expectedBuffer = Buffer.from(expectedSecret);

  return (
    receivedBuffer.byteLength === expectedBuffer.byteLength &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

function getBearerToken(headerValue: string | string[] | undefined) {
  const authorizationHeader = Array.isArray(headerValue)
    ? headerValue[0]
    : headerValue;

  if (!authorizationHeader?.startsWith("Bearer ")) {
    return undefined;
  }

  return authorizationHeader.slice("Bearer ".length);
}

function getQueryValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const firstValue = value[0];

    return typeof firstValue === "string" && firstValue.trim()
      ? firstValue
      : undefined;
  }

  return typeof value === "string" && value.trim() ? value : undefined;
}

function hasQueueLookup(
  queue: MetricsSyncQueue | undefined,
): queue is MetricsSyncQueue & {
  getJob(jobId: string): Promise<{
    attemptsMade: number;
    data: { providers: string[]; user_id: string };
    failedReason?: string | null;
    finishedOn?: number | null;
    getState(): Promise<string>;
    id?: string | number | null;
    name: string;
    processedOn?: number | null;
    progress?: number | Record<string, unknown>;
    returnvalue?: unknown;
    timestamp: number;
  } | null>;
} {
  return (
    typeof (queue as { getJob?: unknown } | undefined)?.getJob === "function"
  );
}

function requireAppApiSecret(expectedSecret: string | undefined) {
  return (request: Request, response: Response, next: NextFunction) => {
    const receivedSecret =
      getBearerToken(request.headers.authorization) ??
      request.headers["x-streamos-api-secret"];

    if (!hasValidSecret(receivedSecret, expectedSecret)) {
      response.status(401).json({
        error: "invalid_api_gateway_secret",
        message: "API gateway secret is invalid.",
      });
      return;
    }

    next();
  };
}

export function createMetricsRouter({
  apiGatewaySecret,
  metricsSyncQueue,
}: CreateMetricsRouterOptions): Router {
  const router = express.Router();

  router.post(
    "/sync-request",
    requireAppApiSecret(apiGatewaySecret),
    async (request, response) => {
      if (!metricsSyncQueue) {
        response.status(503).json({
          error: "metrics_sync_queue_unavailable",
          message: "Metrics sync queue is not configured.",
        });
        return;
      }

      const parsedPayload = syncRequestSchema.safeParse(request.body);

      if (!parsedPayload.success) {
        response.status(400).json({
          error: "invalid_metrics_sync_request",
          issues: parsedPayload.error.issues,
        });
        return;
      }

      try {
        const result = await enqueueMetricsSyncJob(
          metricsSyncQueue,
          parsedPayload.data,
        );

        response.status(202).json(result);
      } catch (error) {
        response.status(503).json({
          error: "metrics_sync_queue_unavailable",
          message:
            error instanceof Error
              ? error.message
              : "Metrics sync queue is unavailable.",
        });
      }
    },
  );

  router.get(
    "/sync-status",
    requireAppApiSecret(apiGatewaySecret),
    async (request, response) => {
      const jobId =
        getQueryValue(request.query.job_id) ??
        getQueryValue(request.query.queue_job_id);

      if (!jobId) {
        response.status(400).json({
          error: "invalid_metrics_sync_status_request",
          message: "job_id or queue_job_id is required.",
        });
        return;
      }

      try {
        const queue = hasQueueLookup(metricsSyncQueue)
          ? metricsSyncQueue
          : getMetricsSyncQueue();

        if (typeof queue.getJob !== "function") {
          response.status(503).json({
            error: "metrics_sync_queue_unavailable",
            message: "Metrics sync queue is not configured.",
          });
          return;
        }

        const job = await queue.getJob(jobId);

        if (!job) {
          response.status(404).json({
            error: "metrics_sync_job_not_found",
            message: "Metrics sync job was not found.",
          });
          return;
        }

        const status = await job.getState();

        response.status(200).json({
          attempts_made: job.attemptsMade,
          data: {
            providers: job.data.providers,
            user_id: job.data.user_id,
          },
          failed_reason: job.failedReason ?? null,
          finished_on: job.finishedOn ?? null,
          job_id: jobId,
          processed_on: job.processedOn ?? null,
          progress: job.progress ?? null,
          queue: queue.name ?? DEFAULT_METRICS_SYNC_QUEUE_NAME,
          queue_job_id: String(job.id ?? jobId),
          result: job.returnvalue ?? null,
          status,
          timestamp: job.timestamp,
        });
      } catch (error) {
        response.status(503).json({
          error: "metrics_sync_queue_unavailable",
          message:
            error instanceof Error
              ? error.message
              : "Metrics sync queue is unavailable.",
        });
      }
    },
  );

  return router;
}
