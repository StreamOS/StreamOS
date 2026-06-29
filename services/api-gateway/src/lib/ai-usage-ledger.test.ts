import { describe, expect, it } from "vitest";

import {
  readAiUsageMonthlyLedgerSummary,
  recordAiUsageLedgerEntry,
} from "./ai-usage-ledger.js";
import { createSupabaseRestClient } from "./supabaseRest.js";

const SUPABASE_URL = "https://supabase.streamos.test";
const SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
const TENANT_ID = "tenant-123";
const USER_ID = "11111111-1111-4111-8111-111111111111";

describe("AI usage ledger repository", () => {
  it("records a minimal reserved usage entry and excludes raw prompt/context fields", async () => {
    let requestUrl = "";
    let requestBody = "";
    const client = createSupabaseRestClient({
      fetchImpl: async (input, init) => {
        requestUrl =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        requestBody = String(init?.body ?? "");

        return new Response(
          JSON.stringify([
            {
              created_at: "2026-06-29T21:55:00.000Z",
              error_category: null,
              estimated_usage_units: 12,
              feature: "ai_assistant",
              final_usage_units: null,
              id: "11111111-1111-4111-8111-111111111119",
              ledger_status: "reserved",
              plan_at_request_time: "pro",
              plan_source: "persisted_server_plan",
              request_classification: "assistant_prompt",
              request_id: "req-123",
              tenant_id: TENANT_ID,
              updated_at: "2026-06-29T21:55:00.000Z",
              usage_month: "2026-06-01",
              user_id: USER_ID,
            },
          ]),
          {
            headers: {
              "Content-Type": "application/json",
            },
            status: 200,
          },
        );
      },
      serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
      supabaseUrl: SUPABASE_URL,
    });

    const entry = await recordAiUsageLedgerEntry({
      client,
      input: {
        estimatedUsageUnits: 12,
        feature: "ai_assistant",
        ledgerStatus: "reserved",
        planAtRequestTime: "pro",
        planSource: "persisted_server_plan",
        prompt: "private prompt that must never be stored",
        rawContextPayload: {
          privateUrl: "https://private.example.com?token=sk-secret",
        },
        requestClassification: "assistant_prompt",
        requestId: "req-123",
        tenantId: TENANT_ID,
        userId: USER_ID,
      } as {
        estimatedUsageUnits: number;
        feature: "ai_assistant";
        ledgerStatus: "reserved";
        planAtRequestTime: "pro";
        planSource: "persisted_server_plan";
        prompt?: string;
        rawContextPayload?: Record<string, unknown>;
        requestClassification: string;
        requestId: string;
        tenantId: string;
        userId: string;
      },
    });

    expect(requestUrl).toContain("/rest/v1/ai_usage_ledger");
    expect(requestUrl).toContain("on_conflict=user_id%2Crequest_id");
    expect(entry).toMatchObject({
      estimatedUsageUnits: 12,
      feature: "ai_assistant",
      ledgerStatus: "reserved",
      requestClassification: "assistant_prompt",
      requestId: "req-123",
      tenantId: TENANT_ID,
      userId: USER_ID,
    });
    expect(requestBody).toContain('"request_id":"req-123"');
    expect(requestBody).toContain('"tenant_id":"tenant-123"');
    expect(requestBody).not.toContain(
      "private prompt that must never be stored",
    );
    expect(requestBody).not.toContain("rawContextPayload");
    expect(requestBody).not.toContain("model_response");
    expect(requestBody).not.toContain("private.example.com");
    expect(requestBody).not.toContain("sk-secret");
  });

  it("rejects writes with missing tenant, user, or feature context before any fetch", async () => {
    let fetchCalls = 0;
    const client = createSupabaseRestClient({
      fetchImpl: async () => {
        fetchCalls += 1;
        return new Response("unexpected", { status: 500 });
      },
      serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
      supabaseUrl: SUPABASE_URL,
    });

    await expect(
      recordAiUsageLedgerEntry({
        client,
        input: {
          estimatedUsageUnits: 12,
          feature: "ai_assistant",
          ledgerStatus: "reserved",
          planAtRequestTime: "pro",
          planSource: "persisted_server_plan",
          requestClassification: "assistant_prompt",
          requestId: "req-123",
          tenantId: "",
          userId: USER_ID,
        },
      }),
    ).rejects.toThrow("AI usage ledger tenantId is invalid.");
    expect(fetchCalls).toBe(0);
  });

  it("reads a monthly summary from the ledger with tenant and user filters", async () => {
    let requestUrl = "";
    const client = createSupabaseRestClient({
      fetchImpl: async (input) => {
        requestUrl =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        return new Response(
          JSON.stringify([
            {
              estimated_usage_units: 12,
              final_usage_units: null,
              ledger_status: "reserved",
              tenant_id: TENANT_ID,
              user_id: USER_ID,
            },
            {
              estimated_usage_units: 12,
              final_usage_units: 9,
              ledger_status: "recorded",
              tenant_id: TENANT_ID,
              user_id: USER_ID,
            },
            {
              estimated_usage_units: 12,
              final_usage_units: null,
              ledger_status: "denied",
              tenant_id: TENANT_ID,
              user_id: USER_ID,
            },
          ]),
          {
            headers: {
              "Content-Type": "application/json",
            },
            status: 200,
          },
        );
      },
      serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
      supabaseUrl: SUPABASE_URL,
    });

    const summary = await readAiUsageMonthlyLedgerSummary({
      client,
      feature: "ai_assistant",
      monthStart: new Date("2026-06-15T13:10:00.000Z"),
      tenantId: TENANT_ID,
      userId: USER_ID,
    });

    expect(requestUrl).toContain("/rest/v1/ai_usage_ledger");
    expect(requestUrl).toContain("feature=eq.ai_assistant");
    expect(requestUrl).toContain("tenant_id=eq.tenant-123");
    expect(requestUrl).toContain(`user_id=eq.${USER_ID}`);
    expect(requestUrl).toContain("usage_month=eq.2026-06-01");
    expect(summary).toEqual({
      deniedCount: 1,
      feature: "ai_assistant",
      monthStart: "2026-06-01",
      recordedUsageUnits: 9,
      reservedUsageUnits: 12,
      tenantId: TENANT_ID,
      totalRows: 3,
      userId: USER_ID,
    });
  });

  it("does not leak cross-tenant rows into the monthly summary", async () => {
    const client = createSupabaseRestClient({
      fetchImpl: async () =>
        new Response(
          JSON.stringify([
            {
              estimated_usage_units: 12,
              final_usage_units: null,
              ledger_status: "reserved",
              tenant_id: "tenant-other",
              user_id: USER_ID,
            },
            {
              estimated_usage_units: 12,
              final_usage_units: 6,
              ledger_status: "recorded",
              tenant_id: TENANT_ID,
              user_id: USER_ID,
            },
          ]),
          {
            headers: {
              "Content-Type": "application/json",
            },
            status: 200,
          },
        ),
      serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
      supabaseUrl: SUPABASE_URL,
    });

    const summary = await readAiUsageMonthlyLedgerSummary({
      client,
      feature: "ai_assistant",
      monthStart: new Date("2026-06-01T00:00:00.000Z"),
      tenantId: TENANT_ID,
      userId: USER_ID,
    });

    expect(summary.reservedUsageUnits).toBe(0);
    expect(summary.recordedUsageUnits).toBe(6);
    expect(summary.deniedCount).toBe(0);
  });
});
