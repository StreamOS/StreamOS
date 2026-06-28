import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildContentPerformanceAnalyticsDashboardModel,
  createEmptyContentPerformanceAnalyticsDashboardModel,
} from "@/components/modules/ContentPerformanceAnalyticsConsole.utils";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getContentPerformanceAnalyticsDashboardData: vi.fn(),
}));

vi.mock("./data", () => ({
  getContentPerformanceAnalyticsDashboardData:
    mocks.getContentPerformanceAnalyticsDashboardData,
}));

import {
  AI_READY_ANALYTICS_CONTEXT_MAX_ITEMS,
  AI_READY_ANALYTICS_CONTEXT_MAX_PERIOD_DAYS,
  buildAIReadyAnalyticsContext,
  getAIReadyAnalyticsContext,
} from "./context";

describe("analytics context", () => {
  beforeEach(() => {
    mocks.getContentPerformanceAnalyticsDashboardData.mockReset();
  });

  it("builds a bounded, structured analytics context from the dashboard model", () => {
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
        metricsSnapshots: Array.from({ length: 8 }, (_, index) => ({
          captured_at: `2026-06-${String(28 - index).padStart(2, "0")}T10:30:00.000Z`,
          channel_id: "channel-1",
          engagement_rate: 7.8 - index * 0.1,
          id: `metric-${index + 1}`,
          platform: "youtube" as const,
          viewer_count: 18400 - index * 100,
          watch_time_minutes: 920 - index * 10,
        })),
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
      publications: Array.from({ length: 8 }, (_, index) => ({
        content_job_id: `job-${index + 1}`,
        created_at: `2026-06-${String(28 - index).padStart(2, "0")}T09:45:00.000Z`,
        id: `publication-${index + 1}`,
        platform_connection_id: "connection-1",
        publication_status: "published",
        published_at: `2026-06-${String(28 - index).padStart(2, "0")}T10:00:00.000Z`,
        requested_at: `2026-06-${String(28 - index).padStart(2, "0")}T09:45:00.000Z`,
        schedule_status: "not_scheduled",
        scheduled_at_utc: null,
        target_platform: "youtube" as const,
        updated_at: `2026-06-${String(28 - index).padStart(2, "0")}T10:05:00.000Z`,
      })),
      selectedItemId: "publication:publication-1",
      state: "ready",
      userId: "user-1",
    });

    const context = buildAIReadyAnalyticsContext(
      model,
      "2026-06-28T09:00:00.000Z",
    );

    expect(context.schemaVersion).toBe("2026-06-28");
    expect(context.generatedAt).toBe("2026-06-28T09:00:00.000Z");
    expect(context.period.selected).toBe("30d");
    expect(context.period.maxWindowDays).toBe(
      AI_READY_ANALYTICS_CONTEXT_MAX_PERIOD_DAYS,
    );
    expect(context.items).toHaveLength(AI_READY_ANALYTICS_CONTEXT_MAX_ITEMS);
    expect(context.summary.itemCount).toBe(8);
    expect(context.platforms[0]?.platform).toBe("youtube");
    expect(context.selectedDetail.state).toBe("ready");
    expect(context.selectedDetail.stream?.title).toBe("Ranked launch stream");
    expect(context.evidence.readOnly).toBe(true);
    expect(context.evidence.ownerScope).toBe("user_id");
    expect(context.limitations.map((item) => item.code)).toContain(
      "sample_scoped_feed",
    );
  });

  it("sanitizes URL-like text and excludes raw AI/provider payload details from the context", () => {
    const model = buildContentPerformanceAnalyticsDashboardModel({
      feed: {
        hasMore: false,
        limit: 12,
      },
      lookupIssues: [],
      lookups: {
        channels: [
          {
            display_name: "www.private.example/channel",
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
              short_form_plan: "Fallback plan",
              title_suggestions: ["https://private.example/signed?token=abc"],
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
            game_name: "https://private.example/game",
            id: "stream-1",
            peak_viewers: 9100,
            provider: "youtube",
            started_at: "2026-06-25T09:55:00.000Z",
            status: "ended",
            title: "www.private.example/stream",
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
      userId: "user-2",
    });

    const context = buildAIReadyAnalyticsContext(model);
    const serialized = JSON.stringify(context);

    expect(context.items[0]?.contentTitle).toBeNull();
    expect(context.items[0]?.channelLabel).toBeNull();
    expect(context.selectedDetail.stream?.title).toBeNull();
    expect(context.selectedDetail.stream?.gameName).toBeNull();
    expect(serialized).not.toContain("https://");
    expect(serialized).not.toContain("www.private.example");
    expect(serialized).not.toContain("openai");
    expect(serialized).not.toContain("gpt-5");
    expect(serialized).not.toContain("queue-1");
  });

  it("marks non-ready dashboard states and missing stream evidence as explicit limitations", () => {
    const model = createEmptyContentPerformanceAnalyticsDashboardModel(
      null,
      "unauthorized",
      [
        {
          code: "load-failed",
          source: "metricsSnapshots",
        },
      ],
    );

    const context = buildAIReadyAnalyticsContext(model);

    expect(context.selectedDetail.state).toBe("idle");
    expect(context.limitations.map((item) => item.code)).toContain(
      "dashboard_state_not_ready",
    );
    expect(context.limitations.map((item) => item.code)).toContain(
      "lookup_sources_partial",
    );
  });

  it("builds the server-side context by delegating to the existing analytics loader", async () => {
    const model = createEmptyContentPerformanceAnalyticsDashboardModel(
      "user-3",
      "ready",
      [],
      "90d",
    );
    mocks.getContentPerformanceAnalyticsDashboardData.mockResolvedValue(model);

    const context = await getAIReadyAnalyticsContext({
      period: "90d",
      selectedItemId: "metrics:metric-1",
    });

    expect(
      mocks.getContentPerformanceAnalyticsDashboardData,
    ).toHaveBeenCalledWith("90d", "metrics:metric-1");
    expect(context.period.selected).toBe("90d");
    expect(context.evidence.ownerScope).toBe("user_id");
  });
});
