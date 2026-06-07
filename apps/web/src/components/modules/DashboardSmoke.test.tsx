import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Search } from "lucide-react";
import { describe, expect, it } from "vitest";
import { StatCard } from "@streamos/ui";
import { ContentJobProgress } from "./ContentJobProgress";
import { ContentJobsLiveList } from "./ContentJobsLiveList";

describe("dashboard UI", () => {
  it("renders a typed stat card", () => {
    const html = renderToStaticMarkup(
      <StatCard label="Discovery score" value="82" trend="+9%" icon={Search} />,
    );

    expect(html).toContain("Discovery score");
    expect(html).toContain("82");
  });

  it("renders live content job status rows", () => {
    const html = renderToStaticMarkup(
      <ContentJobProgress
        userId="11111111-1111-4111-8111-111111111111"
        initialJobs={[
          {
            created_at: "2026-06-01T10:00:00.000Z",
            error_message: null,
            id: "22222222-2222-4222-8222-222222222222",
            job_type: "transcription",
            type: "transcription",
            channel_id: null,
            last_retried_at: null,
            max_retries: 3,
            next_retry_at: null,
            started_at: null,
            completed_at: "2026-06-01T10:00:30.000Z",
            payload: {},
            queue_job_id: "transcription-trigger-1",
            retry_count: 0,
            result: {
              segments: [],
              transcript: "A clean transcript.",
            },
            status: "done",
            stream_id: "33333333-3333-4333-8333-333333333333",
            updated_at: "2026-06-01T10:00:30.000Z",
            user_id: "11111111-1111-4111-8111-111111111111",
          },
        ]}
      />,
    );

    expect(html).toContain("Content Pipeline");
    expect(html).toContain("Done");
    expect(html).toContain("A clean transcript.");
  });

  it("renders the jobs live list with retry actions", () => {
    const html = renderToStaticMarkup(
      <ContentJobsLiveList
        initialJobs={[
          {
            created_at: "2026-06-01T10:00:00.000Z",
            error_message: "Automation service unavailable.",
            id: "44444444-4444-4444-8444-444444444444",
            job_type: "clip_scoring",
            type: "clip_scoring",
            channel_id: null,
            last_retried_at: "2026-06-01T09:59:00.000Z",
            max_retries: 3,
            next_retry_at: null,
            started_at: null,
            completed_at: null,
            payload: {},
            queue_job_id: "clip-generation-1",
            result: { error: "Automation service unavailable." },
            retry_count: 1,
            status: "failed",
            stream_id: "33333333-3333-4333-8333-333333333333",
            updated_at: "2026-06-01T10:00:30.000Z",
            user_id: "11111111-1111-4111-8111-111111111111",
          },
          {
            created_at: "2026-06-01T10:01:00.000Z",
            error_message: null,
            id: "55555555-5555-4555-8555-555555555555",
            job_type: "transcription",
            type: "transcription",
            channel_id: null,
            last_retried_at: null,
            max_retries: 3,
            next_retry_at: null,
            started_at: "2026-06-01T10:01:00.000Z",
            completed_at: null,
            payload: {},
            queue_job_id: "transcription-trigger-1",
            result: null,
            retry_count: 0,
            status: "running",
            stream_id: "33333333-3333-4333-8333-333333333333",
            updated_at: "2026-06-01T10:01:30.000Z",
            user_id: "11111111-1111-4111-8111-111111111111",
          },
        ]}
        retryAction={async () => undefined}
        userId="11111111-1111-4111-8111-111111111111"
      />,
    );

    expect(html).toContain("Live Job Queue");
    expect(html).toContain("Processing");
    expect(html).toContain("Failed");
    expect(html).toContain("Retry");
  });
});
