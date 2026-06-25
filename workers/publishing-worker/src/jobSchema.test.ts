import assert from "node:assert/strict";
import test from "node:test";

import {
  PUBLICATION_EXECUTION_JOB_NAME,
  PUBLICATION_RECONCILE_JOB_NAME,
  publicationExecutionJobDataSchema,
} from "./jobSchema.js";

void test("publishing-worker publication job schema accepts both supported targets", () => {
  const youtubePayload = publicationExecutionJobDataSchema.parse({
    content_publication_id: "44444444-4444-4444-8444-444444444444",
    target_platform: "youtube",
    user_id: "11111111-1111-4111-8111-111111111111",
  });
  const tiktokPayload = publicationExecutionJobDataSchema.parse({
    content_publication_id: "44444444-4444-4444-8444-444444444444",
    target_platform: "tiktok",
    user_id: "11111111-1111-4111-8111-111111111111",
  });

  assert.equal(PUBLICATION_EXECUTION_JOB_NAME, "publication.publish");
  assert.equal(PUBLICATION_RECONCILE_JOB_NAME, "publication.reconcile");
  assert.equal(youtubePayload.target_platform, "youtube");
  assert.equal(tiktokPayload.target_platform, "tiktok");
});

void test("publishing-worker publication job schema rejects unsafe payloads", () => {
  const cases = [
    {
      name: "missing publication id",
      payload: {
        target_platform: "youtube",
        user_id: "11111111-1111-4111-8111-111111111111",
      },
    },
    {
      name: "invalid publication id",
      payload: {
        content_publication_id: "not-a-uuid",
        target_platform: "youtube",
        user_id: "11111111-1111-4111-8111-111111111111",
      },
    },
    {
      name: "unsupported provider",
      payload: {
        content_publication_id: "44444444-4444-4444-8444-444444444444",
        target_platform: "kick",
        user_id: "11111111-1111-4111-8111-111111111111",
      },
    },
    {
      name: "invalid user id",
      payload: {
        content_publication_id: "44444444-4444-4444-8444-444444444444",
        target_platform: "youtube",
        user_id: "not-a-uuid",
      },
    },
  ] as const;

  for (const testCase of cases) {
    assert.equal(
      publicationExecutionJobDataSchema.safeParse(testCase.payload).success,
      false,
      testCase.name,
    );
  }
});

void test("publishing-worker publication job schema strips unexpected secret fields", () => {
  const payload = publicationExecutionJobDataSchema.parse({
    access_token: "unexpected-token-like-value",
    content_publication_id: "44444444-4444-4444-8444-444444444444",
    target_platform: "youtube",
    user_id: "11111111-1111-4111-8111-111111111111",
  });

  assert.deepEqual(Object.keys(payload).sort(), [
    "content_publication_id",
    "target_platform",
    "user_id",
  ]);
});
