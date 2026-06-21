import assert from "node:assert/strict";
import test from "node:test";

import { loadPublishingSchedulerWorkerConfig } from "./config.js";

void test("publishing-scheduler-worker config loads required env and defaults timing", () => {
  const config = loadPublishingSchedulerWorkerConfig({
    REDIS_URL: "redis://localhost:6379/0",
    PUBLICATION_QUEUE_NAME: "streamos-publishing",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
    SUPABASE_URL: "https://supabase.example.com",
  });

  assert.equal(config.redisUrl, "redis://localhost:6379/0");
  assert.equal(config.publicationQueueName, "streamos-publishing");
  assert.equal(config.supabaseUrl, "https://supabase.example.com");
  assert.equal(config.batchSize, 25);
  assert.equal(config.claimTimeoutMs, 300000);
  assert.equal(config.pollIntervalMs, 30000);
});
