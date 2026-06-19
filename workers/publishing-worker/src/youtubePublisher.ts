import { z } from "zod";

const YOUTUBE_UPLOAD_INIT_URL =
  "https://www.googleapis.com/upload/youtube/v3/videos";
const YOUTUBE_VIDEOS_LIST_URL = "https://www.googleapis.com/youtube/v3/videos";
const YOUTUBE_VIDEO_URL = "https://www.youtube.com/watch?v=";
const DEFAULT_YOUTUBE_VISIBILITY = "private";

const youtubeUploadSessionResponseSchema = z.object({
  id: z.string().trim().min(1),
});

const youtubeVideosListResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().trim().min(1),
      processingDetails: z
        .object({
          processingStatus: z.string().trim().min(1).optional(),
        })
        .optional(),
      status: z
        .object({
          privacyStatus: z.enum(["private", "public", "unlisted"]).optional(),
          rejectionReason: z.string().trim().min(1).optional(),
          uploadStatus: z.string().trim().min(1).optional(),
        })
        .optional(),
    }),
  ),
});

const youtubeTokenRefreshResponseSchema = z.object({
  access_token: z.string().trim().min(1),
  expires_in: z.number().int().positive().optional(),
  refresh_token: z.string().trim().min(1).optional(),
  scope: z.string().trim().min(1).optional(),
});

export class YouTubePublishError extends Error {
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
    this.name = "YouTubePublishError";
    this.code = details.code;
    this.httpStatus = details.httpStatus;
    this.retryAfterSeconds = details.retryAfterSeconds;
    this.retryable = details.retryable;
    this.upstreamStatus = details.upstreamStatus;
  }
}

export async function publishYouTubeVideo({
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
}): Promise<{ externalPostId: string; externalUrl: string }> {
  const normalizedTitle = title.trim();
  const normalizedDescription = description.trim();
  const normalizedHashtags = normalizeHashtags(hashtags);
  const normalizedVisibility = normalizeVisibility(visibility);
  const assetResponse = await fetchFn(assetUrl, { signal });

  if (!assetResponse.ok) {
    throw buildYouTubeApiError({
      context: "publishable asset fetch",
      defaultCode: "publishable_asset_missing",
      response: assetResponse,
    });
  }

  const assetBytes = new Uint8Array(await assetResponse.arrayBuffer());
  const contentType =
    assetResponse.headers.get("content-type")?.split(";")[0]?.trim() ||
    "video/mp4";
  const initUrl = new URL(YOUTUBE_UPLOAD_INIT_URL);
  initUrl.searchParams.set("part", "snippet,status");
  initUrl.searchParams.set("uploadType", "resumable");

  const initResponse = await fetchFn(initUrl, {
    body: JSON.stringify({
      snippet: {
        description: normalizedDescription,
        tags: normalizedHashtags,
        title: normalizedTitle,
      },
      status: {
        privacyStatus: normalizedVisibility,
      },
    }),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=utf-8",
      "X-Upload-Content-Length": String(assetBytes.byteLength),
      "X-Upload-Content-Type": contentType,
    },
    method: "POST",
    signal,
  });

  if (!initResponse.ok) {
    throw buildYouTubeApiError({
      context: "upload initialization",
      defaultCode: "upload_initiation_failed",
      response: initResponse,
    });
  }

  const uploadLocation = initResponse.headers.get("location");
  if (!uploadLocation) {
    throw new YouTubePublishError(
      "YouTube resumable upload did not return a session location.",
      {
        code: "upload_session_missing",
        httpStatus: initResponse.status,
        retryable: false,
        upstreamStatus: initResponse.status,
      },
    );
  }

  const uploadResponse = await fetchFn(new URL(uploadLocation, initUrl), {
    body: assetBytes,
    headers: {
      "Content-Length": String(assetBytes.byteLength),
      "Content-Type": contentType,
      "Content-Range": `bytes 0-${Math.max(assetBytes.byteLength - 1, 0)}/${assetBytes.byteLength}`,
    },
    method: "PUT",
    signal,
  });

  if (!uploadResponse.ok) {
    throw buildYouTubeApiError({
      context: "video upload",
      defaultCode: "upload_execution_failed",
      response: uploadResponse,
    });
  }

  const payload = youtubeUploadSessionResponseSchema.parse(
    await uploadResponse.json(),
  );

  return {
    externalPostId: payload.id,
    externalUrl: `${YOUTUBE_VIDEO_URL}${payload.id}`,
  };
}

export async function fetchYouTubePublicationState({
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
  remoteUrl: string;
  rejectionReason: string | null;
}> {
  const stateUrl = new URL(YOUTUBE_VIDEOS_LIST_URL);
  stateUrl.searchParams.set("part", "status,processingDetails");
  stateUrl.searchParams.set("id", externalPostId);

  const response = await fetchFn(stateUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    method: "GET",
    signal,
  });

  if (!response.ok) {
    throw buildYouTubePublicationStateError({
      context: "publication reconciliation",
      response,
    });
  }

  const payload = youtubeVideosListResponseSchema.parse(await response.json());
  const item = payload.items[0];
  if (!item) {
    throw new YouTubePublishError(
      "YouTube publication reconciliation returned no items.",
      {
        code: "remote_post_missing",
        httpStatus: 404,
        retryable: false,
        upstreamStatus: 404,
      },
    );
  }

  const remoteUploadStatus = item.status?.uploadStatus ?? null;
  const remoteProcessingStatus =
    item.processingDetails?.processingStatus ?? null;
  const rejectionReason = item.status?.rejectionReason ?? null;
  const effectiveVisibility = normalizePublicationVisibility(
    item.status?.privacyStatus,
  );

  return {
    effectiveVisibility,
    remotePostId: item.id,
    remoteProcessingStatus,
    remoteStatus: derivePublicationRemoteStatus({
      rejectionReason,
      remoteProcessingStatus,
      remoteUploadStatus,
    }),
    remoteUploadStatus,
    remoteUrl: `${YOUTUBE_VIDEO_URL}${item.id}`,
    rejectionReason,
  };
}

export async function refreshYouTubeAccessToken({
  fetchFn = fetch,
  refreshToken,
  workerConfig,
}: {
  fetchFn?: typeof fetch;
  refreshToken: string;
  workerConfig: {
    youtubeClientId: string;
    youtubeClientSecret: string;
  };
}): Promise<{
  accessToken: string;
  expiresAt: string | null;
  refreshToken: string | null;
  scopes: string[] | null;
}> {
  const response = await fetchFn("https://oauth2.googleapis.com/token", {
    body: new URLSearchParams({
      client_id: workerConfig.youtubeClientId,
      client_secret: workerConfig.youtubeClientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw buildYouTubeApiError({
      context: "token refresh",
      defaultCode: "token_refresh_failed",
      response,
    });
  }

  const payload = youtubeTokenRefreshResponseSchema.parse(
    await response.json(),
  );
  return {
    accessToken: payload.access_token,
    expiresAt: secondsFromNowToIso(payload.expires_in),
    refreshToken: payload.refresh_token ?? null,
    scopes: payload.scope?.trim().split(/\s+/).filter(Boolean) ?? null,
  };
}

function normalizeHashtags(hashtags: string[]): string[] {
  return [
    ...new Set(hashtags.map((hashtag) => hashtag.trim()).filter(Boolean)),
  ];
}

function normalizeVisibility(visibility: string): string {
  if (visibility === "public" || visibility === "unlisted") {
    return visibility;
  }

  return DEFAULT_YOUTUBE_VISIBILITY;
}

function normalizePublicationVisibility(
  visibility: string | undefined,
): "private" | "public" | "unknown" | "unlisted" {
  if (
    visibility === "private" ||
    visibility === "public" ||
    visibility === "unlisted"
  ) {
    return visibility;
  }

  return "unknown";
}

export function buildYouTubeApiError({
  context,
  defaultCode,
  response,
}: {
  context: string;
  defaultCode: string;
  response: Response;
}): YouTubePublishError {
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
      ? `YouTube ${context} rate limited with ${response.status}.`
      : `YouTube ${context} failed with ${response.status}.`;

  return new YouTubePublishError(message, {
    code,
    httpStatus: response.status,
    retryAfterSeconds,
    retryable,
    upstreamStatus: response.status,
  });
}

export function buildYouTubePublicationStateError({
  context,
  response,
}: {
  context: string;
  response: Response;
}): YouTubePublishError {
  const retryAfterSeconds = parseRetryAfterSeconds(
    response.headers.get("retry-after"),
  );
  const retryable = response.status >= 500 && response.status < 600;
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
      ? `YouTube ${context} could not find the remote post.`
      : response.status === 429
        ? `YouTube ${context} rate limited with ${response.status}.`
        : `YouTube ${context} failed with ${response.status}.`;

  return new YouTubePublishError(message, {
    code,
    httpStatus: response.status,
    retryAfterSeconds,
    retryable:
      response.status === 429 ||
      response.status === 401 ||
      response.status === 403 ||
      retryable,
    upstreamStatus: response.status,
  });
}

function derivePublicationRemoteStatus({
  rejectionReason,
  remoteProcessingStatus,
  remoteUploadStatus,
}: {
  rejectionReason: string | null;
  remoteProcessingStatus: string | null;
  remoteUploadStatus: string | null;
}): "missing" | "processing" | "published" | "rejected" | "unknown" {
  if (rejectionReason || remoteUploadStatus === "rejected") {
    return "rejected";
  }

  if (
    remoteProcessingStatus === "processing" ||
    remoteProcessingStatus === "pending" ||
    remoteUploadStatus === "uploaded"
  ) {
    return "processing";
  }

  if (remoteUploadStatus || remoteProcessingStatus) {
    return "published";
  }

  return "unknown";
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
