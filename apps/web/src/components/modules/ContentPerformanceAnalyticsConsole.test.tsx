import { describe, expect, it } from "vitest";
import {
  buildContentPerformanceAnalyticsDashboardModel,
  createEmptyContentPerformanceAnalyticsDashboardModel,
} from "./ContentPerformanceAnalyticsConsole.utils";

describe("ContentPerformanceAnalyticsConsole.utils", () => {
  it("builds linked publication performance with platform comparison", () => {
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

    expect(model.items).toHaveLength(1);
    expect(model.items[0]?.coverageStatus).toBe("linked");
    expect(model.items[0]?.contentTitle).toBe("Ranked launch clip");
    expect(model.items[0]?.views.value).toBe(18400);
    expect(model.items[0]?.ctr.availability).toBe("not_tracked");
    expect(model.periodContext.selectedPeriod).toBe("30d");
    expect(model.summary.totalWatchTimeMinutes.value).toBe(920);
    expect(model.platformComparison[0]?.linkedCount).toBe(1);
    expect(model.platformComparison[0]?.engagementRate.value).toBe(7.8);
  });

  it("keeps publications without metrics explicit instead of fabricating performance", () => {
    const model = buildContentPerformanceAnalyticsDashboardModel({
      feed: {
        hasMore: false,
        limit: 12,
      },
      lookupIssues: [],
      lookups: {
        channels: [],
        contentJobs: [],
        metricsSnapshots: [],
        platformConnections: [],
        streams: [],
      },
      publications: [
        {
          content_job_id: "job-2",
          created_at: "2026-06-25T11:00:00.000Z",
          id: "publication-2",
          platform_connection_id: "connection-2",
          publication_status: "queued",
          published_at: null,
          requested_at: "2026-06-25T11:00:00.000Z",
          schedule_status: "scheduled",
          scheduled_at_utc: "2026-06-26T10:00:00.000Z",
          target_platform: "tiktok",
          updated_at: "2026-06-25T11:05:00.000Z",
        },
      ],
      state: "ready",
      userId: "user-2",
    });

    expect(model.items[0]?.coverageStatus).toBe("publication_only");
    expect(model.items[0]?.views.availability).toBe("unavailable");
    expect(model.items[0]?.watchTimeMinutes.availability).toBe("unavailable");
    expect(model.items[0]?.engagementRate.availability).toBe("unavailable");
    expect(model.summary.publicationOnlyCount).toBe(1);
    expect(model.coverage.scheduledPublications).toBe(1);
  });

  it("keeps metrics without publication links visible as metrics-only rows", () => {
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

    expect(model.items).toHaveLength(1);
    expect(model.items[0]?.coverageStatus).toBe("metrics_only");
    expect(model.items[0]?.publicationId).toBeNull();
    expect(model.items[0]?.engagementRate.availability).toBe("unavailable");
    expect(model.summary.metricsOnlyCount).toBe(1);
    expect(model.coverage.metricsSnapshots).toBe(1);
  });

  it("preserves partial-load metadata on an empty model", () => {
    const model = createEmptyContentPerformanceAnalyticsDashboardModel(
      "user-4",
      "ready",
      [
        {
          code: "load-failed",
          source: "metricsSnapshots",
        },
      ],
    );

    expect(model.state).toBe("ready");
    expect(model.items).toHaveLength(0);
    expect(model.lookupIssues).toHaveLength(1);
    expect(model.periodContext.periodLabel).toBe("Letzte 30 Tage");
    expect(model.lookupIssues[0]?.source).toBe("metricsSnapshots");
    expect(model.detail.state).toBe("idle");
  });

  it("marks the feed as limited when merged items exceed the configured window", () => {
    const metricsSnapshots = Array.from({ length: 13 }, (_, index) => ({
      captured_at: `2026-06-${String(25 - index).padStart(2, "0")}T10:00:00.000Z`,
      channel_id: `channel-${index}`,
      engagement_rate: index,
      id: `metric-${index}`,
      platform: "kick" as const,
      viewer_count: 100 + index,
      watch_time_minutes: 50 + index,
    }));

    const model = buildContentPerformanceAnalyticsDashboardModel({
      feed: {
        hasMore: false,
        limit: 12,
      },
      lookupIssues: [],
      lookups: {
        channels: [],
        contentJobs: [],
        metricsSnapshots,
        platformConnections: [],
        streams: [],
      },
      publications: [],
      state: "ready",
      userId: "user-5",
    });

    expect(model.feed.hasMore).toBe(true);
    expect(model.feed.returnedCount).toBe(12);
    expect(model.items).toHaveLength(12);
  });

  it("sorts platform comparison with dated snapshots first and undated platforms alphabetically", () => {
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
        contentJobs: [],
        metricsSnapshots: [
          {
            captured_at: "2026-06-25T12:00:00.000Z",
            channel_id: "channel-1",
            engagement_rate: 4.2,
            id: "metric-1",
            platform: "youtube",
            viewer_count: 8000,
            watch_time_minutes: 300,
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
          content_job_id: "job-kick",
          created_at: "2026-06-25T10:00:00.000Z",
          id: "publication-1",
          platform_connection_id: "connection-kick",
          publication_status: "queued",
          published_at: null,
          requested_at: "2026-06-25T10:00:00.000Z",
          schedule_status: "not_scheduled",
          scheduled_at_utc: null,
          target_platform: "kick",
          updated_at: "2026-06-25T10:05:00.000Z",
        },
        {
          content_job_id: "job-tiktok",
          created_at: "2026-06-25T09:00:00.000Z",
          id: "publication-2",
          platform_connection_id: "connection-tiktok",
          publication_status: "queued",
          published_at: null,
          requested_at: "2026-06-25T09:00:00.000Z",
          schedule_status: "not_scheduled",
          scheduled_at_utc: null,
          target_platform: "tiktok",
          updated_at: "2026-06-25T09:05:00.000Z",
        },
        {
          content_job_id: "job-youtube",
          created_at: "2026-06-25T11:30:00.000Z",
          id: "publication-3",
          platform_connection_id: "connection-1",
          publication_status: "published",
          published_at: "2026-06-25T11:00:00.000Z",
          requested_at: "2026-06-25T10:30:00.000Z",
          schedule_status: "not_scheduled",
          scheduled_at_utc: null,
          target_platform: "youtube",
          updated_at: "2026-06-25T11:05:00.000Z",
        },
      ],
      state: "ready",
      userId: "user-6",
    });

    expect(model.platformComparison.map((item) => item.platform)).toEqual([
      "youtube",
      "kick",
      "tiktok",
    ]);
  });

  it("builds a selected detail model with matched stream evidence", () => {
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
        contentJobs: [],
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
      userId: "user-7",
    });

    expect(model.detail.state).toBe("ready");
    expect(model.detail.item?.id).toBe("publication:publication-1");
    expect(model.detail.stream?.title).toBe("Ranked launch stream");
    expect(model.detail.stream?.peakViewers.value).toBe(9100);
    expect(model.detail.relatedMetricsCount).toBe(1);
  });

  it("marks detail lookup failures without mutating the overview state", () => {
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
        contentJobs: [],
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
        platformConnections: [],
        streams: [],
      },
      publications: [],
      selectedItemId: "metrics:metric-1",
      state: "ready",
      streamLookupFailed: true,
      userId: "user-8",
    });

    expect(model.state).toBe("ready");
    expect(model.summary.itemCount).toBe(1);
    expect(model.detail.state).toBe("load-failed");
    expect(model.detail.item?.id).toBe("metrics:metric-1");
  });
});
