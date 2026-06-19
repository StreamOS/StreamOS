import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  buildRepurposingReviewBundle,
  getEmptyStateMessage,
  resolveSelectedJob,
  sanitizeRepurposingRawValue,
  type ContentJobRow,
} from "./RepurposingReviewConsole.utils";
import { RepurposingReviewConsole } from "./RepurposingReviewConsole";

describe("RepurposingReviewConsole", () => {
  it("renders structured repurposing fields, review controls, and a closed sanitized raw view", () => {
    const job = makeRepurposingJob({
      payload: {
        api_gateway_secret: "super-secret-gateway-key",
        generated_at: "2026-06-19T10:11:12.000Z",
        source_provider: "youtube",
        source_video_id: "video-123",
        source_video_title: "Stream highlights and cliffhangers",
        target_platforms: ["tiktok", "reels"],
      },
      review_status: "approved",
      reviewed_at: "2026-06-19T11:11:12.000Z",
      reviewed_by: "11111111-1111-4111-8111-111111111111",
      reviewer_notes: "Looks good with a shorter hook.",
      result: {
        captions: ["Short caption one", "Short caption two"],
        confidence: 88,
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

    const html = renderToStaticMarkup(
      <RepurposingReviewConsole
        initialAuditEvents={[
          {
            content_job_id: job.id,
            created_at: "2026-06-19T11:11:12.000Z",
            id: "review-event-1",
            previous_review_status: "needs_review",
            review_status: "approved",
            reviewed_at: "2026-06-19T11:11:12.000Z",
            reviewed_by: "11111111-1111-4111-8111-111111111111",
            reviewer_notes: "Looks good with a shorter hook.",
            user_id: job.user_id,
          },
        ]}
        initialJobs={[job]}
        reviewAction={async () => undefined}
      />,
    );

    expect(html).toContain("Repurposing Jobs");
    expect(html).toContain("Stream highlights and cliffhangers");
    expect(html).toContain("youtube");
    expect(html).toContain("Source provider");
    expect(html).toContain("Source title");
    expect(html).toContain("Source identifier");
    expect(html).toContain("Target platforms");
    expect(html).toContain("Generated at");
    expect(html).toContain("Model provider");
    expect(html).toContain("Model name");
    expect(html).toContain("tiktok, reels");
    expect(html).toContain("2026-06-19T10:11:12.000Z");
    expect(html).toContain("gpt-4o-mini");
    expect(html).toContain("Required");
    expect(html).toContain("Review status");
    expect(html).toContain("Review history for this job");
    expect(html).toContain("Approve, reject, or request changes");
    expect(html).toContain("Approved");
    expect(html).toContain("Looks good with a shorter hook.");
    expect(html).toContain("Open raw payload");
    expect(html).toContain("Open raw result");
    expect(html).toContain("<details");
    expect(html).not.toContain("<details open");
    expect(html).toContain("[REDACTED]");
    expect(html).not.toContain("super-secret-gateway-key");
    expect(html).not.toContain("nested-secret");
    expect(html).not.toContain("api_gateway_secret");
    expect(html).not.toContain("access_token");
    expect(html).not.toContain("automation-service.railway.internal");
  });

  it("renders fallback states for incomplete or unknown result payloads", () => {
    const job = makeRepurposingJob({
      payload: {
        source_provider: "youtube",
        source_video_id: "video-456",
        source_video_title: "Unknown schema sample",
        target_platforms: ["shorts"],
      },
      result: {
        nested: { token: "secret" },
      },
    });

    const html = renderToStaticMarkup(
      <RepurposingReviewConsole
        initialAuditEvents={[]}
        initialJobs={[job]}
        reviewAction={async () => undefined}
      />,
    );

    expect(html).toContain("Unknown schema sample");
    expect(html).toContain("Not available");
    expect(html).toContain("Not marked");
    expect(html).toContain("Needs review");
    expect(html).not.toContain("api_gateway_secret");
    expect(html).not.toContain("secret");
    expect(html).not.toContain("token");
  });

  it("keeps selection scoped to the filtered job list", () => {
    const doneJob = makeRepurposingJob({
      id: "job-done",
      status: "done",
    });
    const failedJob = makeRepurposingJob({
      id: "job-failed",
      status: "failed",
    });

    expect(resolveSelectedJob([doneJob], "job-failed")).toEqual(doneJob);
    expect(resolveSelectedJob([doneJob], failedJob.id)).toEqual(doneJob);
    expect(resolveSelectedJob([], failedJob.id)).toBeNull();
    expect(getEmptyStateMessage("failed", 1)).toContain("failed");
  });

  it("sanitizes nested raw values recursively", () => {
    const sanitized = sanitizeRepurposingRawValue({
      authorization: "Bearer super-secret",
      nested: {
        refresh_token: "refresh-secret",
        redis_url: "redis://user:pass@host:6379/0",
        url: "https://service.up.railway.app/path",
      },
      openai_key: "sk-live-secret",
      plain: "safe text",
    });

    const json = JSON.stringify(sanitized);

    expect(json).toContain("[REDACTED]");
    expect(json).not.toContain("super-secret");
    expect(json).not.toContain("refresh-secret");
    expect(json).not.toContain("redis://user:pass@host:6379/0");
    expect(json).not.toContain("service.up.railway.app");
    expect(json).not.toContain("sk-live-secret");
    expect(json).toContain("safe text");
  });

  it("builds a safe review bundle", () => {
    const job = makeRepurposingJob({
      payload: {
        source_provider: "youtube",
        source_video_id: "video-789",
        target_platforms: ["tiktok"],
      },
      review_status: "rejected",
      reviewed_at: "2026-06-19T10:15:00.000Z",
      reviewed_by: "11111111-1111-4111-8111-111111111111",
      reviewer_notes: "Needs a shorter intro.",
      result: {
        generated_at: "2026-06-19T10:11:12.000Z",
        manual_review_required: true,
        model: "gpt-4o-mini",
        provider: "openai",
        review_notes: ["Review only."],
        short_form_plan: "Keep it short.",
      },
    });

    const bundle = buildRepurposingReviewBundle(job);

    expect(bundle).toContain("youtube");
    expect(bundle).toContain("gpt-4o-mini");
    expect(bundle).toContain("manual_review_required: true");
    expect(bundle).toContain("review_status: Rejected");
    expect(bundle).toContain("reviewer_notes: Needs a shorter intro.");
    expect(bundle).not.toContain("super-secret");
  });
});

function makeRepurposingJob(overrides: Record<string, unknown> = {}) {
  return {
    ...baseRepurposingJob(),
    ...overrides,
  } as ContentJobRow;
}

function baseRepurposingJob() {
  return {
    created_at: "2026-06-19T10:00:00.000Z",
    error_message: null,
    id: "job-001",
    job_type: "repurposing",
    type: "repurposing",
    channel_id: "channel-1",
    last_retried_at: null,
    max_retries: 3,
    next_retry_at: null,
    reviewed_at: null,
    reviewed_by: null,
    reviewer_notes: "",
    review_status: "needs_review",
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
    status: "done",
    stream_id: "stream-1",
    updated_at: "2026-06-19T10:11:00.000Z",
    user_id: "user-1",
  } as unknown as ContentJobRow;
}
