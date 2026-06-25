import assert from "node:assert/strict";
import test from "node:test";

import {
  AutomationServiceError,
  ProviderModelUnavailableError,
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

const VALID_RESPONSE = {
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
};

void test("createAutomationClient posts the repurposing plan request to the private automation service", async () => {
  const requests: Request[] = [];
  const client = createAutomationClient({
    automationServiceUrl: "http://automation-service.railway.internal:8000",
    fetchFn: async (input, init) => {
      requests.push(new Request(input, init));
      return new Response(JSON.stringify(VALID_RESPONSE), { status: 200 });
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

const invalidOutputCases: Array<{
  name: string;
  response: () => Response;
}> = [
  {
    name: "empty body",
    response: () => new Response("", { status: 200 }),
  },
  {
    name: "invalid JSON",
    response: () => new Response("{", { status: 200 }),
  },
  {
    name: "wrong top-level shape",
    response: () => new Response(JSON.stringify([]), { status: 200 }),
  },
  {
    name: "missing required field",
    response: () => {
      const { short_form_plan: _shortFormPlan, ...payload } = VALID_RESPONSE;
      return new Response(JSON.stringify(payload), { status: 200 });
    },
  },
  {
    name: "wrong field type",
    response: () =>
      new Response(JSON.stringify({ ...VALID_RESPONSE, confidence: "high" }), {
        status: 200,
      }),
  },
  {
    name: "empty required array",
    response: () =>
      new Response(JSON.stringify({ ...VALID_RESPONSE, captions: [] }), {
        status: 200,
      }),
  },
  {
    name: "unexpected top-level field",
    response: () =>
      new Response(JSON.stringify({ ...VALID_RESPONSE, auto_publish: true }), {
        status: 200,
      }),
  },
  {
    name: "oversized text field",
    response: () =>
      new Response(
        JSON.stringify({
          ...VALID_RESPONSE,
          short_form_plan: "x".repeat(4_001),
        }),
        { status: 200 },
      ),
  },
  {
    name: "script-like content",
    response: () =>
      new Response(
        JSON.stringify({
          ...VALID_RESPONSE,
          captions: ['<script>alert("x")</script>'],
        }),
        { status: 200 },
      ),
  },
  {
    name: "partial plausible data",
    response: () =>
      new Response(
        JSON.stringify({
          content_job_id: REQUEST_PAYLOAD.content_job_id,
          manual_review_required: true,
          queue_job_id: REQUEST_PAYLOAD.queue_job_id,
          short_form_plan: "Looks like a plan but lacks review fields.",
        }),
        { status: 200 },
      ),
  },
  {
    name: "mismatched job ids",
    response: () =>
      new Response(
        JSON.stringify({
          ...VALID_RESPONSE,
          content_job_id: "99999999-9999-4999-8999-999999999999",
          queue_job_id: "repurposing-plan-99999999-9999-4999-8999-999999999999",
        }),
        { status: 200 },
      ),
  },
];

for (const { name, response } of invalidOutputCases) {
  void test(`createAutomationClient rejects schema-drifted output: ${name}`, async () => {
    const client = createAutomationClient({
      automationServiceUrl: "http://automation-service.railway.internal:8000",
      fetchFn: async () => response(),
    });

    await assert.rejects(
      () => client.planRepurposing(REQUEST_PAYLOAD),
      (error: unknown) => {
        assert.ok(error instanceof AutomationServiceError);
        assert.equal(error.code, "invalid_output");
        assert.equal(error.retryable, false);
        assert.equal(
          error.message,
          "automation-service returned invalid repurposing output.",
        );
        assert.equal(error.message.includes("auto_publish"), false);
        assert.equal(error.message.includes("<script>"), false);
        return true;
      },
    );
  });
}

void test("createAutomationClient keeps malformed HTTP error bodies out of messages", async () => {
  const client = createAutomationClient({
    automationServiceUrl: "http://automation-service.railway.internal:8000",
    fetchFn: async () =>
      new Response('{"raw":"raw-provider-payload"}', { status: 400 }),
  });

  await assert.rejects(
    () => client.planRepurposing(REQUEST_PAYLOAD),
    (error: unknown) => {
      assert.ok(error instanceof AutomationServiceError);
      assert.equal(error.code, "invalid_input");
      assert.equal(error.httpStatus, 400);
      assert.equal(
        error.message,
        "automation-service repurposing failed with 400.",
      );
      assert.equal(error.message.includes("raw-provider-payload"), false);
      return true;
    },
  );
});

void test("createAutomationClient classifies automation 5xx as model unavailable", async () => {
  const client = createAutomationClient({
    automationServiceUrl: "http://automation-service.railway.internal:8000",
    fetchFn: async () =>
      new Response(JSON.stringify({ detail: "temporarily unavailable" }), {
        status: 503,
      }),
  });

  await assert.rejects(
    () => client.planRepurposing(REQUEST_PAYLOAD),
    (error: unknown) => {
      assert.ok(error instanceof ProviderModelUnavailableError);
      assert.equal(error.provider, "openai");
      assert.equal(error.upstreamStatus, 503);
      return true;
    },
  );
});

void test("createAutomationClient surfaces network failures without returning a plan", async () => {
  const client = createAutomationClient({
    automationServiceUrl: "http://automation-service.railway.internal:8000",
    fetchFn: async () => {
      throw new Error("automation service network timeout");
    },
  });

  await assert.rejects(
    () => client.planRepurposing(REQUEST_PAYLOAD),
    /network timeout/,
  );
});
