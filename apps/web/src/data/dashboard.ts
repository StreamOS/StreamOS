import type { OAuthProvider, StreamPlatform } from "@streamos/types";

export type DashboardStat = {
  label: string;
  value: string;
  trend: string;
  tone: "violet" | "emerald" | "rose" | "amber";
};

export type PlatformSummary = {
  id: StreamPlatform;
  name: string;
  followers: string;
  status:
    | "Verbunden"
    | "Abgelaufen"
    | "Nicht verbunden"
    | "OAuth ausstehend"
    | "Beta-Connector"
    | "Setup erforderlich";
  reach: string;
  actionHref?: string;
  actionLabel?: string;
  canRefresh?: boolean;
  gatewayProvider?: OAuthProvider;
};

export type ClipSummary = {
  title: string;
  platform: string;
  status: "Bereit" | "Wird analysiert" | "In Warteschlange";
  score: number;
  hook: string;
};

export type ViewerPoint = {
  day: string;
  kick: number;
  twitch: number;
  youtube: number;
  tiktok: number;
};

export const platforms: PlatformSummary[] = [
  {
    id: "twitch",
    name: "Twitch",
    followers: "Bereit",
    status: "Nicht verbunden",
    reach: "OAuth",
    actionHref: "/api/platforms/twitch/connect?next=/dashboard/platforms",
    actionLabel: "Verbindung starten",
  },
  {
    id: "youtube",
    name: "YouTube",
    followers: "Bereit",
    status: "Nicht verbunden",
    reach: "Gateway OAuth",
    actionLabel: "Verbindung starten",
    gatewayProvider: "youtube",
  },
  {
    id: "tiktok",
    name: "TikTok",
    followers: "Bereit",
    status: "Nicht verbunden",
    reach: "Gateway OAuth",
    actionLabel: "Verbindung starten",
    gatewayProvider: "tiktok",
  },
  {
    id: "kick",
    name: "Kick",
    followers: "Bereit",
    status: "Nicht verbunden",
    reach: "Gateway OAuth",
    actionLabel: "Verbindung starten",
    gatewayProvider: "kick",
  },
];
