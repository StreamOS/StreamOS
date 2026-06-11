import type {
  MonetizationEventStatus,
  MonetizationEventType,
  StreamPlatform,
} from "@streamos/types";

export const MONETIZATION_PERIODS = [
  {
    id: "last_7_days",
    label: "7 Tage",
  },
  {
    id: "last_30_days",
    label: "30 Tage",
  },
  {
    id: "all_time",
    label: "Gesamt",
  },
] as const;

export type MonetizationPeriod = (typeof MONETIZATION_PERIODS)[number]["id"];

export type MonetizationPlatformRevenue = {
  amountCents: number;
  eventCount: number;
  label: string;
  provider: StreamPlatform;
};

export type MonetizationBreakdownItem = {
  amountCents: number;
  eventCount: number;
  id: "subs" | "tips" | "sponsorship" | "merch" | "ads" | "other";
  label: string;
};

export type MonetizationTrendPoint = {
  amountCents: number;
  day: string;
  label: string;
};

export type RecentMonetizationEvent = {
  amountCents: number;
  currency: string;
  eventType: MonetizationEventType;
  id: string;
  occurredAt: string;
  provider: StreamPlatform;
  source: string;
  status: MonetizationEventStatus;
};

export type MonetizationSummarySnapshot = {
  currency: string;
  eventCount: number;
  grossAmountCents: number;
  netAmountCents: number;
  periodLabel: string;
  providerLabel: string;
  updatedAt: string;
  windowLabel: string;
};

export type MonetizationPlatformRanking = {
  currency: string;
  eventCount: number;
  grossAmountCents: number;
  provider: StreamPlatform;
  providerLabel: string;
  rank: number;
  windowLabel: string;
};

export type MonetizationDashboardData = {
  activePlatforms: number;
  avgRevenuePerDayCents: number;
  breakdown: MonetizationBreakdownItem[];
  currency: string;
  latestSummary: MonetizationSummarySnapshot | null;
  period: MonetizationPeriod;
  platformRankings: MonetizationPlatformRanking[];
  platformRevenue: MonetizationPlatformRevenue[];
  recentEvents: RecentMonetizationEvent[];
  totalRevenueCents: number;
  trend: MonetizationTrendPoint[];
};
