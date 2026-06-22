import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../app.js";
import type { PublicationExecutionQueue } from "../jobs/publicationExecutionQueue.js";

const API_SECRET = "test-api-gateway-secret-123";
const SUPABASE_URL = "https://supabase.streamos.test";
const SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const FANOUT_ID = "55555555-5555-4555-8555-555555555555";
const TARGET_ID = "66666666-6666-4666-8666-666666666666";
const BLOCKED_TARGET_ID = "77777777-7777-4777-8777-777777777777";
const PUBLICATION_ID = "88888888-8888-4888-8888-888888888888";
const CONTENT_JOB_ID = "99999999-9999-4999-8999-999999999999";
const CONNECTION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const QUEUED_JOB_ID = "publication-retry-queued-001";
const ORIGINAL_ENV = {
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL: process.env.SUPABASE_URL,
};

describe("content publications fanout controls", () => {
  afterEach(() => {
    restoreEnvValue(
      "SUPABASE_SERVICE_ROLE_KEY",
      ORIGINAL_ENV.SUPABASE_SERVICE_ROLE_KEY,
    );
    restoreEnvValue("SUPABASE_URL", ORIGINAL_ENV.SUPABASE_URL);
  });

  it("refreshes the parent fanout aggregate without touching provider execution", async () => {
    useSupabaseTestEnv();
    const requests: Array<{
      body: string | null;
      method: string;
      url: string;
    }> = [];
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
            requestUrl.includes("/rest/v1/content_publication_fanouts") &&
            method === "GET"
          ) {
            return jsonResponse([
              {
                blocked_target_count: 1,
                content_job_id: CONTENT_JOB_ID,
                created_at: "2026-06-20T12:00:00.000Z",
                fanout_policy: "prepare_valid_targets",
                fanout_status: "partially_validated",
                id: FANOUT_ID,
                last_action_at: null,
                last_action_key: null,
                last_action_result: null,
                last_aggregate_refreshed_at: null,
                requested_at: "2026-06-20T12:00:00.000Z",
                requested_by: USER_ID,
                request_intent_hash:
                  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                review_status_at_request: "approved",
                snapshot: {},
                snapshot_hash:
                  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                target_count: 2,
                updated_at: "2026-06-20T12:00:00.000Z",
                user_id: USER_ID,
                validated_at: "2026-06-20T12:00:00.000Z",
                validated_target_count: 1,
              },
            ]);
          }

          if (
            requestUrl.includes(
              "/rest/v1/content_publication_fanout_targets",
            ) &&
            method === "GET"
          ) {
            return jsonResponse([
              {
                block_message: null,
                block_reason: null,
                capability_snapshot: {},
                capability_version: "1.0.0",
                content_publication_fanout_id: FANOUT_ID,
                content_publication_id: PUBLICATION_ID,
                created_at: "2026-06-20T12:00:00.000Z",
                id: TARGET_ID,
                last_action_at: null,
                last_action_key: null,
                last_action_result: null,
                last_block_reason: null,
                last_rechecked_at: null,
                platform_connection_id: CONNECTION_ID,
                provider_overrides: {},
                request_intent_hash:
                  "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
                target_platform: "youtube",
                target_status: "validated",
                updated_at: "2026-06-20T12:00:00.000Z",
                user_id: USER_ID,
                validated_at: null,
              },
              {
                block_message: null,
                block_reason: null,
                capability_snapshot: {},
                capability_version: "1.0.0",
                content_publication_fanout_id: FANOUT_ID,
                content_publication_id: null,
                created_at: "2026-06-20T12:00:00.000Z",
                id: BLOCKED_TARGET_ID,
                last_action_at: null,
                last_action_key: null,
                last_action_result: null,
                last_block_reason: null,
                last_rechecked_at: null,
                platform_connection_id: CONNECTION_ID,
                provider_overrides: {},
                request_intent_hash:
                  "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
                target_platform: "tiktok",
                target_status: "blocked",
                updated_at: "2026-06-20T12:00:00.000Z",
                user_id: USER_ID,
                validated_at: null,
              },
            ]);
          }

          if (
            requestUrl.includes("/rest/v1/content_publication_fanout_events")
          ) {
            return jsonResponse([]);
          }

          if (
            requestUrl.includes("/rest/v1/content_publication_fanouts") &&
            method === "PATCH"
          ) {
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
        `http://127.0.0.1:${address.port}/api/content-publications/fanouts/${FANOUT_ID}/refresh`,
        {
          body: JSON.stringify({
            user_id: USER_ID,
          }),
          headers: {
            Authorization: `Bearer ${API_SECRET}`,
            "content-type": "application/json",
          },
          method: "POST",
        },
      );
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.status).toBe("publication_fanout_refreshed");
      expect(payload.content_publication_fanout_id).toBe(FANOUT_ID);
      expect(payload.fanout_status).toBe("partially_validated");
      expect(payload.blocked_target_count).toBe(1);
      expect(payload.validated_target_count).toBe(1);
      expect(payload.target_count).toBe(2);
      expect(payload.last_aggregate_refreshed_at).toEqual(expect.any(String));
      expect(
        requests.some((request) =>
          request.url.includes("/rest/v1/content_publication_fanout_events"),
        ),
      ).toBe(true);
    } finally {
      server.close();
    }
  });

  it("rejects rechecks when the approved repurposing job is not ready yet", async () => {
    useSupabaseTestEnv();
    const requests: Array<{
      body: string | null;
      method: string;
      url: string;
    }> = [];
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
            requestUrl.includes("/rest/v1/content_publication_fanouts") &&
            method === "GET"
          ) {
            return jsonResponse([
              {
                blocked_target_count: 1,
                content_job_id: CONTENT_JOB_ID,
                created_at: "2026-06-20T12:00:00.000Z",
                fanout_policy: "prepare_valid_targets",
                fanout_status: "partially_validated",
                id: FANOUT_ID,
                last_action_at: null,
                last_action_key: null,
                last_action_result: null,
                last_aggregate_refreshed_at: null,
                requested_at: "2026-06-20T12:00:00.000Z",
                requested_by: USER_ID,
                request_intent_hash:
                  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                review_status_at_request: "approved",
                snapshot: {
                  approvedBundle: {
                    content_job_id: CONTENT_JOB_ID,
                    queue_job_id: "queue-job-1",
                    manual_review_required: true,
                    captions: [],
                    confidence: 0.9,
                    descriptions: [],
                    hashtag_sets: [],
                    hook_ideas: [],
                    model: "gpt-4o",
                    provider: "openai",
                    review_notes: [],
                    short_form_plan: "Plan",
                    title_suggestions: [],
                    warnings: [],
                  },
                  contentJob: {
                    reviewStatus: "needs_review",
                    status: "running",
                    streamId: "stream-1",
                  },
                },
                snapshot_hash:
                  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                target_count: 1,
                updated_at: "2026-06-20T12:00:00.000Z",
                user_id: USER_ID,
                validated_at: null,
                validated_target_count: 0,
              },
            ]);
          }

          if (
            requestUrl.includes(
              "/rest/v1/content_publication_fanout_targets",
            ) &&
            method === "GET"
          ) {
            return jsonResponse([
              {
                block_message: null,
                block_reason: null,
                capability_snapshot: {},
                capability_version: "1.0.0",
                content_publication_fanout_id: FANOUT_ID,
                content_publication_id: null,
                created_at: "2026-06-20T12:00:00.000Z",
                id: TARGET_ID,
                last_action_at: null,
                last_action_key: null,
                last_action_result: null,
                last_block_reason: null,
                last_rechecked_at: null,
                platform_connection_id: CONNECTION_ID,
                provider_overrides: {},
                request_intent_hash:
                  "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
                target_platform: "youtube",
                target_status: "blocked",
                updated_at: "2026-06-20T12:00:00.000Z",
                user_id: USER_ID,
                validated_at: null,
              },
            ]);
          }

          if (
            requestUrl.includes("/rest/v1/content_jobs") &&
            method === "GET"
          ) {
            return jsonResponse([
              {
                channel_id: null,
                id: CONTENT_JOB_ID,
                job_type: "repurposing",
                queue_job_id: "repurposing-plan-001",
                result: {
                  captions: [],
                  confidence: 0.9,
                  content_job_id: CONTENT_JOB_ID,
                  descriptions: [],
                  hashtag_sets: [],
                  hook_ideas: [],
                  manual_review_required: true,
                  model: "gpt-4o",
                  provider: "openai",
                  queue_job_id: "repurposing-plan-001",
                  review_notes: [],
                  short_form_plan: "Plan",
                  title_suggestions: [],
                  warnings: [],
                },
                review_status: "needs_review",
                status: "running",
                stream_id: "stream-1",
                type: "repurposing",
                user_id: USER_ID,
              },
            ]);
          }

          if (
            requestUrl.includes("/rest/v1/platform_connections") &&
            method === "GET"
          ) {
            return jsonResponse([
              {
                channel_id: null,
                connected_at: "2026-06-20T12:00:00.000Z",
                created_at: "2026-06-20T12:00:00.000Z",
                creator_id: "creator-1",
                expires_at: null,
                id: CONNECTION_ID,
                metadata: {},
                platform: "youtube",
                provider_account_id: "provider-account-1",
                provider_profile: {},
                refresh_token_ciphertext: null,
                scopes: [
                  "https://www.googleapis.com/auth/youtube.upload",
                  "https://www.googleapis.com/auth/youtube.readonly",
                ],
                status: "connected",
                token_version: 1,
                updated_at: "2026-06-20T12:00:00.000Z",
                user_id: USER_ID,
              },
            ]);
          }

          if (
            requestUrl.includes("/rest/v1/content_publication_fanout_events")
          ) {
            return jsonResponse([]);
          }

          if (
            requestUrl.includes(
              "/rest/v1/content_publication_fanout_targets",
            ) &&
            method === "PATCH"
          ) {
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
        `http://127.0.0.1:${address.port}/api/content-publications/fanouts/${FANOUT_ID}/targets/${TARGET_ID}/recheck`,
        {
          body: JSON.stringify({
            user_id: USER_ID,
          }),
          headers: {
            Authorization: `Bearer ${API_SECRET}`,
            "content-type": "application/json",
          },
          method: "POST",
        },
      );
      const payload = await response.json();

      expect(response.status).toBe(409);
      expect(payload.status).toBe("publication_fanout_target_recheck_blocked");
      expect(payload.block_reason).toBe("repurposing_job_not_approved");
      expect(
        requests.some((request) =>
          request.url.includes("/rest/v1/content_publication_fanout_events"),
        ),
      ).toBe(true);
      expect(
        requests.some(
          (request) =>
            request.url.includes(
              "/rest/v1/content_publication_fanout_targets",
            ) && request.method === "PATCH",
        ),
      ).toBe(true);
    } finally {
      server.close();
    }
  });

  it("queues a retry for a retryable child publication and records the child action", async () => {
    useSupabaseTestEnv();
    const requests: Array<{
      body: string | null;
      method: string;
      url: string;
    }> = [];
    const queueAdd = vi.fn(async () => ({ id: QUEUED_JOB_ID }));
    const publicationExecutionQueue: PublicationExecutionQueue = {
      add: queueAdd,
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
            requestUrl.includes("/rest/v1/content_publication_fanouts") &&
            method === "GET"
          ) {
            return jsonResponse([
              {
                blocked_target_count: 0,
                content_job_id: CONTENT_JOB_ID,
                created_at: "2026-06-20T12:00:00.000Z",
                fanout_policy: "prepare_valid_targets",
                fanout_status: "validated",
                id: FANOUT_ID,
                last_action_at: null,
                last_action_key: null,
                last_action_result: null,
                last_aggregate_refreshed_at: null,
                requested_at: "2026-06-20T12:00:00.000Z",
                requested_by: USER_ID,
                request_intent_hash:
                  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                review_status_at_request: "approved",
                snapshot: {
                  approvedBundle: {
                    content_job_id: CONTENT_JOB_ID,
                    queue_job_id: "queue-job-1",
                    manual_review_required: true,
                    captions: [],
                    confidence: 0.9,
                    descriptions: [],
                    hashtag_sets: [],
                    hook_ideas: [],
                    model: "gpt-4o",
                    provider: "openai",
                    review_notes: [],
                    short_form_plan: "Plan",
                    title_suggestions: [],
                    warnings: [],
                  },
                  contentJob: {
                    queueJobId: "queue-job-1",
                    reviewStatus: "approved",
                    status: "done",
                    streamId: "stream-1",
                  },
                },
                snapshot_hash:
                  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                target_count: 1,
                updated_at: "2026-06-20T12:00:00.000Z",
                user_id: USER_ID,
                validated_at: "2026-06-20T12:00:00.000Z",
                validated_target_count: 1,
              },
            ]);
          }

          if (
            requestUrl.includes(
              "/rest/v1/content_publication_fanout_targets",
            ) &&
            method === "GET"
          ) {
            return jsonResponse([
              {
                block_message: null,
                block_reason: null,
                capability_snapshot: {},
                capability_version: "1.0.0",
                content_publication_fanout_id: FANOUT_ID,
                content_publication_id: PUBLICATION_ID,
                created_at: "2026-06-20T12:00:00.000Z",
                id: TARGET_ID,
                last_action_at: null,
                last_action_key: null,
                last_action_result: null,
                last_block_reason: null,
                last_rechecked_at: null,
                platform_connection_id: CONNECTION_ID,
                provider_overrides: {},
                request_intent_hash:
                  "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
                target_platform: "youtube",
                target_status: "validated",
                updated_at: "2026-06-20T12:00:00.000Z",
                user_id: USER_ID,
                validated_at: null,
              },
            ]);
          }

          if (
            requestUrl.includes("/rest/v1/content_publications") &&
            method === "GET"
          ) {
            return jsonResponse([
              {
                capability_snapshot: {},
                capability_version: "1.0.0",
                content_job_id: CONTENT_JOB_ID,
                created_at: "2026-06-20T12:00:00.000Z",
                desired_visibility: "public",
                effective_visibility: "public",
                external_post_id: null,
                external_url: "https://www.youtube.com/watch?v=retry-safe",
                id: PUBLICATION_ID,
                last_reconciled_at: null,
                max_retries: 3,
                next_retry_at: null,
                platform_connection_id: CONNECTION_ID,
                provider_failure_code: "provider_rate_limited",
                provider_failure_metadata: {},
                provider_failure_reason: "Rate limited",
                provider_overrides: {},
                published_at: null,
                publication_status: "failed_retryable",
                reconciliation_status: "idle",
                reconcile_max_retries: 3,
                reconcile_next_retry_at: null,
                reconcile_retry_count: 0,
                remote_processing_status: null,
                remote_state: {},
                remote_status: "missing",
                remote_upload_status: null,
                request_intent_hash:
                  "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
                requested_at: "2026-06-20T12:00:00.000Z",
                requested_by: USER_ID,
                retry_count: 1,
                snapshot: {},
                snapshot_hash:
                  "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
                target_platform: "youtube",
                updated_at: "2026-06-20T12:00:00.000Z",
                user_id: USER_ID,
                validated_at: "2026-06-20T12:00:00.000Z",
                validation_code: "validated",
                validation_message: "Publish request validated by the gateway.",
              },
            ]);
          }

          if (
            requestUrl.includes("/rest/v1/content_jobs") &&
            method === "GET"
          ) {
            return jsonResponse([
              {
                channel_id: null,
                id: CONTENT_JOB_ID,
                job_type: "repurposing",
                queue_job_id: "queue-job-1",
                result: {
                  captions: [],
                  confidence: 0.9,
                  content_job_id: CONTENT_JOB_ID,
                  descriptions: [],
                  hashtag_sets: [],
                  hook_ideas: [],
                  manual_review_required: true,
                  model: "gpt-4o",
                  provider: "openai",
                  queue_job_id: "queue-job-1",
                  review_notes: [],
                  short_form_plan: "Plan",
                  title_suggestions: [],
                  warnings: [],
                },
                review_status: "approved",
                status: "done",
                stream_id: "stream-1",
                type: "repurposing",
                user_id: USER_ID,
              },
            ]);
          }

          if (
            requestUrl.includes("/rest/v1/platform_connections") &&
            method === "GET"
          ) {
            return jsonResponse([
              {
                channel_id: null,
                connected_at: "2026-06-20T12:00:00.000Z",
                created_at: "2026-06-20T12:00:00.000Z",
                creator_id: "creator-1",
                expires_at: null,
                id: CONNECTION_ID,
                metadata: {},
                platform: "youtube",
                provider_account_id: "provider-account-1",
                provider_profile: {},
                refresh_token_ciphertext: null,
                scopes: [
                  "https://www.googleapis.com/auth/youtube.upload",
                  "https://www.googleapis.com/auth/youtube.readonly",
                ],
                status: "connected",
                token_version: 1,
                updated_at: "2026-06-20T12:00:00.000Z",
                user_id: USER_ID,
              },
            ]);
          }

          if (requestUrl.includes("/rest/v1/vod_assets") && method === "GET") {
            return jsonResponse([
              {
                created_at: "2026-06-20T12:00:00.000Z",
                duration_seconds: 3600,
                external_asset_id: null,
                id: "vod-asset-1",
                ingested_at: "2026-06-20T12:00:00.000Z",
                metadata: {},
                platform: "youtube",
                source_url: "https://cdn.example.com/vods/retry.mp4",
                status: "transcribed",
                stream_id: "stream-1",
                transcribed_at: null,
                updated_at: "2026-06-20T12:00:00.000Z",
                user_id: USER_ID,
              },
            ]);
          }

          if (
            requestUrl.includes("/rest/v1/content_publication_fanout_events") ||
            requestUrl.includes("/rest/v1/content_publication_events") ||
            (requestUrl.includes("/rest/v1/content_publications") &&
              method === "PATCH") ||
            (requestUrl.includes("/rest/v1/content_publication_fanouts") &&
              method === "PATCH") ||
            (requestUrl.includes(
              "/rest/v1/content_publication_fanout_targets",
            ) &&
              method === "PATCH")
          ) {
            return jsonResponse([]);
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
        `http://127.0.0.1:${address.port}/api/content-publications/fanouts/${FANOUT_ID}/children/${PUBLICATION_ID}/retry`,
        {
          body: JSON.stringify({
            user_id: USER_ID,
          }),
          headers: {
            Authorization: `Bearer ${API_SECRET}`,
            "content-type": "application/json",
          },
          method: "POST",
        },
      );
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.status).toBe("publication_fanout_child_retry_queued");
      expect(payload.queue_job_id).toBe(QUEUED_JOB_ID);
      expect(
        requests.some((request) =>
          request.url.includes("/rest/v1/content_publication_fanout_events"),
        ),
      ).toBe(true);
      expect(queueAdd).toHaveBeenCalledTimes(1);
      expect(queueAdd.mock.calls[0]?.[0]).toBe("publication.publish");
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

function restoreEnvValue(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}

function useSupabaseTestEnv() {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SUPABASE_SERVICE_ROLE_KEY;
}
