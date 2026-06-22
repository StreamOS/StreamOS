import assert from "node:assert/strict";
import test from "node:test";

import { processRepurposingPlanJob } from "./worker.js";
import type { RepurposingPlanContentJobStore } from "./contentJobStore.js";

const CONTENT_JOB_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const QUEUE_JOB_ID = "repurposing-plan-cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function createJob() {
  return {
    attemptsMade: 0,
    data: {
      content_job_id: CONTENT_JOB_ID,
      manual_review_required: true,
      provider: "youtube",
      queue_job_id: QUEUE_JOB_ID,
      source_event_type: "video.published",
      source_metadata: {},
      user_id: USER_ID,
    },
    discard: async () => {},
    id: QUEUE_JOB_ID,
    opts: {
      attempts: 3,
      backoff: {
        delay: 30_000,
        type: "exponential" as const,
      },
    },
  };
}

function createStore(): RepurposingPlanContentJobStore {
  return {
    loadById: async () => ({
      id: CONTENT_JOB_ID,
      job_type: "repurposing",
      max_retries: 3,
      payload: {
        auto_repurpose_enabled: true,
        channel_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        content_policy_profile: "short-form-safe",
        enrichment_status: "asset_available",
        manual_review_required: true,
        source_event_type: "video.published",
        source_provider: "youtube",
        source_video_id: "video-123",
        stream_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        user_id: USER_ID,
        vod_asset_url: "https://cdn.example.com/vods/test.mp4",
        workflow: "repurposing_plan",
      },
      queue_job_id: QUEUE_JOB_ID,
      retry_count: 0,
      started_at: null,
      status: "pending",
      user_id: USER_ID,
    }),
    updateById: async () => {},
  };
}

void test("smoke: processRepurposingPlanJob completes the canonical repurposing.plan path", async () => {
  const requests: Array<Record<string, unknown>> = [];

  const result = await processRepurposingPlanJob(createJob(), {
    automationClient: {
      async planRepurposing(payload) {
        requests.push(payload as Record<string, unknown>);
        return {
          captions: ["Caption"],
          confidence: 95,
          content_job_id: CONTENT_JOB_ID,
          descriptions: ["Description"],
          hashtag_sets: [["#streamos"]],
          hook_ideas: ["Hook idea"],
          manual_review_required: true,
          model: "gpt-4o",
          provider: "openai",
          queue_job_id: QUEUE_JOB_ID,
          review_notes: ["Manual review required."],
          short_form_plan: "Plan",
          title_suggestions: ["Title"],
          warnings: ["Requires review."],
        };
      },
    },
    statusStore: createStore(),
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.manual_review_required, true);
  assert.equal(requests[0]?.queue_job_id, QUEUE_JOB_ID);
  assert.equal(result.queue_job_id, QUEUE_JOB_ID);
  assert.equal(result.manual_review_required, true);
});
