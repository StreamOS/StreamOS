import { afterEach, describe, expect, it } from "vitest";

import { getPublicationReconciliationJobId } from "@streamos/queue";

import { createApp } from "../app.js";

const API_SECRET = "test-api-gateway-secret-123";
const SUPABASE_URL = "https://supabase.streamos.test";
const SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const CONTENT_JOB_ID = "22222222-2222-4222-8222-222222222222";
const PUBLICATION_ID = "44444444-4444-4444-8444-444444444444";
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

describe("content publications reconciliation routes", () => {
  afterEach(() => {
    restoreEnvValue(
      "SUPABASE_SERVICE_ROLE_KEY",
      ORIGINAL_ENV.SUPABASE_SERVICE_ROLE_KEY,
    );
    restoreEnvValue("SUPABASE_URL", ORIGINAL_ENV.SUPABASE_URL);
  });

  it("returns a secret-safe observability snapshot for an approved publication", async () => {
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
                desired_visibility: "public",
                effective_visibility: "public",
                external_post_id: "youtube-video-1",
                external_url: "https://www.youtube.com/watch?v=youtube-video-1",
                id: PUBLICATION_ID,
                last_reconciled_at: "2026-06-19T13:15:00.000Z",
                publication_status: "published",
                provider_failure_code: null,
                provider_failure_metadata: {},
                provider_failure_reason: null,
                reconciliation_status: "reconciled",
                reconcile_max_retries: 3,
                reconcile_next_retry_at: null,
                reconcile_retry_count: 1,
                remote_processing_status: "succeeded",
                remote_state: {
                  remotePostId: "youtube-video-1",
                  remoteStatus: "published",
                },
                remote_status: "published",
                remote_upload_status: "processed",
                snapshot_hash: "b".repeat(64),
                target_platform: "youtube",
                updated_at: "2026-06-19T13:15:00.000Z",
                user_id: USER_ID,
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

            expect(parsedBody.reconciliation_status).toBe("queued");
            expect(parsedBody.reconcile_max_retries).toBe(3);
            expect(parsedBody.provider_failure_code).toBeNull();
            expect(parsedBody.remote_status).toBeUndefined();
            return jsonResponse([]);
          }

          if (
            requestUrl.includes("/rest/v1/content_publication_events") &&
            method === "GET"
          ) {
            return jsonResponse([
              {
                actor_id: USER_ID,
                content_publication_id: PUBLICATION_ID,
                created_at: "2026-06-19T13:10:00.000Z",
                event_type: "reconcile_requested",
                id: "55555555-5555-4555-8555-555555555555",
                metadata: {
                  queue_job_id:
                    getPublicationReconciliationJobId(PUBLICATION_ID),
                },
                previous_publication_status: "published",
                publication_status: "published",
                source: "api-gateway",
                user_id: USER_ID,
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
        `http://127.0.0.1:${address.port}/api/content-publications/${PUBLICATION_ID}/observability?user_id=${USER_ID}`,
        {
          headers: {
            Authorization: `Bearer ${API_SECRET}`,
          },
        },
      );
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.status).toBe("publication_observability_ready");
      expect(payload.content_publication_id).toBe(PUBLICATION_ID);
      expect(payload.reconciliation_status).toBe("reconciled");
      expect(payload.remote_status).toBe("published");
      expect(payload.remote_state).toMatchObject({
        remotePostId: "youtube-video-1",
        remoteStatus: "published",
      });
      expect(payload.events).toHaveLength(1);
      expect(payload.events[0]).toMatchObject({
        event_type: "reconcile_requested",
        source: "api-gateway",
      });
      expect(JSON.stringify(payload)).not.toContain("test-service-role-key");
      expect(JSON.stringify(payload)).not.toContain("refresh_token");
    } finally {
      server.close();
    }
  });

  it("queues a TikTok publication reconciliation when a remote publish id exists", async () => {
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
                desired_visibility: "public",
                effective_visibility: "public",
                external_post_id: null,
                external_url: null,
                id: PUBLICATION_ID,
                last_reconciled_at: null,
                publication_status: "published",
                provider_failure_code: null,
                provider_failure_metadata: {},
                provider_failure_reason: null,
                reconciliation_status: "idle",
                reconcile_max_retries: 3,
                reconcile_next_retry_at: null,
                reconcile_retry_count: 0,
                remote_processing_status: "pending",
                remote_state: {
                  providerPublishId: "tiktok-publish-1",
                  remotePostId: "tiktok-publish-1",
                  remoteStatus: "published",
                },
                remote_status: "published",
                remote_upload_status: "processed",
                snapshot_hash: "b".repeat(64),
                target_platform: "tiktok",
                updated_at: "2026-06-19T13:15:00.000Z",
                user_id: USER_ID,
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

            expect(parsedBody.reconciliation_status).toBe("queued");
            expect(parsedBody.reconcile_max_retries).toBe(3);
            expect(parsedBody.provider_failure_code).toBeNull();
            expect(parsedBody.remote_status).toBeUndefined();
            return jsonResponse([]);
          }

          if (
            requestUrl.includes("/rest/v1/content_publication_events") &&
            method === "GET"
          ) {
            return jsonResponse([
              {
                actor_id: USER_ID,
                content_publication_id: PUBLICATION_ID,
                created_at: "2026-06-19T13:10:00.000Z",
                event_type: "reconcile_requested",
                id: "55555555-5555-4555-8555-555555555555",
                metadata: {
                  queue_job_id:
                    getPublicationReconciliationJobId(PUBLICATION_ID),
                },
                previous_publication_status: "published",
                publication_status: "published",
                source: "api-gateway",
                user_id: USER_ID,
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
        `http://127.0.0.1:${address.port}/api/content-publications/${PUBLICATION_ID}/observability?user_id=${USER_ID}`,
        {
          headers: {
            Authorization: `Bearer ${API_SECRET}`,
          },
        },
      );
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.status).toBe("publication_observability_ready");
      expect(payload.target_platform).toBe("tiktok");
      expect(payload.remote_state).toMatchObject({
        providerPublishId: "tiktok-publish-1",
        remotePostId: "tiktok-publish-1",
        remoteStatus: "published",
      });
      expect(payload.events).toHaveLength(1);
      expect(payload.events[0]).toMatchObject({
        event_type: "reconcile_requested",
        source: "api-gateway",
      });
    } finally {
      server.close();
    }
  });

  it("queues publication reconciliation when a remote post id exists", async () => {
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
        requests.push({
          body: JSON.stringify({ name, data, jobId: opts.jobId }),
          method: "QUEUE",
          url: "bullmq://publication",
        });

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
          const body = typeof init?.body === "string" ? init.body : null;
          requests.push({ body, method, url: requestUrl });

          if (
            requestUrl.includes("/rest/v1/content_publications") &&
            method === "GET"
          ) {
            return jsonResponse([
              {
                content_job_id: CONTENT_JOB_ID,
                desired_visibility: "public",
                effective_visibility: "public",
                external_post_id: "youtube-video-1",
                external_url: "https://www.youtube.com/watch?v=youtube-video-1",
                id: PUBLICATION_ID,
                last_reconciled_at: null,
                publication_status: "published",
                provider_failure_code: null,
                provider_failure_metadata: {},
                provider_failure_reason: null,
                reconciliation_status: "idle",
                reconcile_max_retries: 0,
                reconcile_next_retry_at: null,
                reconcile_retry_count: 0,
                remote_processing_status: null,
                remote_state: {
                  providerPublishId: "youtube-video-1",
                  remotePostId: "youtube-video-1",
                  remoteStatus: "published",
                },
                remote_status: "unknown",
                remote_upload_status: null,
                snapshot_hash: "b".repeat(64),
                target_platform: "youtube",
                updated_at: "2026-06-19T13:15:00.000Z",
                user_id: USER_ID,
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

            expect(parsedBody.reconciliation_status).toBe("queued");
            expect(parsedBody.reconcile_max_retries).toBe(3);
            expect(parsedBody.provider_failure_code).toBeNull();
            expect(parsedBody.remote_status).toBeUndefined();
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

            expect(parsedBody.event_type).toBe("reconcile_requested");
            expect(parsedBody.metadata).toMatchObject({
              content_job_id: CONTENT_JOB_ID,
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
        `http://127.0.0.1:${address.port}/api/content-publications/${PUBLICATION_ID}/reconcile`,
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
      expect(
        requests.some((request) => request.url === "bullmq://publication"),
      ).toBe(true);
    } finally {
      server.close();
    }
  });

  it("marks reconciliation as skipped when the remote post id is missing", async () => {
    useSupabaseTestEnv();
    let queueCalls = 0;
    const publicationExecutionQueue = {
      async add() {
        queueCalls += 1;
        return { id: "unexpected" };
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
                desired_visibility: "public",
                effective_visibility: null,
                external_post_id: null,
                external_url: null,
                id: PUBLICATION_ID,
                last_reconciled_at: null,
                publication_status: "published",
                provider_failure_code: null,
                provider_failure_metadata: {},
                provider_failure_reason: null,
                reconciliation_status: "idle",
                reconcile_max_retries: 0,
                reconcile_next_retry_at: null,
                reconcile_retry_count: 0,
                remote_processing_status: null,
                remote_state: {},
                remote_status: "unknown",
                remote_upload_status: null,
                snapshot_hash: "b".repeat(64),
                target_platform: "youtube",
                updated_at: "2026-06-19T13:15:00.000Z",
                user_id: USER_ID,
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

            expect(parsedBody.reconciliation_status).toBe("skipped");
            expect(parsedBody.provider_failure_code).toBe(
              "missing_remote_post_id",
            );
            return jsonResponse([]);
          }

          if (
            requestUrl.includes("/rest/v1/content_publication_events") &&
            method === "POST"
          ) {
            const parsedBody = JSON.parse(
              init?.body?.toString() ?? "{}",
            ) as Record<string, unknown>;

            expect(parsedBody.event_type).toBe("reconcile_skipped");
            expect(parsedBody.metadata).toMatchObject({
              content_job_id: CONTENT_JOB_ID,
              reason: "missing_remote_post_id",
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
        `http://127.0.0.1:${address.port}/api/content-publications/${PUBLICATION_ID}/reconcile`,
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
      expect(payload.status).toBe("publication_reconcile_skipped");
      expect(payload.reconciliation_status).toBe("skipped");
      expect(payload.queue_job_id).toBeNull();
      expect(queueCalls).toBe(0);
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
