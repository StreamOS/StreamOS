import type {
  CrosspostingSummaryFanoutItem,
  CrosspostingSummaryTargetItem,
} from "./CrosspostingSummaryConsole.utils";
import type { PublicationDashboardItem } from "./PublicationStatusConsole.utils";
import { formatPublicationTimestamp } from "./PublicationStatusConsole.utils";

export const PUBLISHING_ANALYTICS_PERIODS = [
  "last_7_days",
  "last_30_days",
  "last_90_days",
  "all",
] as const;

export type PublishingAnalyticsPeriod =
  (typeof PUBLISHING_ANALYTICS_PERIODS)[number];

export const PUBLISHING_ANALYTICS_PROVIDERS = [
  "all",
  "youtube",
  "tiktok",
] as const;

export type PublishingAnalyticsProviderFilter =
  (typeof PUBLISHING_ANALYTICS_PROVIDERS)[number];

export type PublishingAnalyticsDashboardInputs = {
  fanouts: CrosspostingSummaryFanoutItem[];
  initialPeriod?: PublishingAnalyticsPeriod;
  initialProvider?: PublishingAnalyticsProviderFilter;
  publications: PublicationDashboardItem[];
  now?: Date;
};

export type PublishingAnalyticsDashboardModel = {
  filters: PublishingAnalyticsFilterState;
  fanoutSummary: PublishingAnalyticsFanoutSummary;
  providerBreakdown: PublishingAnalyticsProviderSummary[];
  reasonBreakdown: PublishingAnalyticsReasonBucket[];
  scopeSummary: PublishingAnalyticsScopeSummary;
  summary: PublishingAnalyticsSummary;
};

export type PublishingAnalyticsFilterState = {
  period: PublishingAnalyticsPeriod;
  periodLabel: string;
  provider: PublishingAnalyticsProviderFilter;
  providerLabel: string;
};

export type PublishingAnalyticsSummary = {
  averageTimeToFirstProviderAckMs: number | null;
  averageTimeToPublishMs: number | null;
  blockedTargetCount: number;
  failureRate: number | null;
  finalFailedCount: number;
  finalSuccessCount: number;
  inProgressCount: number;
  manualInterventionCount: number;
  manualInterventionRate: number | null;
  medianTimeToFirstProviderAckMs: number | null;
  medianTimeToPublishMs: number | null;
  p90TimeToPublishMs: number | null;
  partialFanoutCount: number;
  partialFanoutRate: number | null;
  periodEnd: string;
  periodStart: string | null;
  retryAttemptedCount: number;
  retryFailureCount: number;
  retrySuccessCount: number;
  retrySuccessRate: number | null;
  successRate: number | null;
  totalAnalyzedTargets: number;
  totalFanouts: number;
  totalPublications: number;
};

export type PublishingAnalyticsProvider = "youtube" | "tiktok";

export type PublishingAnalyticsProviderSummary = {
  averageTimeToPublishMs: number | null;
  blockedTargetCount: number;
  failureRate: number | null;
  finalFailedCount: number;
  finalSuccessCount: number;
  inProgressCount: number;
  label: string;
  medianTimeToPublishMs: number | null;
  p90TimeToPublishMs: number | null;
  provider: PublishingAnalyticsProvider;
  retryAttemptedCount: number;
  retryFailureCount: number;
  retrySuccessCount: number;
  retrySuccessRate: number | null;
  successRate: number | null;
  totalPublications: number;
  topFailureReasons: PublishingAnalyticsReasonBucket[];
  totalTargets: number;
};

export type PublishingAnalyticsReasonKey =
  | "asset_not_publishable"
  | "capability_mismatch"
  | "missing_scope"
  | "provider_policy"
  | "reauth_required"
  | "unsupported_provider"
  | "unknown_fallback";

export type PublishingAnalyticsReasonBucket = {
  byProvider: Record<PublishingAnalyticsProvider, number>;
  count: number;
  label: string;
  reason: PublishingAnalyticsReasonKey;
};

export type PublishingAnalyticsFanoutSummary = {
  blockedCount: number;
  failedCount: number;
  fanoutCount: number;
  partialSuccessCount: number;
  publishedCount: number;
  queuedCount: number;
  requiresActionCount: number;
};

export type PublishingAnalyticsScopeSummary = {
  fanoutChildPublicationCount: number;
  fanoutCount: number;
  singlePublicationCount: number;
  totalTargetCount: number;
};

type PublishingAnalyticsPublicationOutcome =
  | "blocked"
  | "final_failed"
  | "in_progress"
  | "published";

type PublishingAnalyticsTargetOutcome =
  | "blocked"
  | "failed"
  | "in_progress"
  | "published";

type PublishingAnalyticsPublicationRecord = {
  firstProviderAckMs: number | null;
  manualInterventionRequired: boolean;
  outcome: PublishingAnalyticsPublicationOutcome;
  provider: PublishingAnalyticsProvider;
  reason: PublishingAnalyticsReasonKey | null;
  retryAttempted: boolean;
  retryFailed: boolean;
  retrySuccess: boolean;
  timeToPublishMs: number | null;
};

type PublishingAnalyticsTargetRecord = {
  fanoutId: string;
  manualInterventionRequired: boolean;
  outcome: PublishingAnalyticsTargetOutcome;
  provider: PublishingAnalyticsProvider;
  reason: PublishingAnalyticsReasonKey | null;
};

type PublishingAnalyticsTargetStatus =
  CrosspostingSummaryTargetItem["targetStatus"];

const PERIOD_LABELS: Record<PublishingAnalyticsPeriod, string> = {
  all: "All time",
  last_30_days: "Last 30 days",
  last_7_days: "Last 7 days",
  last_90_days: "Last 90 days",
};

const PROVIDER_LABELS: Record<PublishingAnalyticsProviderFilter, string> = {
  all: "All providers",
  tiktok: "TikTok",
  youtube: "YouTube",
};

const PROVIDER_ORDER: PublishingAnalyticsProvider[] = ["youtube", "tiktok"];

const FINAL_FAILURE_STATUSES = new Set([
  "canceled",
  "failed_permanent",
  "rejected",
]);

const BLOCKING_VALIDATION_CODES = new Set<string>([
  "account_capability_missing",
  "conditional_field_unresolved",
  "content_job_not_found",
  "invalid_provider_override_value",
  "missing_publish_scopes",
  "platform_connection_not_found",
  "platform_mismatch",
  "policy_blocked",
  "publishable_bundle_missing",
  "publication_not_ready",
  "provider_override_mismatch",
  "provider_override_unsupported_field",
  "unsupported_capability_version",
  "unsupported_target_platform",
]);

const BLOCKING_FAILURE_CODES = new Set<string>(["provider_unauthorized"]);
const TARGET_BLOCKING_STATUSES = new Set<PublishingAnalyticsTargetStatus>([
  "blocked",
  "re-auth required",
  "unsupported",
]);

const TARGET_IN_PROGRESS_STATUSES = new Set<PublishingAnalyticsTargetStatus>([
  "processing",
  "queued",
  "ready",
  "unknown",
]);

const FAILED_TARGET_STATUSES = new Set<PublishingAnalyticsTargetStatus>([
  "failed",
]);

export function parsePublishingAnalyticsPeriod(
  value: string | undefined | null,
): PublishingAnalyticsPeriod {
  switch (value) {
    case "all":
    case "last_7_days":
    case "last_30_days":
    case "last_90_days":
      return value;
    default:
      return "last_30_days";
  }
}

export function parsePublishingAnalyticsProviderFilter(
  value: string | undefined | null,
): PublishingAnalyticsProviderFilter {
  switch (value) {
    case "youtube":
    case "tiktok":
    case "all":
      return value;
    default:
      return "all";
  }
}

export function getPublishingAnalyticsPeriodLabel(
  period: PublishingAnalyticsPeriod,
): string {
  return PERIOD_LABELS[period];
}

export function getPublishingAnalyticsProviderFilterLabel(
  provider: PublishingAnalyticsProviderFilter,
): string {
  return PROVIDER_LABELS[provider];
}

export function buildPublishingAnalyticsDashboardModel({
  fanouts,
  initialPeriod = "last_30_days",
  initialProvider = "all",
  now = new Date(),
  publications,
}: PublishingAnalyticsDashboardInputs): PublishingAnalyticsDashboardModel {
  const filters = {
    period: initialPeriod,
    periodLabel: getPublishingAnalyticsPeriodLabel(initialPeriod),
    provider: initialProvider,
    providerLabel: getPublishingAnalyticsProviderFilterLabel(initialProvider),
  };
  const periodRange = resolvePeriodRange(initialPeriod, now);
  const eligiblePublications = publications.filter((publication) => {
    const referenceTime = getPublicationReferenceTimestamp(publication);

    if (!referenceTime) {
      return false;
    }

    if (
      periodRange.start &&
      new Date(referenceTime).getTime() < new Date(periodRange.start).getTime()
    ) {
      return false;
    }

    if (
      new Date(referenceTime).getTime() > new Date(periodRange.end).getTime()
    ) {
      return false;
    }

    return matchesProviderFilter(publication.targetPlatform, initialProvider);
  });

  const eligibleFanouts = fanouts.filter((fanout) => {
    const referenceTime = getFanoutReferenceTimestamp(fanout);

    if (!referenceTime) {
      return false;
    }

    if (
      periodRange.start &&
      new Date(referenceTime).getTime() < new Date(periodRange.start).getTime()
    ) {
      return false;
    }

    if (
      new Date(referenceTime).getTime() > new Date(periodRange.end).getTime()
    ) {
      return false;
    }

    return true;
  });

  const publicationRecords = eligiblePublications
    .map((publication) => buildPublicationRecord(publication))
    .filter(
      (record): record is PublishingAnalyticsPublicationRecord =>
        record !== null,
    );

  const fanoutRecords = eligibleFanouts
    .map((fanout) => buildFanoutTargetRecords(fanout, initialProvider))
    .filter(
      (entry): entry is PublishingAnalyticsTargetRecord[] => entry.length > 0,
    )
    .flat();

  const fanoutTargetPublicationIds = new Set(
    eligibleFanouts.flatMap((fanout) =>
      fanout.targets
        .filter((target) =>
          matchesProviderFilter(target.targetPlatform, initialProvider),
        )
        .map((target) => target.childPublicationId)
        .filter((value): value is string => typeof value === "string"),
    ),
  );

  const publicationSummary = buildPublicationSummary(publicationRecords);
  const targetSummary = buildTargetSummary(fanoutRecords);
  const reasonBreakdown = buildReasonBreakdown(
    publicationRecords,
    fanoutRecords,
  );
  const providerBreakdown = PROVIDER_ORDER.map((provider) =>
    buildProviderSummary(provider, publicationRecords, fanoutRecords),
  );
  const fanoutSummary = buildFanoutSummary(eligibleFanouts, initialProvider);
  const scopeSummary = {
    fanoutChildPublicationCount: fanoutTargetPublicationIds.size,
    fanoutCount: fanoutSummary.fanoutCount,
    singlePublicationCount: Math.max(
      publicationSummary.totalPublications - fanoutTargetPublicationIds.size,
      0,
    ),
    totalTargetCount: targetSummary.totalAnalyzedTargets,
  };

  return {
    fanoutSummary,
    filters,
    providerBreakdown,
    reasonBreakdown,
    scopeSummary,
    summary: {
      ...publicationSummary,
      ...targetSummary,
      ...fanoutSummary,
      ...scopeSummary,
      blockedTargetCount:
        publicationSummary.blockedTargetCount +
        targetSummary.blockedTargetCount,
      manualInterventionCount:
        publicationSummary.manualInterventionCount +
        targetSummary.manualInterventionCount,
      manualInterventionRate: resolveRate(
        publicationSummary.manualInterventionCount +
          targetSummary.manualInterventionCount,
        publicationSummary.totalPublications +
          targetSummary.totalAnalyzedTargets,
      ),
      partialFanoutCount: fanoutSummary.partialSuccessCount,
      partialFanoutRate: resolveRate(
        fanoutSummary.partialSuccessCount,
        fanoutSummary.fanoutCount,
      ),
      totalFanouts: fanoutSummary.fanoutCount,
      totalAnalyzedTargets:
        publicationSummary.totalPublications +
        targetSummary.totalAnalyzedTargets,
      averageTimeToFirstProviderAckMs: calculateAverage(
        publicationRecords.map((record) => record.firstProviderAckMs),
      ),
      averageTimeToPublishMs: calculateAverage(
        publicationRecords.map((record) => record.timeToPublishMs),
      ),
      medianTimeToFirstProviderAckMs: calculateMedian(
        publicationRecords.map((record) => record.firstProviderAckMs),
      ),
      medianTimeToPublishMs: calculateMedian(
        publicationRecords.map((record) => record.timeToPublishMs),
      ),
      p90TimeToPublishMs: calculatePercentile(
        publicationRecords.map((record) => record.timeToPublishMs),
        90,
      ),
      periodEnd: periodRange.end,
      periodStart: periodRange.start,
    },
  };
}

export function formatPublishingAnalyticsRate(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "Not enough data";
  }

  return `${(value * 100).toFixed(1)}%`;
}

export function formatPublishingAnalyticsDuration(
  value: number | null,
): string {
  if (value === null || !Number.isFinite(value)) {
    return "Not available";
  }

  const absolute = Math.max(Math.round(value), 0);
  const totalMinutes = Math.floor(absolute / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remainingHours = hours % 24;
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  }

  if (hours > 0) {
    const remainingMinutes = totalMinutes % 60;
    return remainingMinutes > 0
      ? `${hours}h ${remainingMinutes}m`
      : `${hours}h`;
  }

  return `${Math.max(totalMinutes, 0)}m`;
}

export function formatPublishingAnalyticsPeriodWindow(
  period: PublishingAnalyticsPeriod,
  periodStart: string | null,
): string {
  if (period === "all") {
    return "All time";
  }

  if (!periodStart) {
    return getPublishingAnalyticsPeriodLabel(period);
  }

  return `${getPublishingAnalyticsPeriodLabel(period)} · since ${formatPublicationTimestamp(periodStart)}`;
}

function buildPublicationSummary(
  records: PublishingAnalyticsPublicationRecord[],
): PublishingAnalyticsSummary {
  const totalPublications = records.length;
  const finalSuccessCount = records.filter(
    (record) => record.outcome === "published",
  ).length;
  const finalFailedCount = records.filter(
    (record) => record.outcome === "final_failed",
  ).length;
  const blockedTargetCount = records.filter(
    (record) => record.outcome === "blocked",
  ).length;
  const inProgressCount = records.filter(
    (record) => record.outcome === "in_progress",
  ).length;
  const retryAttemptedCount = records.filter(
    (record) => record.retryAttempted,
  ).length;
  const retrySuccessCount = records.filter(
    (record) => record.retrySuccess,
  ).length;
  const retryFailureCount = records.filter(
    (record) => record.retryFailed,
  ).length;
  const manualInterventionCount = records.filter(
    (record) => record.manualInterventionRequired,
  ).length;

  return {
    averageTimeToFirstProviderAckMs: null,
    averageTimeToPublishMs: null,
    blockedTargetCount,
    failureRate: resolveRate(
      finalFailedCount,
      finalSuccessCount + finalFailedCount,
    ),
    finalFailedCount,
    finalSuccessCount,
    inProgressCount,
    manualInterventionCount,
    manualInterventionRate: resolveRate(
      manualInterventionCount,
      totalPublications,
    ),
    medianTimeToFirstProviderAckMs: null,
    medianTimeToPublishMs: null,
    p90TimeToPublishMs: null,
    partialFanoutCount: 0,
    partialFanoutRate: null,
    periodEnd: new Date().toISOString(),
    periodStart: null,
    retryAttemptedCount,
    retryFailureCount,
    retrySuccessCount,
    retrySuccessRate: resolveRate(retrySuccessCount, retryAttemptedCount),
    successRate: resolveRate(
      finalSuccessCount,
      finalSuccessCount + finalFailedCount,
    ),
    totalAnalyzedTargets: totalPublications,
    totalFanouts: 0,
    totalPublications,
  };
}

function buildTargetSummary(
  records: PublishingAnalyticsTargetRecord[],
): Pick<
  PublishingAnalyticsSummary,
  "blockedTargetCount" | "manualInterventionCount" | "totalAnalyzedTargets"
> {
  const blockedTargetCount = records.filter(
    (record) => record.outcome === "blocked",
  ).length;
  const manualInterventionCount = records.filter(
    (record) => record.manualInterventionRequired,
  ).length;

  return {
    blockedTargetCount,
    manualInterventionCount,
    totalAnalyzedTargets: records.length,
  };
}

function buildFanoutSummary(
  fanouts: CrosspostingSummaryFanoutItem[],
  providerFilter: PublishingAnalyticsProviderFilter,
): PublishingAnalyticsFanoutSummary {
  const filteredFanouts = fanouts
    .map((fanout) => ({
      fanout,
      targets: fanout.targets.filter((target) =>
        matchesProviderFilter(target.targetPlatform, providerFilter),
      ),
    }))
    .filter((entry) => entry.targets.length > 0);

  let blockedCount = 0;
  let failedCount = 0;
  let partialSuccessCount = 0;
  let publishedCount = 0;
  let queuedCount = 0;
  let requiresActionCount = 0;

  for (const entry of filteredFanouts) {
    const states = entry.targets.map((target) => classifyTargetOutcome(target));
    const publishedTargetCount = states.filter(
      (state) => state === "published",
    ).length;
    const blockedOrFailedCount = states.filter(
      (state) => state === "blocked" || state === "failed",
    ).length;
    const queuedOrProcessingCount = states.filter(
      (state) => state === "in_progress",
    ).length;
    const requiresAction = entry.targets.some((target) =>
      Boolean(target.manualInterventionRequired || target.reauthRequired),
    );

    if (publishedTargetCount > 0 && blockedOrFailedCount > 0) {
      partialSuccessCount += 1;
    }

    if (publishedTargetCount > 0 && blockedOrFailedCount === 0) {
      publishedCount += 1;
    } else if (blockedOrFailedCount > 0 && publishedTargetCount === 0) {
      if (states.some((state) => state === "blocked")) {
        blockedCount += 1;
      } else {
        failedCount += 1;
      }
    }

    queuedCount += queuedOrProcessingCount;
    if (requiresAction) {
      requiresActionCount += 1;
    }
  }

  return {
    blockedCount,
    failedCount,
    fanoutCount: filteredFanouts.length,
    partialSuccessCount,
    publishedCount,
    queuedCount,
    requiresActionCount,
  };
}

function buildProviderSummary(
  provider: PublishingAnalyticsProvider,
  publicationRecords: PublishingAnalyticsPublicationRecord[],
  targetRecords: PublishingAnalyticsTargetRecord[],
): PublishingAnalyticsProviderSummary {
  const providerPublications = publicationRecords.filter(
    (record) => record.provider === provider,
  );
  const providerTargets = targetRecords.filter(
    (record) => record.provider === provider,
  );
  const finalSuccessCount = providerPublications.filter(
    (record) => record.outcome === "published",
  ).length;
  const finalFailedCount = providerPublications.filter(
    (record) => record.outcome === "final_failed",
  ).length;
  const inProgressCount = providerPublications.filter(
    (record) => record.outcome === "in_progress",
  ).length;
  const blockedTargetCount = providerTargets.filter(
    (record) => record.outcome === "blocked",
  ).length;
  const retryAttemptedCount = providerPublications.filter(
    (record) => record.retryAttempted,
  ).length;
  const retrySuccessCount = providerPublications.filter(
    (record) => record.retrySuccess,
  ).length;
  const retryFailureCount = providerPublications.filter(
    (record) => record.retryFailed,
  ).length;

  return {
    averageTimeToPublishMs: calculateAverage(
      providerPublications.map((record) => record.timeToPublishMs),
    ),
    blockedTargetCount,
    failureRate: resolveRate(
      finalFailedCount,
      finalSuccessCount + finalFailedCount,
    ),
    finalFailedCount,
    finalSuccessCount,
    inProgressCount,
    label: provider === "youtube" ? "YouTube" : "TikTok",
    medianTimeToPublishMs: calculateMedian(
      providerPublications.map((record) => record.timeToPublishMs),
    ),
    p90TimeToPublishMs: calculatePercentile(
      providerPublications.map((record) => record.timeToPublishMs),
      90,
    ),
    provider,
    retryAttemptedCount,
    retryFailureCount,
    retrySuccessCount,
    retrySuccessRate: resolveRate(retrySuccessCount, retryAttemptedCount),
    successRate: resolveRate(
      finalSuccessCount,
      finalSuccessCount + finalFailedCount,
    ),
    totalPublications: providerPublications.length,
    topFailureReasons: buildReasonBreakdown(
      providerPublications,
      providerTargets,
    ).slice(0, 3),
    totalTargets: providerTargets.length,
  };
}

function buildReasonBreakdown(
  publicationRecords: PublishingAnalyticsPublicationRecord[],
  targetRecords: PublishingAnalyticsTargetRecord[],
): PublishingAnalyticsReasonBucket[] {
  const bucketMap = new Map<
    PublishingAnalyticsReasonKey,
    PublishingAnalyticsReasonBucket
  >();

  const touch = (
    reason: PublishingAnalyticsReasonKey | null,
    provider: PublishingAnalyticsProvider | null,
  ) => {
    if (!reason || !provider) {
      return;
    }

    const existing = bucketMap.get(reason) ?? createReasonBucket(reason);

    existing.count += 1;
    existing.byProvider[provider] += 1;
    bucketMap.set(reason, existing);
  };

  for (const record of publicationRecords) {
    touch(record.reason, record.provider);
  }

  for (const record of targetRecords) {
    touch(record.reason, record.provider);
  }

  return [...bucketMap.values()].sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }

    return left.label.localeCompare(right.label);
  });
}

function createReasonBucket(
  reason: PublishingAnalyticsReasonKey,
): PublishingAnalyticsReasonBucket {
  return {
    byProvider: {
      tiktok: 0,
      youtube: 0,
    },
    count: 0,
    label: getReasonLabel(reason),
    reason,
  };
}

function getReasonLabel(reason: PublishingAnalyticsReasonKey): string {
  switch (reason) {
    case "asset_not_publishable":
      return "Asset not publishable";
    case "capability_mismatch":
      return "Capability mismatch";
    case "missing_scope":
      return "Missing scope";
    case "provider_policy":
      return "Provider policy / throttling";
    case "reauth_required":
      return "Re-auth required";
    case "unsupported_provider":
      return "Unsupported provider";
    case "unknown_fallback":
    default:
      return "Unknown fallback";
  }
}

function buildPublicationRecord(
  publication: PublicationDashboardItem,
): PublishingAnalyticsPublicationRecord | null {
  const provider = normalizePublishingProvider(publication.targetPlatform);

  if (!provider) {
    return null;
  }

  const outcome = classifyPublicationOutcome(publication);
  const retryAttempted = publication.failure.retryCount > 0;
  const retrySuccess = retryAttempted && outcome === "published";
  const retryFailed = retryAttempted && outcome === "final_failed";
  const firstProviderAckMs = resolveFirstProviderAckMs(publication);
  const timeToPublishMs = resolveTimeToPublishMs(publication);

  return {
    firstProviderAckMs,
    manualInterventionRequired: isPublicationManualInterventionRequired(
      publication,
      outcome,
    ),
    outcome,
    provider,
    reason: classifyPublicationReason(publication),
    retryAttempted,
    retryFailed,
    retrySuccess,
    timeToPublishMs,
  };
}

function buildFanoutTargetRecords(
  fanout: CrosspostingSummaryFanoutItem,
  providerFilter: PublishingAnalyticsProviderFilter,
): PublishingAnalyticsTargetRecord[] {
  const records: PublishingAnalyticsTargetRecord[] = [];

  for (const target of fanout.targets) {
    if (!matchesProviderFilter(target.targetPlatform, providerFilter)) {
      continue;
    }

    const provider = normalizePublishingProvider(target.targetPlatform);

    if (!provider) {
      continue;
    }

    records.push({
      fanoutId: fanout.id,
      manualInterventionRequired: Boolean(
        target.manualInterventionRequired || target.reauthRequired,
      ),
      outcome: classifyTargetOutcome(target),
      provider,
      reason: classifyTargetReason(target),
    });
  }

  return records;
}

function classifyPublicationOutcome(
  publication: PublicationDashboardItem,
): PublishingAnalyticsPublicationOutcome {
  if (isPublicationPublished(publication)) {
    return "published";
  }

  if (isPublicationBlocked(publication)) {
    return "blocked";
  }

  if (isPublicationFinalFailed(publication)) {
    return "final_failed";
  }

  return "in_progress";
}

function classifyTargetOutcome(
  target: CrosspostingSummaryTargetItem,
): PublishingAnalyticsTargetOutcome {
  if (target.targetStatus === "published") {
    return "published";
  }

  if (TARGET_BLOCKING_STATUSES.has(target.targetStatus)) {
    return "blocked";
  }

  if (FAILED_TARGET_STATUSES.has(target.targetStatus)) {
    return "failed";
  }

  if (TARGET_IN_PROGRESS_STATUSES.has(target.targetStatus)) {
    return "in_progress";
  }

  return "in_progress";
}

function isPublicationPublished(
  publication: PublicationDashboardItem,
): boolean {
  return Boolean(
    publication.publicationStatus === "published" ||
    publication.publishedAt ||
    publication.remoteStatusLabel === "Published" ||
    publication.deliveryStatus === "published",
  );
}

function isPublicationBlocked(publication: PublicationDashboardItem): boolean {
  if (publication.deliveryStatus === "re-auth required") {
    return true;
  }

  if (publication.validation.code) {
    return classifyReasonKeyFromCode(publication.validation.code) !== null;
  }

  return false;
}

function isPublicationFinalFailed(
  publication: PublicationDashboardItem,
): boolean {
  if (FINAL_FAILURE_STATUSES.has(publication.publicationStatus)) {
    return true;
  }

  return (
    publication.publicationStatus === "failed_retryable" &&
    publication.failure.retryable === false
  );
}

function isPublicationManualInterventionRequired(
  publication: PublicationDashboardItem,
  outcome: PublishingAnalyticsPublicationOutcome,
): boolean {
  if (outcome === "published") {
    return false;
  }

  if (publication.deliveryStatus === "re-auth required") {
    return true;
  }

  if (publication.manualActions.nextAction !== null) {
    return true;
  }

  return classifyPublicationReason(publication) !== null;
}

function classifyPublicationReason(
  publication: PublicationDashboardItem,
): PublishingAnalyticsReasonKey | null {
  const reason = classifyReasonKeyFromCode(
    publication.validation.code ??
      publication.failure.code ??
      publication.latestSafeErrorHint,
  );

  if (reason) {
    return reason;
  }

  if (publication.deliveryStatus === "re-auth required") {
    return "reauth_required";
  }

  return null;
}

function classifyTargetReason(
  target: CrosspostingSummaryTargetItem,
): PublishingAnalyticsReasonKey | null {
  const reason = classifyReasonKeyFromCode(
    target.blockReason ??
      target.lastBlockReason ??
      target.safeErrorHint ??
      target.blockMessage,
  );

  if (reason) {
    return reason;
  }

  if (target.reauthRequired) {
    return "reauth_required";
  }

  if (target.targetStatus === "unsupported") {
    return "unsupported_provider";
  }

  return null;
}

function classifyReasonKeyFromCode(
  value: string | null | undefined,
): PublishingAnalyticsReasonKey | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  if (
    normalized.includes("missing_publish_scopes") ||
    normalized.includes("missing_scope")
  ) {
    return "missing_scope";
  }

  if (
    normalized.includes("provider_unauthorized") ||
    normalized.includes("platform_connection_not_found") ||
    normalized.includes("connection_not_found") ||
    normalized.includes("expired")
  ) {
    return "reauth_required";
  }

  if (
    normalized.includes("unsupported_target_platform") ||
    normalized.includes("platform_mismatch") ||
    normalized.includes("unsupported_provider")
  ) {
    return "unsupported_provider";
  }

  if (
    normalized.includes("account_capability_missing") ||
    normalized.includes("conditional_field_unresolved") ||
    normalized.includes("provider_override_mismatch") ||
    normalized.includes("provider_override_unsupported_field") ||
    normalized.includes("unsupported_capability_version")
  ) {
    return "capability_mismatch";
  }

  if (
    normalized.includes("publishable_bundle_missing") ||
    normalized.includes("content_job_not_found") ||
    normalized.includes("publication_not_ready") ||
    normalized.includes("asset_missing") ||
    normalized.includes("asset_not_publishable")
  ) {
    return "asset_not_publishable";
  }

  if (
    normalized.includes("policy_blocked") ||
    normalized.includes("provider_rate_limited") ||
    normalized.includes("provider_unavailable") ||
    normalized.includes("remote_post_rejected")
  ) {
    return "provider_policy";
  }

  if (
    BLOCKING_VALIDATION_CODES.has(normalized) ||
    BLOCKING_FAILURE_CODES.has(normalized)
  ) {
    return "unknown_fallback";
  }

  return null;
}

function resolvePeriodRange(
  period: PublishingAnalyticsPeriod,
  now: Date,
): { end: string; start: string | null } {
  if (period === "all") {
    return {
      end: now.toISOString(),
      start: null,
    };
  }

  const durationDays =
    period === "last_7_days" ? 7 : period === "last_90_days" ? 90 : 30;
  const start = new Date(now.getTime() - durationDays * 24 * 60 * 60 * 1000);

  return {
    end: now.toISOString(),
    start: start.toISOString(),
  };
}

function resolveTimeToPublishMs(
  publication: PublicationDashboardItem,
): number | null {
  if (!publication.publishedAt) {
    return null;
  }

  const startAt = publication.requestedAt ?? publication.createdAt;
  const startMs = Date.parse(startAt);
  const endMs = Date.parse(publication.publishedAt);

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return null;
  }

  return endMs - startMs;
}

function resolveFirstProviderAckMs(
  publication: PublicationDashboardItem,
): number | null {
  const providerAckEvent = publication.history.find(
    (event) => event.timelineCategory === "provider_result",
  );

  if (!providerAckEvent) {
    return null;
  }

  const startAt = publication.requestedAt ?? publication.createdAt;
  const startMs = Date.parse(startAt);
  const endMs = Date.parse(providerAckEvent.createdAt);

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return null;
  }

  return endMs - startMs;
}

function calculateAverage(values: Array<number | null>): number | null {
  const filtered = values.filter(
    (value): value is number => typeof value === "number",
  );

  if (filtered.length === 0) {
    return null;
  }

  return filtered.reduce((total, value) => total + value, 0) / filtered.length;
}

function calculateMedian(values: Array<number | null>): number | null {
  const filtered = values.filter(
    (value): value is number => typeof value === "number",
  );

  if (filtered.length === 0) {
    return null;
  }

  const sorted = [...filtered].sort(
    (left: number, right: number) => left - right,
  );
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    const lower = sorted[middle - 1];
    const upper = sorted[middle];

    if (lower === undefined || upper === undefined) {
      return null;
    }

    return (lower + upper) / 2;
  }

  return sorted[middle] ?? null;
}

function calculatePercentile(
  values: Array<number | null>,
  percentile: number,
): number | null {
  const filtered = values.filter(
    (value): value is number => typeof value === "number",
  );

  if (filtered.length === 0) {
    return null;
  }

  const sorted = [...filtered].sort(
    (left: number, right: number) => left - right,
  );
  const rank = Math.min(
    Math.max(Math.ceil((percentile / 100) * sorted.length) - 1, 0),
    sorted.length - 1,
  );

  return sorted[rank] ?? null;
}

function resolveRate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) {
    return null;
  }

  return numerator / denominator;
}

function matchesProviderFilter(
  provider: string,
  filter: PublishingAnalyticsProviderFilter,
): boolean {
  if (filter === "all") {
    return true;
  }

  return provider === filter;
}

function normalizePublishingProvider(
  provider: string,
): PublishingAnalyticsProvider | null {
  if (provider === "youtube") {
    return "youtube";
  }

  if (provider === "tiktok") {
    return "tiktok";
  }

  return null;
}

function getPublicationReferenceTimestamp(
  publication: PublicationDashboardItem,
): string | null {
  return publication.requestedAt ?? publication.createdAt ?? null;
}

function getFanoutReferenceTimestamp(
  fanout: CrosspostingSummaryFanoutItem,
): string | null {
  return fanout.requestedAt ?? fanout.createdAt ?? fanout.updatedAt ?? null;
}
