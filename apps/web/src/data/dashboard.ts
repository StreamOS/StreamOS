import type { StreamPlatform } from "@streamos/types";

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
    | "Connected"
    | "Not connected"
    | "OAuth pending"
    | "Beta connector"
    | "Setup required";
  reach: string;
  actionHref?: string;
  actionLabel?: string;
};

export type ClipSummary = {
  title: string;
  platform: string;
  status: "Ready" | "Analyzing" | "Queued";
  score: number;
  hook: string;
};

export type ViewerPoint = {
  day: string;
  twitch: number;
  youtube: number;
  tiktok: number;
};

export const dashboardStats: DashboardStat[] = [
  {
    label: "Discovery score",
    value: "82",
    trend: "+9% SEO lift",
    tone: "violet",
  },
  {
    label: "Monthly revenue",
    value: "$18.4k",
    trend: "+14% blended MRR",
    tone: "emerald",
  },
  { label: "AI clips queued", value: "36", trend: "12 ready", tone: "rose" },
  { label: "Live reach", value: "148k", trend: "+21% weekly", tone: "amber" },
];

export const platforms: PlatformSummary[] = [
  {
    id: "twitch",
    name: "Twitch",
    followers: "Ready",
    status: "Not connected",
    reach: "OAuth",
    actionHref: "/api/platforms/twitch/connect",
    actionLabel: "Verbinden",
  },
  {
    id: "youtube",
    name: "YouTube",
    followers: "42.8k",
    status: "Connected",
    reach: "28%",
  },
  {
    id: "tiktok",
    name: "TikTok",
    followers: "118.4k",
    status: "OAuth pending",
    reach: "24%",
  },
  {
    id: "kick",
    name: "Kick",
    followers: "9.7k",
    status: "Beta connector",
    reach: "6%",
  },
];

export const clips: ClipSummary[] = [
  {
    title: "Ranked clutch ending",
    platform: "TikTok",
    status: "Ready",
    score: 94,
    hook: "One-health comeback with high chat velocity.",
  },
  {
    title: "Sponsor callout remix",
    platform: "YouTube Shorts",
    status: "Analyzing",
    score: 81,
    hook: "Natural product mention during peak retention.",
  },
  {
    title: "Community Q&A highlight",
    platform: "Twitch",
    status: "Queued",
    score: 76,
    hook: "Viewer question becomes reusable positioning clip.",
  },
];

export const viewerTrend: ViewerPoint[] = [
  { day: "Mon", twitch: 4200, youtube: 2600, tiktok: 3800 },
  { day: "Tue", twitch: 5100, youtube: 3100, tiktok: 4300 },
  { day: "Wed", twitch: 4800, youtube: 3900, tiktok: 5200 },
  { day: "Thu", twitch: 6200, youtube: 4400, tiktok: 6100 },
  { day: "Fri", twitch: 7300, youtube: 5600, tiktok: 7400 },
  { day: "Sat", twitch: 9100, youtube: 6900, tiktok: 9800 },
  { day: "Sun", twitch: 8400, youtube: 7200, tiktok: 8900 },
];

export const operatingPlan = [
  "Connect TikTok OAuth to unlock automated repurposing.",
  "Batch the 12 ready clips into Shorts, Reels, and TikTok variants.",
  "Move sponsor-fit scoring into the API gateway contract.",
  "Reserve one recovery block before the next high-volume stream.",
];
