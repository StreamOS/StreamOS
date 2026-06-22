import { z } from "zod";

const TIKTOK_INIT_URL =
  "https://open.tiktokapis.com/v2/post/publish/video/init/";
const TIKTOK_STATUS_URL =
  "https://open.tiktokapis.com/v2/post/publish/status/fetch/";
const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";

const tikTokInitResponseSchema = z.object({
  data: z.object({
    publish_id: z.string().trim().min(1),
  }),
});

const tikTokStatusResponseSchema = z.object({
  data: z
    .object({
      publish_id: z.string().trim().min(1).optional(),
      status: z.string().trim().min(1).optional(),
      video_id: z.string().trim().min(1).optional(),
      share_url: z.string().trim().min(1).optional(),
      fail_reason: z.string().trim().min(1).optional(),
      privacy_level: z.string().trim().min(1).optional(),
      upload_status: z.string().trim().min(1).optional(),
    })
    .optional(),
});

const tikTokTokenRefreshResponseSchema = z.object({
  access_token: z.string().trim().min(1),
  expires_in: z.number().int().positive().optional(),
  refresh_token: z.string().trim().min(1).optional(),
  scope: z.string().trim().min(1).optional(),
});

export class TikTokPublishError extends Error {
  code: string;
  httpStatus: number;
  retryAfterSeconds?: number;
  retryable: boolean;
  upstreamStatus: number;

  constructor(
    message: string,
    details: {
      code: string;
      httpStatus: number;
      retryAfterSeconds?: number;
      retryable: boolean;
      upstreamStatus: number;
    },
  ) {
    super(message);
    this.name = "TikTokPublishError";
    this.code = details.code;
    this.httpStatus = details.httpStatus;
    this.retryAfterSeconds = details.retryAfterSeconds;
    this.retryable = details.retryable;
    this.upstreamStatus = details.upstreamStatus;
  }
}

export async function publishTikTokVideo({
  accessToken,
  assetUrl,
  description,
  fetchFn = fetch,
  hashtags,
  signal,
  title,
  visibility,
}: {
  accessToken: string;
  assetUrl: string;
  description: string;
  fetchFn?: typeof fetch;
  hashtags: string[];
  signal?: AbortSignal;
  title: string;
  visibility: string;
}): Promise<{ externalPostId: string; externalUrl: string | null }> {
  const response = await fetchFn(TIKTOK_INIT_URL, {
    body: JSON.stringify({
      post_info: {
        disable_comment: false,
        disable_duet: false,
        disable_stitch: false,
        privacy_level: normalizePrivacyLevel(visibility),
        title: buildTikTokCaption(title, description, hashtags),
      },
      source_info: {
        source: "PULL_FROM_URL",
        video_url: assetUrl,
      },
    }),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    method: "POST",
    signal,
  });

  if (!response.ok) {
    throw buildTikTokApiError({
      context: "publish initialization",
      defaultCode: "publish_initiation_failed",
      response,
    });
  }

  const payload = tikTokInitResponseSchema.parse(await response.json());
  return {
    externalPostId: payload.data.publish_id,
    externalUrl: null,
  };
}

export async function fetchTikTokPublicationState({
  accessToken,
  externalPostId,
  fetchFn = fetch,
  signal,
}: {
  accessToken: string;
  externalPostId: string;
  fetchFn?: typeof fetch;
  signal?: AbortSignal;
}): Promise<{
  effectiveVisibility: "private" | "public" | "unknown" | "unlisted";
  remotePostId: string;
  remoteProcessingStatus: string | null;
  remoteStatus: "missing" | "processing" | "published" | "rejected" | "unknown";
  remoteUploadStatus: string | null;
  remoteUrl: string | null;
  rejectionReason: string | null;
  providerStatus: string | null;
  providerUploadStatus: string | null;
}> {
  const response = await fetchFn(TIKTOK_STATUS_URL, {
    body: JSON.stringify({
      publish_id: externalPostId,
    }),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    method: "POST",
    signal,
  });

  if (!response.ok) {
    throw buildTikTokApiError({
      context: "publication reconciliation",
      defaultCode: "status_fetch_failed",
      response,
    });
  }

  const payload = tikTokStatusResponseSchema.parse(await response.json());
  const data = payload.data ?? {};
  const providerStatus = data.status ?? null;
  const providerUploadStatus = data.upload_status ?? null;
  const remoteStatus = derivePublicationRemoteStatus(providerStatus);
  const remoteUploadStatus = providerUploadStatus ?? providerStatus;
  const rejectionReason = data.fail_reason ?? null;
  const effectiveVisibility = normalizePrivacyLevel(data.privacy_level);

  return {
    effectiveVisibility,
    remotePostId: data.video_id ?? data.publish_id ?? externalPostId,
    remoteProcessingStatus: providerStatus,
    remoteStatus,
    remoteUploadStatus,
    remoteUrl: data.share_url ?? null,
    rejectionReason,
    providerStatus,
    providerUploadStatus,
  };
}

export async function refreshTikTokAccessToken({
  clientKey,
  clientSecret,
  fetchFn = fetch,
  refreshToken,
}: {
  clientKey: string;
  clientSecret: string;
  fetchFn?: typeof fetch;
  refreshToken: string;
}): Promise<{
  accessToken: string;
  expiresAt: string | null;
  refreshToken: string | null;
  scopes: string[] | null;
}> {
  const response = await fetchFn(TIKTOK_TOKEN_URL, {
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw buildTikTokApiError({
      context: "token refresh",
      defaultCode: "token_refresh_failed",
      response,
    });
  }

  const payload = tikTokTokenRefreshResponseSchema.parse(await response.json());
  return {
    accessToken: payload.access_token,
    expiresAt: secondsFromNowToIso(payload.expires_in),
    refreshToken: payload.refresh_token ?? null,
    scopes: payload.scope?.trim().split(/\s+/).filter(Boolean) ?? null,
  };
}

export function buildTikTokApiError({
  context,
  defaultCode,
  response,
}: {
  context: string;
  defaultCode: string;
  response: Response;
}): TikTokPublishError {
  const retryAfterSeconds = parseRetryAfterSeconds(
    response.headers.get("retry-after"),
  );
  const retryable =
    response.status === 429 ||
    (response.status >= 500 && response.status < 600);
  const code =
    response.status === 429
      ? "provider_rate_limited"
      : response.status === 401 || response.status === 403
        ? `${defaultCode}_unauthorized`
        : retryable
          ? `${defaultCode}_retryable`
          : defaultCode;
  const message =
    response.status === 429
      ? `TikTok ${context} rate limited with ${response.status}.`
      : `TikTok ${context} failed with ${response.status}.`;

  return new TikTokPublishError(message, {
    code,
    httpStatus: response.status,
    retryAfterSeconds,
    retryable,
    upstreamStatus: response.status,
  });
}

export function buildTikTokPublicationStateError({
  context,
  response,
}: {
  context: string;
  response: Response;
}): TikTokPublishError {
  const retryAfterSeconds = parseRetryAfterSeconds(
    response.headers.get("retry-after"),
  );
  const retryable =
    response.status === 429 ||
    (response.status >= 500 && response.status < 600);
  const code =
    response.status === 429
      ? "provider_rate_limited"
      : response.status === 401 || response.status === 403
        ? "provider_unauthorized"
        : response.status === 404
          ? "remote_post_missing"
          : retryable
            ? "provider_unavailable"
            : "provider_fetch_failed";
  const message =
    response.status === 404
      ? `TikTok ${context} could not find the remote post.`
      : response.status === 429
        ? `TikTok ${context} rate limited with ${response.status}.`
        : `TikTok ${context} failed with ${response.status}.`;

  return new TikTokPublishError(message, {
    code,
    httpStatus: response.status,
    retryAfterSeconds,
    retryable,
    upstreamStatus: response.status,
  });
}

function buildTikTokCaption(
  title: string,
  description: string,
  hashtags: string[],
): string {
  const captionParts = [
    title.trim(),
    description.trim(),
    normalizeHashtags(hashtags),
  ];

  return captionParts.filter(Boolean).join("\n\n");
}

function derivePublicationRemoteStatus(
  status: string | null,
): "missing" | "processing" | "published" | "rejected" | "unknown" {
  const normalizedStatus = status?.trim().toLowerCase() ?? "";

  if (
    normalizedStatus.includes("reject") ||
    normalizedStatus.includes("fail") ||
    normalizedStatus === "canceled" ||
    normalizedStatus === "cancelled"
  ) {
    return "rejected";
  }

  if (
    normalizedStatus.includes("process") ||
    normalizedStatus.includes("pending") ||
    normalizedStatus.includes("upload") ||
    normalizedStatus.includes("progress")
  ) {
    return "processing";
  }

  if (
    normalizedStatus.includes("success") ||
    normalizedStatus.includes("publish") ||
    normalizedStatus.includes("done") ||
    normalizedStatus.includes("complete")
  ) {
    return "published";
  }

  return normalizedStatus ? "unknown" : "missing";
}

function normalizeHashtags(hashtags: string[]): string {
  return [...new Set(hashtags.map((hashtag) => hashtag.trim()).filter(Boolean))]
    .map((hashtag) => (hashtag.startsWith("#") ? hashtag : `#${hashtag}`))
    .join(" ");
}

function normalizePrivacyLevel(
  privacyLevel: string | undefined,
): "private" | "public" | "unknown" | "unlisted" {
  switch (privacyLevel) {
    case "PUBLIC_TO_EVERYONE":
      return "public";
    case "SELF_ONLY":
      return "private";
    case "FOLLOWER_OF_CREATOR":
    case "MUTUAL_FOLLOW_FRIENDS":
      return "unknown";
    default:
      return "unknown";
  }
}

function parseRetryAfterSeconds(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value.trim());
  if (Number.isInteger(parsed) && parsed >= 0) {
    return parsed;
  }

  return undefined;
}

function secondsFromNowToIso(expiresIn?: number): string | null {
  if (
    typeof expiresIn !== "number" ||
    !Number.isFinite(expiresIn) ||
    expiresIn <= 0
  ) {
    return null;
  }

  return new Date(Date.now() + expiresIn * 1000).toISOString();
}
