import {
  MONETIZATION_DASHBOARD_EVENT_LIMIT,
  MONETIZATION_DASHBOARD_PERIODS,
  type MonetizationDashboardLookupIssue,
  type MonetizationDashboardPeriod,
  type MonetizationSummaryPeriod,
} from "@streamos/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import {
  buildMonetizationDashboardModel,
  createEmptyMonetizationDashboardModel,
  type MonetizationAggregateSnapshot,
  type MonetizationAggregateSourceRow,
  type MonetizationAggregateTrendRow,
  type MonetizationDashboardModel,
  type MonetizationEventRow,
  type MonetizationSummaryRow,
} from "@/components/modules/MonetizationDashboardConsole.utils";

type RpcEventTypeRevenue = {
  amount_cents?: unknown;
  event_count?: unknown;
  event_type?: unknown;
};

type RpcTrendPoint = {
  amount_cents?: unknown;
  day?: unknown;
};

type RpcMonetizationDashboard = {
  active_platforms?: unknown;
  avg_revenue_per_day_cents?: unknown;
  currency?: unknown;
  revenue_by_event_type?: unknown;
  revenue_over_time?: unknown;
  total_revenue_cents?: unknown;
};

type MonetizationRpcClient = {
  rpc(
    fn: "get_monetization_dashboard",
    args: { p_period: MonetizationDashboardPeriod },
  ): Promise<{
    data: unknown;
    error: unknown;
  }>;
};

type EventResult = {
  count: number | null;
  data: MonetizationEventRow[] | null;
  error: unknown;
};

type SummaryResult = {
  data: MonetizationSummaryRow[] | null;
  error: unknown;
};

export function parseMonetizationDashboardPeriod(
  value: string | undefined,
): MonetizationDashboardPeriod {
  return MONETIZATION_DASHBOARD_PERIODS.includes(
    value as MonetizationDashboardPeriod,
  )
    ? (value as MonetizationDashboardPeriod)
    : "last_30_days";
}

export async function getMonetizationDashboardData(
  period: MonetizationDashboardPeriod,
): Promise<MonetizationDashboardModel> {
  if (!isSupabaseConfigured()) {
    return createEmptyMonetizationDashboardModel(period, null, "disabled");
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return createEmptyMonetizationDashboardModel(
      period,
      null,
      userError ? "auth-failed" : "unauthorized",
    );
  }

  const since = getSinceIso(period);
  const summaryPeriod: MonetizationSummaryPeriod =
    period === "all_time" ? "weekly" : "daily";
  const rpcClient = supabase as unknown as MonetizationRpcClient;

  const [aggregateResult, eventsResult, summariesResult] = await Promise.all([
    rpcClient.rpc("get_monetization_dashboard", {
      p_period: period,
    }),
    loadRecentEvents(supabase, userData.user.id, since),
    loadSummaries(supabase, userData.user.id, summaryPeriod, since),
  ]);

  const aggregate = sanitizeAggregate(aggregateResult);
  const events = sanitizePrimaryRows(eventsResult, "events");
  const summaries = sanitizePrimaryRows(summariesResult, "summaries");

  if (
    aggregate.issue &&
    events.issue &&
    summaries.issue &&
    events.rows.length === 0 &&
    summaries.rows.length === 0
  ) {
    return createEmptyMonetizationDashboardModel(
      period,
      userData.user.id,
      "load-failed",
      [aggregate.issue, events.issue, summaries.issue],
    );
  }

  const visibleEvents = events.rows.slice(
    0,
    MONETIZATION_DASHBOARD_EVENT_LIMIT,
  );
  const lookupIssues: MonetizationDashboardLookupIssue[] = [
    aggregate.issue,
    events.issue,
    summaries.issue,
  ].filter(
    (issue): issue is MonetizationDashboardLookupIssue => issue !== null,
  );

  if (
    visibleEvents.length === 0 &&
    summaries.rows.length === 0 &&
    aggregate.snapshot.revenueBySource.length === 0 &&
    aggregate.snapshot.trend.length === 0 &&
    aggregate.snapshot.totalRevenueCents === null
  ) {
    return createEmptyMonetizationDashboardModel(
      period,
      userData.user.id,
      "ready",
      lookupIssues,
    );
  }

  return buildMonetizationDashboardModel({
    aggregate: aggregate.snapshot,
    events: visibleEvents,
    feed: {
      hasMore:
        events.rows.length > MONETIZATION_DASHBOARD_EVENT_LIMIT ||
        (events.totalCount ?? 0) > MONETIZATION_DASHBOARD_EVENT_LIMIT,
      limit: MONETIZATION_DASHBOARD_EVENT_LIMIT,
      returnedCount: visibleEvents.length,
      totalCount: events.totalCount ?? undefined,
    },
    lookupIssues,
    period,
    state: "ready",
    summaries: summaries.rows,
    userId: userData.user.id,
  });
}

async function loadRecentEvents(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  since: string | null,
): Promise<EventResult> {
  let query = supabase
    .from("monetization_events")
    .select(
      "amount_cents,currency,event_type,id,occurred_at,provider,source,status",
      { count: "exact" },
    )
    .eq("user_id", userId)
    .order("occurred_at", { ascending: false });

  if (since) {
    query = query.gte("occurred_at", since);
  }

  return (await query.limit(
    MONETIZATION_DASHBOARD_EVENT_LIMIT + 1,
  )) as EventResult;
}

async function loadSummaries(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  period: MonetizationSummaryPeriod,
  since: string | null,
): Promise<SummaryResult> {
  let query = supabase
    .from("monetization_summaries")
    .select(
      "channel_id,currency,event_count,gross_amount_cents,merch_sale_count,net_amount_cents,period,period_end,period_start,provider,subscription_count,tip_count,donation_count,ad_revenue_count,sponsorship_count",
    )
    .eq("user_id", userId)
    .eq("period", period)
    .order("period_start", { ascending: true });

  if (since) {
    query = query.gte("period_start", since);
  }

  return (await query) as SummaryResult;
}

function sanitizeAggregate(result: { data: unknown; error: unknown }): {
  issue: MonetizationDashboardLookupIssue | null;
  snapshot: MonetizationAggregateSnapshot;
} {
  if (result.error || !isAggregatePayload(result.data)) {
    return {
      issue: {
        code: "load-failed",
        source: "aggregates",
      },
      snapshot: createEmptyAggregateSnapshot(),
    };
  }

  return {
    issue: null,
    snapshot: normalizeAggregatePayload(result.data),
  };
}

function sanitizePrimaryRows<T>(
  result: {
    data: T[] | null;
    error: unknown;
    count?: number | null;
  },
  source: MonetizationDashboardLookupIssue["source"],
): {
  issue: MonetizationDashboardLookupIssue | null;
  rows: T[];
  totalCount: number | null;
} {
  if (result.error || !result.data) {
    return {
      issue: {
        code: "load-failed",
        source,
      },
      rows: [],
      totalCount: null,
    };
  }

  return {
    issue: null,
    rows: result.data,
    totalCount: result.count ?? null,
  };
}

function normalizeAggregatePayload(
  payload: RpcMonetizationDashboard,
): MonetizationAggregateSnapshot {
  return {
    activePlatforms: asNumberOrNull(payload.active_platforms),
    averageRevenuePerDayCents: asNumberOrNull(
      payload.avg_revenue_per_day_cents,
    ),
    currency: asCurrencyOrNull(payload.currency),
    revenueBySource: asArray<RpcEventTypeRevenue>(payload.revenue_by_event_type)
      .map<MonetizationAggregateSourceRow | null>((item) => {
        const key = asString(item.event_type);

        if (!key) {
          return null;
        }

        return {
          amountCents: asNumberOrNull(item.amount_cents),
          eventCount: asNumberOrNull(item.event_count),
          key,
        };
      })
      .filter((item): item is MonetizationAggregateSourceRow => item !== null),
    totalRevenueCents: asNumberOrNull(payload.total_revenue_cents),
    trend: asArray<RpcTrendPoint>(payload.revenue_over_time)
      .map<MonetizationAggregateTrendRow | null>((item) => {
        const periodStart = asString(item.day);

        if (!periodStart) {
          return null;
        }

        return {
          amountCents: asNumberOrNull(item.amount_cents),
          label: formatTrendLabel(periodStart),
          periodEnd: null,
          periodStart,
          source: "events",
        };
      })
      .filter((item): item is MonetizationAggregateTrendRow => item !== null),
  };
}

function createEmptyAggregateSnapshot(): MonetizationAggregateSnapshot {
  return {
    activePlatforms: null,
    averageRevenuePerDayCents: null,
    currency: null,
    revenueBySource: [],
    totalRevenueCents: null,
    trend: [],
  };
}

function getSinceIso(period: MonetizationDashboardPeriod): string | null {
  const now = new Date();

  if (period === "last_7_days") {
    now.setUTCDate(now.getUTCDate() - 7);
    return now.toISOString();
  }

  if (period === "last_30_days") {
    now.setUTCDate(now.getUTCDate() - 30);
    return now.toISOString();
  }

  return null;
}

function isAggregatePayload(value: unknown): value is RpcMonetizationDashboard {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asCurrencyOrNull(value: unknown): string | null {
  const currency = asString(value);

  return currency && /^[A-Z]{3}$/.test(currency) ? currency : null;
}

function asNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function formatTrendLabel(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "short",
    timeZone: "Europe/Berlin",
  }).format(date);
}
