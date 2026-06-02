import { timingSafeEqual } from "node:crypto";
import express from "express";
import type { Express } from "express";
import helmet from "helmet";
import { ZodError } from "zod";

import {
  clipGenerationPayloadSchema,
  enqueueClipGenerationJob,
  type ClipGenerationQueue,
} from "./jobs/clipGenerationQueue.js";
import {
  enqueueTranscriptionTriggerJob,
  streamEndedPayloadSchema,
  type TranscriptionQueue,
} from "./jobs/transcriptionQueue.js";

type CreateAppOptions = {
  clipGenerationQueue?: ClipGenerationQueue;
  streamEventWebhookSecret?: string;
  transcriptionQueue?: TranscriptionQueue;
};

function hasValidStreamEventSecret(
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

export function createApp(options: CreateAppOptions = {}): Express {
  const app = express();

  app.use(helmet());
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_request, response) => {
    response.status(200).json({ service: "api-gateway", status: "ok" });
  });

  app.get("/api/platforms", (_request, response) => {
    response.status(200).json({
      platforms: ["twitch", "youtube", "tiktok", "kick"],
      next: "Implement OAuth state handling and encrypted token storage.",
    });
  });

  app.post("/api/clips/generate", async (request, response) => {
    if (!options.clipGenerationQueue) {
      response.status(503).json({
        error: "clip_generation_queue_unavailable",
        message:
          "REDIS_URL is required before clip-generation jobs can be queued.",
      });
      return;
    }

    try {
      const payload = clipGenerationPayloadSchema.parse(request.body);
      const job = await enqueueClipGenerationJob(
        options.clipGenerationQueue,
        payload,
      );

      response.status(202).json({
        job_id: job.jobId,
        queue_job_id: job.queueJobId,
        stream_id: job.streamId,
        status: "queued",
      });
    } catch (error) {
      if (error instanceof ZodError) {
        response.status(400).json({
          error: "invalid_clip_generation_payload",
          issues: error.issues,
        });
        return;
      }

      response.status(502).json({
        error: "clip_generation_queue_failed",
        message: "Clip-generation job could not be queued.",
      });
    }
  });

  app.post("/api/webhooks/streams/ended", async (request, response) => {
    if (
      !hasValidStreamEventSecret(
        request.headers["x-streamos-webhook-secret"],
        options.streamEventWebhookSecret ??
          process.env.STREAM_EVENT_WEBHOOK_SECRET,
      )
    ) {
      response.status(401).json({
        error: "invalid_stream_event_secret",
        message: "Stream event webhook secret is invalid.",
      });
      return;
    }

    if (!options.transcriptionQueue) {
      response.status(503).json({
        error: "transcription_queue_unavailable",
        message:
          "REDIS_URL is required before transcription jobs can be queued.",
      });
      return;
    }

    try {
      const payload = streamEndedPayloadSchema.parse(request.body);
      const job = await enqueueTranscriptionTriggerJob(
        options.transcriptionQueue,
        payload,
      );

      response.status(202).json({
        job_id: job.jobId,
        queue_job_id: job.queueJobId,
        stream_id: job.streamId,
        status: "queued",
      });
    } catch (error) {
      if (error instanceof ZodError) {
        response.status(400).json({
          error: "invalid_stream_ended_payload",
          issues: error.issues,
        });
        return;
      }

      response.status(502).json({
        error: "transcription_queue_failed",
        message: "Transcription trigger job could not be queued.",
      });
    }
  });

  return app;
}
