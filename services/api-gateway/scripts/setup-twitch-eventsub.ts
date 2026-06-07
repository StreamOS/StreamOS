type TwitchSubscriptionType =
  | "stream.online"
  | "stream.offline"
  | "channel.update"
  | "channel.follow";

type TwitchSubscription = {
  condition: Record<string, string>;
  type: TwitchSubscriptionType;
  version: string;
};

type TwitchTokenResponse = {
  access_token: string;
  expires_in: number;
  token_type: string;
};

type TwitchEventSubApiSubscription = {
  condition: Record<string, string>;
  id: string;
  status: string;
  transport?: {
    callback?: string;
    method?: string;
  };
  type: string;
  version: string;
};

type TwitchEventSubResponse = {
  data: TwitchEventSubApiSubscription[];
};

const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const TWITCH_EVENTSUB_URL =
  "https://api.twitch.tv/helix/eventsub/subscriptions";

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));

  return match?.slice(prefix.length).trim();
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function resolveCallbackUrl(): string {
  const explicitCallback = process.env.TWITCH_EVENTSUB_CALLBACK_URL?.trim();

  if (explicitCallback) {
    return explicitCallback;
  }

  const publicUrl = process.env.STREAMOS_PUBLIC_URL?.trim();

  if (!publicUrl) {
    throw new Error(
      "TWITCH_EVENTSUB_CALLBACK_URL or STREAMOS_PUBLIC_URL is required.",
    );
  }

  return `${publicUrl.replace(/\/+$/u, "")}/webhooks/twitch`;
}

function createSubscriptions(broadcasterId: string): TwitchSubscription[] {
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
      condition: {
        broadcaster_user_id: broadcasterId,
        moderator_user_id: broadcasterId,
      },
      type: "channel.follow",
      version: "2",
    },
  ];
}

async function getAppAccessToken({
  clientId,
  clientSecret,
}: {
  clientId: string;
  clientSecret: string;
}): Promise<string> {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
  });
  const response = await fetch(TWITCH_TOKEN_URL, {
    body,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(
      `Twitch app token request failed with status ${response.status}.`,
    );
  }

  const payload = (await response.json()) as TwitchTokenResponse;

  return payload.access_token;
}

function twitchHeaders({
  appAccessToken,
  clientId,
}: {
  appAccessToken: string;
  clientId: string;
}): Record<string, string> {
  return {
    Authorization: `Bearer ${appAccessToken}`,
    "Client-Id": clientId,
  };
}

function getSubscriptionUserId(subscription: TwitchSubscription): string {
  return (
    subscription.condition.broadcaster_user_id ??
    subscription.condition.moderator_user_id
  );
}

function hasMatchingCondition(
  candidate: TwitchEventSubApiSubscription,
  subscription: TwitchSubscription,
  callbackUrl: string,
): boolean {
  return (
    candidate.type === subscription.type &&
    candidate.version === subscription.version &&
    candidate.transport?.method === "webhook" &&
    candidate.transport.callback === callbackUrl &&
    Object.entries(subscription.condition).every(
      ([key, value]) => candidate.condition[key] === value,
    )
  );
}

async function listSubscriptions({
  appAccessToken,
  clientId,
  subscription,
}: {
  appAccessToken: string;
  clientId: string;
  subscription: TwitchSubscription;
}): Promise<TwitchEventSubApiSubscription[]> {
  const url = new URL(TWITCH_EVENTSUB_URL);
  url.searchParams.set("type", subscription.type);
  url.searchParams.set("user_id", getSubscriptionUserId(subscription));

  const response = await fetch(url, {
    headers: twitchHeaders({ appAccessToken, clientId }),
  });

  if (!response.ok) {
    throw new Error(
      `Twitch EventSub lookup failed with status ${response.status}.`,
    );
  }

  const payload = (await response.json()) as TwitchEventSubResponse;

  return payload.data;
}

async function createSubscription({
  appAccessToken,
  callbackUrl,
  clientId,
  secret,
  subscription,
}: {
  appAccessToken: string;
  callbackUrl: string;
  clientId: string;
  secret: string;
  subscription: TwitchSubscription;
}): Promise<string> {
  const response = await fetch(TWITCH_EVENTSUB_URL, {
    body: JSON.stringify({
      condition: subscription.condition,
      transport: {
        callback: callbackUrl,
        method: "webhook",
        secret,
      },
      type: subscription.type,
      version: subscription.version,
    }),
    headers: {
      ...twitchHeaders({ appAccessToken, clientId }),
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(
      `Twitch EventSub create ${subscription.type} failed with status ${response.status}.`,
    );
  }

  const payload = (await response.json()) as TwitchEventSubResponse;
  const created = payload.data[0];

  if (!created) {
    throw new Error(
      `Twitch EventSub create ${subscription.type} returned no id.`,
    );
  }

  return created.id;
}

async function main(): Promise<void> {
  const broadcasterId = getArg("broadcaster-id");

  if (!broadcasterId) {
    throw new Error("Usage: setup:eventsub -- --broadcaster-id=12345");
  }

  const clientId = requireEnv("TWITCH_CLIENT_ID");
  const clientSecret = requireEnv("TWITCH_CLIENT_SECRET");
  const secret = requireEnv("STREAM_EVENT_WEBHOOK_SECRET");
  const callbackUrl = resolveCallbackUrl();
  const appAccessToken = await getAppAccessToken({ clientId, clientSecret });
  const subscriptions = createSubscriptions(broadcasterId);
  const created: string[] = [];
  const skipped: string[] = [];

  for (const subscription of subscriptions) {
    const existing = await listSubscriptions({
      appAccessToken,
      clientId,
      subscription,
    });

    if (
      existing.some((candidate) =>
        hasMatchingCondition(candidate, subscription, callbackUrl),
      )
    ) {
      skipped.push(subscription.type);
      continue;
    }

    const id = await createSubscription({
      appAccessToken,
      callbackUrl,
      clientId,
      secret,
      subscription,
    });
    created.push(`${subscription.type}:${id}`);
  }

  console.info(
    JSON.stringify(
      {
        broadcasterId,
        callbackUrl,
        created,
        skipped,
      },
      null,
      2,
    ),
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
