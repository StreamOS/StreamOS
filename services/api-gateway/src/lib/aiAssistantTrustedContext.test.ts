import { describe, expect, it } from "vitest";

import {
  readTrustedAiAssistantContext,
  trustedAiAssistantContextReadRequestSchema,
} from "./aiAssistantTrustedContext.js";
import { createSupabaseRestClient } from "./supabaseRest.js";

const SUPABASE_URL = "https://supabase.streamos.test";
const SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
const TENANT_ID = "tenant-123";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";

describe("AI assistant trusted context contract", () => {
  it("returns sanitized tenant-scoped summaries for the two low-risk sources", async () => {
    const requests: string[] = [];
    const supabase = createSupabaseRestClient({
      fetchImpl: async (input) => {
        const requestUrl =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        requests.push(requestUrl);

        if (requestUrl.includes("/rest/v1/platform_connections")) {
          return jsonResponse([
            {
              id: "platform-row-1",
              metadata: {
                token: "should-not-leak",
                websub: {
                  failedRenewals: 0,
                  lastRenewedAt: "2026-06-29T19:00:00.000Z",
                },
              },
              platform: "youtube",
              status: "connected",
              updated_at: "2026-06-29T19:01:00.000Z",
              user_id: USER_ID,
            },
            {
              id: "platform-row-2",
              metadata: {
                refresh_token: "also-hidden",
              },
              platform: "twitch",
              status: "expired",
              updated_at: "2026-06-29T18:00:00.000Z",
              user_id: OTHER_USER_ID,
            },
          ]);
        }

        if (requestUrl.includes("/rest/v1/content_jobs")) {
          return jsonResponse([
            {
              created_at: "2026-06-29T18:30:00.000Z",
              error_message:
                "Upstream provider rate limited request for https://private.example.com?token=secret.",
              id: "job-row-1",
              job_type: "repurposing",
              retry_count: 2,
              status: "failed",
              updated_at: "2026-06-29T18:45:00.000Z",
              user_id: USER_ID,
            },
            {
              created_at: "2026-06-29T17:30:00.000Z",
              error_message: "Wrong tenant row should not be visible.",
              id: "job-row-2",
              job_type: "transcription",
              retry_count: 0,
              status: "completed",
              updated_at: "2026-06-29T17:45:00.000Z",
              user_id: OTHER_USER_ID,
            },
          ]);
        }

        return new Response("not found", { status: 404 });
      },
      serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
      supabaseUrl: SUPABASE_URL,
    });

    const result = await readTrustedAiAssistantContext({
      input: {
        sources: ["channel_platform_status", "content_job_summary"],
        tenant_id: TENANT_ID,
        user_id: USER_ID,
      },
      supabase,
    });

    expect(result).toEqual({
      sources: [
        {
          records: [
            {
              connection_state: "connected",
              last_sync_at: "2026-06-29T19:00:00.000Z",
              provider: "youtube",
              status_reason: "status_connected",
            },
          ],
          source: "channel_platform_status",
        },
        {
          records: [
            {
              created_at: "2026-06-29T18:30:00.000Z",
              error_category: "provider_rate_limit",
              job_type: "repurposing",
              retry_count: 2,
              status: "failed",
              updated_at: "2026-06-29T18:45:00.000Z",
            },
          ],
          source: "content_job_summary",
        },
      ],
      tenant_id: TENANT_ID,
      user_id: USER_ID,
    });

    expect(requests).toHaveLength(2);
    expect(requests[0]).toContain(
      "user_id=eq.11111111-1111-4111-8111-111111111111",
    );
    expect(requests[1]).toContain(
      "user_id=eq.11111111-1111-4111-8111-111111111111",
    );
    expect(requests[0]).not.toContain("access_token_ciphertext");
    expect(requests[0]).not.toContain("refresh_token_ciphertext");
    expect(requests[0]).not.toContain("provider_profile");
    expect(requests[0]).not.toContain("scopes");
    expect(requests[1]).not.toContain("payload");
    expect(requests[1]).not.toContain("result");

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("token");
    expect(serialized).not.toContain("private.example.com");
    expect(serialized).not.toContain("https://");
    expect(serialized).not.toContain("refresh_token");
    expect(serialized).not.toContain("provider_profile");
  });

  it("returns empty-safe records when cross-tenant rows are the only rows returned", async () => {
    const supabase = createSupabaseRestClient({
      fetchImpl: async (input) => {
        const requestUrl =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (requestUrl.includes("/rest/v1/platform_connections")) {
          return jsonResponse([
            {
              id: "platform-row-2",
              metadata: {},
              platform: "twitch",
              status: "connected",
              updated_at: "2026-06-29T18:00:00.000Z",
              user_id: OTHER_USER_ID,
            },
          ]);
        }

        if (requestUrl.includes("/rest/v1/content_jobs")) {
          return jsonResponse([
            {
              created_at: "2026-06-29T17:30:00.000Z",
              error_message: "Wrong tenant row should not be visible.",
              id: "job-row-2",
              job_type: "transcription",
              retry_count: 0,
              status: "completed",
              updated_at: "2026-06-29T17:45:00.000Z",
              user_id: OTHER_USER_ID,
            },
          ]);
        }

        return new Response("not found", { status: 404 });
      },
      serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
      supabaseUrl: SUPABASE_URL,
    });

    const result = await readTrustedAiAssistantContext({
      input: {
        sources: ["channel_platform_status", "content_job_summary"],
        tenant_id: TENANT_ID,
        user_id: USER_ID,
      },
      supabase,
    });

    expect(result.sources).toEqual([
      {
        records: [],
        source: "channel_platform_status",
      },
      {
        records: [],
        source: "content_job_summary",
      },
    ]);
  });

  it("requires tenant and user context in the trusted read schema", () => {
    const parsed = trustedAiAssistantContextReadRequestSchema.safeParse({
      sources: ["channel_platform_status"],
      tenant_id: "",
      user_id: "not-a-uuid",
    });

    expect(parsed.success).toBe(false);
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
