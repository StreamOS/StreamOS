import type {
  MonetizationEventStatus,
  MonetizationEventType,
  StreamPlatform,
} from "@streamos/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { formatProvider } from "./formatters";
import type {
  MonetizationBreakdownItem,
  MonetizationDashboardData,
  MonetizationPeriod,
  MonetizationPlatformRevenue,
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
    label: "Subs",
  },
  {
    eventTypes: ["tip", "donation", "bits"],
    id: "tips",
    label: "Tips",
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
    label: "Ads",
  },
  {
    eventTypes: ["other"],
    id: "other",
    label: "Other",
  },
];

type RpcPlatformRevenue = {
  amount_cents?: unknown;
  event_count?: unknown;
  provider?: unknown;
};

type RpcEventTypeRevenue = {
  amount_cents?: unknown;
  event_count?: unknown;
  event_type?: unknown;
};

type RpcTrendPoint = {
  amount_cents?: unknown;
  day?: unknown;
};

type RpcRecentEvent = {
  amount_cents?: unknown;
  currency?: unknown;
  event_type?: unknown;
  id?: unknown;
  occurred_at?: unknown;
  provider?: unknown;
  source?: unknown;
  status?: unknown;
};

type RpcMonetizationDashboard = {
  active_platforms?: unknown;
  avg_revenue_per_day_cents?: unknown;
  currency?: unknown;
  period?: unknown;
  recent_events?: unknown;
  revenue_by_event_type?: unknown;
  revenue_by_platform?: unknown;
  revenue_over_time?: unknown;
  total_revenue_cents?: unknown;
};

type MonetizationRpcClient = {
  rpc(
    fn: "get_monetization_dashboard",
    args: { p_period: MonetizationPeriod },
  ): Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
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

  const rpcClient = supabase as unknown as MonetizationRpcClient;
  const dashboardResult = await rpcClient.rpc("get_monetization_dashboard", {
    p_period: period,
  });

  if (dashboardResult.error || !isDashboardPayload(dashboardResult.data)) {
    return getEmptyMonetizationData(period);
  }

  return normalizeDashboardPayload(dashboardResult.data, period);
}

function normalizeDashboardPayload(
  payload: RpcMonetizationDashboard,
  requestedPeriod: MonetizationPeriod,
): MonetizationDashboardData {
  const period = parseMonetizationPeriod(asString(payload.period));
  const currency = asCurrency(payload.currency);
  const platformRevenue = normalizePlatformRevenue(
    asArray<RpcPlatformRevenue>(payload.revenue_by_platform),
  );
  const eventTypeRevenue = asArray<RpcEventTypeRevenue>(
    payload.revenue_by_event_type,
  );

  return {
    activePlatforms: asNumber(payload.active_platforms),
    avgRevenuePerDayCents: asNumber(payload.avg_revenue_per_day_cents),
    breakdown: normalizeBreakdown(eventTypeRevenue),
    currency,
    period: period ?? requestedPeriod,
    platformRevenue,
    recentEvents: normalizeRecentEvents(
      asArray<RpcRecentEvent>(payload.recent_events),
    ),
    totalRevenueCents: asNumber(payload.total_revenue_cents),
    trend: normalizeTrend(asArray<RpcTrendPoint>(payload.revenue_over_time)),
  };
}

function normalizePlatformRevenue(
  items: RpcPlatformRevenue[],
): MonetizationPlatformRevenue[] {
  const byProvider = new Map<StreamPlatform, MonetizationPlatformRevenue>();

  for (const provider of PLATFORM_ORDER) {
    byProvider.set(provider, {
      amountCents: 0,
      eventCount: 0,
      label: formatProvider(provider),
      provider,
    });
  }

  for (const item of items) {
    const provider = parseProvider(item.provider);

    if (!provider) {
      continue;
    }

    byProvider.set(provider, {
      amountCents: asNumber(item.amount_cents),
      eventCount: asNumber(item.event_count),
      label: formatProvider(provider),
      provider,
    });
  }

  return PLATFORM_ORDER.map((provider) => byProvider.get(provider)).filter(
    (item): item is MonetizationPlatformRevenue => Boolean(item),
  );
}

function normalizeBreakdown(
  items: RpcEventTypeRevenue[],
): MonetizationBreakdownItem[] {
  const byType = new Map<MonetizationEventType, RpcEventTypeRevenue>();

  for (const item of items) {
    const eventType = parseEventType(item.event_type);

    if (eventType) {
      byType.set(eventType, item);
    }
  }

  return BREAKDOWN_GROUPS.map((group) =>
    group.eventTypes.reduce<MonetizationBreakdownItem>(
      (aggregate, eventType) => {
        const item = byType.get(eventType);

        return {
          ...aggregate,
          amountCents: aggregate.amountCents + asNumber(item?.amount_cents),
          eventCount: aggregate.eventCount + asNumber(item?.event_count),
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

function normalizeTrend(items: RpcTrendPoint[]): MonetizationTrendPoint[] {
  return items
    .map((item) => {
      const day = asString(item.day);

      if (!day) {
        return null;
      }

      return {
        amountCents: asNumber(item.amount_cents),
        day,
        label: new Intl.DateTimeFormat("de-DE", {
          day: "2-digit",
          month: "short",
        }).format(new Date(day)),
      };
    })
    .filter((item): item is MonetizationTrendPoint => Boolean(item));
}

function normalizeRecentEvents(
  items: RpcRecentEvent[],
): RecentMonetizationEvent[] {
  return items
    .map((item) => {
      const eventType = parseEventType(item.event_type);
      const id = asString(item.id);
      const occurredAt = asString(item.occurred_at);
      const provider = parseProvider(item.provider);
      const status = parseStatus(item.status);

      if (!eventType || !id || !occurredAt || !provider || !status) {
        return null;
      }

      return {
        amountCents: asNumber(item.amount_cents),
        currency: asCurrency(item.currency),
        eventType,
        id,
        occurredAt,
        provider,
        source: asString(item.source) ?? "unknown",
        status,
      };
    })
    .filter((item): item is RecentMonetizationEvent => Boolean(item));
}

function getEmptyMonetizationData(
  period: MonetizationPeriod,
): MonetizationDashboardData {
  return {
    activePlatforms: 0,
    avgRevenuePerDayCents: 0,
    breakdown: normalizeBreakdown([]),
    currency: "USD",
    period,
    platformRevenue: normalizePlatformRevenue([]),
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

  const eventTypeRevenue: RpcEventTypeRevenue[] = [
    { amount_cents: 182400, event_count: 128, event_type: "subscription" },
    { amount_cents: 82600, event_count: 41, event_type: "tip" },
    { amount_cents: 210000, event_count: 3, event_type: "sponsorship" },
    { amount_cents: 68400, event_count: 18, event_type: "merch_sale" },
    { amount_cents: 39200, event_count: 7, event_type: "ad_revenue" },
  ];

  return {
    activePlatforms: 3,
    avgRevenuePerDayCents: period === "last_7_days" ? 18100 : 11200,
    breakdown: normalizeBreakdown(eventTypeRevenue),
    currency: "USD",
    period,
    platformRevenue: normalizePlatformRevenue([
      { amount_cents: 224300, event_count: 126, provider: "twitch" },
      { amount_cents: 210000, event_count: 3, provider: "youtube" },
      { amount_cents: 68400, event_count: 18, provider: "tiktok" },
      { amount_cents: 0, event_count: 0, provider: "kick" },
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

function isDashboardPayload(value: unknown): value is RpcMonetizationDashboard {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asCurrency(value: unknown): string {
  const currency = asString(value);

  return currency && /^[A-Z]{3}$/.test(currency) ? currency : "USD";
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function parseProvider(value: unknown): StreamPlatform | undefined {
  if (
    value === "twitch" ||
    value === "youtube" ||
    value === "tiktok" ||
    value === "kick"
  ) {
    return value;
  }

  return undefined;
}

function parseEventType(value: unknown): MonetizationEventType | undefined {
  if (
    value === "subscription" ||
    value === "membership" ||
    value === "tip" ||
    value === "donation" ||
    value === "bits" ||
    value === "ad_revenue" ||
    value === "merch_sale" ||
    value === "sponsorship" ||
    value === "affiliate" ||
    value === "other"
  ) {
    return value;
  }

  return undefined;
}

function parseStatus(value: unknown): MonetizationEventStatus | undefined {
  if (
    value === "pending" ||
    value === "confirmed" ||
    value === "void" ||
    value === "disputed" ||
    value === "refunded" ||
    value === "failed"
  ) {
    return value;
  }

  return undefined;
}
