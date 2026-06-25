import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GrowthPage from "./page";
import {
  buildCreatorGrowthIntelligenceDashboardModel,
  createEmptyCreatorGrowthIntelligenceDashboardModel,
} from "@/components/modules/CreatorGrowthIntelligenceConsole.utils";

const mocks = vi.hoisted(() => ({
  getCreatorGrowthIntelligenceDashboardData: vi.fn(),
}));

vi.mock("./data", () => ({
  getCreatorGrowthIntelligenceDashboardData:
    mocks.getCreatorGrowthIntelligenceDashboardData,
}));

describe("GrowthPage", () => {
  beforeEach(() => {
    mocks.getCreatorGrowthIntelligenceDashboardData.mockReset();
  });

  it("renders the empty-state review surface when no intelligence exists", async () => {
    const model = createEmptyCreatorGrowthIntelligenceDashboardModel(
      "11111111-1111-4111-8111-111111111111",
    );

    mocks.getCreatorGrowthIntelligenceDashboardData.mockResolvedValue(model);

    const html = renderToStaticMarkup(await GrowthPage());

    expect(html).toContain("Creator Growth Intelligence");
    expect(html).toContain("Review-only read model");
    expect(html).toContain("Noch keine SEO Intelligence Records");
    expect(html).toContain("Allowed categories");
    expect(html).toContain("Allowed recommendation types");
    expect(html).toContain("--/100");
  });

  it("renders reviewable signals with linked source context", async () => {
    const model = buildCreatorGrowthIntelligenceDashboardModel({
      error: null,
      feed: {
        hasMore: true,
        limit: 12,
        returnedCount: 1,
      },
      userId: "11111111-1111-4111-8111-111111111111",
      items: [
        {
          channelId: "44444444-4444-4444-8444-444444444444",
          confidence: 87,
          contentJobId: "22222222-2222-4222-8222-222222222222",
          contentPublicationId: null,
          createdAt: "2026-06-25T10:00:00.000Z",
          creatorId: "11111111-1111-4111-8111-111111111111",
          evidence: {
            topKeywords: ["ranked clutch", "aim routine"],
            watchTimeMinutes: 1440,
          },
          id: "33333333-3333-4333-8333-333333333333",
          intelligenceCategory: "channel_seo",
          metadata: {
            origin: "automation-service",
          },
          metricsSnapshotId: "55555555-5555-4555-8555-555555555555",
          platform: "twitch",
          rationale:
            "Title and metadata under-index the strongest stream keywords.",
          recommendationStatus: "needs_review",
          recommendationType: "title",
          score: 84,
          summary:
            "The current title misses the highest-value SEO phrase cluster.",
          title: "Tune the stream title for keyword recall",
          updatedAt: "2026-06-25T10:05:00.000Z",
          userId: "11111111-1111-4111-8111-111111111111",
        },
      ],
      lookupIssues: [],
      lookups: {
        channels: [
          {
            display_name: "NovaPlays Live",
            id: "44444444-4444-4444-8444-444444444444",
            platform: "twitch",
          },
        ],
        contentJobs: [
          {
            created_at: "2026-06-25T09:50:00.000Z",
            id: "22222222-2222-4222-8222-222222222222",
            job_type: "title_generation",
            review_status: "needs_review",
            status: "completed",
            updated_at: "2026-06-25T10:00:00.000Z",
          },
        ],
        contentPublications: [],
        creators: [
          {
            display_name: "NovaPlays",
            handle: "novaplays",
            id: "11111111-1111-4111-8111-111111111111",
            niche: "Tactical FPS",
          },
        ],
        metricsSnapshots: [
          {
            captured_at: "2026-06-25T09:55:00.000Z",
            channel_id: "44444444-4444-4444-8444-444444444444",
            creator_id: "11111111-1111-4111-8111-111111111111",
            follower_count: 18200,
            id: "55555555-5555-4555-8555-555555555555",
            platform: "twitch",
            viewer_count: 1440,
          },
        ],
      },
    });

    mocks.getCreatorGrowthIntelligenceDashboardData.mockResolvedValue(model);

    const html = renderToStaticMarkup(await GrowthPage());

    expect(html).toContain("Tune the stream title for keyword recall");
    expect(html).toContain("Kanal-SEO");
    expect(html).toContain("Titel");
    expect(html).toContain("Zur Pruefung");
    expect(html).toContain("Metrik-Snapshot");
    expect(html).toContain("18.200 Followers");
    expect(html).toContain("SEO Health");
    expect(html).toContain("84/100");
    expect(html).toContain("Review Queue");
    expect(html).toContain("Contract Coverage");
    expect(html).toContain("Neueste 12 Signale");
    expect(html).toContain("Stichprobe begrenzt");
  });

  it("renders a partial-load state when lookup data fails", async () => {
    const model = buildCreatorGrowthIntelligenceDashboardModel({
      error: null,
      feed: {
        hasMore: false,
        limit: 12,
        returnedCount: 0,
      },
      userId: "11111111-1111-4111-8111-111111111111",
      items: [],
      lookupIssues: [
        {
          code: "load-failed",
          source: "creators",
        },
      ],
      lookups: {
        channels: [],
        contentJobs: [],
        contentPublications: [],
        creators: [],
        metricsSnapshots: [],
      },
    });

    mocks.getCreatorGrowthIntelligenceDashboardData.mockResolvedValue(model);

    const html = renderToStaticMarkup(await GrowthPage());

    expect(html).toContain("Teilweise geladene Creator-Growth-Daten");
    expect(html).toContain("Lookup-Daten konnten nicht geladen werden");
    expect(html).not.toContain("Noch keine SEO Intelligence Records");
  });

  it("counts only platform_fit entries in the platform fit summary", () => {
    const model = buildCreatorGrowthIntelligenceDashboardModel({
      error: null,
      feed: {
        hasMore: false,
        limit: 12,
        returnedCount: 2,
      },
      userId: "11111111-1111-4111-8111-111111111111",
      items: [
        {
          channelId: null,
          confidence: 90,
          contentJobId: null,
          contentPublicationId: null,
          createdAt: "2026-06-25T10:00:00.000Z",
          creatorId: null,
          evidence: {},
          id: "44444444-4444-4444-8444-444444444444",
          intelligenceCategory: "platform_fit",
          metadata: {},
          metricsSnapshotId: null,
          platform: "youtube",
          rationale: null,
          recommendationStatus: "needs_review",
          recommendationType: "platform_positioning",
          score: 80,
          summary: "Explicit platform fit signal.",
          title: "Platform fit target",
          updatedAt: "2026-06-25T10:01:00.000Z",
          userId: "11111111-1111-4111-8111-111111111111",
        },
        {
          channelId: null,
          confidence: 75,
          contentJobId: null,
          contentPublicationId: null,
          createdAt: "2026-06-25T10:02:00.000Z",
          creatorId: null,
          evidence: {},
          id: "55555555-5555-4555-8555-555555555555",
          intelligenceCategory: "channel_seo",
          metadata: {},
          metricsSnapshotId: null,
          platform: "twitch",
          rationale: null,
          recommendationStatus: "needs_review",
          recommendationType: "title",
          score: 70,
          summary: "Non-platform-fit signal with a platform set.",
          title: "SEO signal with platform context",
          updatedAt: "2026-06-25T10:03:00.000Z",
          userId: "11111111-1111-4111-8111-111111111111",
        },
      ],
      lookupIssues: [],
      lookups: {
        channels: [],
        contentJobs: [],
        contentPublications: [],
        creators: [],
        metricsSnapshots: [],
      },
    });

    expect(model.summary.platformFitCount).toBe(1);
  });
});
