import "server-only";

import type { MonetizationEventType, StreamPlatform } from "@streamos/types";
import type { Tables } from "@streamos/database";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ensureCreatorForUser } from "@/lib/supabase/creator";
import { createClient } from "@/lib/supabase/server";
import { formatProvider } from "./formatters";
import type {
  MonetizationBreakdownItem,
  MonetizationDashboardData,
  MonetizationPeriod,
  MonetizationPlatformRevenue,
  MonetizationPlatformRanking,
  MonetizationSummarySnapshot,
  MonetizationTrendPoint,
  RecentMonetizationEvent,
} from "./types";

const PLATFORM_ORDER: StreamPlatform[] = [
  "twitch",
  "youtube",
  "tiktok",
  "kick",
];

const BREAKDOWN_GROUPS: Array<{
  id: MonetizationBreakdownItem["id"];
  label: string;
  eventTypes: MonetizationEventType[];
}> = [
  {
    eventTypes: ["subscription", "membership"],
    id: "subs",
    label: "Abos",
  },
  {
    eventTypes: ["tip", "donation", "bits"],
    id: "tips",
    label: "Trinkgelder",
  },
  {
    eventTypes: ["sponsorship", "affiliate"],
    id: "sponsorship",
    label: "Sponsoring",
  },
  {
    eventTypes: ["merch_sale"],
    id: "merch",
    label: "Merch",
  },
  {
    eventTypes: ["ad_revenue"],
    id: "ads",
    label: "Werbung",
  },
  {
    eventTypes: ["other"],
    id: "other",
    label: "Sonstiges",
  },
];

type MonetizationEventRow = Pick<
  Tables<"monetization_events">,
  | "amount_cents"
  | "currency"
  | "event_type"
  | "id"
  | "occurred_at"
  | "provider"
  | "source"
  | "status"
>;

type MonetizationSummaryRow = Pick<
  Tables<"monetization_summaries">,
  | "currency"
  | "event_count"
  | "gross_amount_cents"
  | "id"
  | "net_amount_cents"
  | "period"
  | "period_end"
  | "period_start"
  | "provider"
  | "updated_at"
  | "subscription_count"
  | "tip_count"
  | "donation_count"
  | "ad_revenue_count"
  | "sponsorship_count"
  | "merch_sale_count"
>;

type MonetizationEventQueryResult = {
  data: MonetizationEventRow[] | null;
  error: { message: string } | null;
};

type MonetizationSummaryQueryResult = {
  data: MonetizationSummaryRow[] | null;
  error: { message: string } | null;
};

type PeriodWindow = {
  since: Date | null;
  dayCount: number;
};

export function parseMonetizationPeriod(
  value: string | undefined,
): MonetizationPeriod {
  if (
    value === "last_7_days" ||
    value === "last_30_days" ||
    value === "all_time"
  ) {
    return value;
  }

  return "last_30_days";
}

export async function getMonetizationDashboardData(
  period: MonetizationPeriod,
): Promise<MonetizationDashboardData> {
  if (!isSupabaseConfigured()) {
    return getDemoMonetizationData(period);
  }

  const supabase = await createClient();
  const userResult = await supabase.auth.getUser();

  if (userResult.error || !userResult.data.user) {
    return getEmptyMonetizationData(period);
  }

  let creatorId: string | null = null;

  try {
    creatorId = (await ensureCreatorForUser(supabase, userResult.data.user)).id;
  } catch {
    creatorId = null;
  }

  const window = getPeriodWindow(period);
  const userId = userResult.data.user.id;

  let eventsQuery = supabase
    .from("monetization_events")
    .select(
      "amount_cents, currency, event_type, id, occurred_at, provider, source, status",
    )
    .eq("user_id", userId);

  if (creatorId) {
    eventsQuery = eventsQuery.eq("creator_id", creatorId);
  }

  if (window.since) {
    eventsQuery = eventsQuery.gte("occurred_at", window.since.toISOString());
  }

  let summariesQuery = supabase
    .from("monetization_summaries")
    .select(
      "ad_revenue_count, currency, donation_count, event_count, gross_amount_cents, id, merch_sale_count, net_amount_cents, period, period_end, period_start, provider, sponsorship_count, subscription_count, tip_count, updated_at",
    )
    .eq("user_id", userId);

  if (creatorId) {
    summariesQuery = summariesQuery.eq("creator_id", creatorId);
  }

  const [eventsResult, summariesResult] = await Promise.all([
    eventsQuery.order("occurred_at", { ascending: false }),
    summariesQuery.order("period_end", { ascending: false }).limit(12),
  ]);

  if (eventsResult.error && summariesResult.error) {
    return getEmptyMonetizationData(period);
  }

  return buildMonetizationDashboardData({
    events: ((eventsResult as MonetizationEventQueryResult).data ??
      []) as MonetizationEventRow[],
    period,
    summaries: ((summariesResult as MonetizationSummaryQueryResult).data ??
      []) as MonetizationSummaryRow[],
  });
}

export function buildMonetizationDashboardData({
  events,
  period,
  summaries,
}: {
  events: MonetizationEventRow[];
  period: MonetizationPeriod;
  summaries: MonetizationSummaryRow[];
}): MonetizationDashboardData {
  const filteredEvents = filterEventsByPeriod(events, period).sort(
    (left, right) =>
      new Date(right.occurred_at).getTime() -
      new Date(left.occurred_at).getTime(),
  );
  const confirmedEvents = filteredEvents.filter(
    (event) => event.status === "confirmed",
  );
  const currency = resolveCurrency(confirmedEvents, summaries);
  const recentEvents = normalizeRecentEvents(filteredEvents);
  const activePlatforms = resolveActivePlatforms(confirmedEvents, summaries);
  const platformRevenue =
    confirmedEvents.length > 0
      ? normalizePlatformRevenueFromEvents(confirmedEvents)
      : normalizePlatformRevenueFromSummaries(summaries);
  const breakdown =
    confirmedEvents.length > 0
      ? normalizeBreakdownFromEvents(confirmedEvents)
      : normalizeBreakdownFromSummaries(summaries);
  const trend = normalizeTrendFromEvents(confirmedEvents);
  const totalRevenueCents = confirmedEvents.reduce(
    (sum, event) => sum + event.amount_cents,
    0,
  );
  const dayCount =
    period === "all_time"
      ? Math.max(1, countDistinctDays(confirmedEvents))
      : getPeriodWindow(period).dayCount;

  return {
    activePlatforms,
    avgRevenuePerDayCents: Math.floor(totalRevenueCents / dayCount),
    breakdown,
    currency,
    latestSummary: buildLatestSummarySnapshot(summaries),
    period,
    platformRankings: buildPlatformRankingsFromSummaries(summaries),
    platformRevenue,
    recentEvents,
    totalRevenueCents,
    trend,
  };
}

function normalizePlatformRevenueFromEvents(
  events: MonetizationEventRow[],
): MonetizationPlatformRevenue[] {
  const byProvider = new Map<
    StreamPlatform,
    { amountCents: number; eventCount: number }
  >();

  for (const provider of PLATFORM_ORDER) {
    byProvider.set(provider, { amountCents: 0, eventCount: 0 });
  }

  for (const event of events) {
    const bucket = byProvider.get(event.provider);
    if (!bucket) {
      continue;
    }

    bucket.amountCents += event.amount_cents;
    bucket.eventCount += 1;
    byProvider.set(event.provider, bucket);
  }

  return PLATFORM_ORDER.map((provider) => {
    const bucket = byProvider.get(provider) ?? {
      amountCents: 0,
      eventCount: 0,
    };

    return {
      amountCents: bucket.amountCents,
      eventCount: bucket.eventCount,
      label: formatProvider(provider),
      provider,
    };
  });
}

function normalizePlatformRevenueFromSummaries(
  summaries: MonetizationSummaryRow[],
): MonetizationPlatformRevenue[] {
  const latestByProvider = getLatestSummaryByProvider(summaries);

  return PLATFORM_ORDER.map((provider) => {
    const summary = latestByProvider.get(provider);

    return {
      amountCents: summary?.gross_amount_cents ?? 0,
      eventCount: summary?.event_count ?? 0,
      label: formatProvider(provider),
      provider,
    };
  });
}

function normalizeBreakdownFromEvents(
  events: MonetizationEventRow[],
): MonetizationBreakdownItem[] {
  const byType = new Map<
    MonetizationEventType,
    { amountCents: number; eventCount: number }
  >();

  for (const event of events) {
    const bucket = byType.get(event.event_type) ?? {
      amountCents: 0,
      eventCount: 0,
    };
    bucket.amountCents += event.amount_cents;
    bucket.eventCount += 1;
    byType.set(event.event_type, bucket);
  }

  return BREAKDOWN_GROUPS.map((group) =>
    group.eventTypes.reduce<MonetizationBreakdownItem>(
      (aggregate, eventType) => {
        const bucket = byType.get(eventType);

        return {
          ...aggregate,
          amountCents: aggregate.amountCents + (bucket?.amountCents ?? 0),
          eventCount: aggregate.eventCount + (bucket?.eventCount ?? 0),
        };
      },
      {
        amountCents: 0,
        eventCount: 0,
        id: group.id,
        label: group.label,
      },
    ),
  );
}

function normalizeBreakdownFromSummaries(
  summaries: MonetizationSummaryRow[],
): MonetizationBreakdownItem[] {
  const latestByProvider = getLatestSummaryByProvider(summaries);
  const buckets = new Map<
    MonetizationBreakdownItem["id"],
    { amountCents: number; eventCount: number }
  >(
    BREAKDOWN_GROUPS.map((group) => [
      group.id,
      { amountCents: 0, eventCount: 0 },
    ]),
  );

  for (const summary of latestByProvider.values()) {
    const knownCounts = {
      ads: summary.ad_revenue_count,
      merch: summary.merch_sale_count,
      sponsorship: summary.sponsorship_count,
      subs: summary.subscription_count,
      tips: summary.tip_count + summary.donation_count,
    };

    const totalKnownCount = Object.values(knownCounts).reduce(
      (sum, value) => sum + value,
      0,
    );

    if (totalKnownCount === 0) {
      const otherBucket = buckets.get("other") ?? {
        amountCents: 0,
        eventCount: 0,
      };
      otherBucket.amountCents += summary.gross_amount_cents;
      buckets.set("other", otherBucket);
      continue;
    }

    const allocatedAmounts = new Map<MonetizationBreakdownItem["id"], number>();
    let allocatedTotal = 0;

    for (const [id, count] of Object.entries(knownCounts) as Array<
      [Exclude<MonetizationBreakdownItem["id"], "other">, number]
    >) {
      const amountCents = Math.floor(
        (summary.gross_amount_cents * count) / totalKnownCount,
      );

      allocatedAmounts.set(id, amountCents);
      allocatedTotal += amountCents;
    }

    const remainder = summary.gross_amount_cents - allocatedTotal;
    const orderedAllocations: Array<{
      id: MonetizationBreakdownItem["id"];
      amountCents: number;
      eventCount: number;
    }> = [
      {
        amountCents: allocatedAmounts.get("subs") ?? 0,
        eventCount: knownCounts.subs,
        id: "subs",
      },
      {
        amountCents: allocatedAmounts.get("tips") ?? 0,
        eventCount: knownCounts.tips,
        id: "tips",
      },
      {
        amountCents: allocatedAmounts.get("sponsorship") ?? 0,
        eventCount: knownCounts.sponsorship,
        id: "sponsorship",
      },
      {
        amountCents: allocatedAmounts.get("merch") ?? 0,
        eventCount: knownCounts.merch,
        id: "merch",
      },
      {
        amountCents: allocatedAmounts.get("ads") ?? 0,
        eventCount: knownCounts.ads,
        id: "ads",
      },
    ];

    for (const allocation of orderedAllocations) {
      const bucket = buckets.get(allocation.id) ?? {
        amountCents: 0,
        eventCount: 0,
      };

      bucket.amountCents += allocation.amountCents;
      bucket.eventCount += allocation.eventCount;
      buckets.set(allocation.id, bucket);
    }

    const otherBucket = buckets.get("other") ?? {
      amountCents: 0,
      eventCount: 0,
    };
    otherBucket.amountCents += remainder;
    buckets.set("other", otherBucket);
  }

  return BREAKDOWN_GROUPS.map((group) => {
    const bucket = buckets.get(group.id) ?? { amountCents: 0, eventCount: 0 };

    return {
      amountCents: bucket.amountCents,
      eventCount: bucket.eventCount,
      id: group.id,
      label: group.label,
    };
  });
}

function buildLatestSummarySnapshot(
  summaries: MonetizationSummaryRow[],
): MonetizationSummarySnapshot | null {
  const latest = [...summaries].sort(
    (left, right) =>
      new Date(right.period_end).getTime() -
        new Date(left.period_end).getTime() ||
      new Date(right.updated_at).getTime() -
        new Date(left.updated_at).getTime(),
  )[0];

  if (!latest) {
    return null;
  }

  return {
    currency: latest.currency,
    eventCount: latest.event_count,
    grossAmountCents: latest.gross_amount_cents,
    netAmountCents: latest.net_amount_cents,
    periodLabel: formatSummaryPeriodLabel(latest.period),
    providerLabel: formatProvider(latest.provider),
    updatedAt: latest.updated_at,
    windowLabel: `${formatSummaryDate(latest.period_start)} - ${formatSummaryDate(latest.period_end)}`,
  };
}

function buildPlatformRankingsFromSummaries(
  summaries: MonetizationSummaryRow[],
): MonetizationPlatformRanking[] {
  return [...getLatestSummaryByProvider(summaries).values()]
    .sort(
      (left, right) =>
        right.gross_amount_cents - left.gross_amount_cents ||
        left.provider.localeCompare(right.provider),
    )
    .map((summary, index) => ({
      currency: summary.currency,
      eventCount: summary.event_count,
      grossAmountCents: summary.gross_amount_cents,
      provider: summary.provider,
      providerLabel: formatProvider(summary.provider),
      rank: index + 1,
      windowLabel: `${formatSummaryDate(summary.period_start)} - ${formatSummaryDate(summary.period_end)}`,
    }));
}

function normalizeRecentEvents(
  events: MonetizationEventRow[],
): RecentMonetizationEvent[] {
  return events.slice(0, 12).map((event) => ({
    amountCents: event.amount_cents,
    currency: event.currency,
    eventType: event.event_type,
    id: event.id,
    occurredAt: event.occurred_at,
    provider: event.provider,
    source: event.source,
    status: event.status,
  }));
}

function normalizeTrendFromEvents(
  events: MonetizationEventRow[],
): MonetizationTrendPoint[] {
  const byDay = new Map<string, number>();

  for (const event of events) {
    const day = event.occurred_at.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + event.amount_cents);
  }

  return [...byDay.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([day, amountCents]) => ({
      amountCents,
      day,
      label: new Intl.DateTimeFormat("de-DE", {
        day: "2-digit",
        month: "short",
      }).format(new Date(day)),
    }));
}

function resolveCurrency(
  confirmedEvents: MonetizationEventRow[],
  summaries: MonetizationSummaryRow[],
): string {
  const currencyFromEvents = pickPrimaryCurrency(confirmedEvents);
  if (currencyFromEvents) {
    return currencyFromEvents;
  }

  const latestSummary = buildLatestSummarySnapshot(summaries);
  return latestSummary?.currency ?? "USD";
}

function pickPrimaryCurrency(events: MonetizationEventRow[]): string | null {
  if (events.length === 0) {
    return null;
  }

  const byCurrency = new Map<string, number>();
  for (const event of events) {
    byCurrency.set(
      event.currency,
      (byCurrency.get(event.currency) ?? 0) + event.amount_cents,
    );
  }

  return (
    [...byCurrency.entries()].sort(
      (left, right) => right[1] - left[1],
    )[0]?.[0] ?? null
  );
}

function resolveActivePlatforms(
  confirmedEvents: MonetizationEventRow[],
  summaries: MonetizationSummaryRow[],
): number {
  if (confirmedEvents.length > 0) {
    return new Set(
      confirmedEvents
        .filter((event) => event.amount_cents > 0)
        .map((event) => event.provider),
    ).size;
  }

  return getLatestSummaryByProvider(summaries).size;
}

function getLatestSummaryByProvider(
  summaries: MonetizationSummaryRow[],
): Map<StreamPlatform, MonetizationSummaryRow> {
  const sorted = [...summaries].sort(
    (left, right) =>
      new Date(right.period_end).getTime() -
        new Date(left.period_end).getTime() ||
      new Date(right.updated_at).getTime() -
        new Date(left.updated_at).getTime(),
  );
  const byProvider = new Map<StreamPlatform, MonetizationSummaryRow>();

  for (const summary of sorted) {
    if (!byProvider.has(summary.provider)) {
      byProvider.set(summary.provider, summary);
    }
  }

  return byProvider;
}

function filterEventsByPeriod(
  events: MonetizationEventRow[],
  period: MonetizationPeriod,
): MonetizationEventRow[] {
  const window = getPeriodWindow(period);

  if (!window.since) {
    return [...events];
  }

  const sinceTime = window.since.getTime();

  return events.filter(
    (event) => new Date(event.occurred_at).getTime() >= sinceTime,
  );
}

function getPeriodWindow(period: MonetizationPeriod): PeriodWindow {
  if (period === "last_7_days") {
    return {
      dayCount: 7,
      since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000),
    };
  }

  if (period === "last_30_days") {
    return {
      dayCount: 30,
      since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000),
    };
  }

  return {
    dayCount: 1,
    since: null,
  };
}

function countDistinctDays(events: MonetizationEventRow[]): number {
  return new Set(events.map((event) => event.occurred_at.slice(0, 10))).size;
}

function formatSummaryPeriodLabel(
  period: MonetizationSummaryRow["period"],
): string {
  return period === "weekly" ? "Wochenabschluss" : "Tagesabschluss";
}

function formatSummaryDate(value: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(value));
}

function getEmptyMonetizationData(
  period: MonetizationPeriod,
): MonetizationDashboardData {
  return {
    activePlatforms: 0,
    avgRevenuePerDayCents: 0,
    breakdown: normalizeBreakdownFromEvents([]),
    currency: "USD",
    latestSummary: null,
    period,
    platformRankings: [],
    platformRevenue: normalizePlatformRevenueFromEvents([]),
    recentEvents: [],
    totalRevenueCents: 0,
    trend: [],
  };
}

function getDemoMonetizationData(
  period: MonetizationPeriod,
): MonetizationDashboardData {
  const recentEvents: RecentMonetizationEvent[] = [
    {
      amountCents: 2499,
      currency: "USD",
      eventType: "subscription",
      id: "demo-subscription",
      occurredAt: "2026-06-05T18:24:00.000Z",
      provider: "twitch",
      source: "live_stream",
      status: "confirmed",
    },
    {
      amountCents: 12000,
      currency: "USD",
      eventType: "sponsorship",
      id: "demo-sponsorship",
      occurredAt: "2026-06-04T14:10:00.000Z",
      provider: "youtube",
      source: "sponsorship_campaign",
      status: "confirmed",
    },
    {
      amountCents: 5499,
      currency: "USD",
      eventType: "merch_sale",
      id: "demo-merch-sale",
      occurredAt: "2026-06-03T20:42:00.000Z",
      provider: "tiktok",
      source: "merch_sku",
      status: "pending",
    },
  ];

  const summaries: MonetizationSummaryRow[] = [
    {
      ad_revenue_count: 7,
      currency: "USD",
      donation_count: 6,
      event_count: 154,
      gross_amount_cents: 569400,
      id: "demo-summary-1",
      merch_sale_count: 18,
      net_amount_cents: 536000,
      period: "weekly",
      period_end: "2026-06-05",
      period_start: "2026-05-30",
      provider: "twitch",
      sponsorship_count: 3,
      subscription_count: 128,
      tip_count: 41,
      updated_at: "2026-06-05T18:30:00.000Z",
    },
  ];

  return {
    activePlatforms: 3,
    avgRevenuePerDayCents: period === "last_7_days" ? 18100 : 11200,
    breakdown: normalizeBreakdownFromEvents([
      {
        amount_cents: 182400,
        currency: "USD",
        event_type: "subscription",
        id: "demo-event-1",
        occurred_at: "2026-06-05T18:24:00.000Z",
        provider: "twitch",
        source: "live_stream",
        status: "confirmed",
      },
      {
        amount_cents: 82600,
        currency: "USD",
        event_type: "tip",
        id: "demo-event-2",
        occurred_at: "2026-06-04T14:10:00.000Z",
        provider: "youtube",
        source: "stream_chat",
        status: "confirmed",
      },
    ]),
    currency: "USD",
    latestSummary: buildLatestSummarySnapshot(summaries),
    period,
    platformRankings: buildPlatformRankingsFromSummaries(summaries),
    platformRevenue: normalizePlatformRevenueFromEvents([
      {
        amount_cents: 224300,
        currency: "USD",
        event_type: "subscription",
        id: "demo-event-3",
        occurred_at: "2026-06-05T18:24:00.000Z",
        provider: "twitch",
        source: "live_stream",
        status: "confirmed",
      },
      {
        amount_cents: 210000,
        currency: "USD",
        event_type: "sponsorship",
        id: "demo-event-4",
        occurred_at: "2026-06-04T14:10:00.000Z",
        provider: "youtube",
        source: "sponsorship_campaign",
        status: "confirmed",
      },
      {
        amount_cents: 68400,
        currency: "USD",
        event_type: "merch_sale",
        id: "demo-event-5",
        occurred_at: "2026-06-03T20:42:00.000Z",
        provider: "tiktok",
        source: "merch_sku",
        status: "confirmed",
      },
    ]),
    recentEvents,
    totalRevenueCents: 569400,
    trend: [
      { amountCents: 48200, day: "2026-05-30", label: "30. Mai" },
      { amountCents: 61100, day: "2026-05-31", label: "31. Mai" },
      { amountCents: 74400, day: "2026-06-01", label: "01. Juni" },
      { amountCents: 52800, day: "2026-06-02", label: "02. Juni" },
      { amountCents: 89400, day: "2026-06-03", label: "03. Juni" },
      { amountCents: 140200, day: "2026-06-04", label: "04. Juni" },
      { amountCents: 105300, day: "2026-06-05", label: "05. Juni" },
    ],
  };
}
