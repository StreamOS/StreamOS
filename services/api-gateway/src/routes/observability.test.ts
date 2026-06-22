import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../app.js";

const API_SECRET = "test-api-gateway-secret-123";
const SUPABASE_URL = "https://supabase.streamos.test";
const SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
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

describe("scheduler observability route", () => {
  afterEach(() => {
    restoreEnvValue(
      "SUPABASE_SERVICE_ROLE_KEY",
      ORIGINAL_ENV.SUPABASE_SERVICE_ROLE_KEY,
    );
    restoreEnvValue("SUPABASE_URL", ORIGINAL_ENV.SUPABASE_URL);
  });

  it("returns a protected, secret-safe scheduler snapshot", async () => {
    useSupabaseTestEnv();
    const requests: Array<{ method: string; url: string }> = [];
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
          const parsedUrl = new URL(requestUrl);
          const method = init?.method ?? "GET";
          requests.push({ method, url: requestUrl });

          if (
            requestUrl.includes(
              "/rest/v1/content_publication_scheduler_runs",
            ) &&
            method === "GET"
          ) {
            expect(parsedUrl.searchParams.get("scheduler_name")).toBe(
              "eq.publishing-scheduler-worker",
            );
            expect(parsedUrl.searchParams.get("limit")).toBe("2");

            return jsonResponse([
              {
                batch_size: 25,
                claim_timeout_ms: 300000,
                completed_at: "2026-06-21T12:10:00.000Z",
                created_at: "2026-06-21T12:00:00.000Z",
                due_claim_count: 2,
                id: "11111111-1111-4111-8111-111111111111",
                last_attempt_at: "2026-06-21T12:09:59.000Z",
                last_error_code: "queue_enqueue_failed",
                last_error_message:
                  "Queue enqueue failed at rediss://secret.example.com/0",
                metadata: {
                  access_token: "should-not-leak",
                  batch_size: 25,
                  claim_timeout_ms: 300000,
                  poll_interval_ms: 30000,
                  run_id: "11111111-1111-4111-8111-111111111111",
                  scheduler_worker_id: "publishing-scheduler-worker",
                },
                permanent_failed_count: 1,
                poll_interval_ms: 30000,
                queued_count: 1,
                recovered_count: 1,
                retryable_failed_count: 1,
                run_status: "completed_with_warnings",
                scanned_count: 3,
                scheduler_name: "publishing-scheduler-worker",
                skipped_count: 0,
                started_at: "2026-06-21T12:00:00.000Z",
                stale_claim_count: 1,
                stuck_claim_count: 1,
                updated_at: "2026-06-21T12:10:00.000Z",
                worker_id: "publishing-scheduler-worker",
              },
              {
                batch_size: 25,
                claim_timeout_ms: 300000,
                completed_at: null,
                created_at: "2026-06-21T11:30:00.000Z",
                due_claim_count: 0,
                id: "22222222-2222-4222-8222-222222222222",
                last_attempt_at: "2026-06-21T11:30:00.000Z",
                last_error_code: null,
                last_error_message: null,
                metadata: {
                  batch_size: 25,
                  claim_timeout_ms: 300000,
                  poll_interval_ms: 30000,
                  run_id: "22222222-2222-4222-8222-222222222222",
                  scheduler_worker_id: "publishing-scheduler-worker",
                },
                permanent_failed_count: 0,
                poll_interval_ms: 30000,
                queued_count: 0,
                recovered_count: 0,
                retryable_failed_count: 0,
                run_status: "running",
                scanned_count: 0,
                scheduler_name: "publishing-scheduler-worker",
                skipped_count: 0,
                started_at: "2026-06-21T11:30:00.000Z",
                stale_claim_count: 0,
                stuck_claim_count: 0,
                updated_at: "2026-06-21T11:30:00.000Z",
                worker_id: "publishing-scheduler-worker",
              },
            ]);
          }

          if (
            requestUrl.includes(
              "/rest/v1/content_publication_scheduler_run_attempts",
            ) &&
            method === "GET"
          ) {
            expect(parsedUrl.searchParams.get("scheduler_run_id")).toBe(
              "in.(11111111-1111-4111-8111-111111111111,22222222-2222-4222-8222-222222222222)",
            );
            expect(parsedUrl.searchParams.get("limit")).toBe("3");

            return jsonResponse([
              {
                attempt_count: 2,
                attempt_kind: "due_claim",
                attempt_status: "retryable_failed",
                claimed_at: "2026-06-21T12:09:58.000Z",
                claimed_by: "publishing-scheduler-worker",
                content_publication_id: "33333333-3333-4333-8333-333333333333",
                created_at: "2026-06-21T12:09:59.000Z",
                error_code: "queue_enqueue_failed",
                error_message:
                  "Retryable failure via https://private.example.com/path",
                id: "44444444-4444-4444-8444-444444444444",
                metadata: {
                  private_url: "https://private.example.com/path",
                  queue_job_id: "publication-execution-33333333",
                  retry_count: 2,
                  retryable: true,
                  user_id: "55555555-5555-4555-8555-555555555555",
                },
                next_attempt_at: "2026-06-21T12:15:00.000Z",
                queue_job_id: "publication-execution-33333333",
                retryable: true,
                scheduled_at_utc: "2026-06-21T12:10:00.000Z",
                scheduler_run_id: "11111111-1111-4111-8111-111111111111",
                source: "publishing-scheduler-worker",
                stuck_claim: false,
                user_id: "55555555-5555-4555-8555-555555555555",
              },
              {
                attempt_count: 1,
                attempt_kind: "stale_claim",
                attempt_status: "stuck_claim",
                claimed_at: "2026-06-21T11:59:00.000Z",
                claimed_by: "publishing-scheduler-worker",
                content_publication_id: "66666666-6666-4666-8666-666666666666",
                created_at: "2026-06-21T12:00:01.000Z",
                error_code: "stuck_claim",
                error_message:
                  "Claim expired before queue confirmation: rediss://secret.example.com/0",
                id: "77777777-7777-4777-8777-777777777777",
                metadata: {
                  claimed_by: "publishing-scheduler-worker",
                  queue_job_id: "publication-execution-66666666",
                  retry_count: 1,
                  retryable: true,
                  scheduled_at_utc: "2026-06-21T12:00:00.000Z",
                  stuck_claim: true,
                  user_id: "55555555-5555-4555-8555-555555555555",
                },
                next_attempt_at: "2026-06-21T12:05:00.000Z",
                queue_job_id: "publication-execution-66666666",
                retryable: true,
                scheduled_at_utc: "2026-06-21T12:00:00.000Z",
                scheduler_run_id: "11111111-1111-4111-8111-111111111111",
                source: "publishing-scheduler-worker",
                stuck_claim: true,
                user_id: "55555555-5555-4555-8555-555555555555",
              },
              {
                attempt_count: 0,
                attempt_kind: "due_claim",
                attempt_status: "queued",
                claimed_at: null,
                claimed_by: null,
                content_publication_id: "88888888-8888-4888-8888-888888888888",
                created_at: "2026-06-21T12:10:01.000Z",
                error_code: null,
                error_message: null,
                id: "99999999-9999-4999-8999-999999999999",
                metadata: {
                  queue_job_already_exists: true,
                  queue_job_id: "publication-execution-88888888",
                },
                next_attempt_at: null,
                queue_job_id: "publication-execution-88888888",
                retryable: false,
                scheduled_at_utc: "2026-06-21T12:10:00.000Z",
                scheduler_run_id: "22222222-2222-4222-8222-222222222222",
                source: "publishing-scheduler-worker",
                stuck_claim: false,
                user_id: "55555555-5555-4555-8555-555555555555",
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
        `http://127.0.0.1:${address.port}/api/observability/scheduler?scheduler_name=publishing-scheduler-worker&run_limit=2&attempt_limit=3`,
        {
          headers: {
            Authorization: `Bearer ${API_SECRET}`,
          },
        },
      );
      const payload = (await response.json()) as Record<string, unknown>;

      expect(response.status).toBe(200);
      expect(payload.status).toBe("scheduler_observability_ready");
      expect(payload.scheduler_name).toBe("publishing-scheduler-worker");
      expect(payload.latest_run).toMatchObject({
        id: "11111111-1111-4111-8111-111111111111",
        run_status: "completed_with_warnings",
        worker_id: "publishing-scheduler-worker",
      });
      expect(payload.recent_runs).toHaveLength(2);
      expect(payload.recent_attempts).toHaveLength(3);
      expect(JSON.stringify(payload)).not.toContain("rediss://");
      expect(JSON.stringify(payload)).not.toContain(
        "https://private.example.com",
      );
      expect(JSON.stringify(payload)).not.toContain("should-not-leak");
      expect((payload.latest_run as Record<string, unknown>).metadata).toEqual(
        expect.objectContaining({
          batch_size: 25,
          claim_timeout_ms: 300000,
          poll_interval_ms: 30000,
          run_id: "11111111-1111-4111-8111-111111111111",
          scheduler_worker_id: "publishing-scheduler-worker",
        }),
      );
      expect(
        (payload.latest_run as Record<string, unknown>).metadata,
      ).not.toHaveProperty("access_token");
      expect(payload.summary as Record<string, unknown>).toMatchObject({
        attempt_count: 3,
        completed_run_count: 1,
        failed_run_count: 0,
        latest_run_status: "completed_with_warnings",
        permanent_failed_count: 1,
        queued_count: 1,
        recovered_count: 1,
        retryable_failed_count: 1,
        run_count: 2,
        scanned_count: 3,
        skipped_count: 0,
        stale_claim_count: 1,
        stuck_attempt_count: 1,
        stuck_claim_count: 1,
      });
      expect(requests).toHaveLength(2);
    } finally {
      server.close();
    }
  });

  it("rejects invalid scheduler observability queries", async () => {
    useSupabaseTestEnv();
    const app = createApp({
      apiGatewaySecret: API_SECRET,
      nodeEnv: "test",
    });
    const server = app.listen(0);

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected TCP server address.");
      }

      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/observability/scheduler?run_limit=0`,
        {
          headers: {
            Authorization: `Bearer ${API_SECRET}`,
          },
        },
      );
      const payload = await response.json();

      expect(response.status).toBe(400);
      expect(payload.error).toBe("invalid_scheduler_observability_query");
    } finally {
      server.close();
    }
  });

  it("requires the API gateway secret for scheduler observability", async () => {
    useSupabaseTestEnv();
    let fetchCalls = 0;
    const app = createApp({
      apiGatewaySecret: API_SECRET,
      nodeEnv: "test",
      oauth: {
        fetchImpl: async () => {
          fetchCalls += 1;
          return new Response("unexpected", { status: 500 });
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
        `http://127.0.0.1:${address.port}/api/observability/scheduler`,
      );
      const payload = await response.json();

      expect(response.status).toBe(401);
      expect(payload.error).toBe("invalid_api_gateway_secret");
      expect(fetchCalls).toBe(0);
    } finally {
      server.close();
    }
  });
});
