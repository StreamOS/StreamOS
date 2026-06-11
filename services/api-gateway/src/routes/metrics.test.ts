import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { getMetricsSyncJobId, type MetricsSyncQueue } from "@streamos/queue";

const API_SECRET = "test-api-gateway-secret-123";

function createMetricsSyncQueue(): MetricsSyncQueue {
  return {
    async add(_name, data, opts) {
      return {
        id: String(opts.jobId),
        data,
      };
    },
  } as MetricsSyncQueue;
}

function createMetricsSyncStatusQueue(job?: {
  attemptsMade?: number;
  data: {
    providers: Array<"twitch" | "youtube" | "tiktok" | "kick">;
    user_id: string;
  };
  failedReason?: string | null;
  finishedOn?: number | null;
  id?: string;
  processedOn?: number | null;
  progress?: number | Record<string, unknown>;
  result?: unknown;
  state?: string;
  timestamp?: number;
}) {
  return {
    async add(_name, data, opts) {
      return {
        id: String(opts.jobId),
        data,
      };
    },
    async getJob(jobId: string) {
      if (!job || jobId !== job.id) {
        return null;
      }

      return {
        attemptsMade: job.attemptsMade ?? 0,
        data: job.data,
        failedReason: job.failedReason ?? null,
        finishedOn: job.finishedOn ?? null,
        id: job.id ?? jobId,
        name: "metrics.sync",
        processedOn: job.processedOn ?? null,
        progress: job.progress ?? 0,
        returnvalue: job.result,
        timestamp: job.timestamp ?? Date.now(),
        async getState() {
          return job.state ?? "waiting";
        },
      };
    },
    name: "streamos-metrics-sync",
  } as MetricsSyncQueue;
}

describe("POST /api/metrics/sync-request", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it("queues a metrics sync job when authenticated", async () => {
    const app = createApp({
      apiGatewaySecret: API_SECRET,
      allowedOrigins: ["https://app.streamos.test"],
      metricsSyncQueue: createMetricsSyncQueue(),
      rateLimit: { enabled: false },
    });

    const response = await request(app)
      .post("/api/metrics/sync-request")
      .set("authorization", `Bearer ${API_SECRET}`)
      .send({
        providers: ["kick", "twitch", "kick"],
        user_id: "11111111-1111-4111-8111-111111111111",
      })
      .expect(202);

    expect(response.body).toEqual({
      job_id: getMetricsSyncJobId("11111111-1111-4111-8111-111111111111", [
        "twitch",
        "kick",
      ]),
      providers: ["twitch", "kick"],
      queue_job_id: getMetricsSyncJobId(
        "11111111-1111-4111-8111-111111111111",
        ["twitch", "kick"],
      ),
      status: "queued",
    });
  });

  it("rejects requests without a valid API secret", async () => {
    const app = createApp({
      apiGatewaySecret: API_SECRET,
      metricsSyncQueue: createMetricsSyncQueue(),
      rateLimit: { enabled: false },
    });

    const response = await request(app)
      .post("/api/metrics/sync-request")
      .send({
        providers: ["twitch"],
        user_id: "11111111-1111-4111-8111-111111111111",
      })
      .expect(401);

    expect(response.body).toEqual({
      error: "invalid_api_gateway_secret",
      message: "API gateway secret is invalid.",
    });
  });

  it("rejects invalid payloads", async () => {
    const app = createApp({
      apiGatewaySecret: API_SECRET,
      metricsSyncQueue: createMetricsSyncQueue(),
      rateLimit: { enabled: false },
    });

    const response = await request(app)
      .post("/api/metrics/sync-request")
      .set("authorization", `Bearer ${API_SECRET}`)
      .send({
        providers: [],
        user_id: "not-a-uuid",
      })
      .expect(400);

    expect(response.body.error).toBe("invalid_metrics_sync_request");
    expect(Array.isArray(response.body.issues)).toBe(true);
  });

  it("returns 503 when the metrics queue is unavailable", async () => {
    const app = createApp({
      apiGatewaySecret: API_SECRET,
      rateLimit: { enabled: false },
    });

    const response = await request(app)
      .post("/api/metrics/sync-request")
      .set("authorization", `Bearer ${API_SECRET}`)
      .send({
        providers: ["twitch"],
        user_id: "11111111-1111-4111-8111-111111111111",
      })
      .expect(503);

    expect(response.body).toEqual({
      error: "metrics_sync_queue_unavailable",
      message: "Metrics sync queue is not configured.",
    });
  });
});

describe("GET /api/metrics/sync-status", () => {
  const originalEnv = { ...process.env };
  const userId = "11111111-1111-4111-8111-111111111111";

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.API_GATEWAY_SECRET = API_SECRET;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns queue job status for a tracked metrics sync job", async () => {
    const jobId = getMetricsSyncJobId(userId, ["kick", "twitch"]);
    const queue = createMetricsSyncStatusQueue({
      attemptsMade: 1,
      data: {
        providers: ["twitch", "kick"],
        user_id: userId,
      },
      finishedOn: null,
      id: jobId,
      processedOn: 1_717_000_000_000,
      progress: { phase: "syncing" },
      result: {
        failed: [],
        synced: ["twitch", "kick"],
      },
      state: "active",
      timestamp: 1_716_999_990_000,
    });
    const app = createApp({
      apiGatewaySecret: API_SECRET,
      allowedOrigins: ["https://app.streamos.test"],
      metricsSyncQueue: queue,
      rateLimit: { enabled: false },
    });

    const response = await request(app)
      .get(`/api/metrics/sync-status?job_id=${jobId}`)
      .set("authorization", `Bearer ${API_SECRET}`)
      .expect(200);

    expect(response.body).toEqual({
      attempts_made: 1,
      data: {
        providers: ["twitch", "kick"],
        user_id: userId,
      },
      failed_reason: null,
      finished_on: null,
      job_id: jobId,
      processed_on: 1_717_000_000_000,
      progress: { phase: "syncing" },
      queue: "streamos-metrics-sync",
      queue_job_id: jobId,
      result: {
        failed: [],
        synced: ["twitch", "kick"],
      },
      status: "active",
      timestamp: 1_716_999_990_000,
    });
  });

  it("rejects status requests without a job identifier", async () => {
    const app = createApp({
      apiGatewaySecret: API_SECRET,
      metricsSyncQueue: createMetricsSyncQueue(),
      rateLimit: { enabled: false },
    });

    const response = await request(app)
      .get("/api/metrics/sync-status")
      .set("authorization", `Bearer ${API_SECRET}`)
      .expect(400);

    expect(response.body).toEqual({
      error: "invalid_metrics_sync_status_request",
      message: "job_id or queue_job_id is required.",
    });
  });

  it("returns 404 when the metrics sync job cannot be found", async () => {
    const app = createApp({
      apiGatewaySecret: API_SECRET,
      metricsSyncQueue: createMetricsSyncStatusQueue(),
      rateLimit: { enabled: false },
    });

    const response = await request(app)
      .get("/api/metrics/sync-status?queue_job_id=missing-job")
      .set("authorization", `Bearer ${API_SECRET}`)
      .expect(404);

    expect(response.body).toEqual({
      error: "metrics_sync_job_not_found",
      message: "Metrics sync job was not found.",
    });
  });
});
