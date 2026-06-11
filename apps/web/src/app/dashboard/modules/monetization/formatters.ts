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
    ad_revenue: "Werbung",
    affiliate: "Partnerprogramm",
    bits: "Bits",
    donation: "Spende",
    membership: "Mitgliedschaft",
    merch_sale: "Merch",
    other: "Sonstiges",
    sponsorship: "Sponsoring",
    subscription: "Abo",
    tip: "Trinkgeld",
  };

  return labels[eventType];
}

export function formatStatus(status: MonetizationEventStatus): string {
  const labels: Record<MonetizationEventStatus, string> = {
    confirmed: "Bestaetigt",
    disputed: "Angefochten",
    failed: "Fehlgeschlagen",
    pending: "Ausstehend",
    refunded: "Zurueckerstattet",
    void: "Ungueltig",
  };

  return labels[status];
}

export function periodLabel(period: MonetizationPeriod): string {
  const labels: Record<MonetizationPeriod, string> = {
    all_time: "Gesamte Zeit",
    last_30_days: "Letzte 30 Tage",
    last_7_days: "Letzte 7 Tage",
  };

  return labels[period];
}
