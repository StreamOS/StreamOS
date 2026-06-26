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
      state: "ready",
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

  it("renders a hard load failure without the partial-load notice", async () => {
    mocks.getContentPerformanceAnalyticsDashboardData.mockResolvedValue(
      createEmptyContentPerformanceAnalyticsDashboardModel(
        "user-2",
        "load-failed",
        [
          {
            code: "load-failed",
            source: "publications",
          },
        ],
      ),
    );

    const html = renderToStaticMarkup(await AnalyticsPage());

    expect(html).toContain(
      "Publications und Metrics-Snapshots konnten nicht geladen werden",
    );
    expect(html).toContain("Content-Performance konnte nicht geladen werden");
    expect(html).not.toContain(
      "Einige Read- oder Lookup-Quellen konnten nicht geladen werden",
    );
  });

  it("keeps the coverage stats visible when engagement is unavailable", async () => {
    const model = buildContentPerformanceAnalyticsDashboardModel({
      feed: {
        hasMore: false,
        limit: 12,
      },
      lookupIssues: [],
      lookups: {
        channels: [
          {
            display_name: "NightShift",
            id: "channel-2",
            platform: "twitch",
          },
        ],
        contentJobs: [],
        metricsSnapshots: [
          {
            captured_at: "2026-06-25T08:00:00.000Z",
            channel_id: "channel-2",
            engagement_rate: null,
            id: "metric-2",
            platform: "twitch",
            viewer_count: 3400,
            watch_time_minutes: 1250,
          },
        ],
        platformConnections: [],
      },
      publications: [],
      state: "ready",
      userId: "user-3",
    });

    mocks.getContentPerformanceAnalyticsDashboardData.mockResolvedValue(model);

    const html = renderToStaticMarkup(await AnalyticsPage());

    expect(html).toContain("Average Engagement");
    expect(html).toContain("Unavailable");
    expect(html).toContain("Publication Only");
    expect(html).toContain("Metrics Only");
  });

  it("renders a distinct unauthorized state instead of the generic empty state", async () => {
    mocks.getContentPerformanceAnalyticsDashboardData.mockResolvedValue(
      createEmptyContentPerformanceAnalyticsDashboardModel(
        null,
        "unauthorized",
      ),
    );

    const html = renderToStaticMarkup(await AnalyticsPage());

    expect(html).toContain("Dashboard-Session erforderlich");
    expect(html).not.toContain("Noch keine Content-Performance-Daten");
  });
});
