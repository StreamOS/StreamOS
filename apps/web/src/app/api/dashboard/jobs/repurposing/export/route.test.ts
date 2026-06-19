import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRepurposingExportTemplateText } from "@/components/modules/RepurposingReviewConsole.utils";

const mocks = vi.hoisted(() => ({
  authGetUser: vi.fn(),
  exportInsert: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/supabase/config", () => ({
  isSupabaseConfigured: () => true,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: mocks.authGetUser,
    },
    from: mocks.from,
  })),
}));

describe("POST /api/dashboard/jobs/repurposing/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.authGetUser.mockResolvedValue({
      data: {
        user: {
          id: "11111111-1111-4111-8111-111111111111",
        },
      },
      error: null,
    });
  });

  it("stores an audited bundle export for an approved repurposing job", async () => {
    const job = makeRepurposingJob({
      id: "22222222-2222-4222-8222-222222222222",
      user_id: "11111111-1111-4111-8111-111111111111",
      payload: {
        source_provider: "youtube",
        source_video_id: "video-123",
        source_video_title: "Approved export sample",
        target_platforms: ["tiktok", "youtube_shorts"],
      },
      review_status: "approved",
      reviewed_at: "2026-06-19T11:11:12.000Z",
      reviewed_by: "11111111-1111-4111-8111-111111111111",
      reviewer_notes: "Safe to reuse manually.",
      result: {
        captions: ["Short caption one"],
        confidence: 91,
        descriptions: ["A longer description"],
        generated_at: "2026-06-19T10:11:12.000Z",
        hashtag_sets: [["#streamos", "#gaming"]],
        hook_ideas: ["Open with the strongest moment"],
        manual_review_required: true,
        model: "gpt-4o-mini",
        provider: "openai",
        review_notes: ["Needs creator approval"],
        short_form_plan: "Clip the opening and the reaction moment.",
        title_suggestions: ["Best of the stream"],
        warnings: ["Double-check platform tone."],
      },
    });
    const insertedEvents: Array<Record<string, unknown>> = [];

    mocks.from.mockImplementation((table: string) => {
      if (table === "content_jobs") {
        return createContentJobQuery(job);
      }

      if (table === "content_job_export_events") {
        return createExportInsertQuery(insertedEvents);
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    const { POST } = await import("./route");
    const response = await POST(
      createExportRequest({
        eventType: "copy_template",
        jobId: job.id,
        selection: {
          captionIndex: 0,
          descriptionIndex: 0,
          hashtagSetIndex: 0,
          hookIdeaIndex: 0,
          targetPlatformIndex: 1,
          titleSuggestionIndex: 0,
        },
        targetPlatform: "youtube_shorts",
        templateKey: "youtube_shorts",
      }),
    );
    const payload = await response.json();
    const expectedBundleText = buildRepurposingExportTemplateText(
      job,
      "youtube_shorts",
      {
        captionIndex: 0,
        descriptionIndex: 0,
        hashtagSetIndex: 0,
        hookIdeaIndex: 0,
        targetPlatformIndex: 1,
        titleSuggestionIndex: 0,
      },
    );

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      bundle_hash: createHash("sha256")
        .update(expectedBundleText)
        .digest("hex"),
      status: "export_audited",
    });
    expect(insertedEvents).toHaveLength(1);
    expect(insertedEvents[0]).toMatchObject({
      actor_id: "11111111-1111-4111-8111-111111111111",
      content_job_id: job.id,
      event_type: "copy_template",
      review_status_at_export: "approved",
      target_platform: "youtube_shorts",
      template_key: "youtube_shorts",
      user_id: "11111111-1111-4111-8111-111111111111",
    });
    expect(payload.event).toMatchObject({
      content_job_id: job.id,
      event_type: "copy_template",
      review_status_at_export: "approved",
      target_platform: "youtube_shorts",
      template_key: "youtube_shorts",
    });
  });

  it("rejects unauthorized export attempts before loading a job", async () => {
    mocks.authGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const { POST } = await import("./route");
    const response = await POST(
      createExportRequest({
        eventType: "copy_bundle",
        jobId: "22222222-2222-4222-8222-222222222222",
        targetPlatform: "tiktok",
        templateKey: "bundle",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toEqual({
      code: "unauthorized",
      error: "An authenticated Supabase session is required.",
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("rejects export attempts for jobs owned by another user", async () => {
    const job = makeRepurposingJob({
      id: "33333333-3333-4333-8333-333333333333",
      user_id: "22222222-2222-4222-8222-222222222222",
      review_status: "approved",
      reviewed_at: "2026-06-19T11:11:12.000Z",
      reviewed_by: "22222222-2222-4222-8222-222222222222",
    });

    mocks.from.mockImplementation((table: string) => {
      if (table === "content_jobs") {
        return createContentJobQuery(job);
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    const { POST } = await import("./route");
    const response = await POST(
      createExportRequest({
        eventType: "copy_bundle",
        jobId: job.id,
        targetPlatform: "tiktok",
        templateKey: "bundle",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload).toEqual({
      code: "export_job_not_found",
      error: "The repurposing job was not found for the active user.",
    });
  });
});

function createExportRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest(
    "http://localhost/api/dashboard/jobs/repurposing/export",
    {
      body: JSON.stringify(body),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    },
  );
}

function createContentJobQuery(job: ReturnType<typeof makeRepurposingJob>) {
  const query = {
    eq: () => query,
    maybeSingle: vi.fn(async () => ({
      data: job.user_id === "11111111-1111-4111-8111-111111111111" ? job : null,
      error: null,
    })),
    select: () => query,
  };

  return query;
}

function createExportInsertQuery(
  insertedEvents: Array<Record<string, unknown>>,
) {
  return {
    insert: (row: Record<string, unknown>) => {
      insertedEvents.push(row);

      return {
        select: () => ({
          single: vi.fn(async () => ({
            data: {
              ...row,
              created_at: "2026-06-19T12:00:00.000Z",
              id: "export-event-1",
            },
            error: null,
          })),
        }),
      };
    },
  };
}

function makeRepurposingJob(overrides: Record<string, unknown> = {}) {
  return {
    ...baseRepurposingJob(),
    ...overrides,
  } as ReturnType<typeof baseRepurposingJob>;
}

function baseRepurposingJob() {
  return {
    created_at: "2026-06-19T10:00:00.000Z",
    error_message: null,
    id: "job-001",
    job_type: "repurposing" as const,
    type: "repurposing" as const,
    channel_id: "channel-1",
    last_retried_at: null,
    max_retries: 3,
    next_retry_at: null,
    reviewed_at: null,
    reviewed_by: null,
    reviewer_notes: "",
    review_status: "needs_review" as const,
    started_at: null,
    completed_at: null,
    payload: {
      source_provider: "youtube",
      source_video_id: "video-001",
      source_video_title: "Base title",
      target_platforms: ["tiktok"],
    },
    queue_job_id: "repurposing-plan-001",
    result: {
      captions: ["Caption"],
      confidence: 77,
      descriptions: ["Description"],
      generated_at: "2026-06-19T10:10:00.000Z",
      hashtag_sets: [["#streamos"]],
      hook_ideas: ["Hook"],
      manual_review_required: true,
      model: "gpt-4o-mini",
      provider: "openai",
      review_notes: ["Review"],
      short_form_plan: "Plan",
      title_suggestions: ["Title"],
      warnings: ["Warn"],
    },
    retry_count: 0,
    status: "done" as const,
    stream_id: "stream-1",
    updated_at: "2026-06-19T10:11:00.000Z",
    user_id: "user-1",
  };
}
