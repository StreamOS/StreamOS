import type {
  ContentPublicationScheduleActionPolicy,
  ContentPublicationScheduleBlockReason,
  ContentPublicationScheduleStatus,
  PublicationFanoutPolicy,
  PublicationSchedulePolicy,
  StreamPlatform,
} from "@streamos/types";

export const PUBLICATION_SCHEDULE_CONFLICT_SEVERITIES = [
  "info",
  "warning",
  "blocking",
  "expired",
  "requires_action",
  "unknown",
] as const;

export type PublicationScheduleConflictSeverity =
  (typeof PUBLICATION_SCHEDULE_CONFLICT_SEVERITIES)[number];

export const PUBLICATION_SCHEDULE_CONFLICT_KEYS = [
  "asset_needs_revalidation",
  "fanout_target_blocked",
  "missing_scope",
  "provider_capability_stale",
  "provider_native_scheduling_unused",
  "provider_scheduling_unknown",
  "reauth_required",
  "schedule_already_claimed",
  "schedule_already_enqueued",
  "schedule_completed",
  "schedule_executing",
  "schedule_expired",
  "schedule_in_past",
  "schedule_stale",
  "schedule_too_far",
  "schedule_too_soon",
  "streamos_managed_primary",
  "timezone_invalid",
  "tiktok_creator_info_stale",
  "unsupported_provider",
  "unknown",
] as const;

export type PublicationScheduleConflictKey =
  (typeof PUBLICATION_SCHEDULE_CONFLICT_KEYS)[number];

export type PublicationScheduleConflictScope =
  | "fanout"
  | "policy"
  | "publication"
  | "provider"
  | "schedule"
  | "target";

export type PublicationScheduleConflictTone =
  | "emerald"
  | "amber"
  | "rose"
  | "slate"
  | "violet";

export type PublicationScheduleConflictActionLink = {
  href: string;
  label: string;
};

export type PublicationScheduleFanoutTargetConflictSummary = {
  blockMessage: string | null;
  blockReason: string | null;
  connectionStatus: "connected" | "expired" | "pending" | "revoked" | null;
  id: string;
  isBlocked: boolean;
  isReauthRequired: boolean;
  providerLabel: string;
  targetLabel: string;
  targetPlatform: Extract<StreamPlatform, "tiktok" | "youtube">;
  targetStatus: "blocked" | "validated";
  targetStatusLabel: string;
};

export type PublicationScheduleConflict = {
  actionLink: PublicationScheduleConflictActionLink | null;
  affectedScope: PublicationScheduleConflictScope;
  blocked: boolean;
  conflictKey: PublicationScheduleConflictKey;
  description: string;
  editable: boolean;
  mayShowActionLink: boolean;
  operatorFacingHint: string | null;
  provider: StreamPlatform | "fanout" | null;
  requiresRevalidation: boolean;
  severity: PublicationScheduleConflictSeverity;
  targetId: string | null;
  targetLabel: string | null;
  title: string;
  userFacingNextStep: string;
};

export type PublicationScheduleConflictSummary = {
  additionalConflictCount: number;
  conflictCount: number;
  conflicts: PublicationScheduleConflict[];
  hasActionNeededConflict: boolean;
  hasBlockingConflict: boolean;
  hasInfoConflict: boolean;
  hasUnknownConflict: boolean;
  hasWarningConflict: boolean;
  highestSeverity: PublicationScheduleConflictSeverity;
  primaryConflict: PublicationScheduleConflict | null;
  topHint: string | null;
};

export type PublicationScheduleConflictSource = {
  blockedReason: ContentPublicationScheduleBlockReason | null;
  detailHref: string;
  fanoutPolicy: PublicationFanoutPolicy | null;
  fanoutSummaryHref: string | null;
  fanoutTargetBlockedCount: number | null;
  fanoutTargetCount: number | null;
  fanoutTargetProviderSummary: string | null;
  fanoutTargetReauthRequiredCount: number | null;
  fanoutTargetReadyCount: number | null;
  fanoutTargetSummaries: PublicationScheduleFanoutTargetConflictSummary[];
  hasApprovedBundle: boolean;
  hasPublishableAsset: boolean;
  hasRequiredScopes: boolean;
  historyHref: string;
  isBlocked: boolean;
  isExpired: boolean;
  isReauthRequired: boolean;
  itemType: "fanout" | "publication";
  publicationStatusLabel: string | null;
  scheduleActionPolicy: ContentPublicationScheduleActionPolicy;
  schedulePolicy: PublicationSchedulePolicy;
  scheduleStatus: ContentPublicationScheduleStatus;
  scheduledAtUtc: string | null;
  scheduledTimezoneLabel: string;
  scheduledTimezoneRaw: string | null;
  targetAccountLabel: string | null;
  targetPlatform: StreamPlatform | "fanout";
  targetPlatformLabel: string;
};

const SEVERITY_LABELS: Record<PublicationScheduleConflictSeverity, string> = {
  blocking: "Blocking",
  expired: "Expired",
  info: "Info",
  requires_action: "Action needed",
  unknown: "Unknown",
  warning: "Warning",
};

const SEVERITY_TONES: Record<
  PublicationScheduleConflictSeverity,
  PublicationScheduleConflictTone
> = {
  blocking: "rose",
  expired: "amber",
  info: "slate",
  requires_action: "violet",
  unknown: "slate",
  warning: "amber",
};

const SEVERITY_PRIORITY: Record<PublicationScheduleConflictSeverity, number> = {
  blocking: 0,
  expired: 1,
  requires_action: 2,
  warning: 3,
  info: 4,
  unknown: 5,
};

const CONFLICT_PRIORITY: Record<PublicationScheduleConflictKey, number> = {
  schedule_already_claimed: 0,
  schedule_already_enqueued: 1,
  schedule_executing: 2,
  schedule_completed: 3,
  schedule_expired: 10,
  schedule_in_past: 11,
  reauth_required: 20,
  missing_scope: 21,
  timezone_invalid: 22,
  asset_needs_revalidation: 23,
  unsupported_provider: 24,
  fanout_target_blocked: 30,
  schedule_stale: 40,
  provider_capability_stale: 41,
  tiktok_creator_info_stale: 42,
  schedule_too_soon: 50,
  schedule_too_far: 51,
  provider_native_scheduling_unused: 60,
  provider_scheduling_unknown: 61,
  streamos_managed_primary: 70,
  unknown: 999,
};

export function getPublicationScheduleConflictSeverityLabel(
  severity: PublicationScheduleConflictSeverity,
): string {
  return SEVERITY_LABELS[severity];
}

export function getPublicationScheduleConflictSeverityTone(
  severity: PublicationScheduleConflictSeverity,
): PublicationScheduleConflictTone {
  return SEVERITY_TONES[severity];
}

export function buildPublicationScheduleConflictSummary(
  source: PublicationScheduleConflictSource,
): PublicationScheduleConflictSummary {
  const conflicts: PublicationScheduleConflict[] = [];
  const actionLink = resolveActionLink(source);
  const providerNativePolicy =
    source.schedulePolicy.schedulingDecision.providerNativeSchedulingPolicy;
  const providerNativeAvailability =
    source.schedulePolicy.schedulingDecision
      .providerNativeSchedulingAvailability;
  const providerHint = source.schedulePolicy.providerHint;
  const executionStatus = source.schedulePolicy.execution.status;
  const requiresRevalidation =
    source.schedulePolicy.requiresRevalidation ||
    source.schedulePolicy.timing.isStale ||
    source.schedulePolicy.timing.isExpired ||
    source.isBlocked ||
    source.isExpired ||
    source.isReauthRequired;

  const addConflict = (conflict: PublicationScheduleConflict): void => {
    const exists = conflicts.some(
      (existing) =>
        existing.conflictKey === conflict.conflictKey &&
        existing.targetId === conflict.targetId &&
        existing.targetLabel === conflict.targetLabel &&
        existing.provider === conflict.provider,
    );

    if (!exists) {
      conflicts.push(conflict);
    }
  };

  if (executionStatus === "claimed") {
    addConflict({
      actionLink,
      affectedScope: "schedule",
      blocked: true,
      conflictKey: "schedule_already_claimed",
      description: "The schedule is already claimed by the server.",
      editable: false,
      mayShowActionLink: shouldShowActionLink("blocking", actionLink),
      operatorFacingHint: source.schedulePolicy.nextRecommendedAction,
      provider: source.targetPlatform,
      requiresRevalidation: true,
      severity: "blocking",
      targetId: null,
      targetLabel: source.targetPlatformLabel,
      title: "Schedule already claimed",
      userFacingNextStep:
        "Wait for the current claim to finish before changing the schedule again.",
    });
  } else if (executionStatus === "queued") {
    addConflict({
      actionLink,
      affectedScope: "schedule",
      blocked: true,
      conflictKey: "schedule_already_enqueued",
      description: "The schedule is already queued for server-side work.",
      editable: false,
      mayShowActionLink: shouldShowActionLink("blocking", actionLink),
      operatorFacingHint: source.schedulePolicy.nextRecommendedAction,
      provider: source.targetPlatform,
      requiresRevalidation: true,
      severity: "blocking",
      targetId: null,
      targetLabel: source.targetPlatformLabel,
      title: "Schedule already enqueued",
      userFacingNextStep:
        "Wait until the queued run finishes before changing the same schedule again.",
    });
  } else if (executionStatus === "executing") {
    addConflict({
      actionLink,
      affectedScope: "schedule",
      blocked: true,
      conflictKey: "schedule_executing",
      description: "The schedule is currently executing server-side.",
      editable: false,
      mayShowActionLink: shouldShowActionLink("blocking", actionLink),
      operatorFacingHint: source.schedulePolicy.nextRecommendedAction,
      provider: source.targetPlatform,
      requiresRevalidation: true,
      severity: "blocking",
      targetId: null,
      targetLabel: source.targetPlatformLabel,
      title: "Schedule executing",
      userFacingNextStep:
        "Wait for the execution to finish before editing the schedule again.",
    });
  } else if (
    executionStatus === "completed" ||
    source.publicationStatusLabel === "Published"
  ) {
    addConflict({
      actionLink,
      affectedScope: "schedule",
      blocked: false,
      conflictKey: "schedule_completed",
      description: "The schedule already completed and is read-only history.",
      editable: false,
      mayShowActionLink: shouldShowActionLink("info", actionLink),
      operatorFacingHint: null,
      provider: source.targetPlatform,
      requiresRevalidation: false,
      severity: "info",
      targetId: null,
      targetLabel: source.targetPlatformLabel,
      title: "Schedule completed",
      userFacingNextStep:
        "Open the history if you want to review the completed entry.",
    });
  }

  if (
    source.schedulePolicy.timing.isExpired ||
    source.scheduleStatus === "schedule_expired"
  ) {
    addConflict({
      actionLink,
      affectedScope: "schedule",
      blocked: true,
      conflictKey: "schedule_expired",
      description: "The stored schedule time has already expired.",
      editable: false,
      mayShowActionLink: shouldShowActionLink("expired", actionLink),
      operatorFacingHint: source.schedulePolicy.nextRecommendedAction,
      provider: source.targetPlatform,
      requiresRevalidation: true,
      severity: "expired",
      targetId: null,
      targetLabel: source.targetPlatformLabel,
      title: "Schedule expired",
      userFacingNextStep:
        "Choose a new time or cancel the schedule if it should not be used anymore.",
    });
  } else if (
    source.scheduledAtUtc &&
    isPastTimestamp(source.scheduledAtUtc) &&
    source.scheduleStatus !== "schedule_canceled" &&
    source.scheduleStatus !== "schedule_replaced"
  ) {
    addConflict({
      actionLink,
      affectedScope: "schedule",
      blocked: true,
      conflictKey: "schedule_in_past",
      description: "The stored schedule time is already in the past.",
      editable: false,
      mayShowActionLink: shouldShowActionLink("expired", actionLink),
      operatorFacingHint: source.schedulePolicy.nextRecommendedAction,
      provider: source.targetPlatform,
      requiresRevalidation: true,
      severity: "expired",
      targetId: null,
      targetLabel: source.targetPlatformLabel,
      title: "Schedule in the past",
      userFacingNextStep:
        "Choose a future time or remove the old schedule entry.",
    });
  }

  if (source.schedulePolicy.timing.isNearDue) {
    addConflict({
      actionLink,
      affectedScope: "schedule",
      blocked: false,
      conflictKey: "schedule_too_soon",
      description: "The chosen time is close to now and has a short lead time.",
      editable: source.scheduleActionPolicy.canEdit,
      mayShowActionLink: shouldShowActionLink("warning", actionLink),
      operatorFacingHint: source.schedulePolicy.nextRecommendedAction,
      provider: source.targetPlatform,
      requiresRevalidation: true,
      severity: "warning",
      targetId: null,
      targetLabel: source.targetPlatformLabel,
      title: "Schedule is too close to now",
      userFacingNextStep:
        "Use more lead time or wait until the near-due window is safer.",
    });
  }

  if (isBeyondScheduleHorizon(source)) {
    addConflict({
      actionLink,
      affectedScope: "schedule",
      blocked: false,
      conflictKey: "schedule_too_far",
      description:
        "The chosen time is beyond the supported scheduling horizon.",
      editable: source.scheduleActionPolicy.canEdit,
      mayShowActionLink: shouldShowActionLink("warning", actionLink),
      operatorFacingHint: source.schedulePolicy.nextRecommendedAction,
      provider: source.targetPlatform,
      requiresRevalidation: true,
      severity: "warning",
      targetId: null,
      targetLabel: source.targetPlatformLabel,
      title: "Schedule is beyond the supported horizon",
      userFacingNextStep:
        "Choose a time inside the supported scheduling horizon.",
    });
  }

  if (
    source.scheduledTimezoneRaw !== null &&
    source.scheduledTimezoneLabel === "UTC (Fallback)"
  ) {
    addConflict({
      actionLink,
      affectedScope: "schedule",
      blocked: true,
      conflictKey: "timezone_invalid",
      description: "The timezone could not be resolved safely.",
      editable: source.scheduleActionPolicy.canEdit,
      mayShowActionLink: shouldShowActionLink("blocking", actionLink),
      operatorFacingHint: "Use a valid IANA timezone such as Europe/Berlin.",
      provider: source.targetPlatform,
      requiresRevalidation: true,
      severity: "blocking",
      targetId: null,
      targetLabel: source.targetPlatformLabel,
      title: "Timezone needs correction",
      userFacingNextStep:
        "Choose a valid timezone so the schedule can be computed correctly.",
    });
  }

  if (source.isReauthRequired || providerHint.requiresReauth) {
    addConflict({
      actionLink,
      affectedScope: "provider",
      blocked: true,
      conflictKey: "reauth_required",
      description: "The platform connection needs to be refreshed first.",
      editable: false,
      mayShowActionLink: shouldShowActionLink("requires_action", actionLink),
      operatorFacingHint:
        "Reconnect the gateway-owned platform connection before retrying.",
      provider: source.targetPlatform,
      requiresRevalidation: true,
      severity: "requires_action",
      targetId: null,
      targetLabel: source.targetPlatformLabel,
      title: "Platform connection needs re-auth",
      userFacingNextStep:
        "Reconnect the account before reusing this schedule entry.",
    });
  }

  if (
    !source.hasRequiredScopes ||
    source.blockedReason === "missing_publish_scopes" ||
    providerHint.requiresScopes
  ) {
    addConflict({
      actionLink,
      affectedScope: "provider",
      blocked: true,
      conflictKey: "missing_scope",
      description:
        "The connected account is missing the required publish scopes.",
      editable: false,
      mayShowActionLink: shouldShowActionLink("requires_action", actionLink),
      operatorFacingHint:
        "Reconnect with the required publish scopes on the gateway-owned connection.",
      provider: source.targetPlatform,
      requiresRevalidation: true,
      severity: "requires_action",
      targetId: null,
      targetLabel: source.targetPlatformLabel,
      title: "Missing publish scopes",
      userFacingNextStep:
        "Reconnect the account with the needed scopes before continuing.",
    });
  }

  if (
    !source.hasPublishableAsset ||
    source.blockedReason === "publishable_asset_missing"
  ) {
    addConflict({
      actionLink,
      affectedScope: "publication",
      blocked: true,
      conflictKey: "asset_needs_revalidation",
      description: "The publishable asset still needs a safe revalidation.",
      editable: false,
      mayShowActionLink: shouldShowActionLink("requires_action", actionLink),
      operatorFacingHint:
        "Revalidate the approved bundle or asset snapshot before continuing.",
      provider: source.targetPlatform,
      requiresRevalidation: true,
      severity: "requires_action",
      targetId: null,
      targetLabel: source.targetPlatformLabel,
      title: "Publishable asset needs revalidation",
      userFacingNextStep:
        "Recheck the asset or approved bundle before planning again.",
    });
  }

  if (
    source.blockedReason === "target_unsupported" ||
    providerNativePolicy === "provider_native_unsupported"
  ) {
    addConflict({
      actionLink,
      affectedScope: "provider",
      blocked: true,
      conflictKey: "unsupported_provider",
      description: "The selected provider is not supported by this contract.",
      editable: false,
      mayShowActionLink: shouldShowActionLink("blocking", actionLink),
      operatorFacingHint:
        "Keep the entry StreamOS-managed or choose a supported target.",
      provider: source.targetPlatform,
      requiresRevalidation: false,
      severity: "blocking",
      targetId: null,
      targetLabel: source.targetPlatformLabel,
      title: "Unsupported provider",
      userFacingNextStep:
        "Choose a supported platform target before saving the plan again.",
    });
  }

  if (
    source.itemType === "fanout" &&
    (source.fanoutTargetBlockedCount ?? 0) > 0
  ) {
    const severity: PublicationScheduleConflictSeverity =
      source.fanoutPolicy === "all_or_nothing_preflight"
        ? "blocking"
        : "warning";

    addConflict({
      actionLink: source.fanoutSummaryHref
        ? { href: source.fanoutSummaryHref, label: "Open fanout summary" }
        : actionLink,
      affectedScope: "fanout",
      blocked: source.fanoutPolicy === "all_or_nothing_preflight",
      conflictKey: "fanout_target_blocked",
      description:
        source.fanoutPolicy === "all_or_nothing_preflight"
          ? "At least one target blocks the parent fanout completely."
          : "At least one target is blocked, but valid targets may still be prepared.",
      editable: false,
      mayShowActionLink: shouldShowActionLink(severity, actionLink),
      operatorFacingHint:
        source.fanoutPolicy === "all_or_nothing_preflight"
          ? "All-or-nothing fanouts require every target to pass first."
          : "Prepare-valid-targets fanouts may continue with the valid targets.",
      provider: "fanout",
      requiresRevalidation: true,
      severity,
      targetId: null,
      targetLabel:
        source.fanoutTargetCount && source.fanoutTargetCount > 1
          ? `${source.fanoutTargetBlockedCount} blocked targets`
          : "1 blocked target",
      title:
        source.fanoutPolicy === "all_or_nothing_preflight"
          ? "Fanout target blocks the parent schedule"
          : "Some fanout targets are blocked",
      userFacingNextStep:
        source.fanoutPolicy === "all_or_nothing_preflight"
          ? "Fix the blocked target before reusing the parent fanout."
          : "Review the blocked target; the valid targets can remain prepared.",
    });
  }

  for (const target of source.fanoutTargetSummaries) {
    if (target.isBlocked) {
      addConflict({
        actionLink: source.fanoutSummaryHref
          ? { href: source.fanoutSummaryHref, label: "Open fanout summary" }
          : actionLink,
        affectedScope: "target",
        blocked: true,
        conflictKey: "fanout_target_blocked",
        description:
          target.blockMessage ?? "A fanout target is blocked and needs review.",
        editable: false,
        mayShowActionLink: shouldShowActionLink(
          source.fanoutPolicy === "all_or_nothing_preflight"
            ? "blocking"
            : "warning",
          actionLink,
        ),
        operatorFacingHint:
          "Inspect the target-specific policy details in the fanout summary.",
        provider: target.targetPlatform,
        requiresRevalidation: true,
        severity:
          source.fanoutPolicy === "all_or_nothing_preflight"
            ? "blocking"
            : "warning",
        targetId: target.id,
        targetLabel: target.targetLabel,
        title: `${target.providerLabel} target is blocked`,
        userFacingNextStep:
          source.fanoutPolicy === "all_or_nothing_preflight"
            ? "Resolve the blocked target so the parent fanout can stay fully ready."
            : "Review the blocked target; the other targets may remain prepared.",
      });
    }

    if (target.isReauthRequired) {
      addConflict({
        actionLink: source.fanoutSummaryHref
          ? { href: source.fanoutSummaryHref, label: "Open fanout summary" }
          : actionLink,
        affectedScope: "target",
        blocked: true,
        conflictKey: "reauth_required",
        description:
          "A fanout target needs refreshed credentials or fresh scopes.",
        editable: false,
        mayShowActionLink: shouldShowActionLink("requires_action", actionLink),
        operatorFacingHint:
          "Reconnect the affected target connection before retrying the fanout.",
        provider: target.targetPlatform,
        requiresRevalidation: true,
        severity: "requires_action",
        targetId: target.id,
        targetLabel: target.targetLabel,
        title: `${target.providerLabel} target needs re-auth`,
        userFacingNextStep:
          "Reconnect the affected target account before continuing the fanout.",
      });
    }

    if (target.blockReason === "missing_publish_scopes") {
      addConflict({
        actionLink: source.fanoutSummaryHref
          ? { href: source.fanoutSummaryHref, label: "Open fanout summary" }
          : actionLink,
        affectedScope: "target",
        blocked: true,
        conflictKey: "missing_scope",
        description:
          "The fanout target is missing the publish scopes required by policy.",
        editable: false,
        mayShowActionLink: shouldShowActionLink("requires_action", actionLink),
        operatorFacingHint:
          "Reconnect the target with the required publish scopes.",
        provider: target.targetPlatform,
        requiresRevalidation: true,
        severity: "requires_action",
        targetId: target.id,
        targetLabel: target.targetLabel,
        title: `${target.providerLabel} target is missing scopes`,
        userFacingNextStep:
          "Reconnect the target account with the needed scopes before trying again.",
      });
    }
  }

  if (source.targetPlatform === "tiktok" && requiresRevalidation) {
    addConflict({
      actionLink,
      affectedScope: "provider",
      blocked: false,
      conflictKey: "tiktok_creator_info_stale",
      description:
        "TikTok creator information should be revalidated before execution.",
      editable: source.scheduleActionPolicy.canEdit,
      mayShowActionLink: shouldShowActionLink("warning", actionLink),
      operatorFacingHint:
        "Revalidate TikTok creator data and capability state before execution.",
      provider: source.targetPlatform,
      requiresRevalidation: true,
      severity: "warning",
      targetId: null,
      targetLabel: source.targetPlatformLabel,
      title: "TikTok creator info should be revalidated",
      userFacingNextStep: "Recheck the TikTok account data before continuing.",
    });
  }

  if (
    providerNativeAvailability === "conditional" &&
    requiresRevalidation &&
    source.targetPlatform !== "fanout" &&
    !source.isReauthRequired &&
    source.hasRequiredScopes
  ) {
    addConflict({
      actionLink,
      affectedScope: "provider",
      blocked: false,
      conflictKey: "provider_capability_stale",
      description:
        "The provider capability should be revalidated before execution.",
      editable: source.scheduleActionPolicy.canEdit,
      mayShowActionLink: shouldShowActionLink("warning", actionLink),
      operatorFacingHint:
        "Refresh the provider capability snapshot before relying on this schedule.",
      provider: source.targetPlatform,
      requiresRevalidation: true,
      severity: "warning",
      targetId: null,
      targetLabel: source.targetPlatformLabel,
      title: "Provider capability needs revalidation",
      userFacingNextStep:
        "Refresh the provider capability or inspect the connection again.",
    });
  }

  if (
    requiresRevalidation &&
    source.scheduleStatus === "schedule_ready" &&
    !source.isReauthRequired &&
    source.hasRequiredScopes &&
    source.hasPublishableAsset
  ) {
    addConflict({
      actionLink,
      affectedScope: "policy",
      blocked: false,
      conflictKey: "schedule_stale",
      description:
        "The schedule should be revalidated server-side before execution.",
      editable: source.scheduleActionPolicy.canEdit,
      mayShowActionLink: shouldShowActionLink("warning", actionLink),
      operatorFacingHint: source.schedulePolicy.nextRecommendedAction,
      provider: source.targetPlatform,
      requiresRevalidation: true,
      severity: "warning",
      targetId: null,
      targetLabel: source.targetPlatformLabel,
      title: "Schedule needs revalidation",
      userFacingNextStep:
        "Refresh the view or recheck the plan before execution.",
    });
  }

  if (
    providerNativePolicy === "provider_native_available_but_not_primary" ||
    providerNativePolicy === "provider_native_disabled_by_policy" ||
    providerNativePolicy === "provider_native_future_optional"
  ) {
    addConflict({
      actionLink,
      affectedScope: "provider",
      blocked: false,
      conflictKey: "provider_native_scheduling_unused",
      description: "StreamOS keeps scheduling as the primary source of truth.",
      editable: source.scheduleActionPolicy.canEdit,
      mayShowActionLink: shouldShowActionLink("info", actionLink),
      operatorFacingHint: providerHint.description,
      provider: source.targetPlatform,
      requiresRevalidation,
      severity: "info",
      targetId: null,
      targetLabel: source.targetPlatformLabel,
      title: "StreamOS-managed scheduling is primary",
      userFacingNextStep:
        "Keep the StreamOS-managed schedule as the source of truth.",
    });
  } else if (
    providerNativePolicy === "provider_native_unknown" ||
    providerNativeAvailability === "unknown"
  ) {
    addConflict({
      actionLink,
      affectedScope: "provider",
      blocked: false,
      conflictKey: "provider_scheduling_unknown",
      description: "The provider-native scheduling state is not fully known.",
      editable: source.scheduleActionPolicy.canEdit,
      mayShowActionLink: shouldShowActionLink("unknown", actionLink),
      operatorFacingHint:
        "Refresh the safe schedule snapshot before relying on provider hints.",
      provider: source.targetPlatform,
      requiresRevalidation: true,
      severity: "unknown",
      targetId: null,
      targetLabel: source.targetPlatformLabel,
      title: "Provider scheduling state is unknown",
      userFacingNextStep: "Refresh the view or inspect the plan again.",
    });
  }

  if (conflicts.length === 0) {
    addConflict({
      actionLink,
      affectedScope: "policy",
      blocked: false,
      conflictKey: "streamos_managed_primary",
      description:
        "StreamOS manages scheduling as the primary source of truth.",
      editable: source.scheduleActionPolicy.canEdit,
      mayShowActionLink: shouldShowActionLink("info", actionLink),
      operatorFacingHint:
        "StreamOS remains the authoritative scheduling layer for this entry.",
      provider: source.targetPlatform,
      requiresRevalidation,
      severity: "info",
      targetId: null,
      targetLabel: source.targetPlatformLabel,
      title: "StreamOS-managed scheduling is primary",
      userFacingNextStep:
        "Keep the StreamOS-managed schedule as the source of truth.",
    });
  }

  conflicts.sort(compareConflicts);

  const highestSeverity = conflicts[0]?.severity ?? "unknown";

  return {
    additionalConflictCount: Math.max(0, conflicts.length - 1),
    conflictCount: conflicts.length,
    conflicts,
    hasActionNeededConflict: conflicts.some(
      (conflict) =>
        conflict.severity === "requires_action" ||
        conflict.severity === "blocking" ||
        conflict.severity === "expired",
    ),
    hasBlockingConflict: conflicts.some(
      (conflict) =>
        conflict.severity === "blocking" || conflict.severity === "expired",
    ),
    hasInfoConflict: conflicts.some((conflict) => conflict.severity === "info"),
    hasUnknownConflict: conflicts.some(
      (conflict) => conflict.severity === "unknown",
    ),
    hasWarningConflict: conflicts.some(
      (conflict) => conflict.severity === "warning",
    ),
    highestSeverity,
    primaryConflict: conflicts[0] ?? null,
    topHint:
      conflicts[0]?.userFacingNextStep ?? source.schedulePolicy.safeDescription,
  };
}

function shouldShowActionLink(
  severity: PublicationScheduleConflictSeverity,
  actionLink: PublicationScheduleConflictActionLink | null,
): boolean {
  return Boolean(actionLink && severity !== "info" && severity !== "unknown");
}

function compareConflicts(
  left: PublicationScheduleConflict,
  right: PublicationScheduleConflict,
): number {
  const leftPriority = CONFLICT_PRIORITY[left.conflictKey];
  const rightPriority = CONFLICT_PRIORITY[right.conflictKey];

  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  const leftSeverity = SEVERITY_PRIORITY[left.severity];
  const rightSeverity = SEVERITY_PRIORITY[right.severity];

  if (leftSeverity !== rightSeverity) {
    return leftSeverity - rightSeverity;
  }

  const leftTarget = left.targetLabel ?? left.targetId ?? "";
  const rightTarget = right.targetLabel ?? right.targetId ?? "";

  return `${left.affectedScope}:${leftTarget}:${left.title}`.localeCompare(
    `${right.affectedScope}:${rightTarget}:${right.title}`,
  );
}

function resolveActionLink(
  source: PublicationScheduleConflictSource,
): PublicationScheduleConflictActionLink | null {
  if (source.itemType === "fanout") {
    if (source.fanoutSummaryHref) {
      return { href: source.fanoutSummaryHref, label: "Open fanout summary" };
    }

    return { href: source.detailHref, label: "Open schedule details" };
  }

  if (
    source.scheduleActionPolicy.canEdit ||
    source.scheduleActionPolicy.canReplace
  ) {
    return { href: source.detailHref, label: "Open schedule details" };
  }

  return { href: source.historyHref, label: "Open publication history" };
}

function isPastTimestamp(value: string): boolean {
  const timestamp = new Date(value).getTime();

  return Number.isFinite(timestamp) && timestamp < Date.now();
}

function isBeyondScheduleHorizon(
  source: PublicationScheduleConflictSource,
): boolean {
  if (!source.scheduledAtUtc) {
    return false;
  }

  const timestamp = new Date(source.scheduledAtUtc).getTime();

  if (!Number.isFinite(timestamp)) {
    return false;
  }

  const horizonMs =
    source.schedulePolicy.timing.maxHorizonDays * 24 * 60 * 60 * 1000;

  return timestamp > Date.now() + horizonMs;
}
