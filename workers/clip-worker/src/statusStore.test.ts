import { describe, expect, it, vi } from "vitest";

import { createSupabaseJobStatusStore } from "./statusStore.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const STREAM_ID = "22222222-2222-4222-8222-222222222222";

const payload = {
  requested_by: USER_ID,
  source_platform: "twitch" as const,
  source_url: "https://www.twitch.tv/videos/123",
  stream_id: STREAM_ID,
  transcript: "Huge comeback after a risky play in the final round.",
};

describe("createSupabaseJobStatusStore", () => {
  it("upserts clip status into content_jobs by queue_job_id", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 204 }));
    const store = createSupabaseJobStatusStore({
      fetchFn,
      serviceRoleKey: "service-role-key",
      supabaseUrl: "https://project.supabase.co",
    });

    await store.update("queue-job-1", payload, {
      result: {
        repurpose_summary: "Lead with the comeback.",
        virality_score: 84,
      },
      status: "done",
    });

    expect(fetchFn).toHaveBeenCalledWith(
      new URL(
        "/rest/v1/content_jobs?on_conflict=queue_job_id",
        "https://project.supabase.co",
      ),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          apikey: "service-role-key",
          Authorization: "Bearer service-role-key",
          Prefer: "resolution=merge-duplicates,return=minimal",
        }),
      }),
    );

    const [, init] = fetchFn.mock.calls[0]!;
    expect(JSON.parse(String(init?.body))).toMatchObject({
      job_type: "clip_scoring",
      payload,
      queue_job_id: "queue-job-1",
      result: {
        repurpose_summary: "Lead with the comeback.",
        virality_score: 84,
      },
      status: "done",
      stream_id: STREAM_ID,
      user_id: USER_ID,
    });
  });

  it("throws when the Supabase REST write fails", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("missing table", { status: 404 }));
    const store = createSupabaseJobStatusStore({
      fetchFn,
      serviceRoleKey: "service-role-key",
      supabaseUrl: "https://project.supabase.co",
    });

    await expect(
      store.update("queue-job-1", payload, { status: "running" }),
    ).rejects.toThrow(
      "Supabase content_jobs update failed with 404: missing table",
    );
  });
});
