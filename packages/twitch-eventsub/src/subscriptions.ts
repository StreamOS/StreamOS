export type TwitchEventSubSubscription = {
  condition: Record<string, string>;
  type: string;
  version: string;
};

export const TWITCH_EVENTSUB_SUBSCRIPTION_TYPES = [
  "stream.online",
  "stream.offline",
  "channel.update",
  "channel.raid",
  "channel.follow",
] as const;

export type TwitchEventSubSubscriptionType =
  (typeof TWITCH_EVENTSUB_SUBSCRIPTION_TYPES)[number];

export function createTwitchEventSubSubscriptions(
  broadcasterId: string,
): TwitchEventSubSubscription[] {
  return [
    {
      condition: { broadcaster_user_id: broadcasterId },
      type: "stream.online",
      version: "1",
    },
    {
      condition: { broadcaster_user_id: broadcasterId },
      type: "stream.offline",
      version: "1",
    },
    {
      condition: { broadcaster_user_id: broadcasterId },
      type: "channel.update",
      version: "2",
    },
    {
      condition: { to_broadcaster_user_id: broadcasterId },
      type: "channel.raid",
      version: "1",
    },
    {
      condition: {
        broadcaster_user_id: broadcasterId,
        moderator_user_id: broadcasterId,
      },
      type: "channel.follow",
      version: "2",
    },
  ];
}
