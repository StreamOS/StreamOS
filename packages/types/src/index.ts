export type StreamPlatform = "twitch" | "youtube" | "tiktok" | "kick";

export type ConnectedPlatform = {
  id: StreamPlatform;
  displayName: string;
  followerCount: number;
  connectedAt: string | null;
};

export type CreatorMetric = {
  id: string;
  platform: StreamPlatform;
  capturedAt: string;
  viewerCount: number;
  revenueCents: number;
};
