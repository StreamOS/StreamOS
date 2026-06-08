import {
  createTwitchEventSubSubscriptions,
  type TwitchEventSubSubscription,
} from "./subscriptions.js";

const TWITCH_EVENTSUB_SUBSCRIPTIONS_URL =
  "https://api.twitch.tv/helix/eventsub/subscriptions";
const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 1_000;

type TwitchEventSubTransport = {
  callback?: string;
  method: "webhook";
  secret?: string;
};

type TwitchEventSubApiSubscription = {
  condition: Record<string, string>;
  id: string;
  status?: string;
  transport?: TwitchEventSubTransport;
  type: string;
  version: string;
};

type TwitchEventSubApiResponse = {
  data: TwitchEventSubApiSubscription[];
};

export type TwitchEventSubRegisteredSubscription = {
  condition: Record<string, string>;
  id: string;
  status?: string;
  type: string;
  version: string;
};

export type TwitchEventSubRegistrationResult = {
  created: string[];
  failed: string[];
  registeredAt: string;
  subscriptions: TwitchEventSubRegisteredSubscription[];
};

export type RegisterEventSubSubscriptionsOptions = {
  appAccessToken: string;
  broadcasterId: string;
  callbackUrl: string;
  clientId: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  retryAttempts?: number;
  retryDelayMs?: number;
  secret: string;
  subscriptions?: TwitchEventSubSubscription[];
};

export type DeleteEventSubSubscriptionsOptions = {
  appAccessToken: string;
  clientId: string;
  fetchImpl?: typeof fetch;
  subscriptionIds: string[];
};

export async function registerEventSubSubscriptions({
  appAccessToken,
  broadcasterId,
  callbackUrl,
  clientId,
  fetchImpl = fetch,
  now = () => new Date(),
  retryAttempts = DEFAULT_RETRY_ATTEMPTS,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  secret,
  subscriptions = createTwitchEventSubSubscriptions(broadcasterId),
}: RegisterEventSubSubscriptionsOptions): Promise<TwitchEventSubRegistrationResult> {
  const registered: TwitchEventSubRegisteredSubscription[] = [];
  const failed: string[] = [];

  for (const subscription of subscriptions) {
    try {
      const result = await createSubscriptionWithRetry({
        appAccessToken,
        callbackUrl,
        clientId,
        fetchImpl,
        retryAttempts,
        retryDelayMs,
        secret,
        subscription,
      });

      registered.push(result);
    } catch {
      failed.push(subscription.type);
    }
  }

  return {
    created: registered.map((subscription) => subscription.id),
    failed,
    registeredAt: now().toISOString(),
    subscriptions: registered,
  };
}

export async function deleteEventSubSubscriptions({
  appAccessToken,
  clientId,
  fetchImpl = fetch,
  subscriptionIds,
}: DeleteEventSubSubscriptionsOptions): Promise<{
  deleted: string[];
  failed: string[];
}> {
  const uniqueSubscriptionIds = Array.from(new Set(subscriptionIds));
  const deleted: string[] = [];
  const failed: string[] = [];

  for (const subscriptionId of uniqueSubscriptionIds) {
    const url = new URL(TWITCH_EVENTSUB_SUBSCRIPTIONS_URL);
    url.searchParams.set("id", subscriptionId);

    const response = await fetchImpl(url, {
      headers: createTwitchHeaders({ appAccessToken, clientId }),
      method: "DELETE",
    });

    if (response.ok || response.status === 404) {
      deleted.push(subscriptionId);
    } else {
      failed.push(subscriptionId);
    }
  }

  return { deleted, failed };
}

async function createSubscriptionWithRetry({
  appAccessToken,
  callbackUrl,
  clientId,
  fetchImpl,
  retryAttempts,
  retryDelayMs,
  secret,
  subscription,
}: {
  appAccessToken: string;
  callbackUrl: string;
  clientId: string;
  fetchImpl: typeof fetch;
  retryAttempts: number;
  retryDelayMs: number;
  secret: string;
  subscription: TwitchEventSubSubscription;
}): Promise<TwitchEventSubRegisteredSubscription> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= retryAttempts; attempt += 1) {
    try {
      return await createSubscription({
        appAccessToken,
        callbackUrl,
        clientId,
        fetchImpl,
        secret,
        subscription,
      });
    } catch (error) {
      lastError = error;

      if (attempt < retryAttempts) {
        await delay(retryDelayMs);
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(
        `Twitch EventSub registration failed for ${subscription.type}.`,
      );
}

async function createSubscription({
  appAccessToken,
  callbackUrl,
  clientId,
  fetchImpl,
  secret,
  subscription,
}: {
  appAccessToken: string;
  callbackUrl: string;
  clientId: string;
  fetchImpl: typeof fetch;
  secret: string;
  subscription: TwitchEventSubSubscription;
}): Promise<TwitchEventSubRegisteredSubscription> {
  const response = await fetchImpl(TWITCH_EVENTSUB_SUBSCRIPTIONS_URL, {
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
      ...createTwitchHeaders({ appAccessToken, clientId }),
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (response.status === 409) {
    return getExistingSubscription({
      appAccessToken,
      clientId,
      fetchImpl,
      subscription,
    });
  }

  if (!response.ok) {
    throw new Error(
      `Twitch EventSub ${subscription.type} registration failed with status ${response.status}.`,
    );
  }

  const payload = (await response.json()) as TwitchEventSubApiResponse;
  const createdSubscription = payload.data[0];

  if (!createdSubscription) {
    throw new Error(
      `Twitch EventSub ${subscription.type} registration returned no subscription.`,
    );
  }

  return toRegisteredSubscription(createdSubscription);
}

async function getExistingSubscription({
  appAccessToken,
  clientId,
  fetchImpl,
  subscription,
}: {
  appAccessToken: string;
  clientId: string;
  fetchImpl: typeof fetch;
  subscription: TwitchEventSubSubscription;
}): Promise<TwitchEventSubRegisteredSubscription> {
  const url = new URL(TWITCH_EVENTSUB_SUBSCRIPTIONS_URL);
  url.searchParams.set("type", subscription.type);
  url.searchParams.set("user_id", getSubscriptionUserId(subscription));

  const response = await fetchImpl(url, {
    headers: createTwitchHeaders({ appAccessToken, clientId }),
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(
      `Twitch EventSub lookup for ${subscription.type} failed with status ${response.status}.`,
    );
  }

  const payload = (await response.json()) as TwitchEventSubApiResponse;
  const existingSubscription = payload.data.find((candidate) =>
    hasMatchingSubscriptionCondition(candidate, subscription),
  );

  if (!existingSubscription) {
    throw new Error(
      `Twitch EventSub ${subscription.type} conflict could not be resolved.`,
    );
  }

  return toRegisteredSubscription(existingSubscription);
}

function createTwitchHeaders({
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

function getSubscriptionUserId(
  subscription: TwitchEventSubSubscription,
): string {
  const userId =
    subscription.condition.broadcaster_user_id ??
    subscription.condition.to_broadcaster_user_id ??
    subscription.condition.from_broadcaster_user_id ??
    subscription.condition.moderator_user_id;

  if (!userId) {
    throw new Error(
      `Twitch EventSub ${subscription.type} subscription has no user condition.`,
    );
  }

  return userId;
}

function hasMatchingSubscriptionCondition(
  candidate: TwitchEventSubApiSubscription,
  subscription: TwitchEventSubSubscription,
): boolean {
  return (
    candidate.type === subscription.type &&
    candidate.version === subscription.version &&
    Object.entries(subscription.condition).every(
      ([key, value]) => candidate.condition[key] === value,
    )
  );
}

function toRegisteredSubscription(
  subscription: TwitchEventSubApiSubscription,
): TwitchEventSubRegisteredSubscription {
  return {
    condition: subscription.condition,
    id: subscription.id,
    status: subscription.status,
    type: subscription.type,
    version: subscription.version,
  };
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
