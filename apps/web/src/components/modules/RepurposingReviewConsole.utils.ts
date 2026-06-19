import type { Tables } from "@streamos/database";
import {
  getRepurposingReviewStatusLabel,
  getRepurposingExportTemplateLabel,
  type RepurposingExportEventRow,
  type RepurposingExportEventType,
  type RepurposingExportTemplateKey,
  type RepurposingExportTargetPlatform,
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

function isDoneStatus(status: ContentJobRow["status"]): boolean {
  return status === "done" || status === "completed";
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

function readStringMatrix(value: unknown, key: string): string[][] {
  if (!isRecord(value)) {
    return [];
  }

  const candidate = value[key];
  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate
    .map((entry) =>
      Array.isArray(entry)
        ? entry.filter((item): item is string => typeof item === "string")
        : [],
    )
    .filter((entry) => entry.length > 0);
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

function pickIndexedString(values: string[], index: number): string | null {
  if (values.length === 0) {
    return null;
  }

  const normalizedIndex = clampIndex(index, values.length);
  const candidate = values[normalizedIndex]?.trim();

  return candidate && candidate.length > 0 ? sanitizeString(candidate) : null;
}

function pickIndexedArray(values: string[][], index: number): string[] {
  if (values.length === 0) {
    return [];
  }

  const normalizedIndex = clampIndex(index, values.length);

  return (values[normalizedIndex] ?? [])
    .map((item) => sanitizeString(item.trim()))
    .filter(Boolean);
}

function clampIndex(index: number, length: number): number {
  if (!Number.isFinite(index) || length <= 1) {
    return 0;
  }

  return Math.min(Math.max(Math.trunc(index), 0), length - 1);
}

function hasExportableRepurposingResult(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return (
    [
      readStringArrayList(value, "title_suggestions"),
      readStringArrayList(value, "captions"),
      readStringArrayList(value, "descriptions"),
      readStringArrayList(value, "hook_ideas"),
      readStringArrayList(value, "review_notes"),
      readStringArrayList(value, "warnings"),
      readStringMatrix(value, "hashtag_sets").flat(),
    ].some((candidate) => candidate.length > 0) ||
    Boolean(readString(value, "short_form_plan"))
  );
}

function buildApprovedRepurposingExportBundleText({
  caption,
  description,
  generatedAt,
  hashtags,
  hook,
  job,
  reviewNotes,
  reviewedAt,
  reviewedBy,
  reviewerNotes,
  selectedTargetPlatform,
  selectedTitle,
  shortFormPlan,
  sourceProvider,
  sourceTitle,
  warnings,
}: {
  caption: string | null;
  description: string | null;
  generatedAt: string | null;
  hashtags: string[];
  hook: string | null;
  job: ContentJobRow;
  reviewNotes: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewerNotes: string | null;
  selectedTargetPlatform: string | null;
  selectedTitle: string | null;
  shortFormPlan: string | null;
  sourceProvider: string;
  sourceTitle: string;
  warnings: string;
}): string {
  return [
    "Approved Repurposing Export Bundle",
    `job_id: ${job.id}`,
    `queue_job_id: ${job.queue_job_id ?? "not assigned"}`,
    `source_provider: ${sourceProvider}`,
    `source_title: ${sanitizeString(sourceTitle)}`,
    `target_platform: ${selectedTargetPlatform ?? "Not available"}`,
    `title: ${selectedTitle ?? "Not available"}`,
    `caption: ${caption ?? "Not available"}`,
    `description: ${description ?? "Not available"}`,
    `hashtags: ${hashtags.length > 0 ? hashtags.join(" ") : "Not available"}`,
    `hook: ${hook ?? "Not available"}`,
    `short_form_plan: ${sanitizeRepurposingFreeformText(shortFormPlan ?? "Not available")}`,
    `review_notes: ${sanitizeRepurposingFreeformText(reviewNotes)}`,
    `reviewer_notes: ${sanitizeRepurposingFreeformText(reviewerNotes ?? "Not available")}`,
    `warnings: ${sanitizeRepurposingFreeformText(warnings)}`,
    `generated_at: ${generatedAt ?? "Not available"}`,
    `reviewed_at: ${reviewedAt ?? "Not available"}`,
    `reviewed_by: ${reviewedBy ?? "Not available"}`,
    "status_note: Manually reviewed. Not auto-published.",
  ].join("\n");
}

export function sanitizeRepurposingFreeformText(value: string): string {
  return sanitizeString(value);
}

export type RepurposingExportSelection = {
  captionIndex: number;
  descriptionIndex: number;
  hashtagSetIndex: number;
  hookIdeaIndex: number;
  targetPlatformIndex: number;
  titleSuggestionIndex: number;
};

export type RepurposingExportBundleDetails = {
  bundleText: string;
  caption: string | null;
  captionSuggestions: string[];
  description: string | null;
  descriptionSuggestions: string[];
  eligible: boolean;
  generatedAt: string | null;
  hashtags: string[];
  hashtagSets: string[][];
  hook: string | null;
  hookIdeas: string[];
  manualReviewRequired: boolean;
  reason: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewerNotes: string | null;
  shortFormPlan: string | null;
  sourceProvider: string;
  sourceTitle: string;
  targetPlatform: string | null;
  targetPlatforms: string[];
  title: string | null;
  titleSuggestions: string[];
  warnings: string | null;
};

export type RepurposingExportTemplateDetails = {
  body: string;
  eligible: boolean;
  reason: string | null;
  targetPlatform: RepurposingExportTargetPlatform;
  templateKey: RepurposingExportTemplateKey;
  title: string;
};

export type RepurposingExportHistoryEntry = {
  actorLabel: string;
  bundleHash: string | null;
  contentJobId: string;
  createdAt: string;
  eventType: RepurposingExportEventType;
  metadataSummary: string | null;
  reviewStatusAtExport: RepurposingReviewStatus;
  source: string;
  targetPlatform: RepurposingExportTargetPlatform;
  templateKey: RepurposingExportTemplateKey;
};

export type RepurposingExportAnalyticsSummary = {
  approvedJobsWithoutExport: number;
  exportsByEventType: Record<RepurposingExportEventType, number>;
  exportsByPlatform: Record<RepurposingExportTargetPlatform, number>;
  exportsByTemplate: Record<RepurposingExportTemplateKey, number>;
  exportsLast30Days: number;
  exportsLast7Days: number;
  latestExportAt: string | null;
  totalExports: number;
  topPlatform: RepurposingExportTargetPlatform | null;
};

type RepurposingExportPlatformTemplateKey = Exclude<
  RepurposingExportTemplateKey,
  "bundle"
>;

export function getDefaultRepurposingExportSelection(
  _job: ContentJobRow | null | undefined,
): RepurposingExportSelection {
  return {
    captionIndex: 0,
    descriptionIndex: 0,
    hashtagSetIndex: 0,
    hookIdeaIndex: 0,
    targetPlatformIndex: 0,
    titleSuggestionIndex: 0,
  };
}

export function getRepurposingExportEligibility(job: ContentJobRow): {
  eligible: boolean;
  reason: string | null;
} {
  const summary = getRepurposingJobSummary(job);

  if (job.job_type !== "repurposing" || job.type !== "repurposing") {
    return {
      eligible: false,
      reason: "Only repurposing jobs are exportable.",
    };
  }

  if (!isDoneStatus(job.status)) {
    return {
      eligible: false,
      reason: "Export is available only after the job is done.",
    };
  }

  if (!summary.manualReviewRequired) {
    return {
      eligible: false,
      reason: "This job does not require manual review.",
    };
  }

  if (summary.reviewStatus !== "approved") {
    return {
      eligible: false,
      reason: "Export becomes available after approval.",
    };
  }

  if (!hasExportableRepurposingResult(job.result)) {
    return {
      eligible: false,
      reason: "Approved result does not contain exportable suggestions.",
    };
  }

  return {
    eligible: true,
    reason: null,
  };
}

export function getRepurposingExportBundleDetails(
  job: ContentJobRow,
  selection: Partial<RepurposingExportSelection> = {},
): RepurposingExportBundleDetails {
  const summary = getRepurposingJobSummary(job);
  const titleSuggestions = readStringArrayList(job.result, "title_suggestions");
  const captionSuggestions = readStringArrayList(job.result, "captions");
  const descriptionSuggestions = readStringArrayList(
    job.result,
    "descriptions",
  );
  const hookIdeas = readStringArrayList(job.result, "hook_ideas");
  const hashtagSets = readStringMatrix(job.result, "hashtag_sets");
  const targetPlatforms = dedupeStrings(summary.targetPlatforms);
  const selectedTitle = pickIndexedString(
    titleSuggestions,
    selection.titleSuggestionIndex ?? 0,
  );
  const selectedCaption = pickIndexedString(
    captionSuggestions,
    selection.captionIndex ?? 0,
  );
  const selectedDescription = pickIndexedString(
    descriptionSuggestions,
    selection.descriptionIndex ?? 0,
  );
  const selectedHook = pickIndexedString(
    hookIdeas,
    selection.hookIdeaIndex ?? 0,
  );
  const selectedTargetPlatform = pickIndexedString(
    targetPlatforms,
    selection.targetPlatformIndex ?? 0,
  );
  const selectedHashtags = pickIndexedArray(
    hashtagSets,
    selection.hashtagSetIndex ?? 0,
  );
  const shortFormPlan = readString(job.result, "short_form_plan");
  const reviewerNotes = readString(job, "reviewer_notes");
  const warnings = readStringArray(job.result, "warnings");
  const eligibility = getRepurposingExportEligibility(job);

  return {
    bundleText: eligibility.eligible
      ? buildApprovedRepurposingExportBundleText({
          caption: selectedCaption,
          description: selectedDescription,
          generatedAt: summary.generatedAt,
          hashtags: selectedHashtags,
          hook: selectedHook,
          job,
          reviewNotes: readStringArray(job.result, "review_notes"),
          reviewedAt: summary.reviewedAt,
          reviewedBy: summary.reviewedBy,
          reviewerNotes,
          selectedTargetPlatform,
          selectedTitle,
          shortFormPlan,
          sourceProvider: summary.sourceProvider,
          sourceTitle: summary.sourceTitle ?? getRepurposingJobTitle(job),
          warnings,
        })
      : "",
    caption: selectedCaption,
    captionSuggestions,
    description: selectedDescription,
    descriptionSuggestions,
    eligible: eligibility.eligible,
    generatedAt: summary.generatedAt,
    hashtags: selectedHashtags,
    hashtagSets,
    hook: selectedHook,
    hookIdeas,
    manualReviewRequired: summary.manualReviewRequired,
    reason: eligibility.reason,
    reviewedAt: summary.reviewedAt,
    reviewedBy: summary.reviewedBy,
    reviewerNotes,
    shortFormPlan,
    sourceProvider: summary.sourceProvider,
    sourceTitle: summary.sourceTitle ?? getRepurposingJobTitle(job),
    targetPlatform: selectedTargetPlatform,
    targetPlatforms,
    title: selectedTitle,
    titleSuggestions,
    warnings,
  };
}

export function buildApprovedRepurposingExportBundle(
  job: ContentJobRow,
  selection: Partial<RepurposingExportSelection> = {},
): string {
  return getRepurposingExportBundleDetails(job, selection).bundleText;
}

export function buildRepurposingExportTemplateText(
  job: ContentJobRow,
  templateKey: RepurposingExportPlatformTemplateKey,
  selection: Partial<RepurposingExportSelection> = {},
): string {
  const bundle = getRepurposingExportBundleDetails(job, selection);
  const summary = getRepurposingJobSummary(job);

  if (!bundle.eligible) {
    return "";
  }

  const sourceTitle = bundle.sourceTitle ?? getRepurposingJobTitle(job);
  const targetPlatformLabel =
    templateKey === "tiktok" ? "TikTok" : "YouTube Shorts";
  const hashtags =
    bundle.hashtags.length > 0 ? bundle.hashtags.join(" ") : "Not available";
  const reviewNotes = sanitizeRepurposingFreeformText(
    readStringArray(job.result, "review_notes"),
  );
  const warnings = sanitizeRepurposingFreeformText(
    bundle.warnings ?? "Not available",
  );
  const shortFormPlan = sanitizeRepurposingFreeformText(
    bundle.shortFormPlan ?? "Not available",
  );
  const caption = bundle.caption ?? "Not available";
  const description = bundle.description ?? "Not available";
  const hook = bundle.hook ?? "Not available";
  const title = bundle.title ?? "Not available";
  const baseLines = [
    `Approved ${getRepurposingExportTemplateLabel(templateKey)}`,
    `source_provider: ${bundle.sourceProvider}`,
    `source_title: ${sanitizeString(sourceTitle)}`,
    `target_platform: ${targetPlatformLabel}`,
    `target_platforms: ${
      bundle.targetPlatforms.length > 0
        ? bundle.targetPlatforms.join(", ")
        : "Not available"
    }`,
    `confidence: ${summary.confidence}`,
    `manual_review_required: ${bundle.manualReviewRequired ? "true" : "false"}`,
  ];

  if (templateKey === "tiktok") {
    return [
      ...baseLines,
      "",
      "HOOK",
      hook,
      "",
      "CAPTION",
      caption,
      "",
      "HASHTAGS",
      hashtags,
      "",
      "SHORT-FORM PLAN NOTES",
      shortFormPlan,
      "",
      "REVIEW WARNINGS",
      warnings,
      "",
      "status_note: Manually reviewed. Not auto-published.",
    ].join("\n");
  }

  return [
    ...baseLines,
    "",
    "TITLE",
    title,
    "",
    "DESCRIPTION",
    description,
    "",
    "HASHTAGS",
    hashtags,
    "",
    "SHORTS HOOK",
    hook,
    "",
    "SHORT-FORM PLAN",
    shortFormPlan,
    "",
    "REVIEW NOTES",
    reviewNotes,
    "",
    "REVIEW WARNINGS",
    warnings,
    "",
    "status_note: Manually reviewed. Not auto-published.",
  ].join("\n");
}

export function getRepurposingExportTemplateDetails(
  job: ContentJobRow,
  templateKey: RepurposingExportPlatformTemplateKey,
  selection: Partial<RepurposingExportSelection> = {},
): RepurposingExportTemplateDetails {
  const eligibleDetails = getRepurposingExportEligibility(job);
  const body = buildRepurposingExportTemplateText(job, templateKey, selection);

  return {
    body,
    eligible: eligibleDetails.eligible,
    reason: eligibleDetails.reason,
    targetPlatform: templateKey,
    templateKey,
    title: getRepurposingExportTemplateLabel(templateKey),
  };
}

export function getRepurposingExportTemplates(
  job: ContentJobRow,
  selection: Partial<RepurposingExportSelection> = {},
): RepurposingExportTemplateDetails[] {
  const targetPlatforms = getRepurposingJobSummary(job).targetPlatforms;
  const preferredTemplateKeys = [
    ...targetPlatforms.filter(
      (platform): platform is RepurposingExportPlatformTemplateKey =>
        platform === "tiktok" || platform === "youtube_shorts",
    ),
    ...(["tiktok", "youtube_shorts"] as const).filter(
      (platform) => !targetPlatforms.includes(platform),
    ),
  ];

  return preferredTemplateKeys.map((templateKey) =>
    getRepurposingExportTemplateDetails(job, templateKey, selection),
  );
}

export function getRepurposingExportHistoryEntries(
  exportEvents: RepurposingExportEventRow[],
  viewerUserId: string | null | undefined = null,
): RepurposingExportHistoryEntry[] {
  return exportEvents
    .slice()
    .sort(
      (left, right) =>
        new Date(right.created_at).getTime() -
        new Date(left.created_at).getTime(),
    )
    .map((event) => ({
      actorLabel: formatExportActorLabel(event.actor_id, viewerUserId),
      bundleHash: event.bundle_hash,
      contentJobId: event.content_job_id,
      createdAt: event.created_at,
      eventType: event.event_type,
      metadataSummary: formatExportMetadataSummary(event.metadata),
      reviewStatusAtExport: event.review_status_at_export,
      source: sanitizeString(event.source ?? "Not available"),
      targetPlatform: event.target_platform,
      templateKey: event.template_key,
    }));
}

export function getRepurposingExportAnalyticsSummary(
  jobs: ContentJobRow[],
  exportEvents: RepurposingExportEventRow[],
  now: Date = new Date(),
): RepurposingExportAnalyticsSummary {
  const summary: RepurposingExportAnalyticsSummary = {
    approvedJobsWithoutExport: 0,
    exportsByEventType: {
      copy_bundle: 0,
      copy_template: 0,
    },
    exportsByPlatform: {
      tiktok: 0,
      youtube_shorts: 0,
    },
    exportsByTemplate: {
      bundle: 0,
      tiktok: 0,
      youtube_shorts: 0,
    },
    exportsLast30Days: 0,
    exportsLast7Days: 0,
    latestExportAt: null,
    totalExports: exportEvents.length,
    topPlatform: null,
  };

  const exportJobIds = new Set<string>();
  const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const thirtyDaysAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;

  for (const event of exportEvents) {
    exportJobIds.add(event.content_job_id);
    summary.exportsByEventType[event.event_type] += 1;
    summary.exportsByPlatform[event.target_platform] += 1;
    summary.exportsByTemplate[event.template_key] += 1;

    const eventTime = new Date(event.created_at).getTime();
    if (eventTime >= sevenDaysAgo) {
      summary.exportsLast7Days += 1;
    }
    if (eventTime >= thirtyDaysAgo) {
      summary.exportsLast30Days += 1;
    }

    if (
      !summary.latestExportAt ||
      eventTime > new Date(summary.latestExportAt).getTime()
    ) {
      summary.latestExportAt = event.created_at;
    }
  }

  summary.approvedJobsWithoutExport = jobs.filter((job) => {
    if (!getRepurposingExportEligibility(job).eligible) {
      return false;
    }

    return !exportJobIds.has(job.id);
  }).length;

  summary.topPlatform = resolveTopExportPlatform(summary.exportsByPlatform);

  return summary;
}

export function isRepurposingJobExported(
  jobId: string,
  exportEvents: RepurposingExportEventRow[],
): boolean {
  return exportEvents.some((event) => event.content_job_id === jobId);
}

export function getLatestRepurposingExportAt(
  jobId: string,
  exportEvents: RepurposingExportEventRow[],
): string | null {
  const latest = exportEvents
    .filter((event) => event.content_job_id === jobId)
    .slice()
    .sort(
      (left, right) =>
        new Date(right.created_at).getTime() -
        new Date(left.created_at).getTime(),
    )[0];

  return latest?.created_at ?? null;
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

function resolveTopExportPlatform(
  counts: Record<RepurposingExportTargetPlatform, number>,
): RepurposingExportTargetPlatform | null {
  const orderedPlatforms: RepurposingExportTargetPlatform[] = [
    "tiktok",
    "youtube_shorts",
  ];

  let topPlatform: RepurposingExportTargetPlatform | null = null;
  let topCount = 0;

  for (const platform of orderedPlatforms) {
    const count = counts[platform];
    if (count > topCount) {
      topCount = count;
      topPlatform = platform;
    }
  }

  return topCount > 0 ? topPlatform : null;
}

function formatExportActorLabel(
  actorId: string,
  viewerUserId: string | null | undefined,
): string {
  if (viewerUserId && actorId === viewerUserId) {
    return "You";
  }

  return `Actor ${actorId.slice(0, 8)}…`;
}

function formatExportMetadataSummary(metadata: unknown): string | null {
  if (!isRecord(metadata)) {
    return null;
  }

  const parts: string[] = [];
  const bundleLength = readNumber(metadata, "bundle_length");
  const eventLabel = readString(metadata, "event_label");
  const templateLabel = readString(metadata, "template_label");
  const targetPlatform = readString(metadata, "target_platform");

  if (typeof bundleLength === "number") {
    parts.push(`bundle_length: ${bundleLength}`);
  }
  if (eventLabel) {
    parts.push(eventLabel);
  }
  if (templateLabel) {
    parts.push(templateLabel);
  }
  if (targetPlatform) {
    parts.push(targetPlatform);
  }

  return parts.length > 0 ? parts.join(" • ") : null;
}
