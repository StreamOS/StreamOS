export type StreamPlatform = "twitch" | "youtube" | "tiktok" | "kick";

export type ConnectionStatus = "connected" | "expired" | "revoked" | "pending";

export type Creator = {
  id: string;
  ownerId: string;
  displayName: string;
  handle: string | null;
  niche: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ConnectedPlatform = {
  id: StreamPlatform;
  displayName: string;
  followerCount: number;
  connectedAt: string | null;
};

export type PlatformConnection = {
  id: string;
  creatorId: string;
  channelId: string | null;
  platform: StreamPlatform;
  providerAccountId: string;
  scopes: string[];
  expiresAt: string | null;
  connectedAt: string;
  status: ConnectionStatus;
};

export type CreatorMetric = {
  id: string;
  creatorId: string;
  channelId: string;
  platform: StreamPlatform;
  capturedAt: string;
  viewerCount: number;
  followerCount: number;
  watchTimeMinutes: number;
  revenueCents: number;
  engagementRate: number | null;
};
