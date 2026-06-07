import type { Request } from "express";

export type Provider = "twitch" | "youtube";

export type PlatformConnectionLookup = {
  channelRowId: string | null;
  metadata: Record<string, unknown>;
  userId: string;
};

const YOUTUBE_TOPIC_PREFIX =
  "https://www.youtube.com/feeds/videos.xml?channel_id=";

function getServiceRoleConfig():
  | { serviceRoleKey: string; supabaseUrl: string }
  | undefined {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const supabaseUrl =
    process.env.SUPABASE_URL?.trim() ??
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

  if (!serviceRoleKey || !supabaseUrl) {
    return undefined;
  }

  return { serviceRoleKey, supabaseUrl };
}

function createSupabaseUrl(
  supabaseUrl: string,
  table: string,
  params: Record<string, string>,
): URL {
  const url = new URL(`/rest/v1/${table}`, supabaseUrl);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url;
}

function serviceRoleHeaders(serviceRoleKey: string): Record<string, string> {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

export function getHeaderValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function getQueryString(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }

  return null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asString(value: unknown): string | undefined {
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

export function parseJsonObject(rawBody: Buffer): Record<string, unknown> {
  const parsed = JSON.parse(rawBody.toString("utf8")) as unknown;

  if (!isRecord(parsed)) {
    throw new Error("Webhook body must be a JSON object.");
  }

  return parsed;
}

export function getRequestIp(request: Request): string {
  return request.ip || request.socket.remoteAddress || "unknown";
}

export function isAllowedYouTubeTopic(topic: string): boolean {
  return topic.startsWith(YOUTUBE_TOPIC_PREFIX);
}

export async function lookupPlatformConnection({
  externalChannelId,
  provider,
}: {
  externalChannelId: string;
  provider: Provider;
}): Promise<PlatformConnectionLookup | null> {
  const config = getServiceRoleConfig();

  if (!config) {
    return null;
  }

  const url = createSupabaseUrl(config.supabaseUrl, "platform_connections", {
    platform: `eq.${provider}`,
    provider_account_id: `eq.${externalChannelId}`,
    select: "user_id,channel_id,metadata",
    limit: "1",
  });
  const response = await fetch(url, {
    headers: serviceRoleHeaders(config.serviceRoleKey),
  });

  if (!response.ok) {
    throw new Error(
      `platform_connections lookup failed with status ${response.status}.`,
    );
  }

  const rows = (await response.json()) as {
    channel_id: string | null;
    metadata?: unknown;
    user_id: string;
  }[];
  const row = rows[0];

  if (!row) {
    return null;
  }

  return {
    channelRowId: row.channel_id,
    metadata: isRecord(row.metadata) ? row.metadata : {},
    userId: row.user_id,
  };
}

export async function patchPlatformConnectionMetadata({
  externalChannelId,
  metadata,
  provider,
}: {
  externalChannelId: string;
  metadata: Record<string, unknown>;
  provider: Provider;
}): Promise<void> {
  const config = getServiceRoleConfig();

  if (!config) {
    return;
  }

  const url = createSupabaseUrl(config.supabaseUrl, "platform_connections", {
    platform: `eq.${provider}`,
    provider_account_id: `eq.${externalChannelId}`,
  });

  await patchSupabase(url, config.serviceRoleKey, { metadata });
}

export async function patchChannel({
  channelRowId,
  displayName,
  followerCount,
}: {
  channelRowId: string;
  displayName?: string;
  followerCount?: number;
}): Promise<void> {
  const config = getServiceRoleConfig();

  if (!config) {
    return;
  }

  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (displayName) {
    payload.display_name = displayName;
  }

  if (typeof followerCount === "number") {
    payload.follower_count = followerCount;
  }

  const url = createSupabaseUrl(config.supabaseUrl, "channels", {
    id: `eq.${channelRowId}`,
  });

  await patchSupabase(url, config.serviceRoleKey, payload);
}

export async function getChannelFollowerCount(
  channelRowId: string,
): Promise<number | null> {
  const config = getServiceRoleConfig();

  if (!config) {
    return null;
  }

  const url = createSupabaseUrl(config.supabaseUrl, "channels", {
    id: `eq.${channelRowId}`,
    select: "follower_count",
    limit: "1",
  });
  const response = await fetch(url, {
    headers: serviceRoleHeaders(config.serviceRoleKey),
  });

  if (!response.ok) {
    throw new Error(`channels lookup failed with status ${response.status}.`);
  }

  const rows = (await response.json()) as { follower_count: number | null }[];
  return rows[0]?.follower_count ?? null;
}

async function patchSupabase(
  url: URL,
  serviceRoleKey: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const response = await fetch(url, {
    body: JSON.stringify(payload),
    headers: {
      ...serviceRoleHeaders(serviceRoleKey),
      Prefer: "return=minimal",
    },
    method: "PATCH",
  });

  if (!response.ok) {
    throw new Error(`Supabase patch failed with status ${response.status}.`);
  }
}
