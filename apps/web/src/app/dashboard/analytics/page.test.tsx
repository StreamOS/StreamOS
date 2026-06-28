import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AnalyticsPage from "./page";
import {
  buildContentPerformanceAnalyticsDashboardModel,
  createEmptyContentPerformanceAnalyticsDashboardModel,
} from "@/components/modules/ContentPerformanceAnalyticsConsole.utils";

const mocks = vi.hoisted(() => ({
  getContentPerformanceAnalyticsDashboardData: vi.fn(),
  parseContentPerformanceAnalyticsDetailId: vi.fn(),
  parseContentPerformanceAnalyticsPeriod: vi.fn(),
}));

vi.mock("./data", () => ({
  getContentPerformanceAnalyticsDashboardData:
    mocks.getContentPerformanceAnalyticsDashboardData,
  parseContentPerformanceAnalyticsDetailId:
    mocks.parseContentPerformanceAnalyticsDetailId,
  parseContentPerformanceAnalyticsPeriod:
    mocks.parseContentPerformanceAnalyticsPeriod,
}));

describe("AnalyticsPage", () => {
  beforeEach(() => {
    mocks.getContentPerformanceAnalyticsDashboardData.mockReset();
    mocks.parseContentPerformanceAnalyticsDetailId.mockReset();
    mocks.parseContentPerformanceAnalyticsPeriod.mockReset();
    mocks.parseContentPerformanceAnalyticsDetailId.mockImplementation(
      (value?: string) => value?.trim() || null,
    );
    mocks.parseContentPerformanceAnalyticsPeriod.mockImplementation(
      (value?: string) => (value === "7d" ? "7d" : "30d"),
    );
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
    expect(html).toContain("Letzte 30 Tage");
    expect(html).toContain("not tracked");
    expect(html).toContain("Noch kein Stream-Detail ausgewaehlt");
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
        streams: [],
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
          schedule_status: "not_scheduled",
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
    expect(html).toContain("Latest Snapshot");
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
        streams: [],
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

  it("uses the parsed period and detail from search params", async () => {
    mocks.getContentPerformanceAnalyticsDashboardData.mockResolvedValue(
      createEmptyContentPerformanceAnalyticsDashboardModel("user-4"),
    );

    await AnalyticsPage({
      searchParams: Promise.resolve({
        detail: "metrics:metric-2",
        period: "7d",
      }),
    });

    expect(mocks.parseContentPerformanceAnalyticsPeriod).toHaveBeenCalledWith(
      "7d",
    );
    expect(mocks.parseContentPerformanceAnalyticsDetailId).toHaveBeenCalledWith(
      "metrics:metric-2",
    );
    expect(
      mocks.getContentPerformanceAnalyticsDashboardData,
    ).toHaveBeenCalledWith("7d", "metrics:metric-2");
  });

  it("renders the selected stream performance detail when stream evidence exists", async () => {
    const model = buildContentPerformanceAnalyticsDashboardModel({
      feed: {
        hasMore: false,
        limit: 12,
      },
      lookupIssues: [],
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
        streams: [
          {
            average_viewers: 6400,
            channel_id: "channel-1",
            ended_at: "2026-06-25T10:40:00.000Z",
            game_name: "Ranked Arena",
            id: "stream-1",
            peak_viewers: 9100,
            provider: "youtube",
            started_at: "2026-06-25T09:55:00.000Z",
            status: "ended",
            title: "Ranked launch stream",
            updated_at: "2026-06-25T10:45:00.000Z",
            viewer_peak: 9100,
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
          schedule_status: "not_scheduled",
          scheduled_at_utc: null,
          target_platform: "youtube",
          updated_at: "2026-06-25T10:05:00.000Z",
        },
      ],
      selectedItemId: "publication:publication-1",
      state: "ready",
      userId: "user-5",
    });

    mocks.getContentPerformanceAnalyticsDashboardData.mockResolvedValue(model);

    const html = renderToStaticMarkup(await AnalyticsPage());

    expect(html).toContain("Stream Performance Detail");
    expect(html).toContain("Matched Stream Evidence");
    expect(html).toContain("Ranked launch stream");
    expect(html).toContain("Peak Viewers");
    expect(html).toContain("Average Viewers");
  });
});
