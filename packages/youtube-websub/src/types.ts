export const YOUTUBE_WEBSUB_HUB_URL =
  "https://pubsubhubbub.appspot.com/subscribe";
export const YOUTUBE_WEBSUB_MAX_LEASE_SECONDS = 864_000;
export const YOUTUBE_WEBSUB_RENEWAL_WINDOW_MS = 48 * 60 * 60 * 1000;

export type WebSubSubscriptionStatus =
  | "pending"
  | "active"
  | "expired"
  | "failed"
  | "unsubscribed";

export type WebSubSubscription = {
  topicUrl: string;
  leaseSeconds: number;
  subscribedAt: string;
  expiresAt: string;
  status: WebSubSubscriptionStatus;
};

export type YouTubeWebSubHealth = {
  total: number;
  active: number;
  expiringSoon: number;
  expired: number;
  failed: number;
};
