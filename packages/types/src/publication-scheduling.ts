import type {
  ConnectionStatus,
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
  policy: PublicationSchedulePolicy;
};

export const PUBLICATION_SCHEDULE_POLICY_MODES = [
  "calendar",
  "create",
  "edit",
  "fanout_create",
  "fanout_edit",
  "observability",
  "revalidate",
  "replace",
] as const;

export type PublicationSchedulePolicyMode =
  (typeof PUBLICATION_SCHEDULE_POLICY_MODES)[number];

export const PUBLICATION_SCHEDULE_POLICY_STATUSES = [
  "blocked",
  "expired",
  "ready",
  "stale",
  "unknown",
] as const;

export type PublicationSchedulePolicyStatus =
  (typeof PUBLICATION_SCHEDULE_POLICY_STATUSES)[number];

export const PUBLICATION_SCHEDULE_POLICY_VERSION = "2026.06.p3.18.v1" as const;

export type PublicationSchedulePolicyNotice = {
  code: string;
  message: string;
};

export type PublicationScheduleProviderHint = {
  description: string;
  nativeSchedulingSupported: boolean;
  nativeSchedulingUsed: false;
  provider: StreamPlatform | "fanout";
  requiredScopes: string[];
  requiresReauth: boolean;
  requiresScopes: boolean;
  schedulingAllowed: boolean;
  safeLabel: string;
  supportStatus: "conditional" | "experimental" | "supported" | "unsupported";
};

export type PublicationScheduleExecutionPolicyStatus =
  | "canceled"
  | "claimed"
  | "completed"
  | "expired"
  | "executing"
  | "idle"
  | "queued"
  | "unknown";

export type PublicationScheduleExecutionPolicy = {
  claimedAt: string | null;
  claimedBy: string | null;
  isLocked: boolean;
  queueJobId: string | null;
  status: PublicationScheduleExecutionPolicyStatus;
};

export type PublicationScheduleTimingPolicy = {
  expiresAt: string | null;
  isExpired: boolean;
  isNearDue: boolean;
  isStale: boolean;
  minLeadTimeMinutes: number;
  maxHorizonDays: number;
  nearDueEditWindowMinutes: number;
  scheduledAtUtc: string | null;
  scheduledTimezone: string | null;
  staleAt: string | null;
};

export type PublicationScheduleTargetPolicy = {
  blockedTargetCount: number;
  readyTargetCount: number;
  reauthRequiredTargetCount: number;
  runnableTargetCount: number;
  targetCount: number;
};

export type PublicationSchedulePolicy = {
  accepted: boolean;
  actionPolicy: ContentPublicationScheduleActionPolicy;
  blockReason: ContentPublicationScheduleBlockReason | null;
  execution: PublicationScheduleExecutionPolicy;
  info: PublicationSchedulePolicyNotice[];
  mode: PublicationSchedulePolicyMode;
  nextRecommendedAction: string | null;
  policyStatus: PublicationSchedulePolicyStatus;
  policyVersion: string;
  providerHint: PublicationScheduleProviderHint;
  requiresRevalidation: boolean;
  safeDescription: string;
  scheduleStatus: ContentPublicationScheduleStatus;
  softBlocked: boolean;
  targetPolicy: PublicationScheduleTargetPolicy | null;
  timing: PublicationScheduleTimingPolicy;
  warnings: PublicationSchedulePolicyNotice[];
};

export type PublicationSchedulePolicyInput = {
  availableScopes?: string[];
  contentJobReviewStatus: ContentJobReviewStatus | null;
  contentJobStatus: ContentJobStatus | null;
  currentFanoutStatus?: ContentPublicationFanoutStatus | null;
  currentPublicationStatus?: ContentPublicationStatus | null;
  connectionStatus?: ConnectionStatus | null;
  executionClaimedAt?: string | null;
  executionClaimedBy?: string | null;
  executionQueueJobId?: string | null;
  executionStatus?: PublicationScheduleExecutionPolicyStatus | null;
  hasApprovedBundle: boolean;
  hasPublishableAsset: boolean;
  hasRequiredScopes: boolean;
  hasRunnableTargets?: boolean;
  fanoutBlockedTargetCount?: number;
  fanoutReauthRequiredTargetCount?: number;
  fanoutReadyTargetCount?: number;
  fanoutTargetCount?: number;
  mode?: PublicationSchedulePolicyMode;
  now?: number;
  scheduleSource?: ContentPublicationScheduleSource | null;
  scheduledAtUtc: string | Date | null | undefined;
  scheduledTimezone: string | null | undefined;
  schedulingAllowed: boolean;
  targetCount?: number;
  targetPlatform: StreamPlatform | "fanout";
  targetSupportStatus?:
    | "conditional"
    | "experimental"
    | "supported"
    | "unsupported";
};

export type PublicationScheduleEvaluationInput = {
  availableScopes?: string[];
  contentJobReviewStatus: ContentJobReviewStatus | null;
  contentJobStatus: ContentJobStatus | null;
  connectionStatus?: ConnectionStatus | null;
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
  availableScopes?: string[];
  contentJobReviewStatus: ContentJobReviewStatus | null;
  contentJobStatus: ContentJobStatus | null;
  connectionStatus?: ConnectionStatus | null;
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
  availableScopes = [],
  contentJobReviewStatus,
  contentJobStatus,
  connectionStatus = null,
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
  const policy = evaluatePublicationSchedulePolicy({
    availableScopes,
    connectionStatus,
    contentJobReviewStatus,
    contentJobStatus,
    currentPublicationStatus,
    hasApprovedBundle,
    hasPublishableAsset,
    hasRequiredScopes,
    mode: "create",
    now,
    scheduleSource,
    scheduledAtUtc,
    scheduledTimezone,
    schedulingAllowed,
    targetPlatform,
  });

  return {
    accepted: policy.accepted,
    blockReason: policy.blockReason,
    nextRecommendedAction: policy.nextRecommendedAction,
    safeDescription: policy.safeDescription,
    scheduleStatus: policy.scheduleStatus,
    softBlocked: policy.softBlocked,
    policy,
  };
}
export function evaluatePublicationFanoutScheduleIntent({
  availableScopes = [],
  contentJobReviewStatus,
  contentJobStatus,
  connectionStatus = null,
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
  const policy = evaluatePublicationFanoutSchedulePolicy({
    availableScopes,
    connectionStatus,
    contentJobReviewStatus,
    contentJobStatus,
    currentFanoutStatus,
    hasApprovedBundle,
    hasPublishableAsset,
    hasRequiredScopes,
    hasRunnableTargets,
    mode: "fanout_create",
    now,
    scheduleSource,
    scheduledAtUtc,
    scheduledTimezone,
    schedulingAllowed,
    targetCount,
    targetPlatform: "fanout",
  });

  return {
    accepted: policy.accepted,
    blockReason: policy.blockReason,
    nextRecommendedAction: policy.nextRecommendedAction,
    safeDescription: policy.safeDescription,
    scheduleStatus: policy.scheduleStatus,
    softBlocked: policy.softBlocked,
    policy,
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

export function evaluatePublicationSchedulePolicy(
  input: PublicationSchedulePolicyInput,
): PublicationSchedulePolicy {
  return buildPublicationSchedulePolicy({
    ...input,
    mode: input.mode ?? "create",
  });
}

export function evaluatePublicationFanoutSchedulePolicy(
  input: PublicationSchedulePolicyInput,
): PublicationSchedulePolicy {
  return buildPublicationSchedulePolicy({
    ...input,
    hasRunnableTargets: input.hasRunnableTargets ?? false,
    mode: input.mode ?? "fanout_create",
    targetPlatform: "fanout",
    targetCount: input.targetCount ?? 0,
  });
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

function buildPublicationSchedulePolicy(
  input: PublicationSchedulePolicyInput,
): PublicationSchedulePolicy {
  const mode = input.mode ?? "create";
  const policyVersion = PUBLICATION_SCHEDULE_POLICY_VERSION;
  const now = input.now ?? Date.now();
  const minLeadTimeMinutes = 15;
  const nearDueEditWindowMinutes = 30;
  const maxHorizonDays = 30;
  const normalizedScheduledAtUtc = normalizePublicationScheduleTimestamp(
    input.scheduledAtUtc,
  );
  const normalizedTimezone = normalizePublicationScheduleTimezone(
    input.scheduledTimezone,
  );
  const timing = buildPublicationScheduleTimingPolicy({
    maxHorizonDays,
    minLeadTimeMinutes,
    nearDueEditWindowMinutes,
    now,
    normalizedScheduledAtUtc,
    normalizedTimezone,
  });
  const isViewMode =
    mode === "calendar" || mode === "observability" || mode === "revalidate";
  const providerHint = buildPublicationScheduleProviderHint({
    availableScopes: input.availableScopes ?? [],
    connectionStatus: input.connectionStatus ?? null,
    hasRequiredScopes: input.hasRequiredScopes,
    mode,
    providerSupportStatus: input.targetSupportStatus ?? "supported",
    schedulingAllowed: input.schedulingAllowed,
    targetPlatform: input.targetPlatform,
  });
  const execution = buildPublicationScheduleExecutionPolicy({
    claimedAt: input.executionClaimedAt ?? null,
    claimedBy: input.executionClaimedBy ?? null,
    mode,
    queueJobId: input.executionQueueJobId ?? null,
    status: normalizeExecutionStatus(
      input.executionStatus ?? null,
      input.currentPublicationStatus ?? null,
    ),
    timing,
  });
  const targetPolicy =
    typeof input.fanoutTargetCount === "number"
      ? buildPublicationScheduleTargetPolicy({
          blockedTargetCount: input.fanoutBlockedTargetCount ?? 0,
          fanoutTargetCount: input.fanoutTargetCount,
          hasRunnableTargets: input.hasRunnableTargets ?? false,
          reauthRequiredTargetCount: input.fanoutReauthRequiredTargetCount ?? 0,
        })
      : null;
  const finalBlockReason = (() => {
    if (!normalizedScheduledAtUtc) {
      return "schedule_time_invalid";
    }

    if (!normalizedTimezone) {
      return "schedule_timezone_invalid";
    }

    if (
      !isViewMode &&
      !isPublicationScheduleTimestampFuture(normalizedScheduledAtUtc, now)
    ) {
      return "schedule_time_invalid";
    }

    if (
      !input.hasApprovedBundle ||
      input.contentJobReviewStatus !== "approved"
    ) {
      return "content_job_not_approved";
    }

    if (
      input.contentJobStatus !== "done" &&
      input.contentJobStatus !== "completed"
    ) {
      return "content_job_not_complete";
    }

    if (
      (mode === "fanout_create" || mode === "fanout_edit") &&
      (input.targetCount ?? 0) <= 0
    ) {
      return "fanout_not_ready";
    }

    if (input.targetSupportStatus === "unsupported") {
      return "target_unsupported";
    }

    return resolvePublicationScheduleFinalBlockReason({
      currentFanoutStatus: input.currentFanoutStatus ?? null,
      currentPublicationStatus: input.currentPublicationStatus ?? null,
      execution,
      mode,
      timing,
    });
  })();
  const softBlockReason = finalBlockReason
    ? null
    : resolvePublicationScheduleSoftBlockReason({
        connectionStatus: input.connectionStatus ?? null,
        hasPublishableAsset: input.hasPublishableAsset,
        hasRequiredScopes: input.hasRequiredScopes,
        hasRunnableTargets: input.hasRunnableTargets ?? true,
        mode,
        schedulingAllowed: input.schedulingAllowed,
        targetCount: input.targetCount ?? 0,
      });
  const warningCodes = new Set<string>();
  const warnings: PublicationSchedulePolicyNotice[] = [];
  const info: PublicationSchedulePolicyNotice[] = [];

  if (timing.isNearDue) {
    warningCodes.add("near_due");
    warnings.push({
      code: "near_due",
      message:
        "The requested schedule is close to execution and should be treated as near-due.",
    });
  }

  if (timing.isStale) {
    warningCodes.add("stale");
    warnings.push({
      code: "stale",
      message:
        "The schedule or execution claim is stale and should be revalidated server-side.",
    });
  }

  if (timing.isExpired) {
    warningCodes.add("expired");
    warnings.push({
      code: "expired",
      message:
        "The stored schedule time has already passed and should be revalidated.",
    });
  }

  if (!input.schedulingAllowed) {
    warningCodes.add("scheduling_not_allowed");
    warnings.push({
      code: "scheduling_not_allowed",
      message:
        "The selected target account does not currently allow StreamOS scheduling readiness.",
    });
  }

  if (!input.hasRequiredScopes) {
    warningCodes.add("missing_publish_scopes");
    warnings.push({
      code: "missing_publish_scopes",
      message: "The connected account is missing publish scopes for execution.",
    });
  }

  if (!input.hasPublishableAsset) {
    warningCodes.add("publishable_asset_missing");
    warnings.push({
      code: "publishable_asset_missing",
      message:
        "The publishable asset is still missing for the selected schedule.",
    });
  }

  if (providerHint.requiresReauth) {
    warningCodes.add("publication_reauth_required");
    warnings.push({
      code: "publication_reauth_required",
      message:
        "The connected account needs re-authentication before execution can proceed.",
    });
  }

  if (input.mode === "fanout_create" || input.mode === "fanout_edit") {
    info.push({
      code: "fanout_target_policy",
      message:
        "Fanout scheduling remains server-managed; each target stays auditable through the shared policy layer.",
    });
  } else {
    info.push({
      code: "streamos_managed",
      message:
        "Provider-native scheduling is not used; StreamOS stores the UTC plan and keeps execution server-side.",
    });
  }

  const scheduleStatus = determinePolicyScheduleStatus({
    finalBlockReason,
    mode,
    softBlockReason,
    timing,
  });
  const policyStatus = determinePolicyStatus({
    finalBlockReason,
    mode,
    softBlockReason,
    timing,
  });
  const accepted = finalBlockReason === null;
  const softBlocked = softBlockReason !== null;
  const actionPolicy = buildPublicationScheduleActionPolicy({
    finalBlockReason,
    isLocked:
      execution.isLocked ||
      ((mode === "edit" || mode === "replace" || mode === "fanout_edit") &&
        timing.isNearDue),
    itemLabel:
      mode === "fanout_create" || mode === "fanout_edit"
        ? "fanout schedule"
        : "publication schedule",
    lockReason: execution.isLocked
      ? "publication_processing"
      : timing.isNearDue &&
          (mode === "edit" || mode === "replace" || mode === "fanout_edit")
        ? "publication_status_not_schedulable"
        : null,
    replaceSupported: mode !== "fanout_create" && mode !== "fanout_edit",
  });

  return {
    accepted,
    actionPolicy,
    blockReason: finalBlockReason ?? softBlockReason,
    execution,
    info,
    mode,
    nextRecommendedAction: buildPublicationScheduleNextAction({
      finalBlockReason,
      policyStatus,
      softBlockReason,
      timing,
    }),
    policyStatus,
    policyVersion,
    providerHint,
    requiresRevalidation:
      timing.isNearDue ||
      timing.isStale ||
      timing.isExpired ||
      execution.isLocked ||
      softBlocked,
    safeDescription: buildPublicationScheduleSafeDescription({
      finalBlockReason,
      mode,
      providerHint,
      softBlockReason,
      timing,
      targetPolicy,
    }),
    scheduleStatus,
    softBlocked,
    targetPolicy,
    timing,
    warnings,
  };
}

function buildPublicationScheduleSafeDescription({
  finalBlockReason,
  mode,
  providerHint,
  softBlockReason,
  timing,
  targetPolicy,
}: {
  finalBlockReason: ContentPublicationScheduleBlockReason | null;
  mode: PublicationSchedulePolicyMode;
  providerHint: PublicationScheduleProviderHint;
  softBlockReason: ContentPublicationScheduleBlockReason | null;
  timing: PublicationScheduleTimingPolicy;
  targetPolicy: PublicationScheduleTargetPolicy | null;
}): string {
  if (finalBlockReason) {
    switch (finalBlockReason) {
      case "content_job_not_approved":
        return "The repurposing job is not approved yet.";
      case "content_job_not_complete":
        return "The repurposing job is not complete yet.";
      case "fanout_finalized":
        return "The parent fanout is already final.";
      case "publication_finalized":
        return "The publication is already final or currently processing.";
      case "publication_processing":
        return "The publication is already locked for execution.";
      case "publication_status_not_schedulable":
        return "The requested schedule is too close to execution to edit safely.";
      case "schedule_time_invalid":
        return "Choose a future schedule time within the allowed horizon.";
      case "schedule_timezone_invalid":
        return "Provide a valid IANA timezone for the schedule.";
      case "target_unsupported":
        return "The selected target platform does not support scheduling in StreamOS.";
      default:
        return "The requested schedule is not ready yet.";
    }
  }

  if (softBlockReason) {
    switch (softBlockReason) {
      case "missing_publish_scopes":
        return "Scheduling is stored, but the connected account is missing publish scopes.";
      case "platform_connection_missing":
        return "Scheduling is stored, but the platform connection is missing.";
      case "platform_connection_not_connected":
        return "Scheduling is stored, but the platform connection needs re-authentication.";
      case "publishable_asset_missing":
        return "Scheduling is stored, but the publishable asset is still missing.";
      case "scheduling_not_allowed":
        return "Scheduling is stored, but the selected account does not currently allow execution readiness.";
      case "fanout_not_ready":
        return "Scheduling is stored, but the parent fanout is not ready for execution yet.";
      default:
        return "Scheduling is stored, but it still needs server-side attention.";
    }
  }

  if (
    timing.isExpired &&
    (mode === "calendar" || mode === "observability" || mode === "revalidate")
  ) {
    return "The stored schedule has expired and should be revalidated server-side.";
  }

  if (
    timing.isNearDue &&
    (mode === "edit" || mode === "replace" || mode === "fanout_edit")
  ) {
    return "The requested schedule is near execution and can no longer be edited safely.";
  }

  if (timing.isNearDue) {
    return "The requested schedule is near execution and will be handled by the server-side scheduler.";
  }

  if (targetPolicy) {
    return `Scheduling is ready for ${providerHint.safeLabel.toLowerCase()} and stays streamos-managed until execution is introduced.`;
  }

  return `${providerHint.safeLabel} stays streamos-managed until execution is introduced.`;
}

function buildPublicationScheduleNextAction({
  finalBlockReason,
  policyStatus,
  softBlockReason,
  timing,
}: {
  finalBlockReason: ContentPublicationScheduleBlockReason | null;
  policyStatus: PublicationSchedulePolicyStatus;
  softBlockReason: ContentPublicationScheduleBlockReason | null;
  timing: PublicationScheduleTimingPolicy;
}): string | null {
  if (finalBlockReason) {
    if (finalBlockReason === "schedule_timezone_invalid") {
      return "Provide a valid IANA timezone before scheduling again.";
    }

    if (finalBlockReason === "schedule_time_invalid") {
      return "Choose a future UTC time inside the allowed scheduling window.";
    }

    if (
      finalBlockReason === "content_job_not_approved" ||
      finalBlockReason === "content_job_not_complete"
    ) {
      return "Approve and finish the repurposing job before retrying.";
    }

    if (
      finalBlockReason === "publication_finalized" ||
      finalBlockReason === "fanout_finalized"
    ) {
      return "Create a fresh publication or fanout request instead of reusing this one.";
    }

    if (finalBlockReason === "publication_processing") {
      return "Wait for the current execution lock to clear before editing.";
    }

    return "Review the current schedule policy before retrying.";
  }

  if (softBlockReason) {
    switch (softBlockReason) {
      case "missing_publish_scopes":
        return "Reconnect the provider account with the required publish scopes.";
      case "platform_connection_missing":
      case "platform_connection_not_connected":
        return "Reconnect the provider account before execution can proceed.";
      case "publishable_asset_missing":
        return "Attach a publishable asset before the schedule can run.";
      case "scheduling_not_allowed":
        return "Wait until the target account supports scheduling readiness.";
      case "fanout_not_ready":
        return "Prepare runnable fanout targets before scheduling.";
      default:
        return "Review the schedule policy and revalidate the request.";
    }
  }

  if (policyStatus === "expired") {
    return "Revalidate the schedule before execution.";
  }

  if (timing.isNearDue) {
    return "Keep the schedule unchanged until the near-due window passes.";
  }

  if (policyStatus === "stale") {
    return "Revalidate the schedule before execution.";
  }

  return null;
}

function buildPublicationScheduleExecutionPolicy({
  claimedAt,
  claimedBy,
  mode,
  queueJobId,
  status,
  timing,
}: {
  claimedAt: string | null;
  claimedBy: string | null;
  mode: PublicationSchedulePolicyMode;
  queueJobId: string | null;
  status: PublicationScheduleExecutionPolicyStatus;
  timing: PublicationScheduleTimingPolicy;
}): PublicationScheduleExecutionPolicy {
  const isLocked =
    status === "claimed" ||
    status === "queued" ||
    status === "executing" ||
    (mode === "edit" || mode === "replace" || mode === "fanout_edit"
      ? timing.isNearDue
      : false);

  return {
    claimedAt,
    claimedBy,
    isLocked,
    queueJobId,
    status,
  };
}

function buildPublicationScheduleTimingPolicy({
  maxHorizonDays,
  minLeadTimeMinutes,
  nearDueEditWindowMinutes,
  now,
  normalizedScheduledAtUtc,
  normalizedTimezone,
}: {
  maxHorizonDays: number;
  minLeadTimeMinutes: number;
  nearDueEditWindowMinutes: number;
  now: number;
  normalizedScheduledAtUtc: string | null;
  normalizedTimezone: string | null;
}): PublicationScheduleTimingPolicy {
  if (!normalizedScheduledAtUtc) {
    return {
      expiresAt: null,
      isExpired: false,
      isNearDue: false,
      isStale: false,
      minLeadTimeMinutes,
      maxHorizonDays,
      nearDueEditWindowMinutes,
      scheduledAtUtc: null,
      scheduledTimezone: normalizedTimezone,
      staleAt: null,
    };
  }

  const scheduledAt = new Date(normalizedScheduledAtUtc).getTime();
  const leadTimeMinutes = (scheduledAt - now) / 60_000;
  const horizonMinutes = maxHorizonDays * 24 * 60;
  const isExpired = leadTimeMinutes < 0;
  const staleAt = new Date(
    scheduledAt + nearDueEditWindowMinutes * 60_000,
  ).toISOString();

  return {
    expiresAt: new Date(scheduledAt).toISOString(),
    isExpired,
    isNearDue:
      leadTimeMinutes >= 0 && leadTimeMinutes < nearDueEditWindowMinutes,
    isStale:
      leadTimeMinutes > horizonMinutes ||
      (!isExpired && leadTimeMinutes < minLeadTimeMinutes),
    minLeadTimeMinutes,
    maxHorizonDays,
    nearDueEditWindowMinutes,
    scheduledAtUtc: normalizedScheduledAtUtc,
    scheduledTimezone: normalizedTimezone,
    staleAt,
  };
}

function buildPublicationScheduleProviderHint({
  availableScopes,
  connectionStatus,
  hasRequiredScopes,
  mode,
  providerSupportStatus,
  schedulingAllowed,
  targetPlatform,
}: {
  availableScopes: string[];
  connectionStatus: ConnectionStatus | null;
  hasRequiredScopes: boolean;
  mode: PublicationSchedulePolicyMode;
  providerSupportStatus:
    | "conditional"
    | "experimental"
    | "supported"
    | "unsupported";
  schedulingAllowed: boolean;
  targetPlatform: StreamPlatform | "fanout";
}): PublicationScheduleProviderHint {
  const requiredScopes =
    targetPlatform === "youtube"
      ? ["https://www.googleapis.com/auth/youtube.upload"]
      : targetPlatform === "tiktok"
        ? ["video.publish"]
        : [];
  const requiresReauth =
    connectionStatus === "expired" ||
    connectionStatus === "pending" ||
    connectionStatus === "revoked";
  const nativeSchedulingSupported =
    targetPlatform === "youtube" || targetPlatform === "tiktok";
  const safeLabel =
    targetPlatform === "fanout"
      ? "Fanout scheduling"
      : `${getPublicationScheduleProviderHintLabel(targetPlatform)} scheduling`;

  let description =
    "Provider-native scheduling is not used; StreamOS stores the UTC schedule and keeps execution server-side.";

  if (targetPlatform === "fanout") {
    description =
      "Parent fanout scheduling is server-managed; each target remains auditable and execution stays inside StreamOS.";
  } else if (targetPlatform === "tiktok") {
    description =
      "TikTok scheduling stays server-managed and depends on the connected account scopes and capability state.";
  } else if (targetPlatform === "youtube") {
    description =
      "YouTube scheduling stays server-managed; provider-native publishAt execution is not used by StreamOS.";
  }

  if (mode === "observability" || mode === "calendar") {
    description = `${description} The current read model should be treated as a safe schedule snapshot.`;
  }

  return {
    description,
    nativeSchedulingSupported,
    nativeSchedulingUsed: false,
    provider: targetPlatform,
    requiredScopes,
    requiresReauth,
    requiresScopes:
      !hasRequiredScopes ||
      requiredScopes.some((scope) => !availableScopes.includes(scope)),
    schedulingAllowed,
    safeLabel,
    supportStatus: providerSupportStatus,
  };
}

function buildPublicationScheduleTargetPolicy({
  blockedTargetCount,
  fanoutTargetCount,
  hasRunnableTargets,
  reauthRequiredTargetCount,
}: {
  blockedTargetCount: number;
  fanoutTargetCount: number;
  hasRunnableTargets: boolean;
  reauthRequiredTargetCount: number;
}): PublicationScheduleTargetPolicy {
  const readyTargetCount = Math.max(
    0,
    fanoutTargetCount - blockedTargetCount - reauthRequiredTargetCount,
  );

  return {
    blockedTargetCount,
    readyTargetCount,
    reauthRequiredTargetCount,
    runnableTargetCount: hasRunnableTargets ? readyTargetCount : 0,
    targetCount: fanoutTargetCount,
  };
}

function determinePolicyScheduleStatus({
  finalBlockReason,
  softBlockReason,
  mode,
  timing,
}: {
  finalBlockReason: ContentPublicationScheduleBlockReason | null;
  softBlockReason: ContentPublicationScheduleBlockReason | null;
  mode: PublicationSchedulePolicyMode;
  timing: PublicationScheduleTimingPolicy;
}): ContentPublicationScheduleStatus {
  if (finalBlockReason || softBlockReason) {
    return "schedule_blocked";
  }

  if (
    timing.isExpired &&
    (mode === "calendar" || mode === "observability" || mode === "revalidate")
  ) {
    return "schedule_expired";
  }

  return "schedule_ready";
}

function determinePolicyStatus({
  finalBlockReason,
  softBlockReason,
  mode,
  timing,
}: {
  finalBlockReason: ContentPublicationScheduleBlockReason | null;
  softBlockReason: ContentPublicationScheduleBlockReason | null;
  mode: PublicationSchedulePolicyMode;
  timing: PublicationScheduleTimingPolicy;
}): PublicationSchedulePolicyStatus {
  if (finalBlockReason || softBlockReason) {
    return "blocked";
  }

  if (
    timing.isExpired &&
    (mode === "calendar" || mode === "observability" || mode === "revalidate")
  ) {
    return "expired";
  }

  if (timing.isStale) {
    return "stale";
  }

  return "ready";
}

function normalizeExecutionStatus(
  executionStatus: PublicationScheduleExecutionPolicyStatus | null,
  currentPublicationStatus: ContentPublicationStatus | null,
): PublicationScheduleExecutionPolicyStatus {
  if (executionStatus) {
    return executionStatus;
  }

  if (currentPublicationStatus === "publishing") {
    return "executing";
  }

  if (currentPublicationStatus === "queued") {
    return "queued";
  }

  if (currentPublicationStatus === "published") {
    return "completed";
  }

  if (
    currentPublicationStatus === "canceled" ||
    currentPublicationStatus === "rejected"
  ) {
    return "canceled";
  }

  if (currentPublicationStatus === "failed_permanent") {
    return "expired";
  }

  if (currentPublicationStatus === "failed_retryable") {
    return "claimed";
  }

  return "idle";
}

function resolvePublicationScheduleFinalBlockReason({
  currentFanoutStatus,
  currentPublicationStatus,
  execution,
  mode,
  timing,
}: {
  currentFanoutStatus: ContentPublicationFanoutStatus | null;
  currentPublicationStatus: ContentPublicationStatus | null;
  execution: PublicationScheduleExecutionPolicy;
  mode: PublicationSchedulePolicyMode;
  timing: PublicationScheduleTimingPolicy;
}): ContentPublicationScheduleBlockReason | null {
  if (
    currentPublicationStatus === "published" ||
    currentPublicationStatus === "failed_permanent" ||
    currentPublicationStatus === "failed_retryable" ||
    currentPublicationStatus === "canceled" ||
    currentPublicationStatus === "rejected"
  ) {
    return "publication_finalized";
  }

  if (
    currentPublicationStatus === "publishing" ||
    execution.status === "executing" ||
    execution.status === "claimed" ||
    execution.status === "queued" ||
    execution.isLocked
  ) {
    return "publication_processing";
  }

  if (
    (mode === "edit" || mode === "replace" || mode === "fanout_edit") &&
    timing.isNearDue
  ) {
    return "publication_status_not_schedulable";
  }

  if (
    mode === "fanout_edit" &&
    (currentFanoutStatus === "canceled" || currentFanoutStatus === "blocked")
  ) {
    return "fanout_finalized";
  }

  return null;
}

function resolvePublicationScheduleSoftBlockReason({
  connectionStatus,
  hasPublishableAsset,
  hasRequiredScopes,
  hasRunnableTargets,
  mode,
  schedulingAllowed,
  targetCount,
}: {
  connectionStatus: ConnectionStatus | null;
  hasPublishableAsset: boolean;
  hasRequiredScopes: boolean;
  hasRunnableTargets: boolean;
  mode: PublicationSchedulePolicyMode;
  schedulingAllowed: boolean;
  targetCount: number;
}): ContentPublicationScheduleBlockReason | null {
  if (
    connectionStatus === "expired" ||
    connectionStatus === "pending" ||
    connectionStatus === "revoked"
  ) {
    return "publication_reauth_required";
  }

  if (!schedulingAllowed) {
    return "scheduling_not_allowed";
  }

  if (!hasRequiredScopes) {
    return "missing_publish_scopes";
  }

  if (!hasPublishableAsset) {
    return "publishable_asset_missing";
  }

  if (
    (mode === "fanout_create" || mode === "fanout_edit") &&
    targetCount > 0 &&
    !hasRunnableTargets
  ) {
    return "fanout_not_ready";
  }

  return null;
}

function getPublicationScheduleProviderHintLabel(
  targetPlatform: StreamPlatform | "fanout",
): string {
  switch (targetPlatform) {
    case "fanout":
      return "Fanout";
    case "kick":
      return "Kick";
    case "tiktok":
      return "TikTok";
    case "twitch":
      return "Twitch";
    case "youtube":
      return "YouTube";
  }
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
