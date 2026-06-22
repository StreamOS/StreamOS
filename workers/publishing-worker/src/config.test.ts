import assert from "node:assert/strict";
import test from "node:test";

import { loadWorkerConfig } from "./config.js";

void test("publishing-worker config loads required env and defaults queue name", () => {
  const config = loadWorkerConfig({
    APP_ENCRYPTION_KEY: "base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    PUBLISHING_WORKER_CONCURRENCY: "2",
    REDIS_URL: "redis://localhost:6379/0",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
    SUPABASE_URL: "https://supabase.example.com",
    TIKTOK_CLIENT_KEY: "tiktok-client-key",
    TIKTOK_CLIENT_SECRET: "tiktok-client-secret",
    YOUTUBE_CLIENT_ID: "youtube-client-id",
    YOUTUBE_CLIENT_SECRET: "youtube-client-secret",
  });

  assert.equal(config.concurrency, 2);
  assert.equal(config.publicationQueueName, "streamos-publishing");
  assert.equal(config.supabaseUrl, "https://supabase.example.com");
});
