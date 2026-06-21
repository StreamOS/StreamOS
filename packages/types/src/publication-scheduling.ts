import type {
  ContentJobReviewStatus,
  ContentJobStatus,
  ContentPublicationStatus,
  StreamPlatform,
} from "./index.js";
import type { ContentPublicationFanoutStatus } from "./publications.js";

export const CONTENT_PUBLICATION_SCHEDULE_STATUSES = [
  "not_scheduled",
  "scheduled",
  "schedule_blocked",
  "schedule_expired",
  "schedule_canceled",
  "schedule_replaced",
  "schedule_ready",
  "schedule_unknown",
] as const;

export type ContentPublicationScheduleStatus =
  (typeof CONTENT_PUBLICATION_SCHEDULE_STATUSES)[number];

export const CONTENT_PUBLICATION_SCHEDULE_SOURCES = [
  "api-gateway",
  "dashboard",
  "manual",
  "system",
] as const;

export type ContentPublicationScheduleSource =
  (typeof CONTENT_PUBLICATION_SCHEDULE_SOURCES)[number];

export const CONTENT_PUBLICATION_SCHEDULE_BLOCK_REASONS = [
  "child_not_part_of_parent",
  "content_job_not_approved",
  "content_job_not_complete",
  "fanout_finalized",
  "fanout_not_ready",
  "missing_publish_scopes",
  "platform_connection_missing",
  "platform_connection_not_connected",
  "publication_finalized",
  "publication_processing",
  "publication_reauth_required",
  "publication_status_not_schedulable",
  "publishable_asset_missing",
  "publishable_bundle_missing",
  "schedule_time_invalid",
  "schedule_timezone_invalid",
  "scheduling_not_allowed",
  "target_unsupported",
  "tenant_mismatch",
] as const;

export type ContentPublicationScheduleBlockReason =
  (typeof CONTENT_PUBLICATION_SCHEDULE_BLOCK_REASONS)[number];

export type ContentPublicationScheduleSummary = {
  actorId: string | null;
  blockReason: ContentPublicationScheduleBlockReason | null;
  capabilitySnapshot: Record<string, unknown>;
  canceledAt: string | null;
  canceledReason: string | null;
  createdAt: string | null;
  expiredAt: string | null;
  replacedAt: string | null;
  scheduleSource: ContentPublicationScheduleSource | null;
  scheduleStatus: ContentPublicationScheduleStatus;
  scheduledAtUtc: string | null;
  scheduledTimezone: string | null;
  updatedAt: string | null;
};

export type PublicationScheduleStatusTone =
  | "emerald"
  | "amber"
  | "rose"
  | "slate"
  | "violet";

export const CONTENT_PUBLICATION_SCHEDULE_ACTION_KEYS = [
  "edit_schedule",
  "replace_schedule",
  "cancel_schedule",
] as const;

export type ContentPublicationScheduleActionKey =
  (typeof CONTENT_PUBLICATION_SCHEDULE_ACTION_KEYS)[number];

export type ContentPublicationScheduleActionDecision = {
  allowed: boolean;
  blockReason: string | null;
  explanation: string;
  intent: ContentPublicationScheduleActionIntent;
  requiresConfirmation: boolean;
  safeLabel: string;
};

export type ContentPublicationScheduleActionIntent =
  | "update"
  | "replace"
  | "cancel";

export type ContentPublicationScheduleActionPolicy = {
  actions: Record<
    ContentPublicationScheduleActionKey,
    ContentPublicationScheduleActionDecision
  >;
  blockReason: string | null;
  canCancel: boolean;
  canEdit: boolean;
  canReplace: boolean;
  explanation: string;
  nextAction: ContentPublicationScheduleActionKey | null;
};

export type ContentPublicationScheduleActionPolicyInput = {
  finalBlockReason: string | null;
  isLocked: boolean;
  itemLabel: string;
  lockReason?: string | null;
  replaceSupported?: boolean;
};

export type PublicationScheduleEvaluationResult = {
  accepted: boolean;
  blockReason: ContentPublicationScheduleBlockReason | null;
  nextRecommendedAction: string | null;
  safeDescription: string;
  scheduleStatus: ContentPublicationScheduleStatus;
  softBlocked: boolean;
};

export type PublicationScheduleEvaluationInput = {
  contentJobReviewStatus: ContentJobReviewStatus | null;
  contentJobStatus: ContentJobStatus | null;
  currentPublicationStatus: ContentPublicationStatus | null;
  hasApprovedBundle: boolean;
  hasPublishableAsset: boolean;
  hasRequiredScopes: boolean;
  scheduleSource?: ContentPublicationScheduleSource | null;
  scheduledAtUtc: string | Date | null | undefined;
  scheduledTimezone: string | null | undefined;
  schedulingAllowed: boolean;
  targetPlatform: StreamPlatform;
  now?: number;
};

export type PublicationFanoutScheduleEvaluationInput = {
  contentJobReviewStatus: ContentJobReviewStatus | null;
  contentJobStatus: ContentJobStatus | null;
  currentFanoutStatus: ContentPublicationFanoutStatus | null;
  hasApprovedBundle: boolean;
  hasPublishableAsset: boolean;
  hasRequiredScopes: boolean;
  hasRunnableTargets: boolean;
  scheduleSource?: ContentPublicationScheduleSource | null;
  scheduledAtUtc: string | Date | null | undefined;
  scheduledTimezone: string | null | undefined;
  schedulingAllowed: boolean;
  targetCount: number;
  now?: number;
};

export type PublicationScheduleSummaryInput = {
  actorId?: string | null;
  blockReason?: ContentPublicationScheduleBlockReason | null;
  capabilitySnapshot?: Record<string, unknown> | null;
  canceledAt?: string | null;
  canceledReason?: string | null;
  createdAt?: string | null;
  expiredAt?: string | null;
  replacedAt?: string | null;
  scheduleSource?: ContentPublicationScheduleSource | null;
  scheduleStatus?: ContentPublicationScheduleStatus | null;
  scheduledAtUtc?: string | Date | null | undefined;
  scheduledTimezone?: string | null | undefined;
  updatedAt?: string | null;
};

export function buildPublicationScheduleSummary({
  actorId = null,
  blockReason = null,
  capabilitySnapshot = {},
  canceledAt = null,
  canceledReason = null,
  createdAt = null,
  expiredAt = null,
  replacedAt = null,
  scheduleSource = null,
  scheduleStatus = "not_scheduled",
  scheduledAtUtc,
  scheduledTimezone,
  updatedAt = null,
}: PublicationScheduleSummaryInput): ContentPublicationScheduleSummary {
  const normalizedCapabilitySnapshot = capabilitySnapshot ?? {};
  const normalizedScheduleStatus = scheduleStatus ?? "not_scheduled";

  return {
    actorId,
    blockReason,
    capabilitySnapshot: normalizedCapabilitySnapshot,
    canceledAt,
    canceledReason,
    createdAt,
    expiredAt,
    replacedAt,
    scheduleSource,
    scheduleStatus: derivePublicationScheduleStatus({
      canceledAt,
      expiredAt,
      now: Date.now(),
      replacedAt,
      scheduleStatus: normalizedScheduleStatus,
      scheduledAtUtc: normalizePublicationScheduleTimestamp(scheduledAtUtc),
    }),
    scheduledAtUtc: normalizePublicationScheduleTimestamp(scheduledAtUtc),
    scheduledTimezone: normalizePublicationScheduleTimezone(scheduledTimezone),
    updatedAt,
  };
}

export function normalizePublicationScheduleTimestamp(
  value: string | Date | null | undefined,
): string | null {
  if (!value) {
    return null;
  }

  const timestamp = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    return null;
  }

  return timestamp.toISOString();
}

export function normalizePublicationScheduleTimezone(
  value: string | null | undefined,
): string | null {
  const timezone = value?.trim();

  if (!timezone) {
    return null;
  }

  return isValidIanaTimeZone(timezone) ? timezone : null;
}

export function isPublicationScheduleTimestampFuture(
  value: string | Date,
  now = Date.now(),
): boolean {
  const timestamp = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    return false;
  }

  return timestamp.getTime() > now;
}

export function derivePublicationScheduleStatus({
  canceledAt,
  expiredAt,
  now = Date.now(),
  replacedAt,
  scheduledAtUtc,
  scheduleStatus,
}: Pick<
  ContentPublicationScheduleSummary,
  | "canceledAt"
  | "expiredAt"
  | "replacedAt"
  | "scheduledAtUtc"
  | "scheduleStatus"
> & {
  now?: number;
}): ContentPublicationScheduleStatus {
  if (scheduleStatus === "schedule_canceled" || canceledAt) {
    return "schedule_canceled";
  }

  if (scheduleStatus === "schedule_replaced" || replacedAt) {
    return "schedule_replaced";
  }

  if (scheduleStatus === "schedule_blocked") {
    return "schedule_blocked";
  }

  const normalizedScheduledAt = scheduledAtUtc
    ? new Date(scheduledAtUtc).getTime()
    : NaN;

  if (
    (scheduleStatus === "schedule_ready" || scheduleStatus === "scheduled") &&
    Number.isFinite(normalizedScheduledAt) &&
    normalizedScheduledAt <= now
  ) {
    return "schedule_expired";
  }

  if (scheduleStatus === "schedule_expired" || expiredAt) {
    return "schedule_expired";
  }

  if (scheduleStatus === "scheduled") {
    return "scheduled";
  }

  if (scheduleStatus === "schedule_ready") {
    return "schedule_ready";
  }

  if (scheduleStatus === "not_scheduled") {
    return "not_scheduled";
  }

  return "schedule_unknown";
}

export function evaluatePublicationScheduleIntent({
  contentJobReviewStatus,
  contentJobStatus,
  currentPublicationStatus,
  hasApprovedBundle,
  hasPublishableAsset,
  hasRequiredScopes,
  scheduleSource,
  scheduledAtUtc,
  scheduledTimezone,
  schedulingAllowed,
  targetPlatform,
  now = Date.now(),
}: PublicationScheduleEvaluationInput): PublicationScheduleEvaluationResult {
  const normalizedScheduledAtUtc =
    normalizePublicationScheduleTimestamp(scheduledAtUtc);
  const normalizedTimezone =
    normalizePublicationScheduleTimezone(scheduledTimezone);

  if (!normalizedScheduledAtUtc) {
    return blockedScheduleDecision(
      "schedule_time_invalid",
      "The requested schedule time is missing or invalid.",
      "Provide a future UTC timestamp before scheduling.",
    );
  }

  if (!normalizedTimezone) {
    return blockedScheduleDecision(
      "schedule_timezone_invalid",
      "The requested schedule timezone is missing or invalid.",
      "Provide a valid IANA timezone for the creator context.",
    );
  }

  if (!isPublicationScheduleTimestampFuture(normalizedScheduledAtUtc, now)) {
    return blockedScheduleDecision(
      "schedule_time_invalid",
      "The requested schedule time must be in the future.",
      "Choose a future time before creating the schedule.",
    );
  }

  if (!hasApprovedBundle || contentJobReviewStatus !== "approved") {
    return blockedScheduleDecision(
      "content_job_not_approved",
      "The repurposing job is not approved yet.",
      "Approve the repurposing job before scheduling publishing.",
    );
  }

  if (contentJobStatus !== "done" && contentJobStatus !== "completed") {
    return blockedScheduleDecision(
      "content_job_not_complete",
      "The repurposing job is not complete yet.",
      "Wait for the repurposing job to finish before scheduling publishing.",
    );
  }

  if (
    currentPublicationStatus === "published" ||
    currentPublicationStatus === "failed_permanent" ||
    currentPublicationStatus === "failed_retryable" ||
    currentPublicationStatus === "canceled" ||
    currentPublicationStatus === "rejected" ||
    currentPublicationStatus === "publishing"
  ) {
    return blockedScheduleDecision(
      currentPublicationStatus === "publishing"
        ? "publication_processing"
        : "publication_finalized",
      "The publication is already final or currently processing.",
      "Create a new publication request instead of scheduling this one.",
    );
  }

  if (!schedulingAllowed) {
    return {
      accepted: true,
      blockReason: "scheduling_not_allowed",
      nextRecommendedAction:
        "Wait until the selected target account supports scheduling.",
      safeDescription:
        "Scheduling is stored, but the selected target account does not currently allow StreamOS scheduling readiness.",
      scheduleStatus: "schedule_blocked",
      softBlocked: true,
    };
  }

  if (!hasRequiredScopes) {
    return {
      accepted: true,
      blockReason: "missing_publish_scopes",
      nextRecommendedAction:
        "Reconnect the provider account with the required publish scopes.",
      safeDescription:
        "Scheduling is stored, but the provider connection is missing publish scopes for future execution.",
      scheduleStatus: "schedule_blocked",
      softBlocked: true,
    };
  }

  if (!hasPublishableAsset) {
    return {
      accepted: true,
      blockReason: "publishable_asset_missing",
      nextRecommendedAction:
        "Attach a publishable asset before the scheduled execution window.",
      safeDescription:
        "Scheduling is stored, but the publishable asset is still missing.",
      scheduleStatus: "schedule_blocked",
      softBlocked: true,
    };
  }

  return {
    accepted: true,
    blockReason: null,
    nextRecommendedAction: null,
    safeDescription: `Scheduling is ready for ${targetPlatform} via ${scheduleSource ?? "api-gateway"} and will remain server-managed until execution is introduced.`,
    scheduleStatus: "schedule_ready",
    softBlocked: false,
  };
}

export function evaluatePublicationFanoutScheduleIntent({
  contentJobReviewStatus,
  contentJobStatus,
  currentFanoutStatus,
  hasApprovedBundle,
  hasPublishableAsset,
  hasRequiredScopes,
  hasRunnableTargets,
  scheduleSource,
  scheduledAtUtc,
  scheduledTimezone,
  schedulingAllowed,
  targetCount,
  now = Date.now(),
}: PublicationFanoutScheduleEvaluationInput): PublicationScheduleEvaluationResult {
  const normalizedScheduledAtUtc =
    normalizePublicationScheduleTimestamp(scheduledAtUtc);
  const normalizedTimezone =
    normalizePublicationScheduleTimezone(scheduledTimezone);

  if (targetCount <= 0) {
    return blockedScheduleDecision(
      "fanout_not_ready",
      "The parent fanout has no prepared child targets yet.",
      "Prepare at least one target before scheduling the fanout.",
    );
  }

  if (!normalizedScheduledAtUtc) {
    return blockedScheduleDecision(
      "schedule_time_invalid",
      "The requested schedule time is missing or invalid.",
      "Provide a future UTC timestamp before scheduling the fanout.",
    );
  }

  if (!normalizedTimezone) {
    return blockedScheduleDecision(
      "schedule_timezone_invalid",
      "The requested schedule timezone is missing or invalid.",
      "Provide a valid IANA timezone for the creator context.",
    );
  }

  if (!isPublicationScheduleTimestampFuture(normalizedScheduledAtUtc, now)) {
    return blockedScheduleDecision(
      "schedule_time_invalid",
      "The requested schedule time must be in the future.",
      "Choose a future time before creating the fanout schedule.",
    );
  }

  if (!hasApprovedBundle || contentJobReviewStatus !== "approved") {
    return blockedScheduleDecision(
      "content_job_not_approved",
      "The parent repurposing job is not approved yet.",
      "Approve the repurposing job before scheduling the fanout.",
    );
  }

  if (contentJobStatus !== "done" && contentJobStatus !== "completed") {
    return blockedScheduleDecision(
      "content_job_not_complete",
      "The parent repurposing job is not complete yet.",
      "Wait for the repurposing job to finish before scheduling the fanout.",
    );
  }

  if (currentFanoutStatus === "blocked" || currentFanoutStatus === "canceled") {
    return blockedScheduleDecision(
      "fanout_finalized",
      "The parent fanout is already final.",
      "Create a new fanout request instead of scheduling this one.",
    );
  }

  if (!schedulingAllowed) {
    return {
      accepted: true,
      blockReason: "scheduling_not_allowed",
      nextRecommendedAction:
        "Wait until the selected targets support scheduling readiness.",
      safeDescription:
        "Scheduling is stored, but the parent fanout is not ready for execution yet.",
      scheduleStatus: "schedule_blocked",
      softBlocked: true,
    };
  }

  if (!hasRequiredScopes) {
    return {
      accepted: true,
      blockReason: "missing_publish_scopes",
      nextRecommendedAction:
        "Reconnect the target provider accounts with the required publish scopes.",
      safeDescription:
        "Scheduling is stored, but one or more targets are missing publish scopes.",
      scheduleStatus: "schedule_blocked",
      softBlocked: true,
    };
  }

  if (!hasRunnableTargets) {
    return {
      accepted: true,
      blockReason: "fanout_not_ready",
      nextRecommendedAction:
        "Validate at least one runnable target before the scheduled fanout executes.",
      safeDescription:
        "Scheduling is stored, but no runnable targets are available yet.",
      scheduleStatus: "schedule_blocked",
      softBlocked: true,
    };
  }

  if (!hasPublishableAsset) {
    return {
      accepted: true,
      blockReason: "publishable_asset_missing",
      nextRecommendedAction:
        "Attach a publishable asset before the scheduled execution window.",
      safeDescription:
        "Scheduling is stored, but the publishable asset is still missing.",
      scheduleStatus: "schedule_blocked",
      softBlocked: true,
    };
  }

  return {
    accepted: true,
    blockReason: null,
    nextRecommendedAction: null,
    safeDescription: `Scheduling is ready for the parent fanout via ${scheduleSource ?? "api-gateway"} and will remain server-managed until execution is introduced.`,
    scheduleStatus: "schedule_ready",
    softBlocked: false,
  };
}

export function buildPublicationScheduleActionPolicy({
  finalBlockReason,
  isLocked,
  itemLabel,
  lockReason = null,
  replaceSupported = true,
}: ContentPublicationScheduleActionPolicyInput): ContentPublicationScheduleActionPolicy {
  const blockedReason = finalBlockReason ?? (isLocked ? lockReason : null);
  const blockReason = blockedReason ?? null;
  const blockedExplanation = finalBlockReason
    ? `${itemLabel} is already final and cannot be changed anymore.`
    : isLocked
      ? `${itemLabel} is locked for execution and cannot be changed right now.`
      : null;
  const editAllowed = !blockReason;
  const replaceAllowed = !blockReason && replaceSupported;
  const cancelAllowed = !blockReason;

  return {
    actions: {
      cancel_schedule: scheduleActionDecision({
        allowed: cancelAllowed,
        blockReason: blockReason,
        explanation:
          blockedExplanation ?? `Cancel ${itemLabel} to stop future execution.`,
        intent: "cancel",
        requiresConfirmation: true,
        safeLabel: "Cancel schedule",
      }),
      edit_schedule: scheduleActionDecision({
        allowed: editAllowed,
        blockReason: blockReason,
        explanation:
          blockedExplanation ??
          `Edit ${itemLabel} in place without creating a new schedule row.`,
        intent: "update",
        requiresConfirmation: false,
        safeLabel: "Update schedule",
      }),
      replace_schedule: scheduleActionDecision({
        allowed: replaceAllowed,
        blockReason: replaceSupported
          ? blockReason
          : "schedule_replace_not_supported",
        explanation: replaceSupported
          ? (blockedExplanation ??
            `Replace ${itemLabel} with a fresh schedule entry and preserve the current one as replaced.`)
          : `${itemLabel} replacement is not available for this schedule kind.`,
        intent: "replace",
        requiresConfirmation: true,
        safeLabel: "Replace schedule",
      }),
    },
    blockReason,
    canCancel: cancelAllowed,
    canEdit: editAllowed,
    canReplace: replaceAllowed,
    explanation:
      blockedExplanation ??
      `Choose one action to mutate ${itemLabel} without starting provider execution.`,
    nextAction: editAllowed
      ? "edit_schedule"
      : replaceAllowed
        ? "replace_schedule"
        : cancelAllowed
          ? "cancel_schedule"
          : null,
  };
}

function scheduleActionDecision({
  allowed,
  blockReason,
  explanation,
  intent,
  requiresConfirmation,
  safeLabel,
}: {
  allowed: boolean;
  blockReason: string | null;
  explanation: string;
  intent: ContentPublicationScheduleActionDecision["intent"];
  requiresConfirmation: boolean;
  safeLabel: string;
}): ContentPublicationScheduleActionDecision {
  return {
    allowed,
    blockReason: allowed ? null : blockReason,
    explanation,
    intent,
    requiresConfirmation,
    safeLabel,
  };
}

function blockedScheduleDecision(
  blockReason: ContentPublicationScheduleBlockReason,
  safeDescription: string,
  nextRecommendedAction: string,
): PublicationScheduleEvaluationResult {
  return {
    accepted: false,
    blockReason,
    nextRecommendedAction,
    safeDescription,
    scheduleStatus: "schedule_blocked",
    softBlocked: false,
  };
}

export function getPublicationScheduleStatusLabel(
  status: ContentPublicationScheduleStatus,
): string {
  switch (status) {
    case "not_scheduled":
      return "Not scheduled";
    case "scheduled":
      return "Scheduled";
    case "schedule_blocked":
      return "Schedule blocked";
    case "schedule_canceled":
      return "Schedule canceled";
    case "schedule_expired":
      return "Schedule expired";
    case "schedule_ready":
      return "Schedule ready";
    case "schedule_replaced":
      return "Schedule replaced";
    case "schedule_unknown":
    default:
      return "Schedule unknown";
  }
}

export function getPublicationScheduleStatusTone(
  status: ContentPublicationScheduleStatus,
): PublicationScheduleStatusTone {
  switch (status) {
    case "not_scheduled":
    case "schedule_unknown":
      return "slate";
    case "scheduled":
    case "schedule_ready":
    case "schedule_replaced":
      return "violet";
    case "schedule_blocked":
    case "schedule_expired":
      return "amber";
    case "schedule_canceled":
      return "rose";
  }
}

function isValidIanaTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}
