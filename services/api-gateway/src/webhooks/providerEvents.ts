import { XMLParser } from "fast-xml-parser";
import type {
  StreamOSJob,
  StreamOSJobType,
  StreamProvider,
} from "@streamos/queue";

export type ProviderWebhookEventType = StreamOSJobType;
export type ProviderWebhookEvent = StreamOSJob;
export type ProviderWebhookProvider = StreamProvider;

export type ProviderWebhookDispatcher = (
  event: ProviderWebhookEvent,
) => Promise<unknown>;

type TwitchEventSubPayload = {
  subscription?: {
    type?: unknown;
  };
  event?: unknown;
};

type YouTubeAtomEntry = {
  videoId: string;
  channelId: string;
  title?: string;
  publishedAt?: string;
  updatedAt?: string;
  raw: Record<string, unknown>;
};

const youtubeAtomParser = new XMLParser({
  attributeNamePrefix: "@_",
  ignoreAttributes: false,
  parseAttributeValue: false,
  parseTagValue: false,
  textNodeName: "#text",
  trimValues: true,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.trim() || undefined;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (isRecord(value)) {
    return asString(value["#text"]);
  }

  return undefined;
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }

  return isRecord(value) ? [value] : [];
}

export function normalizeTwitchNotification({
  eventId,
  payload,
  receivedAt,
}: {
  eventId: string;
  payload: TwitchEventSubPayload;
  receivedAt: string;
}): ProviderWebhookEvent | undefined {
  const subscriptionType = asString(payload.subscription?.type);

  if (!subscriptionType || !isRecord(payload.event)) {
    throw new Error("Twitch EventSub notification payload is incomplete.");
  }

  const event = payload.event;
  const channelId = asString(event.broadcaster_user_id);

  if (!channelId) {
    throw new Error(
      "Twitch EventSub notification is missing broadcaster_user_id.",
    );
  }

  if (subscriptionType === "stream.online") {
    return {
      id: eventId,
      provider: "twitch",
      type: "stream.online",
      channelId,
      streamId: asString(event.id),
      startedAt: asString(event.started_at),
      raw: event,
      receivedAt,
    };
  }

  if (subscriptionType === "stream.offline") {
    return {
      id: eventId,
      provider: "twitch",
      type: "stream.offline",
      channelId,
      endedAt: receivedAt,
      raw: event,
      receivedAt,
    };
  }

  if (subscriptionType === "channel.update") {
    return {
      id: eventId,
      provider: "twitch",
      type: "channel.update",
      channelId,
      title: asString(event.title),
      gameName: asString(event.category_name),
      raw: event,
      receivedAt,
    };
  }

  return undefined;
}

export function parseYouTubeAtomEntries(rawXml: string): YouTubeAtomEntry[] {
  const parsed = youtubeAtomParser.parse(rawXml) as unknown;

  if (!isRecord(parsed)) {
    throw new Error("YouTube WebSub payload is not an XML object.");
  }

  const feed = parsed.feed;

  if (!isRecord(feed)) {
    throw new Error("YouTube WebSub payload is missing an Atom feed.");
  }

  const entries: YouTubeAtomEntry[] = [];

  for (const entry of asRecordArray(feed.entry)) {
    const videoId = asString(entry["yt:videoId"]);
    const channelId = asString(entry["yt:channelId"]);

    if (!videoId || !channelId) {
      continue;
    }

    entries.push({
      videoId,
      channelId,
      title: asString(entry.title),
      publishedAt: asString(entry.published),
      updatedAt: asString(entry.updated),
      raw: entry,
    });
  }

  return entries;
}

export function normalizeYouTubeAtomEntry({
  entry,
  receivedAt,
}: {
  entry: YouTubeAtomEntry;
  receivedAt: string;
}): ProviderWebhookEvent {
  return {
    id: `youtube:${entry.channelId}:${entry.videoId}:${entry.updatedAt ?? receivedAt}`,
    provider: "youtube",
    type: "video.published",
    channelId: entry.channelId,
    videoId: entry.videoId,
    title: entry.title,
    publishedAt: entry.publishedAt,
    updatedAt: entry.updatedAt,
    raw: entry.raw,
    receivedAt,
  };
}
