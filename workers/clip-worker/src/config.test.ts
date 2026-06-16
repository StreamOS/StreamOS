import { describe, expect, it } from "vitest";

import { loadWorkerConfig } from "./config.js";

describe("loadWorkerConfig", () => {
  it("accepts a private railway.internal automation URL", () => {
    expect(
      loadWorkerConfig({
        AUTOMATION_SERVICE_URL:
          "http://automation-service.railway.internal:8000",
        CLIP_WORKER_CONCURRENCY: "2",
        REDIS_URL: "rediss://default:password@redis.upstash.io:6379",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
        SUPABASE_URL: "https://streamos.supabase.co",
      }),
    ).toMatchObject({
      automationServiceUrl: "http://automation-service.railway.internal:8000",
    });
  });

  it("rejects a public automation-service URL", () => {
    expect(() =>
      loadWorkerConfig({
        AUTOMATION_SERVICE_URL:
          "https://automation-service-production.up.railway.app",
        CLIP_WORKER_CONCURRENCY: "2",
        REDIS_URL: "rediss://default:password@redis.upstash.io:6379",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
        SUPABASE_URL: "https://streamos.supabase.co",
      }),
    ).toThrow("AUTOMATION_SERVICE_URL must use http private networking");
  });
});
