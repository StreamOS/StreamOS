import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AnalyticsPage from "./page";
import {
  buildContentPerformanceAnalyticsDashboardModel,
  createEmptyContentPerformanceAnalyticsDashboardModel,
} from "@/components/modules/ContentPerformanceAnalyticsConsole.utils";

const mocks = vi.hoisted(() => ({
  getContentPerformanceAnalyticsDashboardData: vi.fn(),
}));

vi.mock("./data", () => ({
  getContentPerformanceAnalyticsDashboardData:
    mocks.getContentPerformanceAnalyticsDashboardData,
}));

describe("AnalyticsPage", () => {
  beforeEach(() => {
    mocks.getContentPerformanceAnalyticsDashboardData.mockReset();
  });

  it("renders the empty read-only analytics surface", async () => {
    mocks.getContentPerformanceAnalyticsDashboardData.mockResolvedValue(
      createEmptyContentPerformanceAnalyticsDashboardModel("user-1"),
    );

    const html = renderToStaticMarkup(await AnalyticsPage());

    expect(html).toContain("Analytics Expansion");
    expect(html).toContain("Read-only sample join");
    expect(html).toContain("Noch kein Plattformvergleich verfuegbar");
    expect(html).toContain("Noch keine Content-Performance-Daten");
    expect(html).toContain("not tracked");
  });

  it("renders linked analytics items and partial-load warnings together", async () => {
    const model = buildContentPerformanceAnalyticsDashboardModel({
      error: null,
      feed: {
        hasMore: true,
        limit: 12,
      },
      lookupIssues: [
        {
          code: "load-failed",
          source: "channels",
        },
      ],
      lookups: {
        channels: [
          {
            display_name: "NovaPlays Live",
            id: "channel-1",
            platform: "youtube",
          },
        ],
        contentJobs: [
          {
            id: "job-1",
            result: {
              captions: [],
              confidence: 88,
              content_job_id: "job-1",
              descriptions: [],
              hashtag_sets: [],
              hook_ideas: [],
              manual_review_required: true,
              model: "gpt-5",
              provider: "openai",
              queue_job_id: "queue-1",
              review_notes: [],
              short_form_plan: "Fallback short plan",
              title_suggestions: ["Ranked launch clip"],
              warnings: [],
            },
          },
        ],
        metricsSnapshots: [
          {
            captured_at: "2026-06-25T10:30:00.000Z",
            channel_id: "channel-1",
            engagement_rate: 7.8,
            id: "metric-1",
            platform: "youtube",
            viewer_count: 18400,
            watch_time_minutes: 920,
          },
        ],
        platformConnections: [
          {
            channel_id: "channel-1",
            id: "connection-1",
            platform: "youtube",
            status: "connected",
          },
        ],
      },
      publications: [
        {
          content_job_id: "job-1",
          created_at: "2026-06-25T09:45:00.000Z",
          id: "publication-1",
          platform_connection_id: "connection-1",
          publication_status: "published",
          published_at: "2026-06-25T10:00:00.000Z",
          requested_at: "2026-06-25T09:45:00.000Z",
          schedule_status: "completed",
          scheduled_at_utc: null,
          target_platform: "youtube",
          updated_at: "2026-06-25T10:05:00.000Z",
        },
      ],
      userId: "user-1",
    });

    mocks.getContentPerformanceAnalyticsDashboardData.mockResolvedValue(model);

    const html = renderToStaticMarkup(await AnalyticsPage());

    expect(html).toContain(
      "Einige Read- oder Lookup-Quellen konnten nicht geladen werden",
    );
    expect(html).toContain("Diese Surface zeigt die neuesten 1 Eintraege");
    expect(html).toContain("Platform Comparison");
    expect(html).toContain("Ranked launch clip");
    expect(html).toContain("Published");
    expect(html).toContain("18.400");
    expect(html).toContain("7,8%");
  });
});
