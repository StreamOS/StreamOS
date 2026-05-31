export type RouteId =
  | "dashboard"
  | "onboarding"
  | "platforms"
  | "clips"
  | "analytics"
  | "money"
  | "branding"
  | "planner"
  | "settings";

export type CreatorProfile = {
  creatorName: string;
  niche: string;
  goal: string;
  weeklyHours: number;
  positioning: string;
};

export type PlatformConnection = {
  name: "Twitch" | "YouTube" | "TikTok" | "Kick";
  connected: boolean;
  followers: number;
  status: string;
};

export type ClipCandidate = {
  id: number;
  title: string;
  platform: string;
  score: number;
  status: string;
  hook: string;
};

export type MoneyEntry = {
  id: number;
  source: string;
  amount: number;
  note: string;
};

export type StreamEvent = {
  id: number;
  type: string;
  text: string;
  time: string;
};

export type BrandKit = {
  title: string;
  subtitle: string;
  colors: string[];
};

export type PlannerDay = {
  day: string;
  type: string;
  detail: string;
  tone: "active" | "rest" | "";
};

export type WorkspaceState = {
  profile: CreatorProfile;
  platforms: PlatformConnection[];
  clips: ClipCandidate[];
  money: MoneyEntry[];
  events: StreamEvent[];
  brand: BrandKit;
  plan: PlannerDay[];
  range: 7 | 30 | 90;
};

export type ScoreSummary = {
  connectedCount: number;
  discoverability: number;
  moneyTotal: number;
  burnout: number;
};

export type BarDatum = {
  label: string;
  value: number;
  color: string;
};
