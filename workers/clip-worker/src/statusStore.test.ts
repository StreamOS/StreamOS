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
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ id: "transcript-1" }]), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ id: "highlight-1" }]), {
          status: 201,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ id: "clip-1" }]), {
          status: 201,
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const store = createSupabaseJobStatusStore({
      fetchFn,
      serviceRoleKey: "service-role-key",
      supabaseUrl: "https://project.supabase.co",
    });

    await store.update("queue-job-1", payload, {
      result: {
        asset_id: STREAM_ID,
        highlights: ["Strong opening hook"],
        provider: "test",
        recommended_formats: ["shorts"],
        repurpose_summary: "Lead with the comeback.",
        source_platform: "twitch",
        title_suggestions: ["The Comeback Nobody Expected"],
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
      next_retry_at: null,
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

    const [, transcriptInit] = fetchFn.mock.calls[1]!;
    expect(fetchFn.mock.calls[1]?.[0]).toEqual(
      new URL(
        `/rest/v1/stream_transcripts?select=id&user_id=eq.${USER_ID}&stream_id=eq.${STREAM_ID}&order=updated_at.desc&limit=1`,
        "https://project.supabase.co",
      ),
    );
    expect(transcriptInit?.method).toBe("GET");

    const [, highlightInit] = fetchFn.mock.calls[2]!;
    expect(JSON.parse(String(highlightInit?.body))).toMatchObject({
      rank: 1,
      score: 84,
      source: "clip_scoring",
      source_queue_job_id: "queue-job-1",
      stream_id: STREAM_ID,
      summary: "Strong opening hook",
      title: "The Comeback Nobody Expected",
      transcript_id: "transcript-1",
      user_id: USER_ID,
    });

    const [, clipInit] = fetchFn.mock.calls[3]!;
    expect(JSON.parse(String(clipInit?.body))).toMatchObject({
      description: "Lead with the comeback.",
      highlight_id: "highlight-1",
      source_queue_job_id: "queue-job-1",
      source_url: "https://www.twitch.tv/videos/123",
      status: "draft",
      stream_id: STREAM_ID,
      title: "The Comeback Nobody Expected",
      user_id: USER_ID,
      virality_score: 84,
    });

    const [, exportInit] = fetchFn.mock.calls[4]!;
    expect(JSON.parse(String(exportInit?.body))).toMatchObject({
      clip_id: "clip-1",
      export_format: "shorts",
      status: "draft",
      target_platform: "youtube",
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
      "Supabase /rest/v1/content_jobs write failed with 404: missing table",
    );
  });
});
