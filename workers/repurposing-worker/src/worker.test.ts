import assert from "node:assert/strict";
import test from "node:test";

import type { RepurposingPlanAutomationRequest } from "./automationClient.js";
import {
  ProviderRateLimitError,
  createAutomationClient,
} from "./automationClient.js";
import { processRepurposingPlanJob } from "./worker.js";
import type { RepurposingPlanContentJobStore } from "./contentJobStore.js";

const CONTENT_JOB_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const QUEUE_JOB_ID = "repurposing-plan-33333333-3333-4333-8333-333333333333";

function createJob(
  data: Record<string, unknown>,
  overrides: Partial<{
    attemptsMade: number;
    attempts: number;
  }> = {},
) {
  let discarded = 0;

  return {
    attemptsMade: overrides.attemptsMade ?? 0,
    data,
    discard: async () => {
      discarded += 1;
    },
    get discardCount() {
      return discarded;
    },
    id: QUEUE_JOB_ID,
    opts: {
      attempts: overrides.attempts ?? 3,
      backoff: {
        delay: 30_000,
        type: "exponential" as const,
      },
    },
  };
}

function createStore(
  loadedPayloadOverrides: Record<string, unknown> = {},
): RepurposingPlanContentJobStore & {
  calls: Array<{ contentJobId: string; patch: Record<string, unknown> }>;
} {
  const calls: Array<{ contentJobId: string; patch: Record<string, unknown> }> =
    [];

  return {
    calls,
    loadById: async () => ({
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
        ...loadedPayloadOverrides,
      },
      queue_job_id: QUEUE_JOB_ID,
      retry_count: 0,
      started_at: null,
      status: "pending",
      user_id: USER_ID,
    }),
    updateById: async (contentJobId, patch) => {
      calls.push({
        contentJobId,
        patch: patch as Record<string, unknown>,
      });
    },
  };
}

void test("processRepurposingPlanJob completes successfully and persists the plan", async () => {
  const store = createStore();
  const automationRequests: Array<RepurposingPlanAutomationRequest> = [];
  const result = await processRepurposingPlanJob(
    createJob({
      content_job_id: CONTENT_JOB_ID,
      manual_review_required: true,
      provider: "youtube",
      queue_job_id: QUEUE_JOB_ID,
      source_event_type: "video.published",
      source_metadata: {},
      user_id: USER_ID,
    }),
    {
      automationClient: {
        async planRepurposing(payload) {
          automationRequests.push(payload);
          return {
            captions: ["Caption"],
            confidence: 88,
            content_job_id: CONTENT_JOB_ID,
            descriptions: ["Description"],
            hashtag_sets: [["#streamos"]],
            hook_ideas: ["Hook"],
            manual_review_required: true,
            model: "gpt-4o",
            provider: "openai",
            queue_job_id: QUEUE_JOB_ID,
            review_notes: ["Manual review required."],
            short_form_plan: "Plan",
            title_suggestions: ["Title"],
            warnings: ["Needs manual review."],
          };
        },
      },
      statusStore: store,
    },
  );

  assert.equal(automationRequests.length, 1);
  assert.equal(automationRequests[0]?.manual_review_required, true);
  assert.equal(automationRequests[0]?.queue_job_id, QUEUE_JOB_ID);
  assert.equal(result.queue_job_id, QUEUE_JOB_ID);
  assert.equal(store.calls.length, 2);
  assert.equal(store.calls[0]?.patch.status, "processing");
  assert.equal(store.calls[1]?.patch.status, "done");
  assert.equal(store.calls[1]?.patch.result?.manual_review_required, true);
});

void test("processRepurposingPlanJob classifies provider rate limits as retryable", async () => {
  const store = createStore();
  const job = createJob({
    content_job_id: CONTENT_JOB_ID,
    manual_review_required: true,
    provider: "youtube",
    queue_job_id: QUEUE_JOB_ID,
    source_event_type: "video.published",
    source_metadata: {},
    user_id: USER_ID,
  });

  await assert.rejects(
    () =>
      processRepurposingPlanJob(job, {
        automationClient: {
          async planRepurposing() {
            throw new ProviderRateLimitError({
              message:
                "Upstream repurposing provider rate limited the request.",
              provider: "openai",
              retry_after_seconds: 45,
              upstreamStatus: 429,
            });
          },
        },
        statusStore: store,
      }),
    /rate limited/,
  );

  assert.equal(job.discardCount, 0);
  assert.equal(store.calls.length, 2);
  assert.equal(store.calls[1]?.patch.status, "pending");
  assert.equal(
    (store.calls[1]?.patch.result as Record<string, unknown> | undefined)
      ?.error_code,
    "provider_rate_limited",
  );
  assert.equal(
    (store.calls[1]?.patch.result as Record<string, unknown> | undefined)
      ?.retry_owner,
    "bullmq",
  );
});

void test("processRepurposingPlanJob fails permanently when manual review is missing", async () => {
  const store = createStore({
    manual_review_required: false,
  });
  const job = createJob({
    content_job_id: CONTENT_JOB_ID,
    manual_review_required: true,
    provider: "youtube",
    queue_job_id: QUEUE_JOB_ID,
    source_event_type: "video.published",
    source_metadata: {},
    user_id: USER_ID,
  });

  await assert.rejects(
    () =>
      processRepurposingPlanJob(job, {
        automationClient: {
          async planRepurposing() {
            throw new Error("should not be called");
          },
        },
        statusStore: store,
      }),
    /must require manual review/,
  );

  assert.equal(job.discardCount, 1);
  assert.equal(store.calls.length, 1);
  assert.equal(store.calls[0]?.patch.status, "failed");
  assert.equal(
    (store.calls[0]?.patch.result as Record<string, unknown> | undefined)
      ?.error_code,
    "manual_review_required",
  );
  assert.equal(
    (store.calls[0]?.patch.result as Record<string, unknown> | undefined)
      ?.retry_owner,
    "manual",
  );
});

void test("processRepurposingPlanJob does not persist schema-drifted automation output as done", async () => {
  const store = createStore();
  const job = createJob({
    content_job_id: CONTENT_JOB_ID,
    manual_review_required: true,
    provider: "youtube",
    queue_job_id: QUEUE_JOB_ID,
    source_event_type: "video.published",
    source_metadata: {},
    user_id: USER_ID,
  });

  await assert.rejects(
    () =>
      processRepurposingPlanJob(job, {
        automationClient: createAutomationClient({
          automationServiceUrl:
            "http://automation-service.railway.internal:8000",
          fetchFn: async () =>
            new Response(
              JSON.stringify({
                captions: ['<script>alert("x")</script>'],
                confidence: 90,
                content_job_id: CONTENT_JOB_ID,
                descriptions: ["Description"],
                hashtag_sets: [["#streamos"]],
                hook_ideas: ["Hook"],
                manual_review_required: true,
                model: "gpt-4o",
                provider: "openai",
                queue_job_id: QUEUE_JOB_ID,
                review_notes: ["Manual review required."],
                short_form_plan: "Plan",
                title_suggestions: ["Title"],
                warnings: [],
              }),
              { status: 200 },
            ),
        }),
        statusStore: store,
      }),
    /invalid repurposing output/,
  );

  assert.equal(job.discardCount, 1);
  assert.equal(store.calls.length, 2);
  assert.equal(store.calls[0]?.patch.status, "processing");
  assert.equal(store.calls[1]?.patch.status, "failed");
  assert.notEqual(store.calls[1]?.patch.status, "done");
  assert.equal(
    (store.calls[1]?.patch.result as Record<string, unknown> | undefined)
      ?.error_code,
    "invalid_output",
  );
  assert.equal(
    (store.calls[1]?.patch.result as Record<string, unknown> | undefined)
      ?.retryable,
    false,
  );
  assert.equal(
    (store.calls[1]?.patch.result as Record<string, unknown> | undefined)
      ?.error,
    "automation-service returned invalid repurposing output.",
  );
});
