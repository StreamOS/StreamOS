import { afterEach, describe, expect, it } from "vitest";
import { PUBLICATION_CAPABILITY_VERSION } from "@streamos/types";

import { createApp } from "../app.js";

const API_SECRET = "test-api-gateway-secret-123";
const SUPABASE_URL = "https://supabase.streamos.test";
const SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const CONTENT_JOB_ID = "22222222-2222-4222-8222-222222222222";
const PLATFORM_CONNECTION_ID = "33333333-3333-4333-8333-333333333333";
const PUBLICATION_ID = "44444444-4444-4444-8444-444444444444";
const REPLACEMENT_PUBLICATION_ID = "55555555-5555-4555-8555-555555555555";
const FANOUT_ID = "66666666-6666-4666-8666-666666666666";
const FANOUT_REPLACEMENT_ID = "77777777-7777-4777-8777-777777777777";
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

function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    ...init,
  });
}

describe("content publications schedule routes", () => {
  afterEach(() => {
    restoreEnvValue(
      "SUPABASE_SERVICE_ROLE_KEY",
      ORIGINAL_ENV.SUPABASE_SERVICE_ROLE_KEY,
    );
    restoreEnvValue("SUPABASE_URL", ORIGINAL_ENV.SUPABASE_URL);
  });

  it("updates a mutable publication schedule without triggering worker or provider execution", async () => {
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
            requestUrl.includes("/rest/v1/content_publications") &&
            method === "GET" &&
            requestUrl.includes(`id=eq.${PUBLICATION_ID}`)
          ) {
            return jsonResponse([
              makePublicationRow({
                schedule_status: "scheduled",
                schedule_source: "dashboard",
                scheduled_at_utc: "2026-06-22T18:30:00.000Z",
                scheduled_timezone: "Europe/Berlin",
              }),
            ]);
          }

          if (
            requestUrl.includes("/rest/v1/content_jobs") &&
            method === "GET"
          ) {
            return jsonResponse([
              makeApprovedContentJobRow({
                stream_id: "stream-1",
              }),
            ]);
          }

          if (
            requestUrl.includes("/rest/v1/platform_connections") &&
            method === "GET"
          ) {
            return jsonResponse([
              makeConnectionRow({
                metadata: {
                  publish_capabilities: {
                    youtube: {
                      scheduling_allowed: true,
                      support_status: "supported",
                    },
                  },
                },
              }),
            ]);
          }

          if (requestUrl.includes("/rest/v1/vod_assets") && method === "GET") {
            return jsonResponse([
              {
                id: "vod-asset-1",
                source_url: "https://cdn.example.com/vods/stream-1.mp4",
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

            expect(parsedBody.schedule_source).toBe("dashboard");
            expect(parsedBody.schedule_status).toBe("schedule_ready");
            expect(parsedBody.schedule_block_reason).toBeNull();
            expect(parsedBody.scheduled_at_utc).toBe(
              "2026-06-22T19:30:00.000Z",
            );
            expect(parsedBody.scheduled_timezone).toBe("Europe/Berlin");
            expect(parsedBody.schedule_validation_metadata).toMatchObject({
              action: "edit",
              schedule_policy: expect.objectContaining({
                policyStatus: "ready",
                policyVersion: "2026.06.p3.18.v1",
              }),
              target_platform: "youtube",
            });

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

            expect(parsedBody.event_type).toBe("schedule_updated");
            expect(parsedBody.source).toBe("dashboard");
            expect(parsedBody.metadata).toMatchObject({
              action: "edit",
              content_job_id: CONTENT_JOB_ID,
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
        `http://127.0.0.1:${address.port}/api/content-publications/${PUBLICATION_ID}/schedule`,
        {
          body: JSON.stringify({
            action: "edit",
            reason: "Move to a later slot",
            scheduled_at_utc: "2026-06-22T19:30:00.000Z",
            scheduled_timezone: "Europe/Berlin",
            user_id: USER_ID,
          }),
          headers: {
            Authorization: `Bearer ${API_SECRET}`,
            "content-type": "application/json",
          },
          method: "POST",
        },
      );

      const responseText = await response.text();

      expect(response.status).toBe(200);
      const payload = JSON.parse(responseText) as Record<string, unknown>;

      expect(payload).toMatchObject({
        action: "edit",
        content_publication_id: PUBLICATION_ID,
        replacement_content_publication_id: null,
        schedule_status: "schedule_ready",
        status: "publication_schedule_updated",
        user_id: USER_ID,
      });
      expect(
        requests.some((request) => request.url.includes("automation-service")),
      ).toBe(false);
      expect(requests.some((request) => request.url.includes("worker"))).toBe(
        false,
      );
    } finally {
      server.close();
    }
  });

  it("retries an identical publication replace without creating a second replacement row or audit event", async () => {
    useSupabaseTestEnv();
    const requests: Array<{
      body: string | null;
      method: string;
      url: string;
    }> = [];
    const schedulePatchStatuses: string[] = [];
    const replaceEventIntents = new Set<string>();
    let replaceEventPosts = 0;
    let replacementPublication: Record<string, unknown> | null = null;
    let rpcCalls = 0;
    let publicationRow: Record<string, unknown> = makePublicationRow({
      schedule_replaced_at: null,
      schedule_source: "dashboard",
      schedule_status: "scheduled",
      schedule_updated_at: "2026-06-21T10:00:00.000Z",
      schedule_validation_metadata: {},
    });
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
            method === "GET" &&
            requestUrl.includes(`id=eq.${PUBLICATION_ID}`)
          ) {
            return jsonResponse([publicationRow]);
          }

          if (
            requestUrl.includes("/rest/v1/content_publications") &&
            method === "GET" &&
            requestUrl.includes("request_intent_hash=")
          ) {
            return jsonResponse(
              replacementPublication ? [replacementPublication] : [],
            );
          }

          if (
            requestUrl.includes("/rest/v1/content_publication_events") &&
            method === "GET" &&
            requestUrl.includes("schedule_replace_intent_hash")
          ) {
            const intentHash = new URL(requestUrl).searchParams.get(
              "metadata->>schedule_replace_intent_hash",
            );
            const normalizedIntentHash = intentHash?.replace(/^eq\./, "");

            return jsonResponse(
              normalizedIntentHash &&
                replaceEventIntents.has(normalizedIntentHash)
                ? [{ id: "event-replace-1" }]
                : [],
            );
          }

          if (
            requestUrl.includes("/rest/v1/content_jobs") &&
            method === "GET"
          ) {
            return jsonResponse([
              makeApprovedContentJobRow({
                stream_id: "stream-1",
              }),
            ]);
          }

          if (
            requestUrl.includes("/rest/v1/platform_connections") &&
            method === "GET"
          ) {
            return jsonResponse([
              makeConnectionRow({
                metadata: {
                  publish_capabilities: {
                    youtube: {
                      scheduling_allowed: true,
                      support_status: "supported",
                    },
                  },
                },
              }),
            ]);
          }

          if (requestUrl.includes("/rest/v1/vod_assets") && method === "GET") {
            return jsonResponse([
              {
                id: "vod-asset-1",
                source_url: "https://cdn.example.com/vods/stream-1.mp4",
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

            schedulePatchStatuses.push(
              typeof parsedBody.schedule_status === "string"
                ? parsedBody.schedule_status
                : "unknown",
            );
            publicationRow = {
              ...publicationRow,
              ...parsedBody,
            };
            return jsonResponse([]);
          }

          if (
            requestUrl.includes(
              "/rest/v1/rpc/record_content_publication_request",
            )
          ) {
            rpcCalls += 1;
            const parsedBody = JSON.parse(body ?? "{}") as Record<
              string,
              unknown
            >;

            expect(parsedBody.p_schedule_source).toBe("dashboard");
            expect(parsedBody.p_scheduled_at_utc).toBe(
              "2026-06-23T19:30:00.000Z",
            );
            expect(parsedBody.p_scheduled_timezone).toBe("Europe/Berlin");

            replacementPublication = {
              capability_snapshot: parsedBody.p_capability_snapshot,
              capability_version: "1.0.0",
              content_job_id: CONTENT_JOB_ID,
              id: REPLACEMENT_PUBLICATION_ID,
              platform_connection_id: PLATFORM_CONNECTION_ID,
              publication_status: "validated",
              provider_overrides: {},
              request_intent_hash: String(parsedBody.p_request_intent_hash),
              requested_at: "2026-06-21T12:00:00.000Z",
              snapshot_hash: String(parsedBody.p_snapshot_hash),
              target_platform: "youtube",
              user_id: USER_ID,
              validated_at: "2026-06-21T12:00:00.000Z",
              validation_code: "validated",
              validation_message: "Publish request validated by the gateway.",
            };

            return jsonResponse(replacementPublication);
          }

          if (
            requestUrl.includes("/rest/v1/content_publication_events") &&
            method === "POST"
          ) {
            replaceEventPosts += 1;
            const parsedBody = JSON.parse(body ?? "{}") as Record<
              string,
              unknown
            >;

            expect(parsedBody.event_type).toBe("schedule_replaced");
            expect(parsedBody.source).toBe("dashboard");
            expect(parsedBody.metadata).toMatchObject({
              action: "replace",
              content_job_id: CONTENT_JOB_ID,
              replacement_content_publication_id: REPLACEMENT_PUBLICATION_ID,
              schedule_replace_intent_hash: expect.any(String),
              target_platform: "youtube",
            });
            replaceEventIntents.add(
              String(parsedBody.metadata.schedule_replace_intent_hash),
            );

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

      const makeReplaceRequest = () =>
        fetch(
          `http://127.0.0.1:${address.port}/api/content-publications/${PUBLICATION_ID}/schedule`,
          {
            body: JSON.stringify({
              action: "replace",
              reason: "Fresh schedule with same publication",
              scheduled_at_utc: "2026-06-23T19:30:00.000Z",
              scheduled_timezone: "Europe/Berlin",
              user_id: USER_ID,
            }),
            headers: {
              Authorization: `Bearer ${API_SECRET}`,
              "content-type": "application/json",
            },
            method: "POST",
          },
        );

      const response = await makeReplaceRequest();
      const responseText = await response.text();
      expect(response.status).toBe(200);
      const payload = JSON.parse(responseText) as Record<string, unknown>;

      expect(payload).toMatchObject({
        action: "replace",
        content_publication_id: PUBLICATION_ID,
        replacement_content_publication_id: REPLACEMENT_PUBLICATION_ID,
        schedule_status: "schedule_replaced",
        status: "publication_schedule_replaced",
        user_id: USER_ID,
      });

      const updatedAtAfterFirstReplace = publicationRow.schedule_updated_at;
      const replacedAtAfterFirstReplace = publicationRow.schedule_replaced_at;

      const repeatedResponse = await makeReplaceRequest();
      const repeatedResponseText = await repeatedResponse.text();
      expect(repeatedResponse.status).toBe(200);
      expect(JSON.parse(repeatedResponseText)).toMatchObject({
        action: "replace",
        content_publication_id: PUBLICATION_ID,
        replacement_content_publication_id: REPLACEMENT_PUBLICATION_ID,
        schedule_status: "schedule_replaced",
        status: "publication_schedule_replaced",
        user_id: USER_ID,
      });
      expect(schedulePatchStatuses).toEqual(["schedule_replaced"]);
      expect(publicationRow.schedule_updated_at).toBe(
        updatedAtAfterFirstReplace,
      );
      expect(publicationRow.schedule_replaced_at).toBe(
        replacedAtAfterFirstReplace,
      );
      expect(rpcCalls).toBe(1);
      expect(replaceEventPosts).toBe(1);
      expect(
        requests.some((request) => request.url.includes("automation-service")),
      ).toBe(false);
      expect(requests.some((request) => request.url.includes("worker"))).toBe(
        false,
      );
    } finally {
      server.close();
    }
  });

  it("retries an identical fanout replace without creating a second replacement row or audit event", async () => {
    useSupabaseTestEnv();
    const requests: Array<{
      body: string | null;
      method: string;
      url: string;
    }> = [];
    const schedulePatchStatuses: string[] = [];
    const replaceEventIntents = new Set<string>();
    let replaceEventPosts = 0;
    let publicationRequestCalls = 0;
    let publicationRequest: Record<string, unknown> | null = null;
    let replacementFanout: Record<string, unknown> | null = null;
    let fanoutRow: Record<string, unknown> = makeFanoutRow({
      schedule_replaced_at: null,
      schedule_source: "dashboard",
      schedule_status: "scheduled",
      schedule_updated_at: "2026-06-21T10:00:00.000Z",
      schedule_validation_metadata: {},
    });
    const fanoutTargets = [
      makeFanoutTargetRow({
        id: "fanout-target-1",
        request_intent_hash:
          "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      }),
      makeFanoutTargetRow({
        id: "fanout-target-2",
        platform_connection_id: `${PLATFORM_CONNECTION_ID}-2`,
        request_intent_hash:
          "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      }),
    ];
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
            method === "GET" &&
            requestUrl.includes(`id=eq.${FANOUT_ID}`)
          ) {
            return jsonResponse([fanoutRow]);
          }

          if (
            requestUrl.includes("/rest/v1/content_publication_fanouts") &&
            method === "GET" &&
            requestUrl.includes("request_intent_hash=")
          ) {
            return jsonResponse(replacementFanout ? [replacementFanout] : []);
          }

          if (
            requestUrl.includes(
              "/rest/v1/content_publication_fanout_targets",
            ) &&
            method === "GET"
          ) {
            return jsonResponse(fanoutTargets);
          }

          if (
            requestUrl.includes("/rest/v1/content_publications") &&
            method === "GET" &&
            requestUrl.includes("request_intent_hash=")
          ) {
            return jsonResponse(publicationRequest ? [publicationRequest] : []);
          }

          if (
            requestUrl.includes(
              "/rest/v1/rpc/record_content_publication_request",
            )
          ) {
            publicationRequestCalls += 1;
            const parsedBody = JSON.parse(body ?? "{}") as Record<
              string,
              unknown
            >;

            expect(parsedBody.p_schedule_source).toBe("dashboard");
            expect(parsedBody.p_scheduled_at_utc).toBe(
              "2026-06-23T19:30:00.000Z",
            );
            expect(parsedBody.p_scheduled_timezone).toBe("Europe/Berlin");

            publicationRequest = {
              capability_snapshot: parsedBody.p_capability_snapshot,
              capability_version: parsedBody.p_capability_version,
              content_job_id: CONTENT_JOB_ID,
              id: `${FANOUT_REPLACEMENT_ID}-publication-${publicationRequestCalls}`,
              platform_connection_id: parsedBody.p_platform_connection_id,
              publication_status: "validated",
              provider_overrides: parsedBody.p_provider_overrides,
              request_intent_hash: String(parsedBody.p_request_intent_hash),
              requested_at: String(parsedBody.p_requested_at),
              snapshot_hash: String(parsedBody.p_snapshot_hash),
              target_platform: parsedBody.p_target_platform,
              user_id: USER_ID,
              validated_at: String(parsedBody.p_requested_at),
              validation_code: "validated",
              validation_message: "Publish request validated by the gateway.",
            };

            return jsonResponse(publicationRequest);
          }

          if (
            requestUrl.includes("/rest/v1/content_publication_fanouts") &&
            method === "PATCH"
          ) {
            const parsedBody = JSON.parse(body ?? "{}") as Record<
              string,
              unknown
            >;

            schedulePatchStatuses.push(
              typeof parsedBody.schedule_status === "string"
                ? parsedBody.schedule_status
                : "unknown",
            );
            fanoutRow = {
              ...fanoutRow,
              ...parsedBody,
            };
            return jsonResponse([]);
          }

          if (
            requestUrl.includes("/rest/v1/content_publication_fanouts") &&
            method === "POST"
          ) {
            const parsedBody = JSON.parse(body ?? "{}") as Record<
              string,
              unknown
            >;

            replacementFanout = {
              blocked_target_count:
                typeof parsedBody.blocked_target_count === "number"
                  ? parsedBody.blocked_target_count
                  : 0,
              content_job_id: CONTENT_JOB_ID,
              created_at: "2026-06-21T12:00:00.000Z",
              fanout_policy: "prepare_valid_targets",
              fanout_status: "validated",
              id: FANOUT_REPLACEMENT_ID,
              last_action_at: null,
              last_action_key: null,
              last_action_result: null,
              last_aggregate_refreshed_at: null,
              requested_at: String(parsedBody.requested_at ?? ""),
              requested_by: USER_ID,
              request_intent_hash: String(parsedBody.request_intent_hash),
              review_status_at_request: "approved",
              schedule_block_message: null,
              schedule_block_reason: null,
              schedule_canceled_at: null,
              schedule_canceled_reason: null,
              schedule_capability_snapshot:
                parsedBody.schedule_capability_snapshot ?? {},
              schedule_created_at:
                typeof parsedBody.schedule_created_at === "string"
                  ? parsedBody.schedule_created_at
                  : null,
              schedule_expired_at: null,
              schedule_replaced_at: null,
              schedule_source: "dashboard",
              schedule_status: "schedule_ready",
              schedule_updated_at:
                typeof parsedBody.schedule_updated_at === "string"
                  ? parsedBody.schedule_updated_at
                  : null,
              schedule_validation_metadata:
                parsedBody.schedule_validation_metadata ?? {},
              snapshot: parsedBody.snapshot ?? {},
              snapshot_hash: String(parsedBody.snapshot_hash),
              target_count: 2,
              updated_at: "2026-06-21T12:00:00.000Z",
              user_id: USER_ID,
              validated_at: "2026-06-21T12:00:00.000Z",
              validated_target_count: 2,
            };

            return jsonResponse([replacementFanout]);
          }

          if (
            requestUrl.includes(
              "/rest/v1/content_publication_fanout_targets",
            ) &&
            method === "POST"
          ) {
            return jsonResponse([{}]);
          }

          if (
            requestUrl.includes("/rest/v1/content_publication_fanout_events") &&
            method === "GET" &&
            requestUrl.includes("schedule_replace_intent_hash")
          ) {
            const intentHash = new URL(requestUrl).searchParams.get(
              "metadata->>schedule_replace_intent_hash",
            );
            const normalizedIntentHash = intentHash?.replace(/^eq\./, "");

            return jsonResponse(
              normalizedIntentHash &&
                replaceEventIntents.has(normalizedIntentHash)
                ? [{ id: "event-fanout-replace-1" }]
                : [],
            );
          }

          if (
            requestUrl.includes("/rest/v1/content_publication_fanout_events") &&
            method === "POST"
          ) {
            const parsedBody = JSON.parse(body ?? "{}") as Record<
              string,
              unknown
            >;

            if (parsedBody.event_type === "fanout_schedule_replaced") {
              replaceEventPosts += 1;
              expect(parsedBody.source).toBe("dashboard");
              expect(parsedBody.content_publication_fanout_id).toBe(FANOUT_ID);
              expect(parsedBody.metadata).toMatchObject({
                action: "replace",
                replacement_content_publication_fanout_id:
                  FANOUT_REPLACEMENT_ID,
                schedule_replace_intent_hash: expect.any(String),
              });
              replaceEventIntents.add(
                String(parsedBody.metadata.schedule_replace_intent_hash),
              );
            }

            return jsonResponse({});
          }

          if (
            requestUrl.includes("/rest/v1/content_jobs") &&
            method === "GET"
          ) {
            return jsonResponse([
              makeApprovedContentJobRow({
                stream_id: "stream-1",
              }),
            ]);
          }

          if (
            requestUrl.includes("/rest/v1/platform_connections") &&
            method === "GET"
          ) {
            return jsonResponse([
              makeConnectionRow({
                metadata: {
                  publish_capabilities: {
                    youtube: {
                      scheduling_allowed: true,
                      support_status: "supported",
                    },
                  },
                },
              }),
            ]);
          }

          if (requestUrl.includes("/rest/v1/vod_assets") && method === "GET") {
            return jsonResponse([
              {
                id: "vod-asset-1",
                source_url: "https://cdn.example.com/vods/stream-1.mp4",
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

      const makeReplaceRequest = () =>
        fetch(
          `http://127.0.0.1:${address.port}/api/content-publications/fanouts/${FANOUT_ID}/schedule`,
          {
            body: JSON.stringify({
              action: "replace",
              reason: "Replace the fanout with the same slot",
              scheduled_at_utc: "2026-06-23T19:30:00.000Z",
              scheduled_timezone: "Europe/Berlin",
              user_id: USER_ID,
            }),
            headers: {
              Authorization: `Bearer ${API_SECRET}`,
              "content-type": "application/json",
            },
            method: "POST",
          },
        );

      const response = await makeReplaceRequest();
      const responseText = await response.text();
      if (response.status !== 200) {
        throw new Error(responseText);
      }
      expect(JSON.parse(responseText)).toMatchObject({
        action: "replace",
        content_publication_id: FANOUT_ID,
        replacement_content_publication_fanout_id: FANOUT_REPLACEMENT_ID,
        schedule_status: "schedule_replaced",
        status: "publication_schedule_replaced",
        user_id: USER_ID,
      });

      const scheduleUpdatedAtAfterFirstReplace = fanoutRow.schedule_updated_at;
      const scheduleReplacedAtAfterFirstReplace =
        fanoutRow.schedule_replaced_at;

      const repeatedResponse = await makeReplaceRequest();
      const repeatedResponseText = await repeatedResponse.text();
      expect(repeatedResponse.status).toBe(200);
      expect(JSON.parse(repeatedResponseText)).toMatchObject({
        action: "replace",
        content_publication_id: FANOUT_ID,
        replacement_content_publication_fanout_id: FANOUT_REPLACEMENT_ID,
        schedule_status: "schedule_replaced",
        status: "publication_schedule_replaced",
        user_id: USER_ID,
      });
      expect(schedulePatchStatuses).toEqual(["schedule_replaced"]);
      expect(fanoutRow.schedule_updated_at).toBe(
        scheduleUpdatedAtAfterFirstReplace,
      );
      expect(fanoutRow.schedule_replaced_at).toBe(
        scheduleReplacedAtAfterFirstReplace,
      );
      expect(replaceEventPosts).toBe(1);
      expect(
        requests.some((request) => request.url.includes("automation-service")),
      ).toBe(false);
      expect(requests.some((request) => request.url.includes("worker"))).toBe(
        false,
      );
    } finally {
      server.close();
    }
  });

  it("cancels a fanout schedule without triggering worker or provider execution", async () => {
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
              makeFanoutRow({
                fanout_status: "validated",
                schedule_source: "dashboard",
                schedule_status: "scheduled",
                scheduled_at_utc: "2026-06-22T18:30:00.000Z",
                scheduled_timezone: "Europe/Berlin",
                target_count: 2,
                validated_target_count: 2,
              }),
            ]);
          }

          if (
            requestUrl.includes("/rest/v1/content_publication_fanouts") &&
            method === "PATCH"
          ) {
            const parsedBody = JSON.parse(body ?? "{}") as Record<
              string,
              unknown
            >;

            expect(parsedBody.schedule_status).toBe("schedule_canceled");
            expect(parsedBody.schedule_canceled_reason).toBe(
              "Operator canceled the fanout schedule.",
            );
            expect(parsedBody.schedule_source).toBe("dashboard");
            return jsonResponse([]);
          }

          if (
            requestUrl.includes("/rest/v1/content_publication_fanout_events") &&
            method === "POST"
          ) {
            const parsedBody = JSON.parse(body ?? "{}") as Record<
              string,
              unknown
            >;

            expect(parsedBody.event_type).toBe("fanout_schedule_canceled");
            expect(parsedBody.source).toBe("dashboard");
            expect(parsedBody.metadata).toMatchObject({
              action: "cancel",
              target_count: 2,
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
        `http://127.0.0.1:${address.port}/api/content-publications/fanouts/${FANOUT_ID}/schedule`,
        {
          body: JSON.stringify({
            action: "cancel",
            reason: "Operator canceled the fanout schedule.",
            user_id: USER_ID,
          }),
          headers: {
            Authorization: `Bearer ${API_SECRET}`,
            "content-type": "application/json",
          },
          method: "POST",
        },
      );

      const responseText = await response.text();

      expect(response.status).toBe(200);
      const payload = JSON.parse(responseText) as Record<string, unknown>;

      expect(payload).toMatchObject({
        action: "cancel",
        content_publication_id: FANOUT_ID,
        replacement_content_publication_id: null,
        replacement_content_publication_fanout_id: null,
        schedule_status: "schedule_canceled",
        status: "publication_schedule_canceled",
        user_id: USER_ID,
      });
      expect(
        requests.some((request) => request.url.includes("automation-service")),
      ).toBe(false);
      expect(requests.some((request) => request.url.includes("worker"))).toBe(
        false,
      );
    } finally {
      server.close();
    }
  });
});

function makePublicationRow(overrides: Record<string, unknown> = {}) {
  return {
    capability_snapshot: {},
    capability_version: PUBLICATION_CAPABILITY_VERSION,
    content_job_id: CONTENT_JOB_ID,
    external_post_id: null,
    external_url: null,
    id: PUBLICATION_ID,
    max_retries: 3,
    next_retry_at: null,
    platform_connection_id: PLATFORM_CONNECTION_ID,
    publication_status: "requested",
    published_at: null,
    provider_overrides: {},
    requested_by: USER_ID,
    request_intent_hash:
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    requested_at: "2026-06-21T10:00:00.000Z",
    retry_count: 0,
    review_status_at_request: "approved",
    schedule_block_message: null,
    schedule_block_reason: null,
    schedule_canceled_at: null,
    schedule_canceled_reason: null,
    schedule_capability_snapshot: {},
    schedule_created_at: "2026-06-21T10:00:00.000Z",
    schedule_expired_at: null,
    schedule_replaced_at: null,
    schedule_source: "dashboard",
    schedule_status: "scheduled",
    schedule_updated_at: "2026-06-21T10:00:00.000Z",
    schedule_validation_metadata: {},
    schedule_execution_attempt_count: 0,
    schedule_execution_claimed_at: null,
    schedule_execution_claimed_by: null,
    schedule_execution_completed_at: null,
    schedule_execution_error_code: null,
    schedule_execution_error_message: null,
    schedule_execution_last_attempt_at: null,
    schedule_execution_max_retries: 3,
    schedule_execution_metadata: {},
    schedule_execution_next_attempt_at: null,
    schedule_execution_queue_job_id: null,
    schedule_execution_status: "idle",
    scheduled_at_utc: "2026-06-22T18:30:00.000Z",
    scheduled_timezone: "Europe/Berlin",
    snapshot: {},
    snapshot_hash:
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    target_platform: "youtube",
    user_id: USER_ID,
    validated_at: "2026-06-21T10:00:00.000Z",
    validation_code: "validated",
    validation_message: "Publish request validated by the gateway.",
    ...overrides,
  };
}

function makeApprovedContentJobRow(overrides: Record<string, unknown> = {}) {
  return {
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
    status: "done",
    stream_id: "stream-1",
    type: "repurposing",
    user_id: USER_ID,
    updated_at: "2026-06-21T10:00:00.000Z",
    ...overrides,
  };
}

function makeConnectionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PLATFORM_CONNECTION_ID,
    metadata: {},
    platform: "youtube",
    provider_profile: {},
    scopes: [
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/youtube.upload",
    ],
    status: "connected",
    user_id: USER_ID,
    ...overrides,
  };
}

function makeFanoutRow(overrides: Record<string, unknown> = {}) {
  return {
    blocked_target_count: 0,
    content_job_id: CONTENT_JOB_ID,
    created_at: "2026-06-21T10:00:00.000Z",
    fanout_policy: "prepare_valid_targets",
    fanout_status: "validated",
    id: FANOUT_ID,
    last_action_at: null,
    last_action_key: null,
    last_action_result: null,
    last_aggregate_refreshed_at: null,
    requested_at: "2026-06-21T10:00:00.000Z",
    requested_by: USER_ID,
    request_intent_hash:
      "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    review_status_at_request: "approved",
    schedule_block_message: null,
    schedule_block_reason: null,
    schedule_canceled_at: null,
    schedule_canceled_reason: null,
    schedule_capability_snapshot: {},
    schedule_created_at: "2026-06-21T10:00:00.000Z",
    schedule_expired_at: null,
    schedule_replaced_at: null,
    schedule_source: "dashboard",
    schedule_status: "scheduled",
    schedule_updated_at: "2026-06-21T10:00:00.000Z",
    schedule_validation_metadata: {},
    snapshot: {
      capabilityVersion: PUBLICATION_CAPABILITY_VERSION,
    },
    snapshot_hash:
      "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    target_count: 2,
    updated_at: "2026-06-21T10:00:00.000Z",
    user_id: USER_ID,
    validated_at: "2026-06-21T10:00:00.000Z",
    validated_target_count: 2,
    ...overrides,
  };
}

function makeFanoutTargetRow(overrides: Record<string, unknown> = {}) {
  return {
    block_message: null,
    block_reason: null,
    capability_snapshot: {},
    capability_version: PUBLICATION_CAPABILITY_VERSION,
    content_publication_fanout_id: FANOUT_ID,
    content_publication_id: null,
    created_at: "2026-06-21T10:00:00.000Z",
    last_action_at: null,
    last_action_key: null,
    last_action_result: null,
    last_block_reason: null,
    last_rechecked_at: null,
    id: "fanout-target-1",
    platform_connection_id: PLATFORM_CONNECTION_ID,
    provider_overrides: {},
    request_intent_hash:
      "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    target_platform: "youtube",
    target_status: "validated",
    updated_at: "2026-06-21T10:00:00.000Z",
    user_id: USER_ID,
    validated_at: "2026-06-21T10:00:00.000Z",
    ...overrides,
  };
}
