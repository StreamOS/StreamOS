import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildCanonicalPublicationDraft,
  buildPublicationScheduleSummary,
  PUBLICATION_CAPABILITY_VERSION,
  resolvePublicationCapabilities,
} from "@streamos/types";

import { createApp } from "../app.js";

const API_SECRET = "test-api-gateway-secret-123";
const SUPABASE_URL = "https://supabase.streamos.test";
const SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const CONTENT_JOB_ID = "22222222-2222-4222-8222-222222222222";
const PLATFORM_CONNECTION_ID = "33333333-3333-4333-8333-333333333333";
const PUBLICATION_ID = "44444444-4444-4444-8444-444444444444";
const ORIGINAL_ENV = {
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL: process.env.SUPABASE_URL,
};

describe("content publications router", () => {
  afterEach(() => {
    restoreEnvValue(
      "SUPABASE_SERVICE_ROLE_KEY",
      ORIGINAL_ENV.SUPABASE_SERVICE_ROLE_KEY,
    );
    restoreEnvValue("SUPABASE_URL", ORIGINAL_ENV.SUPABASE_URL);
  });

  it("validates and records a publication request for an approved repurposing job", async () => {
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
                stream_id: "55555555-5555-4555-8555-555555555555",
                type: "repurposing",
                user_id: USER_ID,
              },
            ]);
          }

          if (requestUrl.includes("/rest/v1/platform_connections")) {
            return jsonResponse([
              {
                id: PLATFORM_CONNECTION_ID,
                metadata: {
                  publish_capabilities: {
                    youtube: {
                      allowed_visibility: ["public", "unlisted"],
                      notes: ["Account capability overlay loaded."],
                      scheduling_allowed: true,
                      support_status: "supported",
                    },
                  },
                },
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

            expect(parsedBody.p_user_id).toBe(USER_ID);
            expect(parsedBody.p_requested_by).toBe(USER_ID);
            expect(parsedBody.p_target_platform).toBe("youtube");
            expect(parsedBody.p_request_intent_hash).toEqual(
              expect.stringMatching(/^[a-f0-9]{64}$/),
            );
            expect(parsedBody.p_snapshot_hash).toEqual(
              expect.stringMatching(/^[a-f0-9]{64}$/),
            );

            const snapshot = parsedBody.p_snapshot as Record<string, unknown>;

            expect(snapshot).toMatchObject({
              approvedBundle: {
                content_job_id: CONTENT_JOB_ID,
                manual_review_required: true,
              },
              capability: {
                capabilityVersion: PUBLICATION_CAPABILITY_VERSION,
                providerSupportStatus: "supported",
              },
              contentJob: {
                id: CONTENT_JOB_ID,
                queueJobId: "repurposing-plan-001",
              },
              platformConnection: {
                id: PLATFORM_CONNECTION_ID,
                platform: "youtube",
              },
              providerOverrides: {},
              targetPlatform: "youtube",
            });
            expect(JSON.stringify(snapshot)).not.toContain("access_token");
            expect(JSON.stringify(snapshot)).not.toContain("refresh_token");

            expect(parsedBody.p_capability_version).toBe(
              PUBLICATION_CAPABILITY_VERSION,
            );
            expect(parsedBody.p_provider_overrides).toEqual({});
            expect(parsedBody.p_capability_snapshot).toMatchObject({
              capability: {
                capabilityVersion: PUBLICATION_CAPABILITY_VERSION,
                providerSupportStatus: "supported",
              },
              targetPlatform: "youtube",
            });

            return jsonResponse({
              capability_snapshot: parsedBody.p_capability_snapshot,
              capability_version: PUBLICATION_CAPABILITY_VERSION,
              content_job_id: CONTENT_JOB_ID,
              id: PUBLICATION_ID,
              platform_connection_id: PLATFORM_CONNECTION_ID,
              publication_status: "validated",
              provider_overrides: {},
              request_intent_hash: String(parsedBody.p_request_intent_hash),
              requested_at: "2026-06-19T12:00:00.000Z",
              snapshot_hash: String(parsedBody.p_snapshot_hash),
              target_platform: "youtube",
              user_id: USER_ID,
              validated_at: "2026-06-19T12:00:00.000Z",
              validation_code: "validated",
              validation_message: "Publish request validated by the gateway.",
            });
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
        `http://127.0.0.1:${address.port}/api/content-publications`,
        {
          body: JSON.stringify({
            content_job_id: CONTENT_JOB_ID,
            platform_connection_id: PLATFORM_CONNECTION_ID,
            target_platform: "youtube",
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
      expect(payload.content_job_id).toBe(CONTENT_JOB_ID);
      expect(payload.content_publication_id).toBe(PUBLICATION_ID);
      expect(payload.platform_connection_id).toBe(PLATFORM_CONNECTION_ID);
      expect(payload.publication_status).toBe("validated");
      expect(payload.provider_overrides).toEqual({});
      expect(payload.request_intent_hash).toEqual(
        expect.stringMatching(/^[a-f0-9]{64}$/),
      );
      expect(payload.snapshot_hash).toEqual(
        expect.stringMatching(/^[a-f0-9]{64}$/),
      );
      expect(payload.status).toBe("publication_validated");
      expect(payload.target_platform).toBe("youtube");
      expect(payload.validated_at).toBe("2026-06-19T12:00:00.000Z");
      expect(payload.capability_version).toBe(PUBLICATION_CAPABILITY_VERSION);
      expect(payload.capability_status).toBe("supported");
      expect(payload.capability_warnings).toEqual([
        expect.objectContaining({
          code: "conditional_field_unresolved",
          provider: "youtube",
        }),
      ]);
      expect(payload.capability_snapshot).toMatchObject({
        capability: {
          capabilityVersion: PUBLICATION_CAPABILITY_VERSION,
          providerSupportStatus: "supported",
          targetPlatform: "youtube",
        },
      });
      expect(requests).toHaveLength(4);
    } finally {
      server.close();
    }
  });

  it("stores schedule metadata for a future publication request without exposing secrets", async () => {
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
                stream_id: "55555555-5555-4555-8555-555555555555",
                type: "repurposing",
                user_id: USER_ID,
              },
            ]);
          }

          if (requestUrl.includes("/rest/v1/platform_connections")) {
            return jsonResponse([
              {
                id: PLATFORM_CONNECTION_ID,
                metadata: {
                  publish_capabilities: {
                    youtube: {
                      allowed_visibility: ["public", "unlisted"],
                      notes: ["Account capability overlay loaded."],
                      scheduling_allowed: true,
                      support_status: "supported",
                    },
                  },
                },
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

          if (requestUrl.includes("/rest/v1/vod_assets")) {
            return jsonResponse([
              {
                id: "vod-asset-1",
                source_url: "https://cdn.example.com/vods/stream-123.mp4",
              },
            ]);
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

            expect(parsedBody.p_schedule_source).toBe("api-gateway");
            expect(parsedBody.p_schedule_status).toBe("schedule_ready");
            expect(parsedBody.p_schedule_block_reason).toBeNull();
            expect(parsedBody.p_schedule_validation_metadata).toMatchObject({
              has_approved_bundle: true,
              has_publishable_asset: true,
              has_required_scopes: true,
              schedule_requested: true,
              target_platform: "youtube",
            });
            expect(parsedBody.p_snapshot).toMatchObject({
              schedule: {
                scheduleStatus: "schedule_ready",
                scheduledAtUtc: "2099-06-21T12:00:00.000Z",
                scheduledTimezone: "Europe/Berlin",
              },
            });
            expect(JSON.stringify(parsedBody.p_snapshot)).not.toContain(
              "access_token",
            );

            return jsonResponse({
              capability_snapshot: parsedBody.p_capability_snapshot,
              capability_version: PUBLICATION_CAPABILITY_VERSION,
              content_job_id: CONTENT_JOB_ID,
              id: PUBLICATION_ID,
              platform_connection_id: PLATFORM_CONNECTION_ID,
              publication_status: "validated",
              provider_overrides: {},
              request_intent_hash: String(parsedBody.p_request_intent_hash),
              requested_at: "2026-06-21T12:00:00.000Z",
              schedule_block_message: null,
              schedule_block_reason: null,
              schedule_canceled_at: null,
              schedule_canceled_reason: null,
              schedule_capability_snapshot:
                parsedBody.p_schedule_capability_snapshot,
              schedule_created_at: "2026-06-21T12:00:00.000Z",
              schedule_expired_at: null,
              schedule_replaced_at: null,
              schedule_source: "api-gateway",
              schedule_status: "schedule_ready",
              schedule_updated_at: "2026-06-21T12:00:00.000Z",
              schedule_validation_metadata:
                parsedBody.p_schedule_validation_metadata,
              scheduled_at_utc: "2099-06-21T12:00:00.000Z",
              scheduled_timezone: "Europe/Berlin",
              snapshot_hash: String(parsedBody.p_snapshot_hash),
              target_platform: "youtube",
              user_id: USER_ID,
              validated_at: "2026-06-21T12:00:00.000Z",
              validation_code: "validated",
              validation_message: "Publish request validated by the gateway.",
            });
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
        `http://127.0.0.1:${address.port}/api/content-publications`,
        {
          body: JSON.stringify({
            content_job_id: CONTENT_JOB_ID,
            platform_connection_id: PLATFORM_CONNECTION_ID,
            scheduled_publish_at: "2099-06-21T12:00:00.000Z",
            scheduled_timezone: "Europe/Berlin",
            target_platform: "youtube",
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
      expect(payload.schedule_status).toBe("schedule_ready");
      expect(payload.schedule_block_reason).toBeNull();
      expect(payload.publication_status).toBe("validated");
      expect(payload.content_publication_id).toBe(PUBLICATION_ID);
      expect(requests).toHaveLength(5);
    } finally {
      server.close();
    }
  });

  it("returns an existing validated publication when the request intent is already stored", async () => {
    useSupabaseTestEnv();
    let rpcCalls = 0;
    const approvedBundle = {
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
    };
    const canonicalDraft = buildCanonicalPublicationDraft({
      approvedBundle,
      contentJob: {
        id: CONTENT_JOB_ID,
        queueJobId: "repurposing-plan-001",
        streamId: "55555555-5555-4555-8555-555555555555",
      },
      targetPlatform: "youtube",
    });
    const capabilityResolution = resolvePublicationCapabilities({
      canonicalDraft,
      policy: {
        allowedTargets: ["youtube", "tiktok"],
        forbidAutoPublish: true,
        requireManualReview: true,
      },
      targetPlatform: "youtube",
    });
    const snapshot = {
      approvedBundle,
      capability: {
        accountCapabilities: {},
        capabilityVersion: PUBLICATION_CAPABILITY_VERSION,
        canonicalDraft,
        dynamicCapabilityKeys: capabilityResolution.dynamicCapabilityKeys,
        providerOverrides: {},
        providerPayloadPreview: capabilityResolution.providerPayloadPreview,
        providerSupportStatus: capabilityResolution.providerSupportStatus,
        resolvedDefaults: capabilityResolution.resolvedDefaults,
        targetPlatform: "youtube",
        unsupportedFields: capabilityResolution.unsupportedFields,
        warnings: capabilityResolution.warnings,
      },
      contentJob: {
        id: CONTENT_JOB_ID,
        queueJobId: "repurposing-plan-001",
        reviewStatus: "approved",
        status: "completed",
        streamId: "55555555-5555-4555-8555-555555555555",
      },
      platformConnection: {
        id: PLATFORM_CONNECTION_ID,
        platform: "youtube",
        scopes: ["https://www.googleapis.com/auth/youtube.upload"],
      },
      providerOverrides: {},
      schedule: buildPublicationScheduleSummary({
        scheduleStatus: "not_scheduled",
      }),
      targetPlatform: "youtube",
    };
    const snapshotHash = createHash("sha256")
      .update(JSON.stringify(snapshot), "utf8")
      .digest("hex");
    const requestIntentHash = createHash("sha256")
      .update(
        [
          USER_ID,
          CONTENT_JOB_ID,
          PLATFORM_CONNECTION_ID,
          "youtube",
          snapshotHash,
        ].join("|"),
        "utf8",
      )
      .digest("hex");
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
                status: "completed",
                stream_id: "55555555-5555-4555-8555-555555555555",
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

          if (requestUrl.includes("/rest/v1/content_publications")) {
            const requestIntent = new URL(requestUrl).searchParams.get(
              "request_intent_hash",
            );

            expect(requestIntent).toBe(`eq.${requestIntentHash}`);

            return jsonResponse([
              {
                content_job_id: CONTENT_JOB_ID,
                id: PUBLICATION_ID,
                platform_connection_id: PLATFORM_CONNECTION_ID,
                publication_status: "validated",
                request_intent_hash: requestIntentHash,
                requested_at: "2026-06-19T12:00:00.000Z",
                schedule_block_message: null,
                schedule_block_reason: null,
                schedule_canceled_at: null,
                schedule_canceled_reason: null,
                schedule_capability_snapshot: {},
                schedule_created_at: null,
                schedule_expired_at: null,
                schedule_replaced_at: null,
                schedule_source: null,
                schedule_status: "not_scheduled",
                schedule_updated_at: null,
                schedule_validation_metadata: {},
                scheduled_at_utc: null,
                scheduled_timezone: null,
                snapshot_hash: snapshotHash,
                target_platform: "youtube",
                user_id: USER_ID,
                validated_at: "2026-06-19T12:00:00.000Z",
                validation_code: "validated",
                validation_message: "Publish request validated by the gateway.",
              },
            ]);
          }

          if (
            requestUrl.includes(
              "/rest/v1/rpc/record_content_publication_request",
            )
          ) {
            rpcCalls += 1;
            return jsonResponse({
              content_job_id: CONTENT_JOB_ID,
              id: PUBLICATION_ID,
              platform_connection_id: PLATFORM_CONNECTION_ID,
              publication_status: "validated",
              request_intent_hash: requestIntentHash,
              requested_at: "2026-06-19T12:00:00.000Z",
              schedule_block_message: null,
              schedule_block_reason: null,
              schedule_canceled_at: null,
              schedule_canceled_reason: null,
              schedule_capability_snapshot: {},
              schedule_created_at: null,
              schedule_expired_at: null,
              schedule_replaced_at: null,
              schedule_source: null,
              schedule_status: "not_scheduled",
              schedule_updated_at: null,
              schedule_validation_metadata: {},
              scheduled_at_utc: null,
              scheduled_timezone: null,
              snapshot_hash: snapshotHash,
              target_platform: "youtube",
              user_id: USER_ID,
              validated_at: "2026-06-19T12:00:00.000Z",
              validation_code: "validated",
              validation_message: "Publish request validated by the gateway.",
            });
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

      const body = JSON.stringify({
        content_job_id: CONTENT_JOB_ID,
        platform_connection_id: PLATFORM_CONNECTION_ID,
        target_platform: "youtube",
        user_id: USER_ID,
      });

      const firstResponse = await fetch(
        `http://127.0.0.1:${address.port}/api/content-publications`,
        {
          body,
          headers: {
            Authorization: `Bearer ${API_SECRET}`,
            "content-type": "application/json",
          },
          method: "POST",
        },
      );
      const secondResponse = await fetch(
        `http://127.0.0.1:${address.port}/api/content-publications`,
        {
          body,
          headers: {
            Authorization: `Bearer ${API_SECRET}`,
            "content-type": "application/json",
          },
          method: "POST",
        },
      );

      const firstPayload = await firstResponse.json();
      const secondPayload = await secondResponse.json();

      expect(firstResponse.status).toBe(200);
      expect(secondResponse.status).toBe(200);
      expect(firstPayload.content_publication_id).toBe(PUBLICATION_ID);
      expect(secondPayload.content_publication_id).toBe(PUBLICATION_ID);
      expect(rpcCalls).toBe(0);
    } finally {
      server.close();
    }
  });

  it("rejects publication requests for unapproved jobs", async () => {
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

          if (requestUrl.includes("/rest/v1/content_jobs")) {
            return jsonResponse([
              {
                id: CONTENT_JOB_ID,
                job_type: "repurposing",
                queue_job_id: "repurposing-plan-001",
                result: null,
                review_status: "needs_review",
                status: "pending",
                type: "repurposing",
                user_id: USER_ID,
              },
            ]);
          }

          throw new Error("Unexpected fetch call.");
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
        `http://127.0.0.1:${address.port}/api/content-publications`,
        {
          body: JSON.stringify({
            content_job_id: CONTENT_JOB_ID,
            platform_connection_id: PLATFORM_CONNECTION_ID,
            target_platform: "youtube",
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
      expect(payload.error).toBe("publication_not_ready");
    } finally {
      server.close();
    }
  });

  it("rejects publication requests when the platform connection belongs to another tenant", async () => {
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
                type: "repurposing",
                user_id: USER_ID,
              },
            ]);
          }

          if (requestUrl.includes("/rest/v1/platform_connections")) {
            return jsonResponse([]);
          }

          throw new Error("Unexpected fetch call.");
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
        `http://127.0.0.1:${address.port}/api/content-publications`,
        {
          body: JSON.stringify({
            content_job_id: CONTENT_JOB_ID,
            platform_connection_id: PLATFORM_CONNECTION_ID,
            target_platform: "youtube",
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

      expect(response.status).toBe(404);
      expect(payload.error).toBe("platform_connection_not_found");
    } finally {
      server.close();
    }
  });

  it("rejects publication requests when the selected connection has no publish scopes", async () => {
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
                status: "completed",
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
                scopes: [],
                status: "connected",
                user_id: USER_ID,
              },
            ]);
          }

          throw new Error("Unexpected fetch call.");
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
        `http://127.0.0.1:${address.port}/api/content-publications`,
        {
          body: JSON.stringify({
            content_job_id: CONTENT_JOB_ID,
            platform_connection_id: PLATFORM_CONNECTION_ID,
            target_platform: "youtube",
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
      expect(payload.error).toBe("missing_publish_scopes");
    } finally {
      server.close();
    }
  });

  it("rejects publication requests for unsupported target platforms", async () => {
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
                type: "repurposing",
                user_id: USER_ID,
              },
            ]);
          }

          if (requestUrl.includes("/rest/v1/platform_connections")) {
            return jsonResponse([
              {
                id: PLATFORM_CONNECTION_ID,
                metadata: {},
                platform: "kick",
                provider_profile: {},
                scopes: ["kick.upload"],
                status: "connected",
                user_id: USER_ID,
              },
            ]);
          }

          throw new Error("Unexpected fetch call.");
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
        `http://127.0.0.1:${address.port}/api/content-publications`,
        {
          body: JSON.stringify({
            content_job_id: CONTENT_JOB_ID,
            platform_connection_id: PLATFORM_CONNECTION_ID,
            target_platform: "kick",
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

      expect(response.status).toBe(400);
      expect(payload.error).toBe("unsupported_target_platform");
    } finally {
      server.close();
    }
  });

  it("rejects provider overrides that are not namespaced to the selected platform", async () => {
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
                type: "repurposing",
                user_id: USER_ID,
              },
            ]);
          }

          if (requestUrl.includes("/rest/v1/platform_connections")) {
            return jsonResponse([
              {
                id: PLATFORM_CONNECTION_ID,
                metadata: {},
                platform: "youtube",
                provider_profile: {},
                scopes: ["https://www.googleapis.com/auth/youtube.upload"],
                status: "connected",
                user_id: USER_ID,
              },
            ]);
          }

          throw new Error("Unexpected fetch call.");
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
        `http://127.0.0.1:${address.port}/api/content-publications`,
        {
          body: JSON.stringify({
            content_job_id: CONTENT_JOB_ID,
            platform_connection_id: PLATFORM_CONNECTION_ID,
            provider_overrides: {
              tiktok: {
                privacy_level: "public",
              },
            },
            target_platform: "youtube",
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
      expect(payload.error).toBe("provider_override_mismatch");
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
