import type { Tables } from "@streamos/database";
import {
  getRepurposingReviewStatusLabel,
  type RepurposingReviewEventRow,
  type RepurposingReviewStatus,
} from "@/app/dashboard/jobs/repurposing/review";

export type ContentJobRow = Tables<"content_jobs">;
export type ReviewEventRow = RepurposingReviewEventRow;

export type JobStatusFilter =
  | "all"
  | "pending"
  | "processing"
  | "failed"
  | "done";

export type RepurposingJobSummary = {
  confidence: string;
  generatedAt: string | null;
  manualReviewRequired: boolean;
  modelName: string | null;
  modelProvider: string | null;
  reviewStatus: RepurposingReviewStatus;
  reviewedAt: string | null;
  reviewerNotes: string | null;
  reviewedBy: string | null;
  sourceIdentifier: string;
  sourceProvider: string;
  sourceTitle: string | null;
  targetPlatforms: string[];
};

const SENSITIVE_KEY_PATTERNS = [
  /token/i,
  /secret/i,
  /key/i,
  /authorization/i,
  /cookie/i,
  /redis/i,
  /service_role/i,
  /api_gateway_secret/i,
  /webhook_secret/i,
  /openai/i,
  /railway/i,
  /private_url/i,
  /access_token/i,
  /refresh_token/i,
  /client_secret/i,
  /password/i,
] as const;

const STRING_REDACTIONS: Array<[RegExp, string]> = [
  [/\bredis(?:s)?::?\/\/[^\s"'`]+/gi, "[REDACTED_REDIS_URL]"],
  [/\bpostgres(?:ql)?::?\/\/[^\s"'`]+/gi, "[REDACTED_DATABASE_URL]"],
  [
    /\bhttps?:\/\/[^\s"'`]*railway\.app[^\s"'`]*/gi,
    "[public hosted railway url]",
  ],
  [
    /\bhttps?:\/\/[^\s"'`]*railway\.internal(?::\d+)?[^\s"'`]*/gi,
    "[private railway.internal url]",
  ],
  [/\bsk-[A-Za-z0-9_-]+\b/g, "[REDACTED_OPENAI_KEY]"],
  [/\bBearer\s+[A-Za-z0-9._-]+\b/gi, "Bearer [REDACTED]"],
];

export function resolveSelectedJob(
  filteredJobs: ContentJobRow[],
  selectedJobId: string | null,
): ContentJobRow | null {
  if (selectedJobId) {
    const selectedJob = filteredJobs.find((job) => job.id === selectedJobId);
    if (selectedJob) {
      return selectedJob;
    }
  }

  return filteredJobs[0] ?? null;
}

export function getEmptyStateMessage(
  filter: JobStatusFilter,
  jobCount: number,
): string {
  if (jobCount === 0) {
    return "No repurposing jobs found.";
  }

  switch (filter) {
    case "pending":
      return "Keine Repurposing-Jobs mit Status pending.";
    case "processing":
      return "Keine Repurposing-Jobs mit Status processing.";
    case "failed":
      return "Keine Repurposing-Jobs mit Status failed.";
    case "done":
      return "Keine Repurposing-Jobs mit Status done.";
    default:
      return "Keine Repurposing-Jobs gefunden.";
  }
}

export function getRepurposingJobTitle(job: ContentJobRow): string {
  const sourceTitle = readString(
    job.payload,
    "source_video_title",
    "source_title",
    "title",
  );
  const sourceVideoId = readString(
    job.payload,
    "source_video_id",
    "video_id",
    "stream_id",
  );

  return sourceTitle ?? sourceVideoId ?? job.queue_job_id ?? job.id;
}

export function getRepurposingJobPreview(job: ContentJobRow): string {
  if (job.error_message) {
    return job.error_message;
  }

  if (!isRecord(job.result)) {
    return isProcessingStatus(job.status)
      ? "Waiting for automation result..."
      : "Review bundle not stored yet.";
  }

  const shortFormPlan = readString(job.result, "short_form_plan");
  if (shortFormPlan) {
    return shortFormPlan;
  }

  const reviewNotes = readStringArray(job.result, "review_notes");
  if (reviewNotes) {
    return reviewNotes;
  }

  const warnings = readStringArray(job.result, "warnings");
  if (warnings) {
    return warnings;
  }

  return "Result stored";
}

export function getRepurposingJobSummary(
  job: ContentJobRow,
): RepurposingJobSummary {
  const sourceProvider = readString(
    job.payload,
    "source_provider",
    "sourceProvider",
  );
  const resultProvider = readString(job.result, "provider", "model_provider");
  const modelName = readString(job.result, "model", "model_name");
  const generatedAt = readString(job.result, "generated_at", "generatedAt");
  const targetPlatforms = readStringArrayList(
    job.result,
    "target_platforms",
  ).concat(readStringArrayList(job.payload, "target_platforms"));

  return {
    confidence: formatConfidence(readNumber(job.result, "confidence")),
    generatedAt,
    manualReviewRequired: readBoolean(
      job.result,
      "manual_review_required",
      "manualReviewRequired",
    ),
    modelName,
    modelProvider: resultProvider,
    reviewStatus: normalizeReviewStatus(job.review_status),
    reviewedAt: readString(job, "reviewed_at"),
    reviewedBy: readString(job, "reviewed_by"),
    reviewerNotes: readString(job, "reviewer_notes"),
    sourceIdentifier:
      readString(
        job.payload,
        "source_video_id",
        "video_id",
        "stream_id",
        "queue_job_id",
      ) ??
      job.queue_job_id ??
      job.id,
    sourceProvider: sourceProvider ?? "Not available",
    sourceTitle: readString(
      job.payload,
      "source_video_title",
      "source_title",
      "title",
    ),
    targetPlatforms: dedupeStrings(targetPlatforms),
  };
}

export function buildRepurposingReviewBundle(job: ContentJobRow): string {
  const summary = getRepurposingJobSummary(job);
  const rawPayload = formatSanitizedJsonBlock(job.payload);
  const rawResult = formatSanitizedJsonBlock(job.result);

  return [
    `Repurposing review bundle: ${getRepurposingJobTitle(job)}`,
    `job_id: ${job.id}`,
    `queue_job_id: ${job.queue_job_id ?? "not assigned"}`,
    `status: ${job.status}`,
    `retry_count: ${job.retry_count}/${job.max_retries}`,
    `source_provider: ${summary.sourceProvider}`,
    `source_identifier: ${summary.sourceIdentifier}`,
    `target_platforms: ${summary.targetPlatforms.length > 0 ? summary.targetPlatforms.join(", ") : "Not available"}`,
    `generated_at: ${summary.generatedAt ?? "Not available"}`,
    `model_provider: ${summary.modelProvider ?? "Not available"}`,
    `model_name: ${summary.modelName ?? "Not available"}`,
    `manual_review_required: ${summary.manualReviewRequired ? "true" : "false"}`,
    `review_status: ${getRepurposingReviewStatusLabel(summary.reviewStatus)}`,
    `reviewed_at: ${summary.reviewedAt ?? "Not available"}`,
    `reviewed_by: ${summary.reviewedBy ?? "Not available"}`,
    `reviewer_notes: ${sanitizeRepurposingFreeformText(summary.reviewerNotes ?? "Not available")}`,
    `confidence: ${summary.confidence}`,
    "",
    "short_form_plan:",
    sanitizeRepurposingFreeformText(
      readString(job.result, "short_form_plan") ?? "Not available",
    ),
    "",
    "review_notes:",
    sanitizeRepurposingFreeformText(
      readStringArray(job.result, "review_notes"),
    ),
    "",
    "warnings:",
    sanitizeRepurposingFreeformText(readStringArray(job.result, "warnings")),
    "",
    "raw_payload:",
    rawPayload,
    "",
    "raw_result:",
    rawResult,
  ].join("\n");
}

export function formatSanitizedJsonBlock(value: unknown): string {
  if (value === null || value === undefined) {
    return "Not available";
  }

  try {
    return JSON.stringify(sanitizeRepurposingRawValue(value), null, 2);
  } catch {
    return "Not available";
  }
}

export function sanitizeRepurposingRawValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeRepurposingRawValue(item));
  }

  if (!isRecord(value)) {
    if (typeof value === "string") {
      return sanitizeString(value);
    }

    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry], index) => {
      const keyIsSensitive = isSensitiveKey(key);

      return [
        keyIsSensitive ? `[REDACTED_${index + 1}]` : key,
        keyIsSensitive ? "[REDACTED]" : sanitizeRepurposingRawValue(entry),
      ];
    }),
  );
}

function isProcessingStatus(status: ContentJobRow["status"]): boolean {
  return status === "running" || status === "processing";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function sanitizeString(value: string): string {
  return STRING_REDACTIONS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    value,
  );
}

function readString(value: unknown, ...keys: string[]): string | null {
  if (!isRecord(value)) {
    return null;
  }

  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
  }

  return null;
}

function readStringArray(value: unknown, key: string): string {
  const entries = readStringArrayList(value, key);
  return entries.length > 0 ? entries.join("\n\n") : "Not available";
}

function readStringArrayList(value: unknown, key: string): string[] {
  if (!isRecord(value)) {
    return [];
  }

  const candidate = value[key];
  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate.filter((item): item is string => typeof item === "string");
}

function readBoolean(value: unknown, ...keys: string[]): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return keys.some((key) => value[key] === true);
}

function readNumber(value: unknown, ...keys: string[]): number | null {
  if (!isRecord(value)) {
    return null;
  }

  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
  }

  return null;
}

function formatConfidence(value: number | null): string {
  return typeof value === "number" ? `${value}/100` : "Not available";
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function sanitizeRepurposingFreeformText(value: string): string {
  return sanitizeString(value);
}

function normalizeReviewStatus(status: unknown): RepurposingReviewStatus {
  switch (status) {
    case "approved":
    case "rejected":
    case "needs_changes":
    case "needs_review":
      return status as RepurposingReviewStatus;
    default:
      return "needs_review";
  }
}
