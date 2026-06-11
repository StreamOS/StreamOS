import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  buildAnalyticsPlatformComparison,
  buildDashboardHeroMetrics,
  buildDashboardStats,
  buildDashboardOperatingPlan,
  buildDiscoverabilityOverview,
  buildRecentClips,
  buildViewerTrend,
} from "./insights";

describe("dashboard insights", () => {
  it("builds recent clips from real rows", () => {
    const clips = buildRecentClips([
      {
        clip_url: "https://example.com/clips/older",
        created_at: "2026-06-01T10:00:00.000Z",
        description: "Older clip",
        duration_seconds: 42,
        id: "clip-older",
        source_url: "https://example.com/source/older",
        status: "queued",
        streams: {
          game_name: "Valorant",
          provider: "twitch",
          title: "Older stream",
        },
        thumbnail_url: null,
        title: "Older clip",
        viral_score: 76,
        virality_score: 76,
      },
      {
        clip_url: "https://example.com/clips/newer",
        created_at: "2026-06-02T10:00:00.000Z",
        description: "Newer clip",
        duration_seconds: 55,
        id: "clip-newer",
        source_url: "https://example.com/source/newer",
        status: "ready",
        streams: {
          game_name: "Just Chatting",
          provider: "youtube",
          title: "Newer stream",
        },
        thumbnail_url: null,
        title: "Newer clip",
        viral_score: 91,
        virality_score: 91,
      },
    ]);

    expect(clips).toHaveLength(2);
    expect(clips[0]?.id).toBe("clip-newer");
    expect(clips[0]?.platformLabel).toBe("YouTube");
    expect(clips[0]?.statusLabel).toBe("Bereit");
    expect(clips[0]?.scoreLabel).toBe("91/100");
    expect(clips[1]?.platformLabel).toBe("Twitch");
  });

  it("builds dashboard stats from source tables", () => {
    const stats = buildDashboardStats({
      clips: [
        {
          clip_url: null,
          created_at: "2026-06-02T10:00:00.000Z",
          description: null,
          duration_seconds: null,
          id: "clip-1",
          source_url: null,
          status: "ready",
          streams: null,
          thumbnail_url: null,
          title: "Clip 1",
          viral_score: 84,
          virality_score: 84,
        },
        {
          clip_url: null,
          created_at: "2026-06-03T10:00:00.000Z",
          description: null,
          duration_seconds: null,
          id: "clip-2",
          source_url: null,
          status: "rendering",
          streams: null,
          thumbnail_url: null,
          title: "Clip 2",
          viral_score: 72,
          virality_score: 72,
        },
      ],
      jobs: [
        { job_type: "clip_scoring", status: "pending" },
        { job_type: "repurposing", status: "running" },
        { job_type: "transcription", status: "failed" },
      ],
      snapshots: [
        {
          captured_at: "2026-06-10T20:00:00.000Z",
          engagement_rate: 0.5,
          follower_count: 1_000,
          platform: "twitch",
          revenue_cents: 10_000,
          viewer_count: 250,
          watch_time_minutes: 1_200,
        },
        {
          captured_at: "2026-06-03T20:00:00.000Z",
          engagement_rate: 0.4,
          follower_count: 900,
          platform: "twitch",
          revenue_cents: 8_000,
          viewer_count: 200,
          watch_time_minutes: 1_000,
        },
        {
          captured_at: "2026-06-10T20:00:00.000Z",
          engagement_rate: 0.35,
          follower_count: 500,
          platform: "youtube",
          revenue_cents: 7_000,
          viewer_count: 100,
          watch_time_minutes: 600,
        },
        {
          captured_at: "2026-06-03T20:00:00.000Z",
          engagement_rate: 0.3,
          follower_count: 450,
          platform: "youtube",
          revenue_cents: 5_000,
          viewer_count: 80,
          watch_time_minutes: 500,
        },
      ],
    });

    expect(stats).toHaveLength(4);
    expect(stats[0]?.label).toBe("Discovery-Score");
    expect(stats[0]?.value).not.toBe("0");
    expect(stats[1]?.value).toContain("$");
    expect(stats[2]?.value).toBe("2");
    expect(stats[3]?.value).toBe("350");
  });

  it("builds discoverability signals from metrics snapshots", () => {
    const overview = buildDiscoverabilityOverview([
      {
        captured_at: "2026-06-10T20:00:00.000Z",
        engagement_rate: 0.5,
        follower_count: 1_000,
        platform: "twitch",
        revenue_cents: 10_000,
        viewer_count: 250,
        watch_time_minutes: 1_200,
      },
      {
        captured_at: "2026-06-03T20:00:00.000Z",
        engagement_rate: 0.4,
        follower_count: 900,
        platform: "twitch",
        revenue_cents: 8_000,
        viewer_count: 200,
        watch_time_minutes: 1_000,
      },
      {
        captured_at: "2026-06-10T20:00:00.000Z",
        engagement_rate: 0.35,
        follower_count: 500,
        platform: "youtube",
        revenue_cents: 7_000,
        viewer_count: 100,
        watch_time_minutes: 600,
      },
      {
        captured_at: "2026-06-03T20:00:00.000Z",
        engagement_rate: 0.3,
        follower_count: 450,
        platform: "youtube",
        revenue_cents: 5_000,
        viewer_count: 80,
        watch_time_minutes: 500,
      },
    ]);

    expect(overview.activePlatforms).toBe(2);
    expect(overview.score).toBeGreaterThan(0);
    expect(overview.signalChips).toHaveLength(2);
    expect(overview.recommendations).not.toHaveLength(0);
    expect(overview.weeklyGrowthLabel).toMatch(/%|Noch keine/);
  });

  it("builds discoverability top signals from snapshots and jobs", () => {
    const overview = buildDiscoverabilityOverview(
      [
        {
          captured_at: "2026-06-10T20:00:00.000Z",
          engagement_rate: 0.5,
          follower_count: 1_000,
          platform: "twitch",
          revenue_cents: 10_000,
          viewer_count: 250,
          watch_time_minutes: 1_200,
        },
        {
          captured_at: "2026-06-03T20:00:00.000Z",
          engagement_rate: 0.4,
          follower_count: 900,
          platform: "twitch",
          revenue_cents: 8_000,
          viewer_count: 200,
          watch_time_minutes: 1_000,
        },
        {
          captured_at: "2026-06-10T20:00:00.000Z",
          engagement_rate: 0.35,
          follower_count: 500,
          platform: "youtube",
          revenue_cents: 7_000,
          viewer_count: 100,
          watch_time_minutes: 600,
        },
        {
          captured_at: "2026-06-03T20:00:00.000Z",
          engagement_rate: 0.3,
          follower_count: 450,
          platform: "youtube",
          revenue_cents: 5_000,
          viewer_count: 80,
          watch_time_minutes: 500,
        },
      ],
      [
        { job_type: "clip_scoring", status: "running" },
        { job_type: "clip_scoring", status: "failed" },
        { job_type: "transcription", status: "done" },
      ],
    );

    expect(overview.topSignals).toHaveLength(3);
    expect(overview.topSignals[0]).toMatchObject({
      label: "Staerkste Plattform",
      value: "Twitch",
    });
    expect(overview.topSignals[1]).toMatchObject({
      label: "Pipeline",
      value: "1 aktiv",
    });
    expect(overview.topSignals[1]?.detail).toContain("Clip-Bewertung");
    expect(overview.topSignals[2]).toMatchObject({
      label: "Prioritaet",
      value: "YouTube",
    });
    expect(
      overview.signalChips.some((chip) => chip.includes("aktive Jobs")),
    ).toBe(true);
  });

  it("builds hero metrics and viewer trend rows from snapshots", () => {
    const sources: Parameters<typeof buildDashboardHeroMetrics>[0] = {
      clips: [
        {
          clip_url: null,
          created_at: "2026-06-02T10:00:00.000Z",
          description: null,
          duration_seconds: null,
          id: "clip-1",
          source_url: null,
          status: "ready",
          streams: null,
          thumbnail_url: null,
          title: "Clip 1",
          viral_score: 84,
          virality_score: 84,
        },
      ],
      jobs: [
        { job_type: "clip_scoring", status: "pending" },
        { job_type: "repurposing", status: "running" },
      ],
      snapshots: [
        {
          captured_at: "2026-06-10T20:00:00.000Z",
          engagement_rate: 0.5,
          follower_count: 1_000,
          platform: "twitch",
          revenue_cents: 10_000,
          viewer_count: 250,
          watch_time_minutes: 1_200,
        },
        {
          captured_at: "2026-06-10T21:00:00.000Z",
          engagement_rate: 0.4,
          follower_count: 500,
          platform: "youtube",
          revenue_cents: 7_000,
          viewer_count: 100,
          watch_time_minutes: 600,
        },
        {
          captured_at: "2026-06-09T20:00:00.000Z",
          engagement_rate: 0.35,
          follower_count: 300,
          platform: "tiktok",
          revenue_cents: 4_000,
          viewer_count: 80,
          watch_time_minutes: 300,
        },
        {
          captured_at: "2026-06-09T22:00:00.000Z",
          engagement_rate: 0.3,
          follower_count: 120,
          platform: "kick",
          revenue_cents: 2_000,
          viewer_count: 40,
          watch_time_minutes: 200,
        },
      ],
    };

    const heroMetrics = buildDashboardHeroMetrics(sources);
    const viewerTrend = buildViewerTrend(sources.snapshots);

    expect(heroMetrics.clips).toBe(1);
    expect(heroMetrics.jobs).toBe(2);
    expect(heroMetrics.activePlatforms).toBe(4);
    expect(heroMetrics.snapshots).toBe(4);
    expect(viewerTrend).toHaveLength(2);
    expect(viewerTrend[0]).toMatchObject({
      day: "09.06.",
      kick: 40,
      tiktok: 80,
      twitch: 0,
      youtube: 0,
    });
    expect(viewerTrend[1]).toMatchObject({
      day: "10.06.",
      kick: 0,
      tiktok: 0,
      twitch: 250,
      youtube: 100,
    });
  });

  it("builds a live operating plan from source state", () => {
    const plan = buildDashboardOperatingPlan({
      clips: [
        {
          clip_url: null,
          created_at: "2026-06-02T10:00:00.000Z",
          description: null,
          duration_seconds: null,
          id: "clip-1",
          source_url: null,
          status: "ready",
          streams: null,
          thumbnail_url: null,
          title: "Clip 1",
          viral_score: 84,
          virality_score: 84,
        },
      ],
      jobs: [{ job_type: "clip_scoring", status: "running" }],
      snapshots: [
        {
          captured_at: "2026-06-10T20:00:00.000Z",
          engagement_rate: 0.5,
          follower_count: 1_000,
          platform: "twitch",
          revenue_cents: 10_000,
          viewer_count: 250,
          watch_time_minutes: 1_200,
        },
        {
          captured_at: "2026-06-03T20:00:00.000Z",
          engagement_rate: 0.4,
          follower_count: 900,
          platform: "twitch",
          revenue_cents: 8_000,
          viewer_count: 200,
          watch_time_minutes: 1_000,
        },
      ],
    });

    expect(plan).toHaveLength(4);
    expect(plan[0]).toContain("Plattform");
    expect(plan[1]).toContain("laufende Content-Jobs");
    expect(plan[2]).toContain("fertige Clips");
    expect(plan[3]).toContain("Twitch");
  });

  it("builds analytics platform comparison cards from snapshots", () => {
    const cards = buildAnalyticsPlatformComparison([
      {
        captured_at: "2026-06-10T20:00:00.000Z",
        engagement_rate: 0.5,
        follower_count: 1_000,
        platform: "twitch",
        revenue_cents: 10_000,
        viewer_count: 250,
        watch_time_minutes: 1_200,
      },
      {
        captured_at: "2026-06-03T20:00:00.000Z",
        engagement_rate: 0.4,
        follower_count: 900,
        platform: "twitch",
        revenue_cents: 8_000,
        viewer_count: 200,
        watch_time_minutes: 1_000,
      },
      {
        captured_at: "2026-06-10T20:00:00.000Z",
        engagement_rate: 0.35,
        follower_count: 500,
        platform: "youtube",
        revenue_cents: 7_000,
        viewer_count: 100,
        watch_time_minutes: 600,
      },
    ]);

    expect(cards).toHaveLength(4);
    expect(cards[0]).toMatchObject({
      id: "twitch",
      liveViewersLabel: "250 Live",
      status: "Verbunden",
      title: "Twitch",
    });
    expect(cards[1]).toMatchObject({
      id: "youtube",
      liveViewersLabel: "100 Live",
      status: "Verbunden",
      title: "YouTube",
    });
    expect(cards[2]).toMatchObject({
      id: "tiktok",
      status: "Keine Snapshots",
      title: "TikTok",
    });
    expect(cards[3]).toMatchObject({
      id: "kick",
      status: "Keine Snapshots",
      title: "Kick",
    });
  });
});
