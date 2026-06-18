import assert from "node:assert/strict";
import test from "node:test";

import { loadWorkerConfig } from "./config.js";

void test("loadWorkerConfig uses the repurposing queue defaults", () => {
  const config = loadWorkerConfig({
    AUTOMATION_SERVICE_URL: "http://automation-service.railway.internal:8000",
    REDIS_URL: "rediss://redis.example.com:6380/0",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    SUPABASE_URL: "https://project.supabase.co",
  });

  assert.equal(config.queueName, "streamos-repurposing");
  assert.equal(config.concurrency, 1);
  assert.equal(
    config.automationServiceUrl,
    "http://automation-service.railway.internal:8000",
  );
});

void test("loadWorkerConfig rejects non-private automation URLs", () => {
  assert.throws(
    () =>
      loadWorkerConfig({
        AUTOMATION_SERVICE_URL: "https://automation.example.com",
        REDIS_URL: "rediss://redis.example.com:6380/0",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
        SUPABASE_URL: "https://project.supabase.co",
      }),
    /private networking/,
  );
});
