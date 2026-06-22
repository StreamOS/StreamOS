import type { Tables } from "@streamos/database";
import type {
  ConnectionStatus,
  ContentPublicationScheduleBlockReason,
  ContentPublicationScheduleActionPolicy,
  ContentPublicationScheduleStatus,
  PublicationSchedulePolicy,
  PublicationProviderNativeSchedulingAvailability,
  PublicationProviderNativeSchedulingExecutionStatus,
  PublicationProviderNativeSchedulingPolicy,
  PublicationScheduleStatusTone,
  PublicationSchedulerSourceOfTruth,
  RepurposingPlanResult,
  StreamPlatform,
} from "@streamos/types";
import {
  buildCanonicalPublicationDraft,
  buildPublicationScheduleActionPolicy,
  evaluatePublicationFanoutScheduleIntent,
  evaluatePublicationScheduleIntent,
  isApprovedRepurposingPlanResult,
} from "@streamos/types";
import {
  buildPublicationScheduleConflictSummary,
  type PublicationScheduleConflictSummary,
  type PublicationScheduleFanoutTargetConflictSummary,
} from "./PublicationScheduleConflictMapping";
import { sanitizePublicationFreeformText } from "./PublicationStatusConsole.utils";

export {
  getPublicationScheduleConflictSeverityLabel,
  getPublicationScheduleConflictSeverityTone,
  type PublicationScheduleConflict,
} from "./PublicationScheduleConflictMapping";

export type { PublicationScheduleStatusTone } from "@streamos/types";

export const PUBLICATION_SCHEDULE_PERIODS = [
  "upcoming",
  "recent_7d",
  "recent_30d",
  "all",
] as const;

export type PublicationSchedulePeriod =
  (typeof PUBLICATION_SCHEDULE_PERIODS)[number];

function normalizeScheduleConnectionStatus(
  status: PublicationConnectionRow["status"] | null,
): ConnectionStatus | null {
  if (status === "connected") {
    return "connected";
  }

  if (status === "expired") {
    return "expired";
  }

  if (
    status === "revoked" ||
    status === "disconnected" ||
    status === "degraded"
  ) {
    return "revoked";
  }

  return "pending";
}

export const PUBLICATION_SCHEDULE_TYPES = [
  "all",
  "publication",
  "fanout",
] as const;

export type PublicationScheduleType =
  (typeof PUBLICATION_SCHEDULE_TYPES)[number];

export const PUBLICATION_SCHEDULE_PROVIDERS = [
  "all",
  "twitch",
  "youtube",
  "tiktok",
  "kick",
] as const;

export type PublicationScheduleProvider =
  (typeof PUBLICATION_SCHEDULE_PROVIDERS)[number];

export const PUBLICATION_SCHEDULE_STATUSES = [
  "all",
  "scheduled",
  "schedule_ready",
  "schedule_blocked",
  "schedule_expired",
  "schedule_canceled",
  "schedule_replaced",
  "schedule_unknown",
] as const;

export type PublicationScheduleFilterStatus =
  (typeof PUBLICATION_SCHEDULE_STATUSES)[number];

export type PublicationScheduleFiltersInput = {
  period?: PublicationSchedulePeriod | null;
  provider?: PublicationScheduleProvider | null;
  status?: PublicationScheduleFilterStatus | null;
  type?: PublicationScheduleType | null;
};

export type PublicationScheduleFilters = {
  period: PublicationSchedulePeriod;
  periodLabel: string;
  provider: PublicationScheduleProvider;
  providerLabel: string;
  status: PublicationScheduleFilterStatus;
  statusLabel: string;
  type: PublicationScheduleType;
  typeLabel: string;
};

export type PublicationScheduleSummary = {
  sourceCount: number;
  totalCount: number;
  publicationCount: number;
  fanoutCount: number;
  readyCount: number;
  blockedCount: number;
  expiredCount: number;
  reauthRequiredCount: number;
  attentionCount: number;
  latestActivityAt: string | null;
  latestScheduledAt: string | null;
};

export type PublicationScheduleDateGroup = {
  dateKey: string;
  dateLabel: string;
  itemCount: number;
  items: PublicationScheduleItem[];
};

export type PublicationScheduleDashboardInputs = {
  channels: PublicationChannelRow[];
  connections: PublicationConnectionRow[];
  contentJobs: PublicationJobRow[];
  fanoutTargets: PublicationFanoutTargetRow[];
  fanouts: PublicationFanoutRow[];
  initialFilters?: PublicationScheduleFiltersInput;
  initialSelectedItemId?: string | null;
  publications: PublicationRow[];
};

export type PublicationScheduleDashboardModel = {
  filters: PublicationScheduleFilters;
  groups: PublicationScheduleDateGroup[];
  items: PublicationScheduleItem[];
  selectedItem: PublicationScheduleItem | null;
  selectedItemId: string | null;
  summary: PublicationScheduleSummary;
};

export type PublicationScheduleItem = {
  blockedReasonLabel: string | null;
  connectionStatusLabel: string | null;
  createdAt: string;
  detailHref: string;
  conflictSummary: PublicationScheduleConflictSummary;
  fanoutStatusLabel: string | null;
  fanoutSummaryHref: string | null;
  fanoutTargetCount: number | null;
  fanoutTargetProviderSummary: string | null;
  fanoutTargetReadyCount: number | null;
  fanoutTargetReauthRequiredCount: number | null;
  fanoutPolicy: PublicationFanoutRow["fanout_policy"] | null;
  historyHref: string;
  id: string;
  isAttentionNeeded: boolean;
  isBlocked: boolean;
  isExpired: boolean;
  isReauthRequired: boolean;
  itemType: "fanout" | "publication";
  itemTypeLabel: string;
  itemTypeTone: PublicationScheduleStatusTone;
  manualReviewRequiredLabel: string | null;
  publicationStatusLabel: string | null;
  providerLabel: string;
  providerSummary: string;
  reviewStatusAtRequestLabel: string;
  safeMessage: string;
  safeSourceLabel: string;
  schedulePolicy: PublicationSchedulePolicy;
  scheduleSourceLabel: string;
  scheduleStatus: ContentPublicationScheduleStatus;
  scheduleStatusDescription: string;
  scheduleStatusLabel: string;
  scheduleStatusTone: PublicationScheduleStatusTone;
  scheduleActionPolicy: ContentPublicationScheduleActionPolicy;
  scheduledAtUtc: string | null;
  scheduledDateLabel: string;
  scheduledTimeLabel: string;
  scheduledTimezone: string;
  scheduledTimezoneRaw: string | null;
  summaryHref: string;
  targetAccountLabel: string | null;
  targetPlatformLabel: string;
  targetPlatformSummary: string;
  updatedAt: string;
  utcLabel: string;
};

export type PublicationChannelRow = Tables<"channels">;
export type PublicationConnectionRow = Tables<"platform_connections">;
export type PublicationJobRow = Tables<"content_jobs">;
export type PublicationFanoutRow = Tables<"content_publication_fanouts">;
export type PublicationFanoutTargetRow =
  Tables<"content_publication_fanout_targets">;
export type PublicationRow = Tables<"content_publications">;

const FILTER_LABELS: Record<
  | PublicationSchedulePeriod
  | PublicationScheduleType
  | PublicationScheduleProvider
  | PublicationScheduleFilterStatus,
  string
> = {
  all: "Alle",
  fanout: "Parent-Fanout",
  kick: "Kick",
  publication: "Single-Publication",
  recent_30d: "Letzte 30 Tage",
  recent_7d: "Letzte 7 Tage",
  scheduled: "Geplant",
  schedule_blocked: "Blockiert",
  schedule_canceled: "Abgebrochen",
  schedule_expired: "Abgelaufen",
  schedule_ready: "Bereit",
  schedule_replaced: "Ersetzt",
  schedule_unknown: "Unbekannt",
  tiktok: "TikTok",
  twitch: "Twitch",
  upcoming: "Nächste 30 Tage",
  youtube: "YouTube",
};

const SCHEDULE_STATUS_META: Record<
  ContentPublicationScheduleStatus,
  {
    description: string;
    label: string;
    tone: PublicationScheduleStatusTone;
  }
> = {
  not_scheduled: {
    description: "Noch kein planbarer Zeitplan ist gespeichert.",
    label: "Nicht geplant",
    tone: "slate",
  },
  scheduled: {
    description:
      "Der geplante Zeitpunkt ist gespeichert und wartet auf spätere Ausführung.",
    label: "Geplant",
    tone: "violet",
  },
  schedule_blocked: {
    description:
      "Der Zeitplan ist gespeichert, aber mindestens eine Voraussetzung fehlt noch.",
    label: "Blockiert",
    tone: "amber",
  },
  schedule_canceled: {
    description: "Der Zeitplan wurde bewusst abgebrochen.",
    label: "Abgebrochen",
    tone: "rose",
  },
  schedule_expired: {
    description: "Der geplante Zeitpunkt liegt bereits in der Vergangenheit.",
    label: "Abgelaufen",
    tone: "amber",
  },
  schedule_ready: {
    description:
      "Alle sichtbaren Voraussetzungen sind vorhanden; die Ausführung bleibt serverseitig.",
    label: "Bereit für spätere Ausführung",
    tone: "emerald",
  },
  schedule_replaced: {
    description:
      "Dieser Zeitplan wurde durch eine neue Planung ersetzt und ist nicht mehr aktiv.",
    label: "Ersetzt",
    tone: "violet",
  },
  schedule_unknown: {
    description:
      "Der Planungsstatus konnte aus dem sicheren Read-Model nicht vollständig klassifiziert werden.",
    label: "Unbekannter Planungsstatus",
    tone: "slate",
  },
};

const SCHEDULE_BLOCK_REASON_LABELS: Record<
  ContentPublicationScheduleBlockReason,
  string
> = {
  child_not_part_of_parent: "Kind gehört nicht zum gewählten Parent-Fanout",
  content_job_not_approved: "Repurposing-Job noch nicht freigegeben",
  content_job_not_complete: "Repurposing-Job noch nicht abgeschlossen",
  fanout_finalized: "Parent-Fanout bereits abgeschlossen",
  fanout_not_ready: "Parent-Fanout noch nicht bereit",
  missing_publish_scopes: "Publish-Scopes fehlen",
  platform_connection_missing: "Plattformverbindung fehlt",
  platform_connection_not_connected: "Plattformverbindung nicht verbunden",
  publication_finalized: "Publication bereits abgeschlossen",
  publication_processing: "Publication wird bereits verarbeitet",
  publication_reauth_required: "Re-auth erforderlich",
  publication_status_not_schedulable: "Publication-Status nicht planbar",
  publishable_asset_missing: "Publizierbares Asset fehlt",
  publishable_bundle_missing: "Publish-Bundle fehlt",
  schedule_time_invalid: "Ungültige Planungszeit",
  schedule_timezone_invalid: "Ungültige Zeitzone",
  scheduling_not_allowed: "Planung derzeit nicht erlaubt",
  target_unsupported: "Zielplattform nicht unterstützt",
  tenant_mismatch: "Tenant-Abgleich fehlgeschlagen",
};

const SOURCE_LABELS: Record<
  "api-gateway" | "dashboard" | "manual" | "system",
  string
> = {
  "api-gateway": "API Gateway",
  dashboard: "Dashboard",
  manual: "Manuell",
  system: "System",
};

const SCHEDULING_SOURCE_OF_TRUTH_LABELS: Record<
  PublicationSchedulerSourceOfTruth,
  string
> = {
  streamos_managed_primary: "StreamOS-managed primary",
};

const PROVIDER_NATIVE_SCHEDULING_AVAILABILITY_LABELS: Record<
  PublicationProviderNativeSchedulingAvailability,
  string
> = {
  available: "Available",
  conditional: "Conditional",
  unsupported: "Unsupported",
  unknown: "Unknown",
};

const PROVIDER_NATIVE_SCHEDULING_POLICY_LABELS: Record<
  PublicationProviderNativeSchedulingPolicy,
  string
> = {
  provider_native_available_but_not_primary: "Available but not primary",
  provider_native_disabled_by_policy: "Disabled by policy",
  provider_native_future_optional: "Future optional",
  provider_native_unsupported: "Unsupported",
  provider_native_unknown: "Unknown",
};

const PROVIDER_NATIVE_SCHEDULING_EXECUTION_STATUS_LABELS: Record<
  PublicationProviderNativeSchedulingExecutionStatus,
  string
> = {
  not_used: "Not used",
};

export function buildPublicationScheduleDashboardModel({
  channels,
  connections,
  contentJobs,
  fanoutTargets,
  fanouts,
  initialFilters = {},
  initialSelectedItemId = null,
  publications,
}: PublicationScheduleDashboardInputs): PublicationScheduleDashboardModel {
  const filters = normalizeFilters(initialFilters);
  const now = Date.now();
  const channelsById = new Map(
    channels.map((channel) => [channel.id, channel]),
  );
  const connectionsById = new Map(
    connections.map((connection) => [connection.id, connection]),
  );
  const contentJobsById = new Map(contentJobs.map((job) => [job.id, job]));
  const publicationItems = publications
    .filter((publication) => publication.schedule_status !== "not_scheduled")
    .filter((publication) =>
      matchesTimeWindow(publication.scheduled_at_utc, filters.period, now),
    )
    .map((publication) =>
      buildPublicationScheduleItem({
        channelsById,
        connectionsById,
        contentJob: contentJobsById.get(publication.content_job_id) ?? null,
        filters,
        now,
        publication,
      }),
    );
  const fanoutItems = fanouts
    .filter((fanout) => fanout.schedule_status !== "not_scheduled")
    .filter((fanout) =>
      matchesTimeWindow(fanout.scheduled_at_utc, filters.period, now),
    )
    .map((fanout) =>
      buildFanoutScheduleItem({
        connectionsById,
        contentJob: contentJobsById.get(fanout.content_job_id) ?? null,
        filters,
        fanout,
        fanoutTargets: fanoutTargets.filter(
          (target) => target.content_publication_fanout_id === fanout.id,
        ),
        now,
      }),
    );
  const items = [...publicationItems, ...fanoutItems]
    .filter((item): item is PublicationScheduleItem => item !== null)
    .filter((item) => matchesFilters(item, filters))
    .sort(compareScheduleItems);
  const groups = groupScheduleItems(items, now);
  const summary = buildSummary({
    allItems: [...publicationItems, ...fanoutItems].filter(
      (item): item is PublicationScheduleItem => item !== null,
    ),
    visibleItems: items,
  });

  return {
    filters,
    groups,
    items,
    selectedItem: resolveSelectedItem(items, initialSelectedItemId),
    selectedItemId:
      resolveSelectedItem(items, initialSelectedItemId)?.id ?? null,
    summary,
  };
}

export function getPublicationScheduleStatusLabel(
  status: ContentPublicationScheduleStatus,
): string {
  return SCHEDULE_STATUS_META[status].label;
}

export function getPublicationScheduleStatusDescription(
  status: ContentPublicationScheduleStatus,
): string {
  return SCHEDULE_STATUS_META[status].description;
}

export function getPublicationScheduleStatusToneLabel(
  status: ContentPublicationScheduleStatus,
): PublicationScheduleStatusTone {
  return SCHEDULE_STATUS_META[status].tone;
}

export function getPublicationScheduleFilterLabel(
  value:
    | PublicationSchedulePeriod
    | PublicationScheduleProvider
    | PublicationScheduleType
    | PublicationScheduleFilterStatus,
): string {
  return FILTER_LABELS[value];
}

export function getPublicationScheduleBlockReasonLabel(
  reason: ContentPublicationScheduleBlockReason | null,
): string | null {
  if (!reason) {
    return null;
  }

  return SCHEDULE_BLOCK_REASON_LABELS[reason];
}

export function getPublicationScheduleSourceLabel(
  value:
    | PublicationRow["schedule_source"]
    | PublicationFanoutRow["schedule_source"],
): string {
  if (!value) {
    return "Nicht verfügbar";
  }

  return SOURCE_LABELS[value];
}

export function getPublicationSchedulingSourceOfTruthLabel(
  value: PublicationSchedulerSourceOfTruth,
): string {
  return SCHEDULING_SOURCE_OF_TRUTH_LABELS[value];
}

export function getPublicationProviderNativeSchedulingAvailabilityLabel(
  value: PublicationProviderNativeSchedulingAvailability,
): string {
  return PROVIDER_NATIVE_SCHEDULING_AVAILABILITY_LABELS[value];
}

export function getPublicationProviderNativeSchedulingPolicyLabel(
  value: PublicationProviderNativeSchedulingPolicy,
): string {
  return PROVIDER_NATIVE_SCHEDULING_POLICY_LABELS[value];
}

export function getPublicationProviderNativeSchedulingExecutionStatusLabel(
  value: PublicationProviderNativeSchedulingExecutionStatus,
): string {
  return PROVIDER_NATIVE_SCHEDULING_EXECUTION_STATUS_LABELS[value];
}

export function formatPublicationScheduleTimezone(
  value: string | null,
): string {
  if (!value) {
    return "UTC (Fallback)";
  }

  return isValidIanaTimeZone(value) ? value : "UTC (Fallback)";
}

export function formatPublicationScheduleCanonicalUtc(
  value: string | null,
): string {
  if (!value) {
    return "Nicht verfügbar";
  }

  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    return "Nicht verfügbar";
  }

  return `${new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(timestamp)} UTC`;
}

export function formatPublicationScheduleCreatorTime(
  value: string | null,
  timeZone: string | null,
): string {
  if (!value) {
    return "Nicht verfügbar";
  }

  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    return "Nicht verfügbar";
  }

  const resolvedTimeZone = resolveScheduleTimezone(timeZone);

  try {
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: resolvedTimeZone,
    }).format(timestamp);
  } catch {
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(timestamp);
  }
}

export function formatPublicationScheduleDateGroupLabel(
  dateKey: string,
  reference = Date.now(),
): string {
  if (dateKey === "unscheduled") {
    return "Ohne Zeitangabe";
  }

  const [yearRaw, monthRaw, dayRaw] = dateKey.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);

  if (!year || !month || !day) {
    return "Unbekanntes Datum";
  }

  const targetDate = new Date(Date.UTC(year, month - 1, day));
  const current = new Date(reference);
  const currentKey = `${current.getUTCFullYear()}-${String(current.getUTCMonth() + 1).padStart(2, "0")}-${String(current.getUTCDate()).padStart(2, "0")}`;
  const targetKey = `${targetDate.getUTCFullYear()}-${String(targetDate.getUTCMonth() + 1).padStart(2, "0")}-${String(targetDate.getUTCDate()).padStart(2, "0")}`;

  if (targetKey === currentKey) {
    return "Heute";
  }

  const diffDays = Math.round(
    (targetDate.getTime() -
      Date.UTC(
        current.getUTCFullYear(),
        current.getUTCMonth(),
        current.getUTCDate(),
      )) /
      86_400_000,
  );

  if (diffDays === 1) {
    return "Morgen";
  }

  if (diffDays === -1) {
    return "Gestern";
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "full",
    timeZone: "UTC",
  }).format(targetDate);
}

export function isPublicationScheduleDateKey(value: string): boolean {
  return value !== "unscheduled";
}

function deriveVisibleScheduleStatus(
  row: Pick<
    PublicationRow | PublicationFanoutRow,
    | "schedule_status"
    | "scheduled_at_utc"
    | "schedule_canceled_at"
    | "schedule_expired_at"
    | "schedule_replaced_at"
  >,
  now: number,
): ContentPublicationScheduleStatus {
  if (row.schedule_canceled_at) {
    return "schedule_canceled";
  }

  if (row.schedule_replaced_at) {
    return "schedule_replaced";
  }

  if (row.schedule_expired_at) {
    return "schedule_expired";
  }

  if (
    (row.schedule_status === "scheduled" ||
      row.schedule_status === "schedule_ready") &&
    row.scheduled_at_utc &&
    new Date(row.scheduled_at_utc).getTime() < now
  ) {
    return "schedule_expired";
  }

  return row.schedule_status;
}

function extractSchedulePolicySnapshot(
  value: unknown,
): PublicationSchedulePolicy | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const schedulePolicy = (value as { schedule_policy?: unknown })
    .schedule_policy;

  if (!schedulePolicy || typeof schedulePolicy !== "object") {
    return null;
  }

  const candidate = schedulePolicy as Partial<PublicationSchedulePolicy>;

  if (
    typeof candidate.policyVersion !== "string" ||
    typeof candidate.policyStatus !== "string" ||
    typeof candidate.scheduleStatus !== "string" ||
    !isPublicationSchedulePolicyExecutionSnapshot(candidate.execution) ||
    !isPublicationSchedulePolicyProviderHintSnapshot(candidate.providerHint) ||
    !isPublicationSchedulePolicySchedulingDecisionSnapshot(
      candidate.schedulingDecision,
    ) ||
    !isPublicationSchedulePolicyTimingSnapshot(candidate.timing) ||
    !Array.isArray(candidate.info) ||
    !Array.isArray(candidate.warnings) ||
    !isPublicationSchedulePolicyActionPolicySnapshot(candidate.actionPolicy)
  ) {
    return null;
  }

  return candidate as PublicationSchedulePolicy;
}

function isPublicationSchedulePolicyExecutionSnapshot(
  value: unknown,
): value is PublicationSchedulePolicy["execution"] {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as { status?: unknown }).status === "string" &&
    typeof (value as { isLocked?: unknown }).isLocked === "boolean" &&
    typeof (value as { claimedAt?: unknown }).claimedAt !== "undefined" &&
    typeof (value as { claimedBy?: unknown }).claimedBy !== "undefined" &&
    typeof (value as { queueJobId?: unknown }).queueJobId !== "undefined"
  );
}

function isPublicationSchedulePolicyProviderHintSnapshot(
  value: unknown,
): value is PublicationSchedulePolicy["providerHint"] {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as { description?: unknown }).description === "string" &&
    typeof (value as { nativeSchedulingSupported?: unknown })
      .nativeSchedulingSupported === "boolean" &&
    typeof (value as { nativeSchedulingUsed?: unknown })
      .nativeSchedulingUsed === "boolean" &&
    typeof (value as { provider?: unknown }).provider === "string" &&
    Array.isArray((value as { requiredScopes?: unknown }).requiredScopes) &&
    typeof (value as { requiresReauth?: unknown }).requiresReauth ===
      "boolean" &&
    typeof (value as { requiresScopes?: unknown }).requiresScopes ===
      "boolean" &&
    typeof (value as { schedulingAllowed?: unknown }).schedulingAllowed ===
      "boolean" &&
    typeof (value as { safeLabel?: unknown }).safeLabel === "string" &&
    typeof (value as { supportStatus?: unknown }).supportStatus === "string"
  );
}

function isPublicationSchedulePolicySchedulingDecisionSnapshot(
  value: unknown,
): value is PublicationSchedulePolicy["schedulingDecision"] {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as { providerNativeSchedulingAvailability?: unknown })
      .providerNativeSchedulingAvailability === "string" &&
    typeof (value as { providerNativeSchedulingExecutionStatus?: unknown })
      .providerNativeSchedulingExecutionStatus === "string" &&
    typeof (value as { providerNativeSchedulingPolicy?: unknown })
      .providerNativeSchedulingPolicy === "string" &&
    typeof (value as { requiresRevalidation?: unknown })
      .requiresRevalidation === "boolean" &&
    typeof (value as { schedulerSourceOfTruth?: unknown })
      .schedulerSourceOfTruth === "string"
  );
}

function isPublicationSchedulePolicyTimingSnapshot(
  value: unknown,
): value is PublicationSchedulePolicy["timing"] {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as { expiresAt?: unknown }).expiresAt !== "undefined" &&
    typeof (value as { isExpired?: unknown }).isExpired === "boolean" &&
    typeof (value as { isNearDue?: unknown }).isNearDue === "boolean" &&
    typeof (value as { isStale?: unknown }).isStale === "boolean" &&
    typeof (value as { minLeadTimeMinutes?: unknown }).minLeadTimeMinutes ===
      "number" &&
    typeof (value as { maxHorizonDays?: unknown }).maxHorizonDays ===
      "number" &&
    typeof (value as { nearDueEditWindowMinutes?: unknown })
      .nearDueEditWindowMinutes === "number" &&
    typeof (value as { scheduledAtUtc?: unknown }).scheduledAtUtc !==
      "undefined" &&
    typeof (value as { scheduledTimezone?: unknown }).scheduledTimezone !==
      "undefined" &&
    typeof (value as { staleAt?: unknown }).staleAt !== "undefined"
  );
}

function isPublicationSchedulePolicyActionPolicySnapshot(
  value: unknown,
): value is PublicationSchedulePolicy["actionPolicy"] {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as { actions?: unknown }).actions === "object" &&
    typeof (value as { blockReason?: unknown }).blockReason !== "undefined" &&
    typeof (value as { canCancel?: unknown }).canCancel === "boolean" &&
    typeof (value as { canEdit?: unknown }).canEdit === "boolean" &&
    typeof (value as { canReplace?: unknown }).canReplace === "boolean" &&
    typeof (value as { explanation?: unknown }).explanation === "string" &&
    typeof (value as { nextAction?: unknown }).nextAction !== "undefined"
  );
}

function readScheduleValidationBoolean(
  value: unknown,
  key: string,
  fallback: boolean,
): boolean {
  if (!value || typeof value !== "object") {
    return fallback;
  }

  const candidate = (value as Record<string, unknown>)[key];

  return typeof candidate === "boolean" ? candidate : fallback;
}

function buildPublicationScheduleItem({
  channelsById,
  connectionsById,
  contentJob,
  filters,
  now,
  publication,
}: {
  channelsById: Map<string, PublicationChannelRow>;
  connectionsById: Map<string, PublicationConnectionRow>;
  contentJob: PublicationJobRow | null;
  filters: PublicationScheduleFilters;
  now: number;
  publication: PublicationRow;
}): PublicationScheduleItem | null {
  const connection =
    connectionsById.get(publication.platform_connection_id) ?? null;
  const channel =
    connection?.channel_id !== null && connection?.channel_id !== undefined
      ? (channelsById.get(connection.channel_id) ?? null)
      : null;
  const providerLabel = getPlatformLabel(publication.target_platform);
  const scheduleValidationMetadata =
    publication.schedule_validation_metadata ?? null;
  const connectionScopes = connection?.scopes ?? [];
  const approvedBundle = extractApprovedBundle(contentJob?.result ?? null);
  const schedulePolicy =
    extractSchedulePolicySnapshot(scheduleValidationMetadata) ??
    evaluatePublicationScheduleIntent({
      availableScopes: connectionScopes,
      connectionStatus: normalizeScheduleConnectionStatus(
        connection?.status ?? null,
      ),
      contentJobReviewStatus: contentJob?.review_status ?? null,
      contentJobStatus: contentJob?.status ?? null,
      currentPublicationStatus: publication.publication_status,
      hasApprovedBundle: readScheduleValidationBoolean(
        scheduleValidationMetadata,
        "has_approved_bundle",
        Boolean(approvedBundle),
      ),
      hasPublishableAsset: readScheduleValidationBoolean(
        scheduleValidationMetadata,
        "has_publishable_asset",
        publication.schedule_block_reason !== "publishable_asset_missing",
      ),
      hasRequiredScopes: readScheduleValidationBoolean(
        scheduleValidationMetadata,
        "has_required_scopes",
        publication.schedule_block_reason !== "missing_publish_scopes",
      ),
      scheduleSource: publication.schedule_source,
      scheduledAtUtc: publication.scheduled_at_utc,
      scheduledTimezone: publication.scheduled_timezone,
      schedulingAllowed: readScheduleValidationBoolean(
        scheduleValidationMetadata,
        "scheduling_allowed",
        publication.schedule_block_reason !== "scheduling_not_allowed",
      ),
      targetPlatform: publication.target_platform,
      now,
    }).policy;
  const scheduleStatus = deriveVisibleScheduleStatus(publication, now);
  const scheduleMeta = SCHEDULE_STATUS_META[scheduleStatus];
  const blockedReasonLabel = getPublicationScheduleBlockReasonLabel(
    schedulePolicy.blockReason ?? publication.schedule_block_reason,
  );
  const connectionStatusLabel = connection
    ? getPublicationStatusLabel(connection.status)
    : null;
  const isReauthRequired = Boolean(
    schedulePolicy.providerHint.requiresReauth ||
    (connectionStatusLabel && connectionStatusLabel !== "Connected"),
  );
  const isExpired =
    scheduleStatus === "schedule_expired" ||
    schedulePolicy.policyStatus === "expired";
  const isBlocked = scheduleStatus === "schedule_blocked";
  const isFinalized =
    scheduleStatus === "schedule_canceled" ||
    scheduleStatus === "schedule_replaced" ||
    publication.publication_status === "published" ||
    publication.publication_status === "failed_permanent" ||
    publication.publication_status === "canceled" ||
    publication.publication_status === "rejected" ||
    publication.publication_status === "publishing";
  const scheduleActions = buildPublicationScheduleActionPolicy({
    finalBlockReason: isFinalized
      ? publication.publication_status === "publishing"
        ? "publication_processing"
        : "publication_finalized"
      : null,
    isLocked: Boolean(
      publication.schedule_execution_claimed_at ||
      publication.schedule_execution_claimed_by ||
      publication.schedule_execution_status === "claimed" ||
      publication.schedule_execution_status === "queued",
    ),
    itemLabel: "publication schedule",
    lockReason: "publication_processing",
    replaceSupported: true,
  });
  const safeSourceLabel = buildPublicationSafeSourceLabel(
    publication.target_platform,
    approvedBundle,
    contentJob,
  );
  const conflictSummary = buildPublicationScheduleConflictSummary({
    blockedReason:
      schedulePolicy.blockReason ?? publication.schedule_block_reason,
    detailHref: buildSchedulePageHref(filters, publication.id),
    fanoutPolicy: null,
    fanoutSummaryHref: null,
    fanoutTargetBlockedCount: null,
    fanoutTargetCount: null,
    fanoutTargetProviderSummary: null,
    fanoutTargetReauthRequiredCount: null,
    fanoutTargetReadyCount: null,
    fanoutTargetSummaries: [],
    hasApprovedBundle: Boolean(approvedBundle),
    hasPublishableAsset: readScheduleValidationBoolean(
      scheduleValidationMetadata,
      "has_publishable_asset",
      publication.schedule_block_reason !== "publishable_asset_missing",
    ),
    hasRequiredScopes: readScheduleValidationBoolean(
      scheduleValidationMetadata,
      "has_required_scopes",
      publication.schedule_block_reason !== "missing_publish_scopes",
    ),
    historyHref: `/dashboard/publications?publicationId=${publication.id}`,
    isBlocked,
    isExpired,
    isReauthRequired,
    itemType: "publication",
    publicationStatusLabel: formatStatusLabel(publication.publication_status),
    scheduleActionPolicy: scheduleActions,
    schedulePolicy,
    scheduleStatus,
    scheduledAtUtc: publication.scheduled_at_utc,
    scheduledTimezoneLabel: formatPublicationScheduleTimezone(
      publication.scheduled_timezone,
    ),
    scheduledTimezoneRaw: publication.scheduled_timezone,
    targetAccountLabel:
      channel?.display_name ??
      getProviderProfileDisplayName(connection) ??
      "Unlinked target account",
    targetPlatform: publication.target_platform,
    targetPlatformLabel: providerLabel,
  });

  return {
    blockedReasonLabel,
    connectionStatusLabel,
    createdAt: publication.created_at,
    detailHref: buildSchedulePageHref(filters, publication.id),
    conflictSummary,
    fanoutStatusLabel: null,
    fanoutSummaryHref: null,
    fanoutTargetCount: null,
    fanoutTargetProviderSummary: null,
    fanoutTargetReadyCount: null,
    fanoutTargetReauthRequiredCount: null,
    fanoutPolicy: null,
    historyHref: `/dashboard/publications?publicationId=${publication.id}`,
    id: publication.id,
    isAttentionNeeded: isBlocked || isExpired || isReauthRequired,
    isBlocked,
    isExpired,
    isReauthRequired,
    itemType: "publication",
    itemTypeLabel: "Single-Publication",
    itemTypeTone: scheduleMeta.tone,
    manualReviewRequiredLabel: approvedBundle
      ? approvedBundle.manual_review_required
        ? "Ja"
        : "Nein"
      : null,
    publicationStatusLabel: formatStatusLabel(publication.publication_status),
    providerLabel,
    providerSummary: providerLabel,
    reviewStatusAtRequestLabel: formatReviewStatusLabel(
      publication.review_status_at_request,
    ),
    safeMessage: buildPublicationSafeMessage({
      blockedReasonLabel,
      connectionStatusLabel,
      contentJob,
      isBlocked,
      isExpired,
      publication,
      scheduleMeta,
    }),
    safeSourceLabel,
    schedulePolicy,
    scheduleSourceLabel: getPublicationScheduleSourceLabel(
      publication.schedule_source,
    ),
    scheduleStatus,
    scheduleStatusDescription: scheduleMeta.description,
    scheduleStatusLabel: scheduleMeta.label,
    scheduleStatusTone: scheduleMeta.tone,
    scheduleActionPolicy: scheduleActions,
    scheduledAtUtc: publication.scheduled_at_utc,
    scheduledDateLabel: formatPublicationScheduleCreatorTime(
      publication.scheduled_at_utc,
      publication.scheduled_timezone,
    ),
    scheduledTimeLabel: formatScheduleTimeLabel(
      publication.scheduled_at_utc,
      publication.scheduled_timezone,
    ),
    scheduledTimezone: formatPublicationScheduleTimezone(
      publication.scheduled_timezone,
    ),
    scheduledTimezoneRaw: publication.scheduled_timezone,
    summaryHref: `/dashboard/publications?publicationId=${publication.id}`,
    targetAccountLabel:
      channel?.display_name ??
      getProviderProfileDisplayName(connection) ??
      "Unlinked target account",
    targetPlatformLabel: providerLabel,
    targetPlatformSummary: `${providerLabel} / ${
      channel?.display_name ??
      getProviderProfileDisplayName(connection) ??
      "Unlinked target account"
    }`,
    updatedAt: publication.updated_at,
    utcLabel: formatPublicationScheduleCanonicalUtc(
      publication.scheduled_at_utc,
    ),
  };
}

function buildFanoutScheduleItem({
  connectionsById,
  contentJob,
  filters,
  fanout,
  fanoutTargets,
  now,
}: {
  connectionsById: Map<string, PublicationConnectionRow>;
  contentJob: PublicationJobRow | null;
  filters: PublicationScheduleFilters;
  fanout: PublicationFanoutRow;
  fanoutTargets: PublicationFanoutTargetRow[];
  now: number;
}): PublicationScheduleItem {
  const scheduleValidationMetadata =
    fanout.schedule_validation_metadata ?? null;
  const scheduledTimezone = formatPublicationScheduleTimezone(
    fanout.scheduled_timezone,
  );
  const providerLabels = uniqueValues(
    fanoutTargets.map((target) => getPlatformLabel(target.target_platform)),
  );
  const schedulePolicy =
    extractSchedulePolicySnapshot(scheduleValidationMetadata) ??
    evaluatePublicationFanoutScheduleIntent({
      availableScopes: [],
      connectionStatus: null,
      contentJobReviewStatus: contentJob?.review_status ?? null,
      contentJobStatus: contentJob?.status ?? null,
      currentFanoutStatus: fanout.fanout_status,
      hasApprovedBundle: Boolean(extractFanoutApprovedBundle(fanout.snapshot)),
      hasPublishableAsset: readScheduleValidationBoolean(
        scheduleValidationMetadata,
        "has_publishable_asset",
        fanout.schedule_block_reason !== "publishable_asset_missing",
      ),
      hasRequiredScopes: readScheduleValidationBoolean(
        scheduleValidationMetadata,
        "has_required_scopes",
        fanout.schedule_block_reason !== "missing_publish_scopes",
      ),
      hasRunnableTargets: readScheduleValidationBoolean(
        scheduleValidationMetadata,
        "has_runnable_targets",
        fanout.validated_target_count > 0,
      ),
      scheduleSource: fanout.schedule_source,
      scheduledAtUtc: fanout.scheduled_at_utc,
      scheduledTimezone: fanout.scheduled_timezone,
      schedulingAllowed: readScheduleValidationBoolean(
        scheduleValidationMetadata,
        "scheduling_allowed",
        fanout.schedule_block_reason !== "scheduling_not_allowed",
      ),
      targetCount: fanout.target_count,
      now,
    }).policy;
  const scheduleStatus = deriveVisibleScheduleStatus(fanout, now);
  const scheduleMeta = SCHEDULE_STATUS_META[scheduleStatus];
  const blockedReasonLabel = getPublicationScheduleBlockReasonLabel(
    schedulePolicy.blockReason ?? fanout.schedule_block_reason,
  );
  const reauthRequiredTargetCount = countReauthRequiredTargets(
    fanoutTargets,
    connectionsById,
  );
  const readyTargetCount = Math.max(
    0,
    fanout.target_count -
      fanout.blocked_target_count -
      reauthRequiredTargetCount,
  );
  const approvedBundle = extractFanoutApprovedBundle(fanout.snapshot);
  const providerSummary = providerLabels.join(" / ") || "Unbekannter Provider";
  const isReauthRequired =
    reauthRequiredTargetCount > 0 || schedulePolicy.providerHint.requiresReauth;
  const isExpired =
    scheduleStatus === "schedule_expired" ||
    schedulePolicy.policyStatus === "expired";
  const isBlocked = scheduleStatus === "schedule_blocked";
  const isFinalized =
    scheduleStatus === "schedule_canceled" ||
    scheduleStatus === "schedule_replaced" ||
    fanout.fanout_status === "canceled";
  const scheduleActions = buildPublicationScheduleActionPolicy({
    finalBlockReason: isFinalized ? "fanout_finalized" : null,
    isLocked: false,
    itemLabel: "fanout schedule",
    replaceSupported: false,
  });
  const fanoutTargetSummaries = buildFanoutTargetConflictSummaries({
    connectionsById,
    fanoutTargets,
  });
  const conflictSummary = buildPublicationScheduleConflictSummary({
    blockedReason: schedulePolicy.blockReason ?? fanout.schedule_block_reason,
    detailHref: buildSchedulePageHref(filters, fanout.id),
    fanoutPolicy: fanout.fanout_policy,
    fanoutSummaryHref: `/dashboard/publications/fanouts?fanoutId=${fanout.id}`,
    fanoutTargetBlockedCount: fanout.blocked_target_count,
    fanoutTargetCount: fanout.target_count,
    fanoutTargetProviderSummary: providerSummary,
    fanoutTargetReauthRequiredCount: reauthRequiredTargetCount,
    fanoutTargetReadyCount: readyTargetCount,
    fanoutTargetSummaries,
    hasApprovedBundle: Boolean(approvedBundle),
    hasPublishableAsset: readScheduleValidationBoolean(
      scheduleValidationMetadata,
      "has_publishable_asset",
      fanout.schedule_block_reason !== "publishable_asset_missing",
    ),
    hasRequiredScopes: readScheduleValidationBoolean(
      scheduleValidationMetadata,
      "has_required_scopes",
      fanout.schedule_block_reason !== "missing_publish_scopes",
    ),
    historyHref: `/dashboard/publications/fanouts?fanoutId=${fanout.id}`,
    isBlocked,
    isExpired,
    isReauthRequired,
    itemType: "fanout",
    publicationStatusLabel: null,
    scheduleActionPolicy: scheduleActions,
    schedulePolicy,
    scheduleStatus,
    scheduledAtUtc: fanout.scheduled_at_utc,
    scheduledTimezoneLabel: scheduledTimezone,
    scheduledTimezoneRaw: fanout.scheduled_timezone,
    targetAccountLabel: `${fanout.target_count} targets`,
    targetPlatform: "fanout",
    targetPlatformLabel: "Parent-Fanout",
  });

  return {
    blockedReasonLabel,
    connectionStatusLabel: null,
    createdAt: fanout.created_at,
    detailHref: buildSchedulePageHref(filters, fanout.id),
    conflictSummary,
    fanoutStatusLabel: getFanoutStatusLabel(fanout.fanout_status),
    fanoutSummaryHref: `/dashboard/publications/fanouts?fanoutId=${fanout.id}`,
    fanoutTargetCount: fanout.target_count,
    fanoutTargetProviderSummary: providerSummary,
    fanoutTargetReadyCount: readyTargetCount,
    fanoutTargetReauthRequiredCount: reauthRequiredTargetCount,
    fanoutPolicy: fanout.fanout_policy,
    historyHref: `/dashboard/publications/fanouts?fanoutId=${fanout.id}`,
    id: fanout.id,
    isAttentionNeeded: isBlocked || isExpired || isReauthRequired,
    isBlocked,
    isExpired,
    isReauthRequired,
    itemType: "fanout",
    itemTypeLabel: "Parent-Fanout",
    itemTypeTone: scheduleMeta.tone,
    manualReviewRequiredLabel: approvedBundle
      ? approvedBundle.manual_review_required
        ? "Ja"
        : "Nein"
      : null,
    publicationStatusLabel: null,
    providerLabel: providerSummary,
    providerSummary,
    reviewStatusAtRequestLabel: formatReviewStatusLabel(
      fanout.review_status_at_request,
    ),
    safeMessage: buildFanoutSafeMessage({
      blockedReasonLabel,
      contentJob,
      isBlocked,
      isExpired,
      isReauthRequired,
      scheduleMeta,
      targetCount: fanout.target_count,
    }),
    safeSourceLabel: getSafeFanoutTitle(fanout),
    schedulePolicy,
    scheduleSourceLabel: getPublicationScheduleSourceLabel(
      fanout.schedule_source,
    ),
    scheduleStatus,
    scheduleStatusDescription: scheduleMeta.description,
    scheduleStatusLabel: scheduleMeta.label,
    scheduleStatusTone: scheduleMeta.tone,
    scheduleActionPolicy: scheduleActions,
    scheduledAtUtc: fanout.scheduled_at_utc,
    scheduledDateLabel: formatPublicationScheduleCreatorTime(
      fanout.scheduled_at_utc,
      fanout.scheduled_timezone,
    ),
    scheduledTimeLabel: formatScheduleTimeLabel(
      fanout.scheduled_at_utc,
      fanout.scheduled_timezone,
    ),
    scheduledTimezone,
    scheduledTimezoneRaw: fanout.scheduled_timezone,
    summaryHref: `/dashboard/publications/fanouts?fanoutId=${fanout.id}`,
    targetAccountLabel: `${fanout.target_count} targets`,
    targetPlatformLabel: "Parent-Fanout",
    targetPlatformSummary: `${fanout.target_count} targets / ${fanout.blocked_target_count} blocked / ${reauthRequiredTargetCount} re-auth required`,
    updatedAt: fanout.updated_at,
    utcLabel: formatPublicationScheduleCanonicalUtc(fanout.scheduled_at_utc),
  };
}

function buildFanoutTargetConflictSummaries({
  connectionsById,
  fanoutTargets,
}: {
  connectionsById: Map<string, PublicationConnectionRow>;
  fanoutTargets: PublicationFanoutTargetRow[];
}): PublicationScheduleFanoutTargetConflictSummary[] {
  return fanoutTargets.map((target) => {
    const connection =
      connectionsById.get(target.platform_connection_id) ?? null;
    const connectionStatus = connection
      ? normalizeScheduleConnectionStatus(connection.status)
      : null;
    const targetPlatformLabel = getPlatformLabel(target.target_platform);
    const connectionLabel =
      getProviderProfileDisplayName(connection) ?? "Unlinked target account";
    const targetLabel = `${targetPlatformLabel} / ${connectionLabel}`;
    const blockMessage = target.block_message
      ? sanitizePublicationFreeformText(target.block_message)
      : null;
    const isBlocked = Boolean(
      target.target_status === "blocked" ||
      target.block_reason ||
      target.last_block_reason ||
      blockMessage,
    );
    const isReauthRequired = Boolean(
      connectionStatus && connectionStatus !== "connected",
    );

    return {
      blockMessage,
      blockReason: target.block_reason,
      connectionStatus,
      id: target.id,
      isBlocked,
      isReauthRequired,
      providerLabel: targetPlatformLabel,
      targetLabel,
      targetPlatform: target.target_platform as Extract<
        StreamPlatform,
        "tiktok" | "youtube"
      >,
      targetStatus: target.target_status,
      targetStatusLabel:
        target.target_status === "blocked" ? "Blocked" : "Validated",
    };
  });
}

function buildPublicationSafeSourceLabel(
  targetPlatform: StreamPlatform,
  approvedBundle: RepurposingPlanResult | null,
  contentJob: PublicationJobRow | null,
): string {
  if (!approvedBundle) {
    return `${getPlatformLabel(targetPlatform)} publication`;
  }

  return buildCanonicalPublicationDraft({
    approvedBundle,
    contentJob: {
      id: contentJob?.id ?? "content-job-unavailable",
      queueJobId: contentJob?.queue_job_id ?? null,
      streamId: contentJob?.stream_id ?? null,
    },
    targetPlatform,
  }).title;
}

function buildPublicationSafeMessage({
  blockedReasonLabel,
  connectionStatusLabel,
  contentJob,
  isBlocked,
  isExpired,
  publication,
  scheduleMeta,
}: {
  blockedReasonLabel: string | null;
  connectionStatusLabel: string | null;
  contentJob: PublicationJobRow | null;
  isBlocked: boolean;
  isExpired: boolean;
  publication: PublicationRow;
  scheduleMeta: {
    description: string;
    label: string;
    tone: PublicationScheduleStatusTone;
  };
}): string {
  if (blockedReasonLabel) {
    return `${blockedReasonLabel}.`;
  }

  if (isExpired) {
    return "Der geplante Zeitpunkt liegt bereits in der Vergangenheit.";
  }

  if (connectionStatusLabel && connectionStatusLabel !== "Connected") {
    return `Die Verbindung ist ${connectionStatusLabel.toLowerCase()} und benötigt vor der Ausführung eine sichere Re-Auth.`;
  }

  if (scheduleMeta.label === "Bereit für spätere Ausführung") {
    return "Alle sichtbaren Voraussetzungen sind vorhanden; die Ausführung bleibt serverseitig.";
  }

  if (isBlocked) {
    return "Der Zeitplan ist gespeichert, aber noch nicht ausführbar.";
  }

  if (contentJob?.review_status !== "approved") {
    return "Der zugrunde liegende Repurposing-Job ist noch nicht freigegeben.";
  }

  return `Der Zeitplan für ${getPlatformLabel(publication.target_platform)} ist gespeichert und wartet auf die spätere Scheduler-Ausführung.`;
}

function buildFanoutSafeMessage({
  blockedReasonLabel,
  contentJob,
  isBlocked,
  isExpired,
  isReauthRequired,
  scheduleMeta,
  targetCount,
}: {
  blockedReasonLabel: string | null;
  contentJob: PublicationJobRow | null;
  isBlocked: boolean;
  isExpired: boolean;
  isReauthRequired: boolean;
  scheduleMeta: {
    description: string;
    label: string;
    tone: PublicationScheduleStatusTone;
  };
  targetCount: number;
}): string {
  if (blockedReasonLabel) {
    return blockedReasonLabel;
  }

  if (isExpired) {
    return "Der Parent-Fanout liegt bereits in der Vergangenheit und braucht Aufmerksamkeit.";
  }

  if (isReauthRequired) {
    return "Mindestens ein Ziel braucht Re-Auth, bevor der Parent-Fanout später ausgeführt werden kann.";
  }

  if (scheduleMeta.label === "Bereit für spätere Ausführung") {
    return "Der Parent-Fanout ist in der sicheren Read-Model-Darstellung vollständig vorbereitet.";
  }

  if (isBlocked) {
    return "Der Parent-Fanout ist gespeichert, aber noch nicht ausführbar.";
  }

  if (contentJob?.review_status !== "approved") {
    return "Der zugrunde liegende Repurposing-Job ist noch nicht freigegeben.";
  }

  return `Der Parent-Fanout mit ${targetCount} Zielen ist gespeichert und wartet auf die spätere Scheduler-Ausführung.`;
}

function buildSummary({
  allItems,
  visibleItems,
}: {
  allItems: PublicationScheduleItem[];
  visibleItems: PublicationScheduleItem[];
}): PublicationScheduleSummary {
  return {
    sourceCount: allItems.length,
    totalCount: visibleItems.length,
    publicationCount: visibleItems.filter(
      (item) => item.itemType === "publication",
    ).length,
    fanoutCount: visibleItems.filter((item) => item.itemType === "fanout")
      .length,
    readyCount: visibleItems.filter(
      (item) => item.scheduleStatus === "schedule_ready",
    ).length,
    blockedCount: visibleItems.filter((item) => item.isBlocked).length,
    expiredCount: visibleItems.filter((item) => item.isExpired).length,
    reauthRequiredCount: visibleItems.filter((item) => item.isReauthRequired)
      .length,
    attentionCount: visibleItems.filter((item) => item.isAttentionNeeded)
      .length,
    latestActivityAt: latestTimestamp(
      visibleItems.map((item) => item.updatedAt),
    ),
    latestScheduledAt: latestTimestamp(
      visibleItems.map((item) => item.scheduledAtUtc),
    ),
  };
}

function groupScheduleItems(
  items: PublicationScheduleItem[],
  now: number,
): PublicationScheduleDateGroup[] {
  const groups = new Map<string, PublicationScheduleDateGroup>();

  for (const item of items) {
    const dateKey = getPublicationScheduleDateKey(
      item.scheduledAtUtc,
      item.scheduledTimezone,
    );
    const dateLabel = formatPublicationScheduleDateGroupLabel(dateKey, now);
    const group =
      groups.get(dateKey) ??
      ({
        dateKey,
        dateLabel,
        itemCount: 0,
        items: [],
      } satisfies PublicationScheduleDateGroup);

    group.items.push(item);
    group.itemCount = group.items.length;
    groups.set(dateKey, group);
  }

  return [...groups.values()].sort((left, right) => {
    const leftSort = groupSortValue(left.items[0]!, now);
    const rightSort = groupSortValue(right.items[0]!, now);

    if (leftSort !== rightSort) {
      return leftSort - rightSort;
    }

    return compareScheduleItems(left.items[0]!, right.items[0]!);
  });
}

function compareScheduleItems(
  left: PublicationScheduleItem,
  right: PublicationScheduleItem,
): number {
  const now = Date.now();
  const leftSort = getScheduleSortBucket(left, now);
  const rightSort = getScheduleSortBucket(right, now);

  if (leftSort !== rightSort) {
    return leftSort - rightSort;
  }

  const leftTimestamp = getScheduleTimestamp(left.scheduledAtUtc);
  const rightTimestamp = getScheduleTimestamp(right.scheduledAtUtc);

  if (leftTimestamp !== rightTimestamp) {
    if (leftSort === 1) {
      return rightTimestamp - leftTimestamp;
    }

    return leftTimestamp - rightTimestamp;
  }

  return left.id.localeCompare(right.id);
}

function buildSchedulePageHref(
  filters: PublicationScheduleFilters,
  selectedItemId: string,
): string {
  const params = new URLSearchParams();

  if (filters.period !== "upcoming") {
    params.set("period", filters.period);
  }

  if (filters.provider !== "all") {
    params.set("provider", filters.provider);
  }

  if (filters.status !== "all") {
    params.set("status", filters.status);
  }

  if (filters.type !== "all") {
    params.set("type", filters.type);
  }

  if (selectedItemId) {
    params.set("scheduleItemId", selectedItemId);
  }

  const query = params.toString();

  return query.length > 0
    ? `/dashboard/publications/schedule?${query}`
    : "/dashboard/publications/schedule";
}

function getScheduleSortBucket(
  item: PublicationScheduleItem,
  now: number,
): number {
  if (!item.scheduledAtUtc) {
    return 2;
  }

  const timestamp = new Date(item.scheduledAtUtc).getTime();

  if (!Number.isFinite(timestamp)) {
    return 2;
  }

  return timestamp >= now ? 0 : 1;
}

function groupSortValue(item: PublicationScheduleItem, now: number): number {
  return getScheduleSortBucket(item, now);
}

function getScheduleTimestamp(value: string | null): number {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }

  const timestamp = new Date(value).getTime();

  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

function matchesFilters(
  item: PublicationScheduleItem,
  filters: PublicationScheduleFilters,
): boolean {
  if (filters.type !== "all" && item.itemType !== filters.type) {
    return false;
  }

  if (filters.status !== "all" && item.scheduleStatus !== filters.status) {
    return false;
  }

  if (
    filters.provider !== "all" &&
    !matchesProviderFilter(item, filters.provider)
  ) {
    return false;
  }

  return true;
}

function matchesProviderFilter(
  item: PublicationScheduleItem,
  provider: PublicationScheduleProvider,
): boolean {
  const providerLabel = getPublicationProviderLabel(provider);

  if (item.itemType === "publication") {
    return item.providerLabel.toLowerCase() === providerLabel.toLowerCase();
  }

  return item.providerSummary
    .toLowerCase()
    .includes(providerLabel.toLowerCase());
}

function matchesTimeWindow(
  value: string | null,
  period: PublicationSchedulePeriod,
  now: number,
): boolean {
  if (period === "all") {
    return true;
  }

  if (!value) {
    return false;
  }

  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return false;
  }

  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;

  switch (period) {
    case "upcoming":
      return timestamp >= now - sevenDays && timestamp <= now + thirtyDays;
    case "recent_7d":
      return timestamp >= now - sevenDays && timestamp <= now;
    case "recent_30d":
      return timestamp >= now - thirtyDays && timestamp <= now;
    default:
      return true;
  }
}

function normalizeFilters(
  filters: PublicationScheduleFiltersInput,
): PublicationScheduleFilters {
  const period = normalizeFilterValue(
    filters.period,
    PUBLICATION_SCHEDULE_PERIODS,
    "upcoming",
  );
  const provider = normalizeFilterValue(
    filters.provider,
    PUBLICATION_SCHEDULE_PROVIDERS,
    "all",
  );
  const status = normalizeFilterValue(
    filters.status,
    PUBLICATION_SCHEDULE_STATUSES,
    "all",
  );
  const type = normalizeFilterValue(
    filters.type,
    PUBLICATION_SCHEDULE_TYPES,
    "all",
  );

  return {
    period,
    periodLabel: getPublicationScheduleFilterLabel(period),
    provider,
    providerLabel: getPublicationScheduleFilterLabel(provider),
    status,
    statusLabel: getPublicationScheduleFilterLabel(status),
    type,
    typeLabel: getPublicationScheduleFilterLabel(type),
  };
}

function normalizeFilterValue<T extends string>(
  value: T | null | undefined,
  options: readonly T[],
  fallback: T,
): T {
  return value && options.includes(value) ? value : fallback;
}

function resolveSelectedItem(
  items: PublicationScheduleItem[],
  selectedItemId: string | null,
): PublicationScheduleItem | null {
  if (items.length === 0) {
    return null;
  }

  if (selectedItemId) {
    const selected = items.find((item) => item.id === selectedItemId);

    if (selected) {
      return selected;
    }
  }

  return items[0] ?? null;
}

function extractApprovedBundle(
  result: PublicationJobRow["result"] | null,
): RepurposingPlanResult | null {
  return isApprovedRepurposingPlanResult(result) ? result : null;
}

function extractFanoutApprovedBundle(
  snapshot: PublicationFanoutRow["snapshot"],
): RepurposingPlanResult | null {
  if (!snapshot || typeof snapshot !== "object") {
    return null;
  }

  const approvedBundle = (snapshot as { approvedBundle?: unknown })
    .approvedBundle;

  return isApprovedRepurposingPlanResult(approvedBundle)
    ? approvedBundle
    : null;
}

function getSafeFanoutTitle(fanout: PublicationFanoutRow): string {
  const approvedBundle = extractFanoutApprovedBundle(fanout.snapshot);

  if (!approvedBundle) {
    return "Approved parent fanout";
  }

  return (
    firstNonEmpty(approvedBundle.title_suggestions) ??
    approvedBundle.short_form_plan ??
    "Approved parent fanout"
  );
}

function getPublicationScheduleDateKey(
  value: string | null,
  timeZone: string | null,
): string {
  if (!value) {
    return "unscheduled";
  }

  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    return "unscheduled";
  }

  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      month: "2-digit",
      timeZone: resolveScheduleTimezone(timeZone),
      year: "numeric",
    }).formatToParts(timestamp);
    const year = parts.find((part) => part.type === "year")?.value ?? "0000";
    const month = parts.find((part) => part.type === "month")?.value ?? "01";
    const day = parts.find((part) => part.type === "day")?.value ?? "01";

    return `${year}-${month}-${day}`;
  } catch {
    return "unscheduled";
  }
}

function formatScheduleTimeLabel(
  value: string | null,
  timeZone: string | null,
): string {
  if (!value) {
    return "Nicht verfügbar";
  }

  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    return "Nicht verfügbar";
  }

  try {
    return new Intl.DateTimeFormat("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: resolveScheduleTimezone(timeZone),
    }).format(timestamp);
  } catch {
    return new Intl.DateTimeFormat("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    }).format(timestamp);
  }
}

function getFanoutStatusLabel(
  status: PublicationFanoutRow["fanout_status"],
): string {
  switch (status) {
    case "blocked":
      return "Blockiert";
    case "canceled":
      return "Abgebrochen";
    case "partially_validated":
      return "Teilweise bereit";
    case "requested":
      return "Vorbereitet";
    case "validated":
      return "Bereit";
    default:
      return "Unbekannt";
  }
}

function getPlatformLabel(platform: StreamPlatform): string {
  switch (platform) {
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

function getPublicationProviderLabel(
  provider: PublicationScheduleProvider,
): string {
  switch (provider) {
    case "all":
      return "Alle";
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

function formatReviewStatusLabel(
  value:
    | PublicationRow["review_status_at_request"]
    | PublicationFanoutRow["review_status_at_request"],
): string {
  switch (value) {
    case "approved":
      return "Approved";
    case "needs_changes":
      return "Needs changes";
    case "needs_review":
      return "Needs review";
    case "rejected":
      return "Rejected";
    default:
      return "Unknown";
  }
}

function formatStatusLabel(
  value: PublicationRow["publication_status"],
): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function countReauthRequiredTargets(
  targets: PublicationFanoutTargetRow[],
  connectionsById: Map<string, PublicationConnectionRow>,
): number {
  return targets.filter((target) => {
    const connection = connectionsById.get(target.platform_connection_id);

    return Boolean(
      connection &&
      getPublicationStatusLabel(connection.status) !== "Connected",
    );
  }).length;
}

function latestTimestamp(values: Array<string | null>): string | null {
  const timestamps = values
    .filter((value): value is string => typeof value === "string")
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value));

  if (timestamps.length === 0) {
    return null;
  }

  return new Date(Math.max(...timestamps)).toISOString();
}

function isValidIanaTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function resolveScheduleTimezone(value: string | null): string {
  if (!value) {
    return "UTC";
  }

  return isValidIanaTimeZone(value) ? value : "UTC";
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function firstNonEmpty(
  values: Array<string | undefined | null>,
): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return null;
}

function getPublicationStatusLabel(
  status: PublicationConnectionRow["status"],
): string {
  switch (status) {
    case "connected":
      return "Connected";
    case "expired":
      return "Expired";
    case "revoked":
      return "Revoked";
    case "pending":
      return "Pending";
    case "disconnected":
      return "Disconnected";
    case "degraded":
      return "Degraded";
    default:
      return "Unknown";
  }
}

function getProviderProfileDisplayName(
  connection: PublicationConnectionRow | null,
): string | null {
  if (!connection) {
    return null;
  }

  const providerProfile = toSafeRecord(connection.provider_profile);
  const metadata = toSafeRecord(connection.metadata);

  return firstNonEmpty([
    readDisplayName(providerProfile),
    readDisplayName(metadata),
    connection.provider_account_id,
  ]);
}

function readDisplayName(value: Record<string, unknown> | null): string | null {
  if (!value) {
    return null;
  }

  return firstNonEmpty([
    typeof value.display_name === "string" ? value.display_name : null,
    typeof value.displayName === "string" ? value.displayName : null,
    typeof value.username === "string" ? value.username : null,
    typeof value.handle === "string" ? value.handle : null,
    typeof value.name === "string" ? value.name : null,
    typeof value.account_name === "string" ? value.account_name : null,
    typeof value.accountName === "string" ? value.accountName : null,
    typeof value.title === "string" ? value.title : null,
  ]);
}

function toSafeRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}
