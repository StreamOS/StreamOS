import assert from "node:assert/strict";
import test from "node:test";

import {
  ProviderRateLimitError,
  createAutomationClient,
} from "./automationClient.js";

const REQUEST_PAYLOAD = {
  asset_reference: {
    kind: "vod",
    status: "asset_available",
    url: "https://cdn.example.com/vods/test.mp4",
  },
  brand_context: {
    brand_profile_id: "brand-profile-1",
  },
  content_job_id: "11111111-1111-4111-8111-111111111111",
  content_policy_hints: {
    content_policy_profile: "short-form-safe",
  },
  language: "en",
  locale: "en",
  manual_review_required: true,
  provider: "youtube",
  provider_video_id: "video-123",
  queue_job_id: "repurposing-plan-33333333-3333-4333-8333-333333333333",
  source_event_type: "video.published",
  source_metadata: {
    stream_id: "44444444-4444-4444-8444-444444444444",
    user_id: "22222222-2222-4222-8222-222222222222",
  },
  target_platforms: ["youtube", "tiktok"],
  user_id: "22222222-2222-4222-8222-222222222222",
};

void test("createAutomationClient posts the repurposing plan request to the private automation service", async () => {
  const requests: Request[] = [];
  const client = createAutomationClient({
    automationServiceUrl: "http://automation-service.railway.internal:8000",
    fetchFn: async (input, init) => {
      requests.push(new Request(input, init));
      return new Response(
        JSON.stringify({
          captions: ["Hook", "Payoff"],
          confidence: 91,
          content_job_id: REQUEST_PAYLOAD.content_job_id,
          descriptions: ["Short description"],
          hashtag_sets: [["#stream", "#clips"]],
          hook_ideas: ["Open with the comeback"],
          manual_review_required: true,
          model: "gpt-4o",
          provider: "openai",
          queue_job_id: REQUEST_PAYLOAD.queue_job_id,
          review_notes: ["Needs human approval before publishing."],
          short_form_plan: "Cut for vertical short-form review.",
          title_suggestions: ["The comeback nobody expected"],
          warnings: ["Manual review required before any publication."],
        }),
        { status: 200 },
      );
    },
  });

  const result = await client.planRepurposing(REQUEST_PAYLOAD);

  assert.equal(requests.length, 1);
  assert.equal(
    requests[0]?.url,
    "http://automation-service.railway.internal:8000/repurposing/plan",
  );
  assert.equal(requests[0]?.method, "POST");
  assert.equal(requests[0]?.headers.get("content-type"), "application/json");
  assert.equal(result.manual_review_required, true);
  assert.equal(result.queue_job_id, REQUEST_PAYLOAD.queue_job_id);
});

void test("createAutomationClient classifies provider rate limits", async () => {
  const client = createAutomationClient({
    automationServiceUrl: "http://automation-service.railway.internal:8000",
    fetchFn: async () =>
      new Response(
        JSON.stringify({
          detail: {
            code: "provider_rate_limited",
            message: "Upstream repurposing provider rate limited the request.",
            provider: "openai",
            retry_after_seconds: 45,
            retryable: true,
            upstream_status: 503,
          },
        }),
        { status: 503 },
      ),
  });

  await assert.rejects(
    () => client.planRepurposing(REQUEST_PAYLOAD),
    (error: unknown) => {
      assert.ok(error instanceof ProviderRateLimitError);
      assert.equal(error.provider, "openai");
      assert.equal(error.retryAfterSeconds, 45);
      assert.equal(error.upstreamStatus, 503);
      return true;
    },
  );
});
