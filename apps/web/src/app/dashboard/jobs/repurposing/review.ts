import type { Tables } from "@streamos/database";
import { z } from "zod";

export const REPURPOSING_REVIEW_DECISIONS = [
  "approved",
  "rejected",
  "needs_changes",
] as const;

export type RepurposingReviewDecision =
  (typeof REPURPOSING_REVIEW_DECISIONS)[number];

export type RepurposingReviewStatus =
  | "needs_review"
  | RepurposingReviewDecision;

export type RepurposingReviewEventRow = Tables<"content_job_review_events">;

export const repurposingReviewDecisionSchema = z.enum(
  REPURPOSING_REVIEW_DECISIONS,
);

export const repurposingReviewFormSchema = z.object({
  jobId: z.string().uuid(),
  reviewStatus: repurposingReviewDecisionSchema,
  reviewerNotes: z.string().trim().max(4_000).default(""),
});

export type RepurposingReviewFormValues = z.infer<
  typeof repurposingReviewFormSchema
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
