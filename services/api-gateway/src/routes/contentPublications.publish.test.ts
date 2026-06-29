import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import { getPublicationExecutionJobId } from "@streamos/queue";

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

describe("content publications publish route", () => {
  afterEach(() => {
    restoreEnvValue(
      "SUPABASE_SERVICE_ROLE_KEY",
      ORIGINAL_ENV.SUPABASE_SERVICE_ROLE_KEY,
    );
    restoreEnvValue("SUPABASE_URL", ORIGINAL_ENV.SUPABASE_URL);
  });

  it("queues a YouTube publication execution for an approved publication", async () => {
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
        opts: {
          jobId?: string | number;
        },
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

          if (requestUrl.includes("/rest/v1/user_plan_models")) {
            throw new Error(
              "Publish core flow must not request premium command plan models.",
            );
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
            expect(parsedBody.next_retry_at).toBeNull();
            return jsonResponse([]);
          }

          if (
            requestUrl.includes("/rest/v1/content_publications") &&
            method === "GET"
          ) {
            return jsonResponse([
              {
                capability_snapshot: {
                  targetPlatform: "youtube",
                },
                capability_version: "2026.06.p3.2.v1",
                content_job_id: CONTENT_JOB_ID,
                external_post_id: null,
                external_url: null,
                id: PUBLICATION_ID,
                max_retries: 0,
                next_retry_at: null,
                platform_connection_id: PLATFORM_CONNECTION_ID,
                publication_status: "validated",
                published_at: null,
                provider_overrides: {},
                requested_at: "2026-06-19T12:00:00.000Z",
                requested_by: USER_ID,
                retry_count: 0,
                request_intent_hash: "a".repeat(64),
                snapshot: {
                  approvedBundle: {
                    content_job_id: CONTENT_JOB_ID,
                    manual_review_required: true,
                    queue_job_id: "repurposing-plan-001",
                  },
                  contentJob: {
                    id: CONTENT_JOB_ID,
                    queueJobId: "repurposing-plan-001",
                    reviewStatus: "approved",
                    status: "done",
                    streamId: STREAM_ID,
                  },
                  platformConnection: {
                    id: PLATFORM_CONNECTION_ID,
                    platform: "youtube",
                    scopes: ["https://www.googleapis.com/auth/youtube.upload"],
                  },
                  targetPlatform: "youtube",
                },
                snapshot_hash: "b".repeat(64),
                target_platform: "youtube",
                user_id: USER_ID,
                validated_at: "2026-06-19T12:00:00.000Z",
                validation_code: "validated",
                validation_message: "Publish request validated by the gateway.",
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
            expect(parsedBody.next_retry_at).toBeNull();
            return jsonResponse([]);
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
                  hashtag_sets: [["#streamos", "#repurposing"]],
                  hook_ideas: ["Hook one"],
                  manual_review_required: true,
                  model: "gpt-4o",
                  provider: "openai",
                  queue_job_id: "repurposing-plan-001",
                  review_notes: ["Reviewed and approved."],
                  short_form_plan: "Short-form plan",
                  title_suggestions: ["Video title one"],
                  warnings: ["Sanitized and review-ready."],
                },
                review_status: "approved",
                status: "done",
                type: "repurposing",
                user_id: USER_ID,
                stream_id: STREAM_ID,
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

          if (requestUrl.includes("/rest/v1/content_publication_events")) {
            const parsedBody = JSON.parse(body ?? "{}") as Record<
              string,
              unknown
            >;

            expect(parsedBody.event_type).toBe("queued");
            expect(parsedBody.metadata).toMatchObject({
              content_job_id: CONTENT_JOB_ID,
              queue_job_id: getPublicationExecutionJobId(PUBLICATION_ID),
              publishable_asset_present: true,
              target_platform: "youtube",
            });

            return jsonResponse({});
          }

          return new Response("not found", { status: 404 });
        },
      },
      publicationExecutionQueue,
      premiumCommandPolicies: {
        fanout_schedule_mutation: {
          feature: "publishing_schedule",
          mode: "enforced",
        },
        publication_schedule_mutation: {
          feature: "publishing_schedule",
          mode: "enforced",
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
        `http://127.0.0.1:${address.port}/api/content-publications/${PUBLICATION_ID}/publish`,
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
      expect(payload.content_publication_id).toBe(PUBLICATION_ID);
      expect(payload.publication_status).toBe("queued");
      expect(payload.queue_job_id).toBe(
        getPublicationExecutionJobId(PUBLICATION_ID),
      );
      expect(payload.status).toBe("publication_queued");
      expect(requests).toHaveLength(6);
      expect(
        requests.some((request) =>
          request.url.includes("/rest/v1/user_plan_models"),
        ),
      ).toBe(false);
    } finally {
      server.close();
    }
  });

  it("queues a TikTok publication execution for an approved publication", async () => {
    useSupabaseTestEnv();
    const publicationExecutionQueue = {
      async add(
        name: string,
        data: Record<string, unknown>,
        opts: {
          jobId?: string | number;
        },
      ) {
        expect(name).toBe("publication.publish");
        expect(data).toEqual({
          content_publication_id: PUBLICATION_ID,
          target_platform: "tiktok",
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

          if (
            requestUrl.includes("/rest/v1/content_publications") &&
            method === "GET"
          ) {
            return jsonResponse([
              {
                capability_snapshot: {
                  targetPlatform: "tiktok",
                },
                capability_version: "2026.06.p3.2.v1",
                content_job_id: CONTENT_JOB_ID,
                desired_visibility: "public",
                effective_visibility: null,
                external_post_id: null,
                external_url: null,
                id: PUBLICATION_ID,
                last_reconciled_at: null,
                max_retries: 0,
                next_retry_at: null,
                platform_connection_id: PLATFORM_CONNECTION_ID,
                publication_status: "validated",
                published_at: null,
                provider_failure_code: null,
                provider_failure_metadata: {},
                provider_failure_reason: null,
                provider_overrides: {},
                reconciliation_status: "idle",
                reconcile_max_retries: 3,
                reconcile_next_retry_at: null,
                reconcile_retry_count: 0,
                remote_processing_status: null,
                remote_state: {
                  providerPublishId: null,
                  remoteStatus: "unknown",
                },
                remote_status: "unknown",
                remote_upload_status: null,
                requested_at: "2026-06-19T12:00:00.000Z",
                requested_by: USER_ID,
                retry_count: 0,
                request_intent_hash: "a".repeat(64),
                snapshot: {
                  approvedBundle: {
                    content_job_id: CONTENT_JOB_ID,
                    manual_review_required: true,
                    queue_job_id: "repurposing-plan-001",
                  },
                  capability: {
                    canonicalDraft: {
                      assetReference: {
                        contentJobId: CONTENT_JOB_ID,
                        queueJobId: "repurposing-plan-001",
                        sourcePlatform: "twitch",
                        streamId: STREAM_ID,
                      },
                      audienceClassification: "general",
                      description: "Description one",
                      disclosureIntent: {
                        containsAffiliateLinks: false,
                        containsAIGeneratedAssets: false,
                        containsSponsoredContent: false,
                        manualReviewRequired: true,
                        warnings: ["Sanitized and review-ready."],
                      },
                      formatProfile: "short_form",
                      hashtags: ["#streamos", "#repurposing"],
                      publishKind: "video",
                      scheduledPublishAt: null,
                      title: "Video title one",
                      visibility: "public",
                    },
                  },
                  contentJob: {
                    id: CONTENT_JOB_ID,
                    queueJobId: "repurposing-plan-001",
                    reviewStatus: "approved",
                    status: "done",
                    streamId: STREAM_ID,
                  },
                  platformConnection: {
                    id: PLATFORM_CONNECTION_ID,
                    platform: "tiktok",
                    scopes: ["video.publish"],
                  },
                  providerOverrides: {},
                  targetPlatform: "tiktok",
                },
                snapshot_hash: "b".repeat(64),
                target_platform: "tiktok",
                user_id: USER_ID,
                validated_at: "2026-06-19T12:00:00.000Z",
                validation_code: "validated",
                validation_message: "Publish request validated by the gateway.",
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
            expect(parsedBody.next_retry_at).toBeNull();
            return jsonResponse([]);
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
                  hashtag_sets: [["#streamos", "#repurposing"]],
                  hook_ideas: ["Hook one"],
                  manual_review_required: true,
                  model: "gpt-4o",
                  provider: "openai",
                  queue_job_id: "repurposing-plan-001",
                  review_notes: ["Reviewed and approved."],
                  short_form_plan: "Short-form plan",
                  title_suggestions: ["Video title one"],
                  warnings: ["Sanitized and review-ready."],
                },
                review_status: "approved",
                status: "done",
                type: "repurposing",
                user_id: USER_ID,
                stream_id: STREAM_ID,
              },
            ]);
          }

          if (requestUrl.includes("/rest/v1/platform_connections")) {
            return jsonResponse([
              {
                id: PLATFORM_CONNECTION_ID,
                platform: "tiktok",
                scopes: ["video.publish", "user.info.basic"],
                status: "connected",
                user_id: USER_ID,
              },
            ]);
          }

          if (requestUrl.includes("/rest/v1/content_publication_events")) {
            const parsedBody = JSON.parse(body ?? "{}") as Record<
              string,
              unknown
            >;

            expect(parsedBody.event_type).toBe("queued");
            expect(parsedBody.metadata).toMatchObject({
              content_job_id: CONTENT_JOB_ID,
              queue_job_id: getPublicationExecutionJobId(PUBLICATION_ID),
              publishable_asset_present: true,
              target_platform: "tiktok",
            });

            return jsonResponse({});
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
      publicationExecutionQueue,
    });
    const server = app.listen(0);

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected TCP server address.");
      }

      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/content-publications/${PUBLICATION_ID}/publish`,
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
      expect(payload.content_publication_id).toBe(PUBLICATION_ID);
      expect(payload.publication_status).toBe("queued");
      expect(payload.queue_job_id).toBe(
        getPublicationExecutionJobId(PUBLICATION_ID),
      );
      expect(payload.status).toBe("publication_queued");
    } finally {
      server.close();
    }
  });

  it("rejects publication execution when publish scopes are missing", async () => {
    useSupabaseTestEnv();
    const publicationExecutionQueue = {
      async add() {
        throw new Error("Unexpected enqueue.");
      },
    };
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
                capability_snapshot: {
                  targetPlatform: "youtube",
                },
                capability_version: "2026.06.p3.2.v1",
                content_job_id: CONTENT_JOB_ID,
                external_post_id: null,
                external_url: null,
                id: PUBLICATION_ID,
                max_retries: 0,
                next_retry_at: null,
                platform_connection_id: PLATFORM_CONNECTION_ID,
                publication_status: "validated",
                published_at: null,
                provider_overrides: {},
                requested_at: "2026-06-19T12:00:00.000Z",
                requested_by: USER_ID,
                retry_count: 0,
                request_intent_hash: "a".repeat(64),
                snapshot: {},
                snapshot_hash: "b".repeat(64),
                target_platform: "youtube",
                user_id: USER_ID,
                validated_at: "2026-06-19T12:00:00.000Z",
                validation_code: "validated",
                validation_message: "Publish request validated by the gateway.",
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
                  hashtag_sets: [["#streamos", "#repurposing"]],
                  hook_ideas: ["Hook one"],
                  manual_review_required: true,
                  model: "gpt-4o",
                  provider: "openai",
                  queue_job_id: "repurposing-plan-001",
                  review_notes: ["Reviewed and approved."],
                  short_form_plan: "Short-form plan",
                  title_suggestions: ["Video title one"],
                  warnings: ["Sanitized and review-ready."],
                },
                review_status: "approved",
                status: "done",
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
                scopes: ["https://www.googleapis.com/auth/youtube.readonly"],
                status: "connected",
                user_id: USER_ID,
              },
            ]);
          }

          return jsonResponse([]);
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
        `http://127.0.0.1:${address.port}/api/content-publications/${PUBLICATION_ID}/publish`,
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
      expect(payload.error).toBe("missing_publish_scopes");
    } finally {
      server.close();
    }
  });
});

function jsonResponse(body: unknown) {
  return Response.json(body);
}
