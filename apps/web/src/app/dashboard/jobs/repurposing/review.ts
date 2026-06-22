import type { Tables } from "@streamos/database";
import { z } from "zod";

export const REPURPOSING_REVIEW_DECISIONS = [
  "approved",
  "rejected",
  "needs_changes",
] as const;

export const REPURPOSING_EXPORT_EVENT_TYPES = [
  "copy_bundle",
  "copy_template",
] as const;

export const REPURPOSING_EXPORT_TEMPLATE_KEYS = [
  "bundle",
  "tiktok",
  "youtube_shorts",
] as const;

export const REPURPOSING_EXPORT_TARGET_PLATFORMS = [
  "tiktok",
  "youtube_shorts",
] as const;

export type RepurposingReviewDecision =
  (typeof REPURPOSING_REVIEW_DECISIONS)[number];

export type RepurposingExportEventType =
  (typeof REPURPOSING_EXPORT_EVENT_TYPES)[number];

export type RepurposingExportTemplateKey =
  (typeof REPURPOSING_EXPORT_TEMPLATE_KEYS)[number];

export type RepurposingExportTargetPlatform =
  (typeof REPURPOSING_EXPORT_TARGET_PLATFORMS)[number];

export type RepurposingReviewStatus =
  | "needs_review"
  | RepurposingReviewDecision;

export type RepurposingReviewEventRow = Tables<"content_job_review_events">;
export type RepurposingExportEventRow = Tables<"content_job_export_events">;

export const repurposingReviewDecisionSchema = z.enum(
  REPURPOSING_REVIEW_DECISIONS,
);

export const repurposingReviewFormSchema = z.object({
  jobId: z.string().uuid(),
  reviewStatus: repurposingReviewDecisionSchema,
  reviewerNotes: z.string().trim().max(4_000).default(""),
});

export const repurposingExportAuditFormSchema = z.object({
  eventType: z.enum(REPURPOSING_EXPORT_EVENT_TYPES),
  jobId: z.string().uuid(),
  targetPlatform: z.enum(REPURPOSING_EXPORT_TARGET_PLATFORMS),
  templateKey: z.enum(REPURPOSING_EXPORT_TEMPLATE_KEYS),
});

export type RepurposingReviewFormValues = z.infer<
  typeof repurposingReviewFormSchema
>;

export type RepurposingExportAuditFormValues = z.infer<
  typeof repurposingExportAuditFormSchema
>;

export function getRepurposingReviewStatusLabel(
  status: RepurposingReviewStatus | null | undefined,
): string {
  switch (status) {
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "needs_changes":
      return "Needs changes";
    case "needs_review":
    default:
      return "Needs review";
  }
}

export function getRepurposingReviewDecisionClassName(
  status: RepurposingReviewStatus,
): string {
  switch (status) {
    case "approved":
      return "border-signal-green/30 bg-signal-green/10 text-signal-green";
    case "rejected":
      return "border-signal-red/30 bg-signal-red/10 text-signal-red";
    case "needs_changes":
      return "border-amber-300/30 bg-amber-300/10 text-amber-200";
    case "needs_review":
    default:
      return "border-slate-500/30 bg-slate-500/10 text-slate-300";
  }
}

export function formatReviewDecisionSummary(
  status: RepurposingReviewStatus | null | undefined,
): string {
  return getRepurposingReviewStatusLabel(status);
}

export function getRepurposingExportTemplateLabel(
  templateKey: RepurposingExportTemplateKey,
): string {
  switch (templateKey) {
    case "tiktok":
      return "TikTok template";
    case "youtube_shorts":
      return "YouTube Shorts template";
    case "bundle":
    default:
      return "Approved export bundle";
  }
}

export function getRepurposingExportTargetPlatformLabel(
  targetPlatform: RepurposingExportTargetPlatform,
): string {
  switch (targetPlatform) {
    case "tiktok":
      return "TikTok";
    case "youtube_shorts":
    default:
      return "YouTube Shorts";
  }
}

export function getRepurposingExportEventLabel(
  eventType: RepurposingExportEventType,
): string {
  switch (eventType) {
    case "copy_bundle":
      return "Bundle copy";
    case "copy_template":
    default:
      return "Platform template copy";
  }
}
