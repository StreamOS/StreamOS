import { describe, expect, it, vi } from "vitest";

import { createSupabaseContentJobRetryStore } from "./contentJobStore.js";

const JOB_ID = "33333333-3333-4333-8333-333333333333";
const NOW = new Date("2026-06-01T12:00:00.000Z");

describe("createSupabaseContentJobRetryStore", () => {
  it("fetches failed jobs that are due for retry", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            error_message: "failed",
            id: JOB_ID,
            job_type: "clip_scoring",
            max_retries: 3,
            next_retry_at: null,
            payload: { stream_id: "stream-1" },
            queue_job_id: "queue-job-1",
            retry_count: 0,
            status: "failed",
            stream_id: null,
            user_id: "11111111-1111-4111-8111-111111111111",
          },
        ]),
        { status: 200 },
      ),
    );
    const store = createSupabaseContentJobRetryStore({
      batchSize: 25,
      fetchFn,
      serviceRoleKey: "service-role-key",
      supabaseUrl: "https://project.supabase.co",
    });

    await expect(store.listFailedJobs(NOW)).resolves.toHaveLength(1);

    const [url, init] = fetchFn.mock.calls[0]!;
    expect(String(url)).toContain("status=eq.failed");
    expect(init?.headers).toMatchObject({
      apikey: "service-role-key",
      Authorization: "Bearer service-role-key",
    });
  });

  it("claims a failed job by retry_count to avoid duplicate workers", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify([{ id: JOB_ID }]), { status: 200 }),
      );
    const store = createSupabaseContentJobRetryStore({
      batchSize: 25,
      fetchFn,
      serviceRoleKey: "service-role-key",
      supabaseUrl: "https://project.supabase.co",
    });

    await expect(
      store.claimForRetry({
        job: {
          error_message: "failed",
          id: JOB_ID,
          job_type: "clip_scoring",
          max_retries: 3,
          next_retry_at: null,
          payload: { stream_id: "stream-1" },
          queue_job_id: "queue-job-1",
          retry_count: 0,
          status: "failed",
          stream_id: null,
          user_id: "11111111-1111-4111-8111-111111111111",
        },
        now: NOW,
        queueJobId: "retry-job-1",
        retryCount: 1,
      }),
    ).resolves.toBe(true);

    const [url, init] = fetchFn.mock.calls[0]!;
    expect(String(url)).toContain(`id=eq.${JOB_ID}`);
    expect(String(url)).toContain("retry_count=eq.0");
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      queue_job_id: "retry-job-1",
      retry_count: 1,
      status: "pending",
    });
  });
});
