import { afterEach, describe, expect, it } from "vitest";

import {
  getPublicationExecutionJobId,
  getPublicationReconciliationJobId,
} from "@streamos/queue";

import { createApp } from "../app.js";

const API_SECRET = "test-api-gateway-secret-123";
const SUPABASE_URL = "https://supabase.streamos.test";
const SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const CONTENT_JOB_ID = "22222222-2222-4222-8222-222222222222";
const PLATFORM_CONNECTION_ID = "33333333-3333-4333-8333-333333333333";
const PUBLICATION_ID = "44444444-4444-4444-8444-444444444444";
const STREAM_ID = "55555555-5555-4555-8555-555555555555";
const ORIGINAL_ENV = {
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL: process.env.SUPABASE_URL,
};

function useSupabaseTestEnv() {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SUPABASE_SERVICE_ROLE_KEY;
}

function restoreEnvValue(
  name: keyof typeof ORIGINAL_ENV,
  value: string | undefined,
) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

describe("content publications manual action routes", () => {
  afterEach(() => {
    restoreEnvValue(
      "SUPABASE_SERVICE_ROLE_KEY",
      ORIGINAL_ENV.SUPABASE_SERVICE_ROLE_KEY,
    );
    restoreEnvValue("SUPABASE_URL", ORIGINAL_ENV.SUPABASE_URL);
  });

  it("queues a retry publish action for an eligible publication", async () => {
    useSupabaseTestEnv();
    const requests: Array<{
      body: string | null;
      method: string;
      url: string;
    }> = [];
    const publicationExecutionQueue = {
      async add(
        name: string,
        data: Record<string, unknown>,
        opts: { jobId?: string | number },
      ) {
        expect(name).toBe("publication.publish");
        expect(data).toEqual({
          content_publication_id: PUBLICATION_ID,
          target_platform: "youtube",
          user_id: USER_ID,
        });
        expect(opts.jobId).toBe(getPublicationExecutionJobId(PUBLICATION_ID));
        return { id: String(opts.jobId) };
      },
    };
    const app = createApp({
      apiGatewaySecret: API_SECRET,
      nodeEnv: "test",
      oauth: {
        fetchImpl: async (input, init) => {
          const requestUrl =
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.toString()
                : input.url;
          const method = init?.method ?? "GET";
          const body = typeof init?.body === "string" ? init.body : null;
          requests.push({ body, method, url: requestUrl });

          if (
            requestUrl.includes("/rest/v1/content_publications") &&
            method === "GET"
          ) {
            return jsonResponse([
              {
                content_job_id: CONTENT_JOB_ID,
                external_post_id: "youtube-video-1",
                external_url: "https://www.youtube.com/watch?v=youtube-video-1",
                id: PUBLICATION_ID,
                max_retries: 3,
                next_retry_at: null,
                platform_connection_id: PLATFORM_CONNECTION_ID,
                publication_status: "failed_retryable",
                published_at: null,
                provider_failure_code: "provider_rate_limited",
                provider_failure_metadata: {},
                provider_failure_reason: "Rate limited",
                reconciliation_status: "idle",
                reconcile_max_retries: 3,
                reconcile_next_retry_at: null,
                reconcile_retry_count: 0,
                remote_processing_status: null,
                remote_state: {},
                remote_status: "unknown",
                remote_upload_status: null,
                retry_count: 1,
                snapshot_hash: "b".repeat(64),
                target_platform: "youtube",
                updated_at: "2026-06-19T12:00:00.000Z",
                user_id: USER_ID,
              },
            ]);
          }

          if (requestUrl.includes("/rest/v1/content_jobs")) {
            return jsonResponse([
              {
                id: CONTENT_JOB_ID,
                job_type: "repurposing",
                queue_job_id: "repurposing-plan-001",
                result: {
                  captions: ["Caption one"],
                  confidence: 0.93,
                  content_job_id: CONTENT_JOB_ID,
                  descriptions: ["Description one"],
                  hashtag_sets: [["#streamos"]],
                  hook_ideas: ["Hook one"],
                  manual_review_required: true,
                  model: "gpt-4o",
                  provider: "openai",
                  queue_job_id: "repurposing-plan-001",
                  review_notes: ["Reviewed and approved."],
                  short_form_plan: "Short-form plan",
                  title_suggestions: ["Title one"],
                  warnings: ["Sanitized and review-ready."],
                },
                review_status: "approved",
                status: "done",
                stream_id: STREAM_ID,
                type: "repurposing",
                user_id: USER_ID,
              },
            ]);
          }

          if (requestUrl.includes("/rest/v1/platform_connections")) {
            return jsonResponse([
              {
                id: PLATFORM_CONNECTION_ID,
                platform: "youtube",
                scopes: [
                  "https://www.googleapis.com/auth/youtube.upload",
                  "https://www.googleapis.com/auth/youtube.readonly",
                ],
                status: "connected",
                user_id: USER_ID,
              },
            ]);
          }

          if (requestUrl.includes("/rest/v1/vod_assets")) {
            return jsonResponse([
              {
                id: "vod-asset-1",
                source_url: "https://cdn.example.com/vods/stream-123.mp4",
              },
            ]);
          }

          if (
            requestUrl.includes("/rest/v1/content_publications") &&
            method === "PATCH"
          ) {
            const parsedBody = JSON.parse(body ?? "{}") as Record<
              string,
              unknown
            >;
            expect(parsedBody.publication_status).toBe("queued");
            expect(parsedBody.retry_count).toBe(2);
            return jsonResponse([]);
          }

          if (
            requestUrl.includes("/rest/v1/content_publication_events") &&
            method === "POST"
          ) {
            const parsedBody = JSON.parse(body ?? "{}") as Record<
              string,
              unknown
            >;
            expect(parsedBody.event_type).toBe("queued");
            expect(parsedBody.metadata).toMatchObject({
              content_job_id: CONTENT_JOB_ID,
              manual_action: "retry_publish",
              queue_job_id: getPublicationExecutionJobId(PUBLICATION_ID),
              target_platform: "youtube",
            });
            return jsonResponse({});
          }

          return new Response("not found", { status: 404 });
        },
      },
      publicationExecutionQueue,
    });
    const server = app.listen(0);

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected TCP server address.");
      }

      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/content-publications/${PUBLICATION_ID}/retry`,
        {
          body: JSON.stringify({ user_id: USER_ID }),
          headers: {
            Authorization: `Bearer ${API_SECRET}`,
            "content-type": "application/json",
          },
          method: "POST",
        },
      );
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.status).toBe("publication_retry_queued");
      expect(payload.queue_job_id).toBe(
        getPublicationExecutionJobId(PUBLICATION_ID),
      );
      expect(payload.publication_status).toBe("queued");
      expect(payload.reconciliation_status).toBe("idle");
    } finally {
      server.close();
    }
  });

  it("queues a reconciliation action when the remote post id exists", async () => {
    useSupabaseTestEnv();
    const publicationExecutionQueue = {
      async add(
        name: string,
        data: Record<string, unknown>,
        opts: { jobId?: string | number },
      ) {
        expect(name).toBe("publication.reconcile");
        expect(data).toEqual({
          content_publication_id: PUBLICATION_ID,
          target_platform: "youtube",
          user_id: USER_ID,
        });
        expect(opts.jobId).toBe(
          getPublicationReconciliationJobId(PUBLICATION_ID),
        );
        return { id: String(opts.jobId) };
      },
    };
    const app = createApp({
      apiGatewaySecret: API_SECRET,
      nodeEnv: "test",
      oauth: {
        fetchImpl: async (input, init) => {
          const requestUrl =
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.toString()
                : input.url;
          const method = init?.method ?? "GET";

          if (
            requestUrl.includes("/rest/v1/content_publications") &&
            method === "GET"
          ) {
            return jsonResponse([
              {
                content_job_id: CONTENT_JOB_ID,
                external_post_id: "youtube-video-1",
                external_url: "https://www.youtube.com/watch?v=youtube-video-1",
                id: PUBLICATION_ID,
                max_retries: 3,
                next_retry_at: null,
                platform_connection_id: PLATFORM_CONNECTION_ID,
                publication_status: "published",
                published_at: "2026-06-19T12:30:00.000Z",
                provider_failure_code: null,
                provider_failure_metadata: {},
                provider_failure_reason: null,
                reconciliation_status: "idle",
                reconcile_max_retries: 3,
                reconcile_next_retry_at: null,
                reconcile_retry_count: 1,
                remote_processing_status: null,
                remote_state: {},
                remote_status: "published",
                remote_upload_status: null,
                retry_count: 0,
                snapshot_hash: "b".repeat(64),
                target_platform: "youtube",
                updated_at: "2026-06-19T12:00:00.000Z",
                user_id: USER_ID,
              },
            ]);
          }

          if (requestUrl.includes("/rest/v1/content_jobs")) {
            return jsonResponse([
              {
                id: CONTENT_JOB_ID,
                job_type: "repurposing",
                queue_job_id: "repurposing-plan-001",
                result: {
                  captions: ["Caption one"],
                  confidence: 0.93,
                  content_job_id: CONTENT_JOB_ID,
                  descriptions: ["Description one"],
                  hashtag_sets: [["#streamos"]],
                  hook_ideas: ["Hook one"],
                  manual_review_required: true,
                  model: "gpt-4o",
                  provider: "openai",
                  queue_job_id: "repurposing-plan-001",
                  review_notes: ["Reviewed and approved."],
                  short_form_plan: "Short-form plan",
                  title_suggestions: ["Title one"],
                  warnings: ["Sanitized and review-ready."],
                },
                review_status: "approved",
                status: "done",
                stream_id: STREAM_ID,
                type: "repurposing",
                user_id: USER_ID,
              },
            ]);
          }

          if (requestUrl.includes("/rest/v1/platform_connections")) {
            return jsonResponse([
              {
                id: PLATFORM_CONNECTION_ID,
                platform: "youtube",
                scopes: [
                  "https://www.googleapis.com/auth/youtube.upload",
                  "https://www.googleapis.com/auth/youtube.readonly",
                ],
                status: "connected",
                user_id: USER_ID,
              },
            ]);
          }

          if (requestUrl.includes("/rest/v1/vod_assets")) {
            return jsonResponse([
              {
                id: "vod-asset-1",
                source_url: "https://cdn.example.com/vods/stream-123.mp4",
              },
            ]);
          }

          if (
            requestUrl.includes("/rest/v1/content_publications") &&
            method === "PATCH"
          ) {
            const parsedBody = JSON.parse(
              init?.body?.toString() ?? "{}",
            ) as Record<string, unknown>;
            expect(parsedBody.reconciliation_status).toBe("queued");
            expect(parsedBody.reconcile_retry_count).toBe(2);
            return jsonResponse([]);
          }

          if (
            requestUrl.includes("/rest/v1/content_publication_events") &&
            method === "POST"
          ) {
            const parsedBody = JSON.parse(
              init?.body?.toString() ?? "{}",
            ) as Record<string, unknown>;
            expect(parsedBody.event_type).toBe("reconcile_requested");
            expect(parsedBody.metadata).toMatchObject({
              content_job_id: CONTENT_JOB_ID,
              manual_action: "reconcile_now",
              queue_job_id: getPublicationReconciliationJobId(PUBLICATION_ID),
              target_platform: "youtube",
            });
            return jsonResponse({});
          }

          return new Response("not found", { status: 404 });
        },
      },
      publicationExecutionQueue,
    });
    const server = app.listen(0);

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected TCP server address.");
      }

      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/content-publications/${PUBLICATION_ID}/reconcile-now`,
        {
          body: JSON.stringify({ user_id: USER_ID }),
          headers: {
            Authorization: `Bearer ${API_SECRET}`,
            "content-type": "application/json",
          },
          method: "POST",
        },
      );
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.status).toBe("publication_reconcile_queued");
      expect(payload.queue_job_id).toBe(
        getPublicationReconciliationJobId(PUBLICATION_ID),
      );
      expect(payload.reconciliation_status).toBe("queued");
      expect(payload.publication_status).toBe("published");
    } finally {
      server.close();
    }
  });

  it("marks a publication as permanently failed when requested explicitly", async () => {
    useSupabaseTestEnv();
    const app = createApp({
      apiGatewaySecret: API_SECRET,
      nodeEnv: "test",
      oauth: {
        fetchImpl: async (input, init) => {
          const requestUrl =
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.toString()
                : input.url;
          const method = init?.method ?? "GET";

          if (
            requestUrl.includes("/rest/v1/content_publications") &&
            method === "GET"
          ) {
            return jsonResponse([
              {
                content_job_id: CONTENT_JOB_ID,
                external_post_id: null,
                external_url: null,
                id: PUBLICATION_ID,
                max_retries: 3,
                next_retry_at: null,
                platform_connection_id: PLATFORM_CONNECTION_ID,
                publication_status: "failed_retryable",
                published_at: null,
                provider_failure_code: "provider_rate_limited",
                provider_failure_metadata: {},
                provider_failure_reason: "Rate limited",
                reconciliation_status: "idle",
                reconcile_max_retries: 3,
                reconcile_next_retry_at: null,
                reconcile_retry_count: 0,
                remote_processing_status: null,
                remote_state: {},
                remote_status: "unknown",
                remote_upload_status: null,
                retry_count: 1,
                snapshot_hash: "b".repeat(64),
                target_platform: "youtube",
                updated_at: "2026-06-19T12:00:00.000Z",
                user_id: USER_ID,
              },
            ]);
          }

          if (requestUrl.includes("/rest/v1/content_jobs")) {
            return jsonResponse([
              {
                id: CONTENT_JOB_ID,
                job_type: "repurposing",
                queue_job_id: "repurposing-plan-001",
                result: {
                  captions: ["Caption one"],
                  confidence: 0.93,
                  content_job_id: CONTENT_JOB_ID,
                  descriptions: ["Description one"],
                  hashtag_sets: [["#streamos"]],
                  hook_ideas: ["Hook one"],
                  manual_review_required: true,
                  model: "gpt-4o",
                  provider: "openai",
                  queue_job_id: "repurposing-plan-001",
                  review_notes: ["Reviewed and approved."],
                  short_form_plan: "Short-form plan",
                  title_suggestions: ["Title one"],
                  warnings: ["Sanitized and review-ready."],
                },
                review_status: "approved",
                status: "done",
                stream_id: STREAM_ID,
                type: "repurposing",
                user_id: USER_ID,
              },
            ]);
          }

          if (requestUrl.includes("/rest/v1/platform_connections")) {
            return jsonResponse([
              {
                id: PLATFORM_CONNECTION_ID,
                platform: "youtube",
                scopes: [
                  "https://www.googleapis.com/auth/youtube.upload",
                  "https://www.googleapis.com/auth/youtube.readonly",
                ],
                status: "connected",
                user_id: USER_ID,
              },
            ]);
          }

          if (requestUrl.includes("/rest/v1/vod_assets")) {
            return jsonResponse([
              {
                id: "vod-asset-1",
                source_url: "https://cdn.example.com/vods/stream-123.mp4",
              },
            ]);
          }

          if (
            requestUrl.includes("/rest/v1/content_publications") &&
            method === "PATCH"
          ) {
            const parsedBody = JSON.parse(
              init?.body?.toString() ?? "{}",
            ) as Record<string, unknown>;
            expect(parsedBody.publication_status).toBe("failed_permanent");
            return jsonResponse([]);
          }

          if (
            requestUrl.includes("/rest/v1/content_publication_events") &&
            method === "POST"
          ) {
            const parsedBody = JSON.parse(
              init?.body?.toString() ?? "{}",
            ) as Record<string, unknown>;
            expect(parsedBody.event_type).toBe("failed_permanent");
            expect(parsedBody.metadata).toMatchObject({
              content_job_id: CONTENT_JOB_ID,
              manual_action: "mark_final_failed",
              target_platform: "youtube",
            });
            return jsonResponse({});
          }

          return new Response("not found", { status: 404 });
        },
      },
    });
    const server = app.listen(0);

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected TCP server address.");
      }

      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/content-publications/${PUBLICATION_ID}/mark-final-failed`,
        {
          body: JSON.stringify({ confirm: true, user_id: USER_ID }),
          headers: {
            Authorization: `Bearer ${API_SECRET}`,
            "content-type": "application/json",
          },
          method: "POST",
        },
      );
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.status).toBe("publication_final_failed");
      expect(payload.queue_job_id).toBeNull();
      expect(payload.publication_status).toBe("failed_permanent");
    } finally {
      server.close();
    }
  });

  it("rejects retry publish when the publication is not retryable", async () => {
    useSupabaseTestEnv();
    const app = createApp({
      apiGatewaySecret: API_SECRET,
      nodeEnv: "test",
      oauth: {
        fetchImpl: async (input) => {
          const requestUrl =
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.toString()
                : input.url;

          if (requestUrl.includes("/rest/v1/content_publications")) {
            return jsonResponse([
              {
                content_job_id: CONTENT_JOB_ID,
                external_post_id: null,
                external_url: null,
                id: PUBLICATION_ID,
                max_retries: 3,
                next_retry_at: null,
                platform_connection_id: PLATFORM_CONNECTION_ID,
                publication_status: "published",
                published_at: "2026-06-19T12:30:00.000Z",
                provider_failure_code: null,
                provider_failure_metadata: {},
                provider_failure_reason: null,
                reconciliation_status: "idle",
                reconcile_max_retries: 3,
                reconcile_next_retry_at: null,
                reconcile_retry_count: 0,
                remote_processing_status: null,
                remote_state: {},
                remote_status: "published",
                remote_upload_status: null,
                retry_count: 0,
                snapshot_hash: "b".repeat(64),
                target_platform: "youtube",
                updated_at: "2026-06-19T12:00:00.000Z",
                user_id: USER_ID,
              },
            ]);
          }

          if (requestUrl.includes("/rest/v1/content_jobs")) {
            return jsonResponse([
              {
                id: CONTENT_JOB_ID,
                job_type: "repurposing",
                queue_job_id: "repurposing-plan-001",
                result: {
                  captions: ["Caption one"],
                  confidence: 0.93,
                  content_job_id: CONTENT_JOB_ID,
                  descriptions: ["Description one"],
                  hashtag_sets: [["#streamos"]],
                  hook_ideas: ["Hook one"],
                  manual_review_required: true,
                  model: "gpt-4o",
                  provider: "openai",
                  queue_job_id: "repurposing-plan-001",
                  review_notes: ["Reviewed and approved."],
                  short_form_plan: "Short-form plan",
                  title_suggestions: ["Title one"],
                  warnings: ["Sanitized and review-ready."],
                },
                review_status: "approved",
                status: "done",
                stream_id: STREAM_ID,
                type: "repurposing",
                user_id: USER_ID,
              },
            ]);
          }

          if (requestUrl.includes("/rest/v1/platform_connections")) {
            return jsonResponse([
              {
                id: PLATFORM_CONNECTION_ID,
                platform: "youtube",
                scopes: ["https://www.googleapis.com/auth/youtube.upload"],
                status: "connected",
                user_id: USER_ID,
              },
            ]);
          }

          if (requestUrl.includes("/rest/v1/vod_assets")) {
            return jsonResponse([
              {
                id: "vod-asset-1",
                source_url: "https://cdn.example.com/vods/stream-123.mp4",
              },
            ]);
          }

          return new Response("not found", { status: 404 });
        },
      },
    });
    const server = app.listen(0);

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected TCP server address.");
      }

      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/content-publications/${PUBLICATION_ID}/retry`,
        {
          body: JSON.stringify({ user_id: USER_ID }),
          headers: {
            Authorization: `Bearer ${API_SECRET}`,
            "content-type": "application/json",
          },
          method: "POST",
        },
      );
      const payload = await response.json();

      expect(response.status).toBe(409);
      expect(payload.error).toBe("manual_action_not_allowed");
      expect(payload.block_reason).toBe("publication_in_progress");
    } finally {
      server.close();
    }
  });

  it("rejects manual actions for publications owned by another tenant", async () => {
    useSupabaseTestEnv();
    const app = createApp({
      apiGatewaySecret: API_SECRET,
      nodeEnv: "test",
      oauth: {
        fetchImpl: async (input) => {
          const requestUrl =
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.toString()
                : input.url;

          if (requestUrl.includes("/rest/v1/content_publications")) {
            return jsonResponse([]);
          }

          return new Response("not found", { status: 404 });
        },
      },
    });
    const server = app.listen(0);

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected TCP server address.");
      }

      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/content-publications/${PUBLICATION_ID}/retry`,
        {
          body: JSON.stringify({ user_id: USER_ID }),
          headers: {
            Authorization: `Bearer ${API_SECRET}`,
            "content-type": "application/json",
          },
          method: "POST",
        },
      );
      const payload = await response.json();

      expect(response.status).toBe(404);
      expect(payload.error).toBe("content_publication_not_found");
    } finally {
      server.close();
    }
  });
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json",
    },
    status: 200,
  });
}
