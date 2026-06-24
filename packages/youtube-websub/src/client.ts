import {
  YOUTUBE_WEBSUB_HUB_URL,
  YOUTUBE_WEBSUB_MAX_LEASE_SECONDS,
  type WebSubSubscription,
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const RETRY_DELAYS_MS = [2_000, 4_000, 8_000] as const;
const MAX_STREAMOS_PUBLIC_URL_LENGTH = 4096;
const YOUTUBE_WEBSUB_CALLBACK_PATH = "/api/webhooks/youtube/websub";

type RequestWebSubOptions = {
  fetchImpl?: typeof fetch;
  leaseSeconds?: number;
  now?: () => Date;
  secret?: string;
  streamOsPublicUrl?: string;
  timeoutMs?: number;
  verifyToken?: string;
};

type WebSubRequestMode = "subscribe" | "unsubscribe";

export async function subscribe(
  channelId: string,
  options: RequestWebSubOptions = {},
): Promise<WebSubSubscription> {
  return requestSubscription({
    channelId,
    mode: "subscribe",
    options,
  });
}

export async function renewSubscription(
  channelId: string,
  options: RequestWebSubOptions = {},
): Promise<WebSubSubscription> {
  return subscribe(channelId, options);
}

export async function unsubscribe(
  channelId: string,
  options: RequestWebSubOptions = {},
): Promise<void> {
  await requestSubscription({
    channelId,
    mode: "unsubscribe",
    options,
  });
}

export function createYouTubeWebSubTopicUrl(channelId: string): string {
  const normalizedChannelId = normalizeChannelId(channelId);
  const url = new URL("https://www.youtube.com/xml/feeds/videos.xml");
  url.searchParams.set("channel_id", normalizedChannelId);
  return url.toString();
}

export function parseYouTubeChannelIdFromTopic(
  topicUrl: string,
): string | null {
  try {
    const url = new URL(topicUrl);
    const channelId = url.searchParams.get("channel_id");
    return channelId?.trim() || null;
  } catch {
    return null;
  }
}

function requestSubscription({
  channelId,
  mode,
  options,
}: {
  channelId: string;
  mode: WebSubRequestMode;
  options: RequestWebSubOptions;
}): Promise<WebSubSubscription> {
  const leaseSeconds = clampLeaseSeconds(
    options.leaseSeconds ?? YOUTUBE_WEBSUB_MAX_LEASE_SECONDS,
  );
  const topicUrl = createYouTubeWebSubTopicUrl(channelId);
  const subscribedAt = options.now?.() ?? new Date();

  const subscription = {
    expiresAt: new Date(
      subscribedAt.getTime() + leaseSeconds * 1000,
    ).toISOString(),
    leaseSeconds,
    subscribedAt: subscribedAt.toISOString(),
    topicUrl,
  };

  return requestWithRetry({
    body: createRequestBody({
      leaseSeconds,
      mode,
      options,
      topicUrl,
    }),
    fetchImpl: options.fetchImpl ?? fetch,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  })
    .then((): WebSubSubscription => {
      const status: WebSubSubscription["status"] =
        mode === "unsubscribe" ? "unsubscribed" : "pending";

      return {
        ...subscription,
        status,
      };
    })
    .catch((error) => {
      if (
        mode === "subscribe" &&
        error instanceof YouTubeWebSubUnretryableError &&
        error.status === 422
      ) {
        return {
          ...subscription,
          status: "failed",
        };
      }

      throw error;
    });
}

async function requestWithRetry({
  body,
  fetchImpl,
  timeoutMs,
}: {
  body: URLSearchParams;
  fetchImpl: typeof fetch;
  timeoutMs: number;
}): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const response = await postToHub({ body, fetchImpl, timeoutMs });

      if (response.status === 202 || response.status === 204) {
        return;
      }

      if (response.status === 422) {
        throw new YouTubeWebSubUnretryableError(
          "YouTube WebSub topic is invalid.",
          response.status,
        );
      }

      if (response.status < 500) {
        throw new YouTubeWebSubUnretryableError(
          `YouTube WebSub request failed with status ${response.status}.`,
          response.status,
        );
      }

      throw new YouTubeWebSubRetryableError(
        `YouTube WebSub request failed with status ${response.status}.`,
        response.status,
      );
    } catch (error) {
      lastError = error;

      if (
        error instanceof YouTubeWebSubUnretryableError ||
        attempt === RETRY_DELAYS_MS.length
      ) {
        throw error;
      }

      await delay(RETRY_DELAYS_MS[attempt] ?? 0);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("YouTube WebSub request failed.");
}

async function postToHub({
  body,
  fetchImpl,
  timeoutMs,
}: {
  body: URLSearchParams;
  fetchImpl: typeof fetch;
  timeoutMs: number;
}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(YOUTUBE_WEBSUB_HUB_URL, {
      body,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      method: "POST",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new YouTubeWebSubRetryableError(
        "YouTube WebSub request timed out.",
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function createRequestBody({
  leaseSeconds,
  mode,
  options,
  topicUrl,
}: {
  leaseSeconds: number;
  mode: WebSubRequestMode;
  options: RequestWebSubOptions;
  topicUrl: string;
}): URLSearchParams {
  const callbackUrl = getCallbackUrl(options.streamOsPublicUrl);
  const secret = getRequiredSecret(options.secret);
  const body = new URLSearchParams({
    "hub.callback": callbackUrl,
    "hub.mode": mode,
    "hub.secret": secret,
    "hub.topic": topicUrl,
  });
  const verifyToken =
    options.verifyToken ?? process.env.YOUTUBE_WEBSUB_VERIFY_TOKEN?.trim();

  if (mode === "subscribe") {
    body.set("hub.lease_seconds", String(leaseSeconds));
  }

  if (verifyToken) {
    body.set("hub.verify_token", verifyToken);
  }

  return body;
}

function getCallbackUrl(streamOsPublicUrl: string | undefined): string {
  const publicUrl =
    streamOsPublicUrl?.trim() ?? process.env.STREAMOS_PUBLIC_URL?.trim();

  if (!publicUrl) {
    throw new Error("STREAMOS_PUBLIC_URL is required for YouTube WebSub.");
  }

  if (publicUrl.length > MAX_STREAMOS_PUBLIC_URL_LENGTH) {
    throw new Error("STREAMOS_PUBLIC_URL is invalid for YouTube WebSub.");
  }

  let url: URL;

  try {
    url = new URL(publicUrl);
  } catch {
    throw new Error("STREAMOS_PUBLIC_URL is invalid for YouTube WebSub.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("STREAMOS_PUBLIC_URL is invalid for YouTube WebSub.");
  }

  if (url.search || url.hash) {
    throw new Error("STREAMOS_PUBLIC_URL is invalid for YouTube WebSub.");
  }

  url.pathname = joinUrlPath(url.pathname, YOUTUBE_WEBSUB_CALLBACK_PATH);
  return url.toString();
}

function joinUrlPath(basePath: string, suffixPath: string): string {
  const segments = [
    ...basePath.split("/").filter(Boolean),
    ...suffixPath.split("/").filter(Boolean),
  ];

  return `/${segments.join("/")}`;
}

function getRequiredSecret(secret: string | undefined): string {
  const resolvedSecret = secret?.trim() ?? process.env.YOUTUBE_WEBSUB_SECRET;

  if (!resolvedSecret) {
    throw new Error("YOUTUBE_WEBSUB_SECRET is required for YouTube WebSub.");
  }

  return resolvedSecret;
}

function normalizeChannelId(channelId: string): string {
  const normalizedChannelId = channelId.trim();

  if (!normalizedChannelId) {
    throw new Error("YouTube channelId is required.");
  }

  return normalizedChannelId;
}

function clampLeaseSeconds(leaseSeconds: number): number {
  if (!Number.isInteger(leaseSeconds) || leaseSeconds <= 0) {
    throw new Error("YouTube WebSub leaseSeconds must be a positive integer.");
  }

  return Math.min(leaseSeconds, YOUTUBE_WEBSUB_MAX_LEASE_SECONDS);
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class YouTubeWebSubRetryableError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "YouTubeWebSubRetryableError";
  }
}

export class YouTubeWebSubUnretryableError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "YouTubeWebSubUnretryableError";
  }
}
