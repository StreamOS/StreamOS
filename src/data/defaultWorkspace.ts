import type { BarDatum, WorkspaceState } from "@/types/streamos";

export const STORAGE_KEY = "streamos.workspace.v3";

export const marketData: BarDatum[] = [
  { label: "YouTube", value: 14.83, color: "#00d4aa" },
  { label: "TikTok", value: 8.0, color: "#9b5cff" },
  { label: "Twitch", value: 4.64, color: "#ff4e6a" },
  { label: "Kick", value: 1.1, color: "#f5c842" },
  { label: "Sonstige", value: 0.8, color: "rgba(255,255,255,0.35)" }
];

export const painData: BarDatum[] = [
  { label: "Discoverability", value: 9.5, color: "#ff4e6a" },
  { label: "Monetarisierung", value: 9.0, color: "#f5c842" },
  { label: "Burnout", value: 8.5, color: "#9b5cff" },
  { label: "Multi-Plattform", value: 8.0, color: "#48a4ff" },
  { label: "Branding", value: 7.5, color: "#00d4aa" },
  { label: "Analytics", value: 7.0, color: "rgba(255,255,255,0.35)" }
];

export const defaultWorkspace: WorkspaceState = {
  profile: {
    creatorName: "NovaPlays",
    niche: "Tactical FPS & Community Challenges",
    goal: "Mehr Zuschauer",
    weeklyHours: 18,
    positioning:
      "Kompetitive Streams mit klaren Lernmomenten, schnellen Highlights und starker Community-Interaktion."
  },
  platforms: [
    { name: "Twitch", connected: true, followers: 18420, status: "EventSub aktiv" },
    { name: "YouTube", connected: true, followers: 9200, status: "Analytics aktiv" },
    { name: "TikTok", connected: false, followers: 6100, status: "OAuth offen" },
    { name: "Kick", connected: false, followers: 1200, status: "Beta Connector" }
  ],
  clips: [
    {
      id: 1,
      title: "Bossfight Clutch in Overtime",
      platform: "TikTok + Shorts",
      score: 94,
      status: "bereit",
      hook: "Ich hatte nur noch 1 HP..."
    },
    {
      id: 2,
      title: "Chat rastet nach Comeback aus",
      platform: "Reels",
      score: 88,
      status: "geplant",
      hook: "Niemand hat an diesen Run geglaubt."
    }
  ],
  money: [
    { id: 1, source: "Subs", amount: 420, note: "Subathon Push" },
    { id: 2, source: "Sponsoring", amount: 1200, note: "Hardware Brand Integration" },
    { id: 3, source: "Merch", amount: 310, note: "Drop nach Community Stream" }
  ],
  events: [
    { id: 1, type: "stream.online", text: "Twitch Stream gestartet", time: "09:04" },
    { id: 2, type: "channel.follow", text: "12 neue Follower seit Streamstart", time: "09:42" },
    { id: 3, type: "channel.cheer", text: "Bits Spike nach Bossfight erkannt", time: "10:16" }
  ],
  brand: {
    title: "Stream Starting",
    subtitle: "Neon Tactical / high contrast / chat ready",
    colors: ["#9b5cff", "#00d4aa", "#ff4e6a", "#f5c842"]
  },
  plan: [
    { day: "Mo", type: "Stream", detail: "Ranked Push", tone: "active" },
    { day: "Di", type: "Edit", detail: "Shorts Batch", tone: "" },
    { day: "Mi", type: "Rest", detail: "Recovery", tone: "rest" },
    { day: "Do", type: "Stream", detail: "Collab", tone: "active" },
    { day: "Fr", type: "Drop", detail: "Merch + Clips", tone: "" },
    { day: "Sa", type: "Rest", detail: "Offline", tone: "rest" },
    { day: "So", type: "Review", detail: "Analytics", tone: "" }
  ],
  range: 7
};
