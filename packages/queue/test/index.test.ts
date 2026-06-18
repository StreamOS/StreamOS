import assert from "node:assert/strict";
import test from "node:test";

import {
  getClipGenerationJobId,
  getRepurposingPlanJobId,
  getTranscriptionTriggerJobId,
} from "../src/index.js";

const STREAM_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_STREAM_ID = "44444444-4444-4444-8444-444444444444";

void test("getTranscriptionTriggerJobId is deterministic per stream", () => {
  assert.equal(
    getTranscriptionTriggerJobId(STREAM_ID),
    getTranscriptionTriggerJobId(STREAM_ID),
  );
  assert.notEqual(
    getTranscriptionTriggerJobId(STREAM_ID),
    getTranscriptionTriggerJobId(OTHER_STREAM_ID),
  );
});

void test("getClipGenerationJobId is deterministic per stream", () => {
  const clipJobId = getClipGenerationJobId(STREAM_ID);

  assert.equal(clipJobId, getClipGenerationJobId(STREAM_ID));
  assert.match(clipJobId, /^clip-generation-/);
  assert.ok(!clipJobId.includes(":"));
});

void test("getRepurposingPlanJobId is deterministic per stream", () => {
  const repurposingJobId = getRepurposingPlanJobId(STREAM_ID);

  assert.equal(repurposingJobId, getRepurposingPlanJobId(STREAM_ID));
  assert.equal(repurposingJobId, getRepurposingPlanJobId(STREAM_ID));
  assert.match(repurposingJobId, /^repurposing-plan-/);
  assert.ok(!repurposingJobId.includes(":"));
});
