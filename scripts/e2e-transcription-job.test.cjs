const test = require("node:test");
const assert = require("node:assert/strict");

const {
  PRODUCTION_GATE_MODE,
  PRODUCTION_GATE_WEBHOOK_SECRET_BOUNDARY_BLOCKED,
  assertProductionGateTriggerContract,
  classifyContentJobFailure,
  classifyRetryableTranscriptionState,
} = require("./e2e-transcription-job.cjs");

test("production transcription E2E blocks the webhook-secret trigger path without requiring runner secret", () => {
  assert.throws(
    () =>
      assertProductionGateTriggerContract({
        env: {},
        options: {
          mode: PRODUCTION_GATE_MODE,
        },
      }),
    (error) =>
      error instanceof Error &&
      error.message.includes(PRODUCTION_GATE_WEBHOOK_SECRET_BOUNDARY_BLOCKED) &&
      error.message.includes("proof-safe trigger contract") &&
      !error.message.includes("local-streamos-webhook-secret"),
  );
});

test("production transcription E2E rejects webhook secrets on release-gate-runner without leaking values", () => {
  const secretValue = "runner-must-not-own-this-secret";

  assert.throws(
    () =>
      assertProductionGateTriggerContract({
        env: {
          STREAM_EVENT_WEBHOOK_SECRET: secretValue,
        },
        options: {
          mode: PRODUCTION_GATE_MODE,
        },
      }),
    (error) =>
      error instanceof Error &&
      error.message.includes(PRODUCTION_GATE_WEBHOOK_SECRET_BOUNDARY_BLOCKED) &&
      error.message.includes("api-gateway-owned") &&
      !error.message.includes(secretValue),
  );
});

test("local transcription diagnostic may use the local webhook trigger contract", () => {
  assert.doesNotThrow(() =>
    assertProductionGateTriggerContract({
      env: {},
      options: {
        mode: "local-diagnostic",
      },
    }),
  );
});

test("transcription E2E classifies retryable provider 429 states without masking queue ownership", () => {
  const state = classifyRetryableTranscriptionState({
    error_message:
      "provider_rate_limited: Upstream transcription provider rate limited the request.",
    max_retries: 5,
    result: {
      error_code: "provider_rate_limited",
      next_attempt_in_ms: 120000,
      provider: "openai",
      retry_after_seconds: 120,
      retry_owner: "bullmq",
      retryable: true,
      upstream_status: 429,
    },
    retry_count: 2,
    status: "pending",
  });

  assert.deepEqual(state, {
    code: "provider_rate_limited",
    message:
      "transcription provider rate limited the canonical job (provider=openai, upstream_status=429, retry_after_seconds=120, retry_count=2, max_retries=5, next_attempt_in_ms=120000, retry_owner=bullmq, status=pending)",
  });
});

test("transcription E2E keeps provider 429 pending states out of terminal failure classification", () => {
  const failure = classifyContentJobFailure({
    error_message:
      "provider_rate_limited: Upstream transcription provider rate limited the request.",
    result: {
      error_code: "provider_rate_limited",
      retryable: true,
      upstream_status: 429,
    },
    status: "pending",
  });

  assert.equal(failure, null);
});

test("transcription E2E classifies exhausted provider 429 states as terminal gate failures", () => {
  const failure = classifyContentJobFailure({
    error_message:
      "provider_rate_limited: Upstream transcription provider rate limited the request.",
    max_retries: 5,
    result: {
      error_code: "provider_rate_limited",
      provider: "openai",
      retry_after_seconds: 90,
      retryable: true,
      upstream_status: 429,
    },
    retry_count: 5,
    status: "failed",
  });

  assert.deepEqual(failure, {
    code: "provider_rate_limited",
    message:
      "transcription provider rate limited the canonical job (provider=openai, upstream_status=429, retry_after_seconds=90, retry_count=5, max_retries=5, status=failed)",
  });
});
