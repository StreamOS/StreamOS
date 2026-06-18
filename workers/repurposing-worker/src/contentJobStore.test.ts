import assert from "node:assert/strict";
import test from "node:test";

import {
  createSupabaseRepurposingPlanStore,
  type RepurposingContentJobRow,
} from "./contentJobStore.js";

const CONTENT_JOB_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const QUEUE_JOB_ID = "repurposing-plan-33333333-3333-4333-8333-333333333333";

void test("loadById resolves the durable repurposing payload by content and queue ids", async () => {
  const fetchFn = async (_input: Parameters<typeof fetch>[0]) =>
    new Response(
      JSON.stringify([
        {
          id: CONTENT_JOB_ID,
          job_type: "repurposing",
          max_retries: 3,
          payload: {
            auto_repurpose_enabled: true,
            channel_id: "33333333-3333-4333-8333-333333333333",
            content_policy_profile: "short-form-safe",
            enrichment_status: "asset_available",
            manual_review_required: true,
            source_event_type: "video.published",
            source_provider: "youtube",
            source_video_id: "video-123",
            stream_id: "44444444-4444-4444-8444-444444444444",
            user_id: USER_ID,
            vod_asset_url: "https://cdn.example.com/vods/test.mp4",
            workflow: "repurposing_plan",
          },
          queue_job_id: QUEUE_JOB_ID,
          retry_count: 0,
          started_at: null,
          status: "pending",
          user_id: USER_ID,
        },
      ]),
      { status: 200 },
    );

  const store = createSupabaseRepurposingPlanStore({
    fetchFn,
    serviceRoleKey: "service-role-key",
    supabaseUrl: "https://project.supabase.co",
  });

  const row = (await store.loadById({
    contentJobId: CONTENT_JOB_ID,
    queueJobId: QUEUE_JOB_ID,
    userId: USER_ID,
  })) as RepurposingContentJobRow | null;

  assert.equal(row?.id, CONTENT_JOB_ID);
  assert.equal(row?.queue_job_id, QUEUE_JOB_ID);
  assert.equal(row?.payload.manual_review_required, true);
});

void test("updateById only sends explicitly provided fields", async () => {
  const requests: Array<{ body: Record<string, unknown>; url: string }> = [];
  const fetchFn = async (
    _input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    requests.push({
      body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
      url: String(_input),
    });
    return new Response("[]", { status: 200 });
  };

  const store = createSupabaseRepurposingPlanStore({
    fetchFn,
    serviceRoleKey: "service-role-key",
    supabaseUrl: "https://project.supabase.co",
  });

  await store.updateById(CONTENT_JOB_ID, {
    completed_at: "2026-06-18T10:00:00.000Z",
    error_message: null,
    max_retries: 3,
    result: { manual_review_required: true },
    retry_count: 1,
    status: "done",
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.url.includes("id=eq." + CONTENT_JOB_ID), true);
  assert.deepEqual(requests[0]?.body, {
    completed_at: "2026-06-18T10:00:00.000Z",
    error_message: null,
    max_retries: 3,
    result: { manual_review_required: true },
    retry_count: 1,
    status: "done",
    updated_at: requests[0]?.body.updated_at,
  });
  assert.equal("started_at" in (requests[0]?.body ?? {}), false);
});
