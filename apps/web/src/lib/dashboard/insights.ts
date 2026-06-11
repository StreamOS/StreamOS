import "server-only";

import type { Tables } from "@streamos/database";
import type { StreamPlatform } from "@streamos/types";
import type { DashboardStat, ViewerPoint } from "@/data/dashboard";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ensureCreatorForUser } from "@/lib/supabase/creator";
import { createClient } from "@/lib/supabase/server";

export type RecentClipDisplay = {
  createdAtLabel: string;
  href: string | null;
  hook: string;
  id: string;
  platformLabel: string;
  score: number;
  scoreLabel: string;
  statusLabel: string;
  thumbnailUrl: string | null;
  title: string;
};

export type DiscoverabilityRecommendation = {
  label: string;
  recommendation: string;
  score: number;
};

export type DiscoverabilitySignalCard = {
  detail: string;
  label: string;
  tone: "amber" | "emerald" | "rose" | "violet";
  value: string;
};

export type DiscoverabilityOverview = {
  activePlatforms: number;
  recommendations: DiscoverabilityRecommendation[];
  score: number;
  signalChips: string[];
  topSignals: DiscoverabilitySignalCard[];
  weeklyGrowthLabel: string;
};

export type DashboardHeroMetrics = {
  activePlatforms: number;
  clips: number;
  jobs: number;
  snapshots: number;
};

export type DashboardSurfaceData = {
  dashboardStats: DashboardStat[];
  heroMetrics: DashboardHeroMetrics;
  operatingPlan: string[];
  recentClips: RecentClipDisplay[];
  viewerTrend: ViewerPoint[];
};

export type AnalyticsSurfaceData = {
  platformComparison: AnalyticsPlatformCard[];
  viewerTrend: ViewerPoint[];
};

export type AnalyticsPlatformCard = {
  engagementLabel: string;
  followerGrowthLabel: string;
  followersLabel: string;
  id: StreamPlatform;
  liveViewersLabel: string;
  note: string;
  status: string;
  title: string;
  viewerGrowthLabel: string;
};

type DashboardSnapshotRow = Pick<
  Tables<"metrics_snapshots">,
  | "captured_at"
  | "engagement_rate"
  | "follower_count"
  | "platform"
  | "revenue_cents"
  | "viewer_count"
  | "watch_time_minutes"
>;

type DashboardJobRow = Pick<Tables<"content_jobs">, "job_type" | "status">;

type DashboardClipRow = Pick<
  Tables<"clips">,
  | "clip_url"
  | "created_at"
  | "description"
  | "duration_seconds"
  | "id"
  | "source_url"
  | "status"
  | "thumbnail_url"
  | "title"
  | "viral_score"
  | "virality_score"
> & {
  streams: Pick<Tables<"streams">, "game_name" | "provider" | "title"> | null;
};

type DashboardSources = {
  clips: DashboardClipRow[];
  jobs: DashboardJobRow[];
  snapshots: DashboardSnapshotRow[];
};

type PlatformSummary = {
  engagementRate: number;
  followerGrowthPercent: number;
  followerTotal: number;
  label: string;
  platform: StreamPlatform;
  recommendation: string;
  score: number;
  viewerGrowthPercent: number;
  viewerTotal: number;
};

const ACTIVE_JOB_STATUSES = new Set(["pending", "processing", "running"]);
const READY_CLIP_STATUSES = new Set(["ready", "published"]);
const QUEUED_CLIP_STATUSES = new Set([
  "draft",
  "pending",
  "queued",
  "rendering",
]);

const PLATFORM_LABELS: Record<StreamPlatform, string> = {
  kick: "Kick",
  tiktok: "TikTok",
  twitch: "Twitch",
  youtube: "YouTube",
};

const PLATFORM_ORDER: StreamPlatform[] = [
  "twitch",
  "youtube",
  "tiktok",
  "kick",
];

const DEMO_SOURCES: DashboardSources = {
  clips: [
    {
      clip_url: "https://example.com/demo/tiktok-clutch",
      created_at: "2026-06-10T21:24:00.000Z",
      description: "Comeback mit hoher Chat-Aktivitaet und engem Hook.",
      duration_seconds: 42,
      id: "demo-clip-1",
      source_url: "https://www.twitch.tv/videos/demo-1",
      status: "ready",
      streams: {
        game_name: "Valorant",
        provider: "tiktok",
        title: "Clutch-Ende im Ranked",
      },
      thumbnail_url: "https://example.com/demo/tiktok-clutch.jpg",
      title: "Clutch-Ende im Ranked",
      viral_score: 94,
      virality_score: 94,
    },
    {
      clip_url: "https://example.com/demo/youtube-sponsor",
      created_at: "2026-06-09T18:12:00.000Z",
      description: "Natuerliche Produktnennung bei Peak-Retention.",
      duration_seconds: 55,
      id: "demo-clip-2",
      source_url: "https://www.twitch.tv/videos/demo-2",
      status: "rendering",
      streams: {
        game_name: "Just Chatting",
        provider: "youtube",
        title: "Sponsor-Callout Remix",
      },
      thumbnail_url: "https://example.com/demo/youtube-sponsor.jpg",
      title: "Sponsor-Callout Remix",
      viral_score: 81,
      virality_score: 81,
    },
    {
      clip_url: null,
      created_at: "2026-06-08T15:01:00.000Z",
      description:
        "Viewer-Frage wird zu einem wiederverwendbaren Positioning-Clip.",
      duration_seconds: 63,
      id: "demo-clip-3",
      source_url: "https://www.twitch.tv/videos/demo-3",
      status: "queued",
      streams: {
        game_name: "Community Night",
        provider: "twitch",
        title: "Community-Q&A Highlight",
      },
      thumbnail_url: null,
      title: "Community-Q&A Highlight",
      viral_score: 76,
      virality_score: 76,
    },
  ],
  jobs: [
    {
      job_type: "clip_scoring",
      status: "pending",
    },
    {
      job_type: "repurposing",
      status: "running",
    },
    {
      job_type: "transcription",
      status: "failed",
    },
  ],
  snapshots: [
    {
      captured_at: "2026-06-10T20:00:00.000Z",
      engagement_rate: 0.42,
      follower_count: 28_400,
      platform: "twitch",
      revenue_cents: 182_400,
      viewer_count: 7_300,
      watch_time_minutes: 42_000,
    },
    {
      captured_at: "2026-06-03T20:00:00.000Z",
      engagement_rate: 0.36,
      follower_count: 27_200,
      platform: "twitch",
      revenue_cents: 166_200,
      viewer_count: 6_200,
      watch_time_minutes: 39_100,
    },
    {
      captured_at: "2026-06-10T20:00:00.000Z",
      engagement_rate: 0.31,
      follower_count: 19_800,
      platform: "youtube",
      revenue_cents: 92_000,
      viewer_count: 5_600,
      watch_time_minutes: 18_400,
    },
    {
      captured_at: "2026-06-03T20:00:00.000Z",
      engagement_rate: 0.28,
      follower_count: 19_150,
      platform: "youtube",
      revenue_cents: 83_400,
      viewer_count: 4_400,
      watch_time_minutes: 15_900,
    },
    {
      captured_at: "2026-06-10T20:00:00.000Z",
      engagement_rate: 0.48,
      follower_count: 15_400,
      platform: "tiktok",
      revenue_cents: 68_400,
      viewer_count: 7_400,
      watch_time_minutes: 16_200,
    },
    {
      captured_at: "2026-06-03T20:00:00.000Z",
      engagement_rate: 0.44,
      follower_count: 14_900,
      platform: "tiktok",
      revenue_cents: 55_600,
      viewer_count: 6_100,
      watch_time_minutes: 14_700,
    },
  ],
};

export async function getRecentClips(limit = 6): Promise<RecentClipDisplay[]> {
  const sources = await loadDashboardSources({
    includeClips: true,
    includeJobs: false,
    includeSnapshots: false,
    limit,
  });

  return buildRecentClips(sources.clips);
}

export async function getDashboardStats(): Promise<DashboardStat[]> {
  const sources = await loadDashboardSources();

  return buildDashboardStats(sources);
}

export async function getDashboardSurfaceData(): Promise<DashboardSurfaceData> {
  const sources = await loadDashboardSources();

  return {
    dashboardStats: buildDashboardStats(sources),
    heroMetrics: buildDashboardHeroMetrics(sources),
    operatingPlan: buildDashboardOperatingPlan(sources),
    recentClips: buildRecentClips(sources.clips),
    viewerTrend: buildViewerTrend(sources.snapshots),
  };
}

export async function getDiscoverabilityOverview(): Promise<DiscoverabilityOverview> {
  const sources = await loadDashboardSources({
    includeClips: false,
    includeJobs: true,
    includeSnapshots: true,
  });

  return buildDiscoverabilityOverview(sources.snapshots, sources.jobs);
}

export async function getViewerTrend(): Promise<ViewerPoint[]> {
  const sources = await loadDashboardSources({
    includeClips: false,
    includeJobs: false,
    includeSnapshots: true,
  });

  return buildViewerTrend(sources.snapshots);
}

export async function getAnalyticsPlatformComparison(): Promise<
  AnalyticsPlatformCard[]
> {
  const sources = await loadDashboardSources({
    includeClips: false,
    includeJobs: false,
    includeSnapshots: true,
  });

  return buildAnalyticsPlatformComparison(sources.snapshots);
}

export async function getAnalyticsSurfaceData(): Promise<AnalyticsSurfaceData> {
  const sources = await loadDashboardSources({
    includeClips: false,
    includeJobs: false,
    includeSnapshots: true,
  });

  return {
    platformComparison: buildAnalyticsPlatformComparison(sources.snapshots),
    viewerTrend: buildViewerTrend(sources.snapshots),
  };
}

export function buildRecentClips(
  rows: DashboardClipRow[],
): RecentClipDisplay[] {
  return [...rows]
    .sort(
      (left, right) =>
        new Date(right.created_at).getTime() -
        new Date(left.created_at).getTime(),
    )
    .slice(0, 6)
    .map((clip) => {
      const score = clip.virality_score ?? clip.viral_score ?? 0;
      const stream = clip.streams;
      const platformLabel = stream
        ? formatPlatformLabel(stream.provider)
        : "Unbekannt";
      const hook = clip.description?.trim() || buildClipHook(clip, stream);

      return {
        createdAtLabel: formatTimestamp(clip.created_at),
        href: clip.clip_url ?? clip.source_url,
        hook,
        id: clip.id,
        platformLabel,
        score,
        scoreLabel: `${score}/100`,
        statusLabel: formatClipStatus(clip.status),
        thumbnailUrl: clip.thumbnail_url,
        title: clip.title,
      };
    });
}

export function buildDashboardStats(
  sources: DashboardSources,
): DashboardStat[] {
  const metrics = summarizeMetricsSnapshots(sources.snapshots);
  const activeJobs = sources.jobs.filter((job) =>
    isActiveJob(job.status),
  ).length;
  const readyClips = sources.clips.filter((clip) =>
    READY_CLIP_STATUSES.has(clip.status),
  ).length;
  const queuedClips = sources.clips.filter((clip) =>
    QUEUED_CLIP_STATUSES.has(clip.status),
  ).length;

  return [
    {
      label: "Discovery-Score",
      tone: "violet",
      trend:
        metrics.activePlatforms > 0
          ? `${metrics.weeklyGrowthLabel}% Reichweite im Vergleich zur Vorwoche`
          : "Noch keine Metriken",
      value: String(metrics.discoveryScore),
    },
    {
      label: "Monatlicher Umsatz",
      tone: "emerald",
      trend: metrics.revenueComparisonLabel ?? "Noch keine Umsatz-Snapshots",
      value: formatCurrency(metrics.monthlyRevenueCents),
    },
    {
      label: "KI-Clips in Warteschlange",
      tone: "rose",
      trend:
        queuedClips > 0
          ? `${formatCompactNumber(queuedClips)} Clips in der Pipeline, ${formatCompactNumber(readyClips)} bereit`
          : readyClips > 0
            ? `${formatCompactNumber(readyClips)} Clips bereit`
            : "Keine fertigen Clips",
      value: formatCompactNumber(activeJobs),
    },
    {
      label: "Live-Reichweite",
      tone: "amber",
      trend:
        metrics.activePlatforms > 0
          ? `${metrics.viewerGrowthLabel}% im Vergleich zur letzten Erfassung`
          : "Noch keine Reichweiten-Snapshots",
      value: formatCompactNumber(metrics.latestViewerTotal),
    },
  ];
}

export function buildDashboardHeroMetrics(
  sources: DashboardSources,
): DashboardHeroMetrics {
  const activePlatforms = new Set(
    sources.snapshots.map((snapshot) => snapshot.platform),
  ).size;

  return {
    activePlatforms,
    clips: sources.clips.length,
    jobs: sources.jobs.length,
    snapshots: sources.snapshots.length,
  };
}

export function buildDashboardOperatingPlan(
  sources: DashboardSources,
): string[] {
  const metrics = summarizeMetricsSnapshots(sources.snapshots);
  const activeJobs = sources.jobs.filter((job) =>
    isActiveJob(job.status),
  ).length;
  const readyClips = sources.clips.filter((clip) =>
    READY_CLIP_STATUSES.has(clip.status),
  ).length;
  const queuedClips = sources.clips.filter((clip) =>
    QUEUED_CLIP_STATUSES.has(clip.status),
  ).length;
  const strongestPlatform = metrics.platformSummaries[0] ?? null;

  const plan = [
    metrics.activePlatforms === 0
      ? "Mindestens eine Plattform verbinden, damit Dashboard und Analytics echte Signale sehen."
      : metrics.activePlatforms < 3
        ? `Noch ${3 - metrics.activePlatforms} Plattformen anbinden, um Reach und Discovery breiter zu messen.`
        : "Alle verbundenen Plattformen regelmaessig syncen, damit der Gateway-Flow stabil bleibt.",
    activeJobs > 0
      ? `${activeJobs} laufende Content-Jobs priorisieren, damit die Pipeline nicht stehen bleibt.`
      : "Neue VOD-Analyse starten, um die Clip-Pipeline wieder zu fuellen.",
    readyClips > 0
      ? `${readyClips} fertige Clips in Shorts-, TikTok- und Reels-Varianten ausrollen.`
      : queuedClips > 0
        ? `${queuedClips} Clips rendern und Hooks nachschaerfen, bevor sie live gehen.`
        : "Clip-Analyse anstossen, um neue Highlights in die Pipeline zu bekommen.",
    strongestPlatform
      ? `${strongestPlatform.label} als Top-Signal nutzen und erfolgreiche Themen sofort repurposen.`
      : "Die naechste starke Story in allen aktiven Plattformen replizieren.",
  ];

  return plan;
}

export function buildAnalyticsPlatformComparison(
  snapshots: DashboardSnapshotRow[],
): AnalyticsPlatformCard[] {
  const metrics = summarizeMetricsSnapshots(snapshots);
  const summariesByPlatform = new Map(
    metrics.platformSummaries.map((summary) => [summary.platform, summary]),
  );

  return PLATFORM_ORDER.map((platform) => {
    const summary = summariesByPlatform.get(platform);

    if (!summary) {
      return {
        engagementLabel: "Keine Daten",
        followerGrowthLabel: "Keine Daten",
        followersLabel: "Keine Snapshots",
        id: platform,
        liveViewersLabel: "0",
        note: "Verbinde die Plattform oder sync die ersten Metrics-Snapshots.",
        status: "Keine Snapshots",
        title: formatPlatformLabel(platform),
        viewerGrowthLabel: "Keine Daten",
      };
    }

    return {
      engagementLabel: `${formatPercentage(summary.engagementRate)} Engagement`,
      followerGrowthLabel: `${formatSignedNumber(summary.followerGrowthPercent)}% Follower`,
      followersLabel: `${formatCompactNumber(summary.followerTotal)} Follower`,
      id: platform,
      liveViewersLabel: `${formatCompactNumber(summary.viewerTotal)} Live`,
      note: summary.recommendation,
      status: "Verbunden",
      title: formatPlatformLabel(platform),
      viewerGrowthLabel: `${formatSignedNumber(summary.viewerGrowthPercent)}% Viewer`,
    };
  });
}

export function buildDiscoverabilityOverview(
  snapshots: DashboardSnapshotRow[],
  jobs: DashboardJobRow[] = [],
): DiscoverabilityOverview {
  const metrics = summarizeMetricsSnapshots(snapshots);
  const jobSummary = summarizeJobSignals(jobs);

  if (metrics.platformSummaries.length === 0 && jobSummary.totalJobs === 0) {
    return {
      activePlatforms: 0,
      recommendations: [],
      score: 0,
      signalChips: [],
      topSignals: [],
      weeklyGrowthLabel: "Noch keine",
    };
  }

  const recommendations = [...metrics.platformSummaries]
    .sort((left, right) => left.score - right.score)
    .slice(0, 3)
    .map((platform) => ({
      label: platform.label,
      recommendation: platform.recommendation,
      score: platform.score,
    }));

  return {
    activePlatforms: metrics.platformSummaries.length,
    recommendations,
    score: metrics.discoveryScore,
    signalChips: buildSignalChips(metrics, jobSummary),
    topSignals: buildTopSignals(metrics, jobSummary),
    weeklyGrowthLabel:
      metrics.weeklyGrowthLabel === 0 && metrics.activePlatforms === 0
        ? "Noch keine"
        : `${formatSignedNumber(metrics.weeklyGrowthLabel)}%`,
  };
}

async function loadDashboardSources({
  includeClips = true,
  includeJobs = true,
  includeSnapshots = true,
  limit = 60,
}: {
  includeClips?: boolean;
  includeJobs?: boolean;
  includeSnapshots?: boolean;
  limit?: number;
} = {}): Promise<DashboardSources> {
  if (!isSupabaseConfigured()) {
    return getDemoSources({ includeClips, includeJobs, includeSnapshots });
  }

  const supabase = await createClient();
  const userResult = await supabase.auth.getUser();

  if (userResult.error || !userResult.data.user) {
    return {
      clips: [],
      jobs: [],
      snapshots: [],
    };
  }

  let creatorId: string | null = null;

  try {
    creatorId = (await ensureCreatorForUser(supabase, userResult.data.user)).id;
  } catch {
    creatorId = null;
  }

  const clipsPromise = includeClips
    ? supabase
        .from("clips")
        .select(
          "id, title, description, clip_url, thumbnail_url, status, created_at, duration_seconds, source_url, virality_score, viral_score, streams(provider, title, game_name)",
        )
        .eq("user_id", userResult.data.user.id)
        .order("created_at", { ascending: false })
        .limit(limit)
    : Promise.resolve({ data: [], error: null } as const);

  const jobsPromise = includeJobs
    ? supabase
        .from("content_jobs")
        .select("job_type, status")
        .eq("user_id", userResult.data.user.id)
    : Promise.resolve({ data: [], error: null } as const);

  const snapshotsQuery = supabase
    .from("metrics_snapshots")
    .select(
      "captured_at, engagement_rate, follower_count, platform, revenue_cents, viewer_count, watch_time_minutes",
    )
    .eq("user_id", userResult.data.user.id);

  const snapshotsPromise = includeSnapshots
    ? (creatorId ? snapshotsQuery.eq("creator_id", creatorId) : snapshotsQuery)
        .order("captured_at", { ascending: false })
        .limit(limit)
    : Promise.resolve({ data: [], error: null } as const);

  const [clipsResult, jobsResult, snapshotsResult] = await Promise.all([
    clipsPromise,
    jobsPromise,
    snapshotsPromise,
  ]);

  return {
    clips: (clipsResult.data ?? []) as DashboardClipRow[],
    jobs: (jobsResult.data ?? []) as DashboardJobRow[],
    snapshots: (snapshotsResult.data ?? []) as DashboardSnapshotRow[],
  };
}

function buildClipHook(
  clip: DashboardClipRow,
  stream: DashboardClipRow["streams"],
): string {
  const parts = [
    stream?.title?.trim() ||
      clip.source_url?.trim() ||
      "Quelle noch nicht erfasst",
  ];

  if (stream?.game_name) {
    parts.push(stream.game_name);
  }

  if (clip.duration_seconds) {
    parts.push(formatDuration(clip.duration_seconds));
  }

  return parts.filter(Boolean).join(" - ");
}

function formatClipStatus(status: DashboardClipRow["status"]): string {
  const labels: Record<DashboardClipRow["status"], string> = {
    draft: "Entwurf",
    failed: "Fehlgeschlagen",
    pending: "In Warteschlange",
    published: "Veroeffentlicht",
    queued: "In Warteschlange",
    ready: "Bereit",
    rendering: "Wird gerendert",
  };

  return labels[status];
}

function formatPlatformLabel(platform: StreamPlatform): string {
  return PLATFORM_LABELS[platform];
}

function isActiveJob(status: DashboardJobRow["status"]): boolean {
  return ACTIVE_JOB_STATUSES.has(status);
}

function isDoneJob(status: DashboardJobRow["status"]): boolean {
  return status === "done" || status === "completed";
}

function formatJobTypeLabel(jobType: DashboardJobRow["job_type"]): string {
  const labels: Record<DashboardJobRow["job_type"], string> = {
    clip_scoring: "Clip-Bewertung",
    repurposing: "Repurposing",
    title_generation: "Titelgenerierung",
    transcription: "Transkription",
  };

  return labels[jobType];
}

export function buildViewerTrend(
  snapshots: DashboardSnapshotRow[],
): ViewerPoint[] {
  const byDay = new Map<
    string,
    {
      date: Date;
      kick: number;
      tiktok: number;
      twitch: number;
      youtube: number;
    }
  >();

  for (const snapshot of [...snapshots].sort(
    (left, right) =>
      new Date(left.captured_at).getTime() -
      new Date(right.captured_at).getTime(),
  )) {
    const date = new Date(snapshot.captured_at);
    const dayKey = formatDayKey(date);
    const bucket =
      byDay.get(dayKey) ??
      ({
        date,
        kick: 0,
        tiktok: 0,
        twitch: 0,
        youtube: 0,
      } as const);

    const nextBucket = {
      ...bucket,
      date,
      [snapshot.platform]: snapshot.viewer_count,
    };

    byDay.set(dayKey, nextBucket);
  }

  return [...byDay.values()]
    .sort((left, right) => left.date.getTime() - right.date.getTime())
    .slice(-7)
    .map((item) => ({
      day: formatViewerTrendDay(item.date),
      kick: item.kick,
      tiktok: item.tiktok,
      twitch: item.twitch,
      youtube: item.youtube,
    }));
}

function getDemoSources({
  includeClips,
  includeJobs,
  includeSnapshots,
}: {
  includeClips: boolean;
  includeJobs: boolean;
  includeSnapshots: boolean;
}): DashboardSources {
  return {
    clips: includeClips ? DEMO_SOURCES.clips : [],
    jobs: includeJobs ? DEMO_SOURCES.jobs : [],
    snapshots: includeSnapshots ? DEMO_SOURCES.snapshots : [],
  };
}

function summarizeMetricsSnapshots(snapshots: DashboardSnapshotRow[]) {
  const byPlatform = new Map<StreamPlatform, DashboardSnapshotRow[]>();

  for (const snapshot of [...snapshots].sort(
    (left, right) =>
      new Date(right.captured_at).getTime() -
      new Date(left.captured_at).getTime(),
  )) {
    const entries = byPlatform.get(snapshot.platform) ?? [];
    entries.push(snapshot);
    byPlatform.set(snapshot.platform, entries);
  }

  const platformSummaries = [...byPlatform.entries()]
    .map(([platform, entries]) => {
      const latest = entries[0];
      if (!latest) {
        return null;
      }

      const previous = entries[1] ?? null;
      const viewerGrowthPercent = formatPercentChange(
        latest.viewer_count,
        previous?.viewer_count ?? 0,
      );
      const followerGrowthPercent = formatPercentChange(
        latest.follower_count,
        previous?.follower_count ?? 0,
      );
      const engagementRate = normalizeEngagementRate(latest.engagement_rate);
      const score = computePlatformScore({
        engagementRate,
        followerGrowthPercent,
        viewerGrowthPercent,
      });

      return {
        engagementRate,
        followerGrowthPercent,
        followerTotal: latest.follower_count,
        label: formatPlatformLabel(platform),
        platform,
        recommendation: buildRecommendation({
          followerGrowthPercent,
          label: formatPlatformLabel(platform),
          viewerGrowthPercent,
          engagementRate,
        }),
        score,
        viewerGrowthPercent,
        viewerTotal: latest.viewer_count,
      };
    })
    .filter((item): item is PlatformSummary => item !== null)
    .sort((left, right) => right.score - left.score);

  const latestViewerTotal = platformSummaries.reduce(
    (sum, platform) => sum + platform.viewerTotal,
    0,
  );
  const previousViewerTotal = [...byPlatform.values()].reduce(
    (sum, entries) => sum + (entries[1]?.viewer_count ?? 0),
    0,
  );
  const latestFollowerTotal = [...byPlatform.values()].reduce(
    (sum, entries) => sum + (entries[0]?.follower_count ?? 0),
    0,
  );
  const previousFollowerTotal = [...byPlatform.values()].reduce(
    (sum, entries) => sum + (entries[1]?.follower_count ?? 0),
    0,
  );

  const recentRevenueCents = snapshots
    .filter((snapshot) => isWithinDays(snapshot.captured_at, 15))
    .reduce((sum, snapshot) => sum + snapshot.revenue_cents, 0);
  const previousRevenueCents = snapshots
    .filter(
      (snapshot) =>
        !isWithinDays(snapshot.captured_at, 15) &&
        isWithinDays(snapshot.captured_at, 30),
    )
    .reduce((sum, snapshot) => sum + snapshot.revenue_cents, 0);

  const discoveryScore = platformSummaries.length
    ? Math.round(
        platformSummaries.reduce((sum, item) => sum + item.score, 0) /
          platformSummaries.length,
      )
    : 0;

  return {
    activePlatforms: platformSummaries.length,
    discoveryScore,
    latestFollowerTotal,
    latestViewerTotal,
    platformSummaries,
    monthlyRevenueCents: recentRevenueCents,
    previousFollowerTotal,
    previousRevenueCents,
    previousViewerTotal,
    recentRevenueCents,
    revenueComparisonLabel:
      previousRevenueCents > 0 || recentRevenueCents > 0
        ? `${formatPercentChange(recentRevenueCents, previousRevenueCents)} Umsatz`
        : null,
    viewerGrowthLabel: formatPercentChange(
      latestViewerTotal,
      previousViewerTotal,
    ),
    weeklyGrowthLabel: formatPercentChange(
      latestFollowerTotal,
      previousFollowerTotal,
    ),
  };
}

function buildRecommendation({
  followerGrowthPercent,
  label,
  viewerGrowthPercent,
  engagementRate,
}: {
  followerGrowthPercent: number;
  label: string;
  viewerGrowthPercent: number;
  engagementRate: number;
}): string {
  if (viewerGrowthPercent < -5) {
    return `${label}: Reichweite ist zuletzt um ${formatSignedNumber(viewerGrowthPercent)}% gefallen. Hook und Posting-Fenster schaerfen.`;
  }

  if (engagementRate < 20) {
    return `${label}: Engagement ist ausbaufaehig. Titel, Beschreibung und die ersten 3 Sekunden enger an den Outcome koppeln.`;
  }

  if (followerGrowthPercent < 2) {
    return `${label}: Gute Reichweite, aber wenig Follower-Wachstum. CTA und Kanal-Follow-Signal klarer setzen.`;
  }

  return `${label}: Momentum ist positiv. Erfolgreiche Themen sofort in Shorts und TikTok-Varianten wiederverwenden.`;
}

function buildSignalChips(
  metrics: ReturnType<typeof summarizeMetricsSnapshots>,
  jobSummary: ReturnType<typeof summarizeJobSignals>,
): string[] {
  const chips = metrics.platformSummaries.map(
    (platform) =>
      `${platform.label} - ${formatCompactNumber(platform.viewerTotal)} Live`,
  );

  if (jobSummary.activeJobs > 0) {
    chips.push(`${formatCompactNumber(jobSummary.activeJobs)} aktive Jobs`);
  }

  if (jobSummary.failedJobs > 0) {
    chips.push(`${formatCompactNumber(jobSummary.failedJobs)} fehlgeschlagen`);
  }

  if (jobSummary.leadingJobTypeLabel) {
    chips.push(
      `${jobSummary.leadingJobTypeLabel} - ${formatCompactNumber(jobSummary.leadingJobTypeCount)}`,
    );
  }

  return chips.slice(0, 6);
}

function buildTopSignals(
  metrics: ReturnType<typeof summarizeMetricsSnapshots>,
  jobSummary: ReturnType<typeof summarizeJobSignals>,
): DiscoverabilitySignalCard[] {
  const strongestPlatform = metrics.platformSummaries[0] ?? null;
  const weakestPlatform =
    metrics.platformSummaries[metrics.platformSummaries.length - 1] ?? null;

  return [
    strongestPlatform
      ? {
          detail: `${formatCompactNumber(strongestPlatform.viewerTotal)} Live - ${formatPercentage(strongestPlatform.engagementRate)} Engagement`,
          label: "Staerkste Plattform",
          tone: "emerald",
          value: strongestPlatform.label,
        }
      : {
          detail:
            "Sobald Snapshots vorliegen, priorisiert StreamOS die staerksten Kanaele.",
          label: "Signalbasis",
          tone: "violet",
          value: "Keine Snapshots",
        },
    jobSummary.totalJobs > 0
      ? {
          detail:
            jobSummary.failedJobs > 0
              ? `${jobSummary.failedJobs} fehlgeschlagen - ${jobSummary.leadingJobTypeLabel ?? "keine Jobtypen"}`
              : jobSummary.leadingJobTypeLabel
                ? `Top-Jobtyp: ${jobSummary.leadingJobTypeLabel}`
                : "Die Pipeline laeuft ohne Ausreisser.",
          label: "Pipeline",
          tone: jobSummary.failedJobs > 0 ? "amber" : "violet",
          value:
            jobSummary.activeJobs > 0
              ? `${formatCompactNumber(jobSummary.activeJobs)} aktiv`
              : `${formatCompactNumber(jobSummary.completedJobs)} fertig`,
        }
      : {
          detail:
            "Noch keine Content-Jobs vorhanden. Starte eine Analyse, um Signale zu erzeugen.",
          label: "Pipeline",
          tone: "violet",
          value: "0 Jobs",
        },
    weakestPlatform
      ? {
          detail: weakestPlatform.recommendation,
          label: "Prioritaet",
          tone: metrics.platformSummaries.length > 1 ? "rose" : "amber",
          value: weakestPlatform.label,
        }
      : {
          detail:
            "Verbinde Twitch, YouTube, TikTok oder Kick, um eine Priorisierung zu erhalten.",
          label: "Prioritaet",
          tone: "amber",
          value: "Plattform verbinden",
        },
  ];
}

function summarizeJobSignals(jobs: DashboardJobRow[]) {
  const countsByType = new Map<DashboardJobRow["job_type"], number>();

  for (const job of jobs) {
    countsByType.set(job.job_type, (countsByType.get(job.job_type) ?? 0) + 1);
  }

  const sortedTypes = [...countsByType.entries()].sort(
    (left, right) => right[1] - left[1],
  );
  const leadingJobType = sortedTypes[0] ?? null;

  return {
    activeJobs: jobs.filter((job) => isActiveJob(job.status)).length,
    completedJobs: jobs.filter((job) => isDoneJob(job.status)).length,
    failedJobs: jobs.filter((job) => job.status === "failed").length,
    leadingJobTypeCount: leadingJobType?.[1] ?? 0,
    leadingJobTypeLabel: leadingJobType
      ? formatJobTypeLabel(leadingJobType[0])
      : null,
    totalJobs: jobs.length,
  };
}

function computePlatformScore({
  engagementRate,
  followerGrowthPercent,
  viewerGrowthPercent,
}: {
  engagementRate: number;
  followerGrowthPercent: number;
  viewerGrowthPercent: number;
}): number {
  const engagementScore = clamp(engagementRate, 0, 100);
  const growthScore = clamp(50 + viewerGrowthPercent * 2, 0, 100);
  const followerScore = clamp(50 + followerGrowthPercent * 1.5, 0, 100);

  return clamp(
    Math.round(
      growthScore * 0.45 + followerScore * 0.25 + engagementScore * 0.3,
    ),
    0,
    100,
  );
}

function normalizeEngagementRate(value: number | null): number {
  if (value === null || !Number.isFinite(value)) {
    return 0;
  }

  if (value <= 1) {
    return clamp(value * 100, 0, 100);
  }

  return clamp(value, 0, 100);
}

function formatPercentChange(current: number, previous: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) {
    return 0;
  }

  if (previous <= 0) {
    return current > 0 ? 100 : 0;
  }

  return Math.round(((current - previous) / previous) * 100);
}

function formatSignedNumber(value: number): string {
  return `${value >= 0 ? "+" : ""}${Math.round(value)}`;
}

function formatPercentage(value: number): string {
  return `${Math.round(value)}%`;
}

function formatCompactNumber(value: number): string {
  const absolute = Math.abs(value);

  if (absolute >= 1_000_000) {
    return `${formatNumber(absolute / 1_000_000)}m`;
  }

  if (absolute >= 1_000) {
    return `${formatNumber(absolute / 1_000)}k`;
  }

  return formatNumber(absolute);
}

function formatCurrency(cents: number): string {
  const dollars = Math.abs(cents) / 100;

  if (dollars >= 1_000_000) {
    return `${cents < 0 ? "-" : ""}$${formatNumber(dollars / 1_000_000)}m`;
  }

  if (dollars >= 1_000) {
    return `${cents < 0 ? "-" : ""}$${formatNumber(dollars / 1_000)}k`;
  }

  return `${cents < 0 ? "-" : ""}$${formatNumber(dollars)}`;
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return [
      hours,
      minutes.toString().padStart(2, "0"),
      seconds.toString().padStart(2, "0"),
    ].join(":");
  }

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  }).format(new Date(value));
}

function formatDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatViewerTrendDay(date: Date): string {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

function formatNumber(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(1).replace(/\.0$/, "");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isWithinDays(value: string, days: number): boolean {
  const timestamp = new Date(value).getTime();
  const ageMs = Date.now() - timestamp;

  return ageMs >= 0 && ageMs <= days * 24 * 60 * 60 * 1_000;
}
