import type {
  MonetizationEventStatus,
  MonetizationEventType,
  StreamPlatform,
} from "@streamos/types";
import type { MonetizationPeriod } from "./types";

export function formatMoney(amountCents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    currency,
    maximumFractionDigits: 0,
    style: "currency",
  }).format(amountCents / 100);
}

export function formatCompactMoney(
  amountCents: number,
  currency: string,
): string {
  return new Intl.NumberFormat("en-US", {
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
    style: "currency",
  }).format(amountCents / 100);
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}

export function formatProvider(provider: StreamPlatform): string {
  const labels: Record<StreamPlatform, string> = {
    kick: "Kick",
    tiktok: "TikTok",
    twitch: "Twitch",
    youtube: "YouTube",
  };

  return labels[provider];
}

export function formatEventType(eventType: MonetizationEventType): string {
  const labels: Record<MonetizationEventType, string> = {
    ad_revenue: "Ads",
    affiliate: "Affiliate",
    bits: "Bits",
    donation: "Donation",
    membership: "Membership",
    merch_sale: "Merch",
    other: "Other",
    sponsorship: "Sponsoring",
    subscription: "Subscription",
    tip: "Tip",
  };

  return labels[eventType];
}

export function formatStatus(status: MonetizationEventStatus): string {
  const labels: Record<MonetizationEventStatus, string> = {
    confirmed: "Confirmed",
    disputed: "Disputed",
    failed: "Failed",
    pending: "Pending",
    refunded: "Refunded",
    void: "Void",
  };

  return labels[status];
}

export function periodLabel(period: MonetizationPeriod): string {
  const labels: Record<MonetizationPeriod, string> = {
    all_time: "All time",
    last_30_days: "Last 30 days",
    last_7_days: "Last 7 days",
  };

  return labels[period];
}
