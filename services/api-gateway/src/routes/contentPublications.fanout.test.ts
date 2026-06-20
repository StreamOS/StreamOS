import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../app.js";

const API_SECRET = "test-api-gateway-secret-123";
const SUPABASE_URL = "https://supabase.streamos.test";
const SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const CONTENT_JOB_ID = "22222222-2222-4222-8222-222222222222";
const YOUTUBE_CONNECTION_ID = "33333333-3333-4333-8333-333333333333";
const TIKTOK_CONNECTION_ID = "44444444-4444-4444-8444-444444444444";
const FANOUT_ID = "55555555-5555-4555-8555-555555555555";
const YOUTUBE_PUBLICATION_ID = "66666666-6666-4666-8666-666666666666";
const TIKTOK_PUBLICATION_ID = "77777777-7777-4777-8777-777777777777";
const ORIGINAL_ENV = {
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL: process.env.SUPABASE_URL,
};

describe("content publications fanout route", () => {
  afterEach(() => {
    restoreEnvValue(
      "SUPABASE_SERVICE_ROLE_KEY",
      ORIGINAL_ENV.SUPABASE_SERVICE_ROLE_KEY,
    );
    restoreEnvValue("SUPABASE_URL", ORIGINAL_ENV.SUPABASE_URL);
  });

  it("prepares validated publication children for a multi-target fanout request", async () => {
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

          if (requestUrl.includes("/rest/v1/content_jobs")) {
            return jsonResponse([
              {
                channel_id: null,
                id: CONTENT_JOB_ID,
                job_type: "repurposing",
                queue_job_id: "repurposing-plan-001",
                result: {
                  captions: ["Caption one"],
                  confidence: 0.93,
                  content_job_id: CONTENT_JOB_ID,
                  descriptions: ["Description one"],
                  hashtag_sets: [["#streamos", "#repurposing"]],
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
                stream_id: "88888888-8888-4888-8888-888888888888",
                type: "repurposing",
                user_id: USER_ID,
              },
            ]);
          }

          if (requestUrl.includes("/rest/v1/platform_connections")) {
            if (requestUrl.includes(YOUTUBE_CONNECTION_ID)) {
              return jsonResponse([
                {
                  id: YOUTUBE_CONNECTION_ID,
                  metadata: {},
                  platform: "youtube",
                  provider_profile: {},
                  scopes: [
                    "https://www.googleapis.com/auth/youtube.upload",
                    "https://www.googleapis.com/auth/youtube.readonly",
                  ],
                  status: "connected",
                  user_id: USER_ID,
                },
              ]);
            }

            if (requestUrl.includes(TIKTOK_CONNECTION_ID)) {
              return jsonResponse([
                {
                  id: TIKTOK_CONNECTION_ID,
                  metadata: {},
                  platform: "tiktok",
                  provider_profile: {},
                  scopes: ["video.publish"],
                  status: "connected",
                  user_id: USER_ID,
                },
              ]);
            }
          }

          if (requestUrl.includes("/rest/v1/content_publications")) {
            if (method === "GET") {
              return jsonResponse([]);
            }
          }

          if (
            requestUrl.includes(
              "/rest/v1/rpc/record_content_publication_request",
            )
          ) {
            const parsedBody = JSON.parse(body ?? "{}") as Record<
              string,
              unknown
            >;
            const targetPlatform = parsedBody.p_target_platform;

            expect(
              targetPlatform === "youtube" || targetPlatform === "tiktok",
            ).toBe(true);
            expect(parsedBody.p_user_id).toBe(USER_ID);
            expect(parsedBody.p_requested_by).toBe(USER_ID);
            expect(parsedBody.p_request_intent_hash).toEqual(
              expect.stringMatching(/^[a-f0-9]{64}$/),
            );
            expect(parsedBody.p_snapshot_hash).toEqual(
              expect.stringMatching(/^[a-f0-9]{64}$/),
            );
            expect(parsedBody.p_snapshot).toMatchObject({
              capability: {
                capabilityVersion: "2026.06.p3.2.v1",
              },
              contentJob: {
                id: CONTENT_JOB_ID,
                reviewStatus: "approved",
              },
            });
            expect(JSON.stringify(parsedBody.p_snapshot)).not.toContain(
              "access_token",
            );

            return jsonResponse({
              capability_snapshot: parsedBody.p_capability_snapshot,
              capability_version: "2026.06.p3.2.v1",
              content_job_id: CONTENT_JOB_ID,
              external_post_id: null,
              external_url: null,
              id:
                targetPlatform === "youtube"
                  ? YOUTUBE_PUBLICATION_ID
                  : TIKTOK_PUBLICATION_ID,
              max_retries: 0,
              next_retry_at: null,
              platform_connection_id:
                targetPlatform === "youtube"
                  ? YOUTUBE_CONNECTION_ID
                  : TIKTOK_CONNECTION_ID,
              publication_status: "validated",
              provider_failure_code: null,
              provider_failure_metadata: {},
              provider_failure_reason: null,
              provider_overrides: parsedBody.p_provider_overrides,
              reconciliation_status: "idle",
              reconcile_max_retries: 3,
              reconcile_next_retry_at: null,
              reconcile_retry_count: 0,
              remote_processing_status: null,
              remote_state: {},
              remote_status: "unknown",
              remote_upload_status: null,
              request_intent_hash: String(parsedBody.p_request_intent_hash),
              requested_at: "2026-06-20T12:00:00.000Z",
              requested_by: USER_ID,
              retry_count: 0,
              snapshot: parsedBody.p_snapshot,
              snapshot_hash: String(parsedBody.p_snapshot_hash),
              target_platform: targetPlatform,
              user_id: USER_ID,
              validated_at: "2026-06-20T12:00:00.000Z",
              validation_code: "validated",
              validation_message: "Publish request validated by the gateway.",
            });
          }

          if (
            requestUrl.includes("/rest/v1/content_publication_fanouts") &&
            method === "POST"
          ) {
            const parsedBody = JSON.parse(body ?? "{}") as Record<
              string,
              unknown
            >;

            expect(parsedBody.fanout_status).toBe("validated");
            expect(parsedBody.target_count).toBe(2);
            expect(parsedBody.validated_target_count).toBe(2);
            expect(parsedBody.blocked_target_count).toBe(0);
            expect(parsedBody.request_intent_hash).toEqual(
              expect.stringMatching(/^[a-f0-9]{64}$/),
            );
            expect(parsedBody.snapshot).toMatchObject({
              capabilityVersion: "2026.06.p3.2.v1",
              contentJob: {
                id: CONTENT_JOB_ID,
                reviewStatus: "approved",
              },
              fanoutPolicy: "prepare_valid_targets",
            });

            return jsonResponse([
              {
                ...parsedBody,
                created_at: "2026-06-20T12:00:00.000Z",
                id: FANOUT_ID,
                updated_at: "2026-06-20T12:00:00.000Z",
              },
            ]);
          }

          if (
            requestUrl.includes(
              "/rest/v1/content_publication_fanout_targets",
            ) &&
            method === "POST"
          ) {
            const parsedBody = JSON.parse(body ?? "{}") as Record<
              string,
              unknown
            >;

            expect(parsedBody.target_status).toBe("validated");
            expect(parsedBody.content_publication_id).toEqual(
              expect.stringMatching(/^[a-f0-9-]{36}$/),
            );

            return jsonResponse([
              {
                ...parsedBody,
                created_at: "2026-06-20T12:00:00.000Z",
                id:
                  String(parsedBody.target_platform) === "youtube"
                    ? "88888888-8888-4888-8888-888888888888"
                    : "99999999-9999-4999-8999-999999999999",
                updated_at: "2026-06-20T12:00:00.000Z",
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
        `http://127.0.0.1:${address.port}/api/content-publications/fanout`,
        {
          body: JSON.stringify({
            content_job_id: CONTENT_JOB_ID,
            targets: [
              {
                platform_connection_id: YOUTUBE_CONNECTION_ID,
                provider_overrides: {
                  category_id: "22",
                },
                target_platform: "youtube",
              },
              {
                platform_connection_id: TIKTOK_CONNECTION_ID,
                provider_overrides: {
                  allow_comments: true,
                },
                target_platform: "tiktok",
              },
            ],
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
      expect(payload.status).toBe("publication_fanout_validated");
      expect(payload.fanout_status).toBe("validated");
      expect(payload.target_count).toBe(2);
      expect(payload.validated_target_count).toBe(2);
      expect(payload.blocked_target_count).toBe(0);
      expect(payload.targets).toHaveLength(2);
      expect(payload.targets[0].target_status).toBe("validated");
      expect(payload.targets[1].target_status).toBe("validated");
      expect(payload.request_intent_hash).toEqual(
        expect.stringMatching(/^[a-f0-9]{64}$/),
      );
      expect(payload.snapshot_hash).toEqual(
        expect.stringMatching(/^[a-f0-9]{64}$/),
      );

      const fanoutWrites = requests.filter((request) =>
        request.url.includes("/rest/v1/content_publication_fanouts"),
      );
      const targetWrites = requests.filter((request) =>
        request.url.includes("/rest/v1/content_publication_fanout_targets"),
      );
      const publicationRpcs = requests.filter((request) =>
        request.url.includes("/rest/v1/rpc/record_content_publication_request"),
      );

      expect(fanoutWrites).toHaveLength(1);
      expect(targetWrites).toHaveLength(2);
      expect(publicationRpcs).toHaveLength(2);
      expect(JSON.stringify(requests)).not.toContain("access_token");
      expect(JSON.stringify(requests)).not.toContain("refresh_token");
    } finally {
      server.close();
    }
  });

  it("records blocked fanout targets separately when one target lacks publish scopes", async () => {
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

          if (requestUrl.includes("/rest/v1/content_jobs")) {
            return jsonResponse([
              {
                channel_id: null,
                id: CONTENT_JOB_ID,
                job_type: "repurposing",
                queue_job_id: "repurposing-plan-001",
                result: {
                  captions: ["Caption one"],
                  confidence: 0.93,
                  content_job_id: CONTENT_JOB_ID,
                  descriptions: ["Description one"],
                  hashtag_sets: [["#streamos", "#repurposing"]],
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
                stream_id: "88888888-8888-4888-8888-888888888888",
                type: "repurposing",
                user_id: USER_ID,
              },
            ]);
          }

          if (requestUrl.includes("/rest/v1/platform_connections")) {
            if (requestUrl.includes(YOUTUBE_CONNECTION_ID)) {
              return jsonResponse([
                {
                  id: YOUTUBE_CONNECTION_ID,
                  metadata: {},
                  platform: "youtube",
                  provider_profile: {},
                  scopes: [
                    "https://www.googleapis.com/auth/youtube.upload",
                    "https://www.googleapis.com/auth/youtube.readonly",
                  ],
                  status: "connected",
                  user_id: USER_ID,
                },
              ]);
            }

            if (requestUrl.includes(TIKTOK_CONNECTION_ID)) {
              return jsonResponse([
                {
                  id: TIKTOK_CONNECTION_ID,
                  metadata: {},
                  platform: "tiktok",
                  provider_profile: {},
                  scopes: [],
                  status: "connected",
                  user_id: USER_ID,
                },
              ]);
            }
          }

          if (requestUrl.includes("/rest/v1/content_publications")) {
            return jsonResponse([]);
          }

          if (
            requestUrl.includes(
              "/rest/v1/rpc/record_content_publication_request",
            )
          ) {
            const parsedBody = JSON.parse(body ?? "{}") as Record<
              string,
              unknown
            >;

            expect(parsedBody.p_target_platform).toBe("youtube");

            return jsonResponse({
              capability_snapshot: parsedBody.p_capability_snapshot,
              capability_version: "2026.06.p3.2.v1",
              content_job_id: CONTENT_JOB_ID,
              external_post_id: null,
              external_url: null,
              id: YOUTUBE_PUBLICATION_ID,
              max_retries: 0,
              next_retry_at: null,
              platform_connection_id: YOUTUBE_CONNECTION_ID,
              publication_status: "validated",
              provider_failure_code: null,
              provider_failure_metadata: {},
              provider_failure_reason: null,
              provider_overrides: parsedBody.p_provider_overrides,
              reconciliation_status: "idle",
              reconcile_max_retries: 3,
              reconcile_next_retry_at: null,
              reconcile_retry_count: 0,
              remote_processing_status: null,
              remote_state: {},
              remote_status: "unknown",
              remote_upload_status: null,
              request_intent_hash: String(parsedBody.p_request_intent_hash),
              requested_at: "2026-06-20T12:00:00.000Z",
              requested_by: USER_ID,
              retry_count: 0,
              snapshot: parsedBody.p_snapshot,
              snapshot_hash: String(parsedBody.p_snapshot_hash),
              target_platform: "youtube",
              user_id: USER_ID,
              validated_at: "2026-06-20T12:00:00.000Z",
              validation_code: "validated",
              validation_message: "Publish request validated by the gateway.",
            });
          }

          if (
            requestUrl.includes("/rest/v1/content_publication_fanouts") &&
            method === "POST"
          ) {
            const parsedBody = JSON.parse(body ?? "{}") as Record<
              string,
              unknown
            >;

            expect(parsedBody.fanout_status).toBe("partially_validated");
            expect(parsedBody.target_count).toBe(2);
            expect(parsedBody.validated_target_count).toBe(1);
            expect(parsedBody.blocked_target_count).toBe(1);

            return jsonResponse([
              {
                ...parsedBody,
                created_at: "2026-06-20T12:00:00.000Z",
                id: FANOUT_ID,
                updated_at: "2026-06-20T12:00:00.000Z",
              },
            ]);
          }

          if (
            requestUrl.includes(
              "/rest/v1/content_publication_fanout_targets",
            ) &&
            method === "POST"
          ) {
            const parsedBody = JSON.parse(body ?? "{}") as Record<
              string,
              unknown
            >;

            if (parsedBody.target_platform === "youtube") {
              expect(parsedBody.target_status).toBe("validated");
              expect(parsedBody.content_publication_id).toBe(
                YOUTUBE_PUBLICATION_ID,
              );
              return jsonResponse([
                {
                  ...parsedBody,
                  created_at: "2026-06-20T12:00:00.000Z",
                  id: "88888888-8888-4888-8888-888888888888",
                  updated_at: "2026-06-20T12:00:00.000Z",
                },
              ]);
            }

            expect(parsedBody.target_platform).toBe("tiktok");
            expect(parsedBody.target_status).toBe("blocked");
            expect(parsedBody.block_reason).toBe("missing_publish_scopes");
            expect(parsedBody.content_publication_id).toBeNull();

            return jsonResponse([
              {
                ...parsedBody,
                created_at: "2026-06-20T12:00:00.000Z",
                id: "99999999-9999-4999-8999-999999999999",
                updated_at: "2026-06-20T12:00:00.000Z",
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
        `http://127.0.0.1:${address.port}/api/content-publications/fanout`,
        {
          body: JSON.stringify({
            content_job_id: CONTENT_JOB_ID,
            targets: [
              {
                platform_connection_id: YOUTUBE_CONNECTION_ID,
                provider_overrides: {},
                target_platform: "youtube",
              },
              {
                platform_connection_id: TIKTOK_CONNECTION_ID,
                provider_overrides: {
                  allow_comments: true,
                },
                target_platform: "tiktok",
              },
            ],
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
      expect(payload.status).toBe("publication_fanout_partially_validated");
      expect(payload.fanout_status).toBe("partially_validated");
      expect(payload.target_count).toBe(2);
      expect(payload.validated_target_count).toBe(1);
      expect(payload.blocked_target_count).toBe(1);
      expect(payload.targets).toHaveLength(2);
      expect(
        payload.targets.find(
          (target: { target_platform: string }) =>
            target.target_platform === "youtube",
        )?.target_status,
      ).toBe("validated");
      expect(
        payload.targets.find(
          (target: { target_platform: string }) =>
            target.target_platform === "tiktok",
        )?.target_status,
      ).toBe("blocked");
      expect(
        payload.targets.find(
          (target: { target_platform: string }) =>
            target.target_platform === "tiktok",
        )?.block_reason,
      ).toBe("missing_publish_scopes");

      const fanoutWrites = requests.filter((request) =>
        request.url.includes("/rest/v1/content_publication_fanouts"),
      );
      const targetWrites = requests.filter((request) =>
        request.url.includes("/rest/v1/content_publication_fanout_targets"),
      );
      const publicationRpcs = requests.filter((request) =>
        request.url.includes("/rest/v1/rpc/record_content_publication_request"),
      );

      expect(fanoutWrites).toHaveLength(1);
      expect(targetWrites).toHaveLength(2);
      expect(publicationRpcs).toHaveLength(1);
      expect(JSON.stringify(requests)).not.toContain("access_token");
      expect(JSON.stringify(requests)).not.toContain("refresh_token");
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
