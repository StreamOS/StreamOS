import type { RepurposingPlanResult, StreamPlatform } from "./index.js";

export const PUBLICATION_CAPABILITY_VERSION = "2026.06.p3.2.v1" as const;

export const PUBLICATION_CAPABILITY_SUPPORT_STATUSES = [
  "supported",
  "conditional",
  "unsupported",
  "experimental",
] as const;

export type PublicationCapabilitySupportStatus =
  (typeof PUBLICATION_CAPABILITY_SUPPORT_STATUSES)[number];

export const PUBLICATION_CANONICAL_FIELD_KEYS = [
  "publishKind",
  "formatProfile",
  "title",
  "description",
  "hashtags",
  "visibility",
  "scheduledPublishAt",
  "disclosureIntent",
  "audienceClassification",
  "assetReference",
] as const;

export type PublicationCanonicalFieldKey =
  (typeof PUBLICATION_CANONICAL_FIELD_KEYS)[number];

export type PublicationFieldGroup =
  | "canonical"
  | "provider_mapped"
  | "provider_specific";

export type PublicationCapabilityIssueSeverity = "blocking" | "warning";

export const PUBLICATION_CAPABILITY_ISSUE_CODES = [
  "account_capability_missing",
  "conditional_field_unresolved",
  "invalid_provider_override_value",
  "missing_required_canonical_field",
  "policy_blocked",
  "provider_override_mismatch",
  "provider_override_unsupported_field",
  "unsupported_capability_version",
  "unsupported_target_platform",
] as const;

export type PublicationCapabilityIssueCode =
  (typeof PUBLICATION_CAPABILITY_ISSUE_CODES)[number];

export type PublicationCapabilityIssue = {
  code: PublicationCapabilityIssueCode;
  field?: string;
  message: string;
  provider: StreamPlatform;
  severity: PublicationCapabilityIssueSeverity;
};

export type PublicationCapabilityFieldRule = {
  allowedValues?: readonly string[];
  canonicalKey?: PublicationCanonicalFieldKey;
  defaultValue?: unknown;
  dynamic?: boolean;
  group: PublicationFieldGroup;
  key: string;
  label: string;
  notes?: string[];
  required: boolean;
  supportStatus: PublicationCapabilitySupportStatus;
};

export type PublicationAccountCapabilityOverlay = {
  allowedCommentControls?: string[];
  allowedDuetControls?: string[];
  allowedStitchControls?: string[];
  allowedVisibility?: string[];
  capabilityStatus?: PublicationCapabilitySupportStatus;
  notes?: string[];
  maxVideoDurationSeconds?: number;
  schedulingAllowed?: boolean;
};

export type PublicationCapabilityPolicy = {
  allowedTargets?: StreamPlatform[];
  blockedTargets?: StreamPlatform[];
  forbidAutoPublish?: boolean;
  requireManualReview?: boolean;
};

export type PublicationCanonicalAssetReference = {
  contentJobId: string;
  queueJobId: string;
  sourcePlatform: StreamPlatform;
  streamId: string | null;
};

export type PublicationCanonicalDraft = {
  assetReference: PublicationCanonicalAssetReference;
  audienceClassification: "adult" | "all_audiences" | "general" | "teen";
  description: string;
  disclosureIntent: {
    containsAffiliateLinks: boolean;
    containsAIGeneratedAssets: boolean;
    containsSponsoredContent: boolean;
    manualReviewRequired: true;
    warnings: string[];
  };
  formatProfile: "long_form" | "short_form";
  hashtags: string[];
  publishKind: "video";
  scheduledPublishAt: string | null;
  title: string;
  visibility: "friends_only" | "private" | "public" | "unlisted";
};

export type PublicationProviderOverrides = Partial<
  Record<StreamPlatform, Record<string, unknown>>
>;

export type PublicationCapabilityDefinition = {
  canonicalFields: PublicationCapabilityFieldRule[];
  capabilityVersion: string;
  dynamicCapabilityKeys: string[];
  notes: string[];
  providerMappedFields: PublicationCapabilityFieldRule[];
  providerSpecificFields: PublicationCapabilityFieldRule[];
  providerSupportStatus: PublicationCapabilitySupportStatus;
  requiredScopes: string[];
  targetPlatform: StreamPlatform;
};

export type PublicationCapabilityResolution = {
  accountCapabilities: PublicationAccountCapabilityOverlay;
  blockingErrors: PublicationCapabilityIssue[];
  capabilityVersion: string;
  canonicalDraft: PublicationCanonicalDraft;
  canonicalFields: PublicationCapabilityFieldRule[];
  dynamicCapabilityKeys: string[];
  ignoredFields: string[];
  providerMappedFields: PublicationCapabilityFieldRule[];
  providerOverrides: PublicationProviderOverrides;
  providerPayloadPreview: Record<string, unknown>;
  providerSpecificFields: PublicationCapabilityFieldRule[];
  providerSupportStatus: PublicationCapabilitySupportStatus;
  resolvedDefaults: Record<string, unknown>;
  targetPlatform: StreamPlatform;
  unsupportedFields: string[];
  warnings: PublicationCapabilityIssue[];
};

const CANONICAL_VISIBILITY_VALUES = [
  "friends_only",
  "private",
  "public",
  "unlisted",
] as const;

const CANONICAL_AUDIENCE_CLASSIFICATIONS = [
  "adult",
  "all_audiences",
  "general",
  "teen",
] as const;

const YOUTUBE_SUPPORT: PublicationCapabilityDefinition = {
  canonicalFields: [
    field({
      group: "canonical",
      key: "publishKind",
      label: "Publish kind",
      required: true,
      supportStatus: "supported",
    }),
    field({
      allowedValues: ["long_form", "short_form"],
      group: "canonical",
      key: "formatProfile",
      label: "Format profile",
      notes: [
        "Shorts are modeled as a format profile on the canonical YouTube video publish contract.",
      ],
      required: true,
      supportStatus: "supported",
    }),
    field({
      group: "canonical",
      key: "title",
      label: "Title",
      required: true,
      supportStatus: "supported",
    }),
    field({
      group: "canonical",
      key: "description",
      label: "Description",
      required: true,
      supportStatus: "supported",
    }),
    field({
      group: "canonical",
      key: "hashtags",
      label: "Hashtags",
      required: true,
      supportStatus: "supported",
    }),
    field({
      allowedValues: CANONICAL_VISIBILITY_VALUES,
      group: "canonical",
      key: "visibility",
      label: "Visibility",
      required: true,
      supportStatus: "supported",
    }),
    field({
      group: "canonical",
      key: "scheduledPublishAt",
      label: "Scheduled publish time",
      notes: ["Scheduling is resolved server-side before execution."],
      required: false,
      supportStatus: "conditional",
    }),
    field({
      group: "canonical",
      key: "disclosureIntent",
      label: "Disclosure intent",
      required: true,
      supportStatus: "supported",
    }),
    field({
      allowedValues: CANONICAL_AUDIENCE_CLASSIFICATIONS,
      group: "canonical",
      key: "audienceClassification",
      label: "Audience classification",
      required: true,
      supportStatus: "supported",
    }),
    field({
      group: "canonical",
      key: "assetReference",
      label: "Asset reference",
      required: true,
      supportStatus: "supported",
    }),
  ],
  capabilityVersion: PUBLICATION_CAPABILITY_VERSION,
  dynamicCapabilityKeys: ["allowedVisibility", "schedulingAllowed"],
  notes: [
    "YouTube publishing stays on the canonical YouTube video contract.",
    "Provider-specific fields are namespaced and stay separate from the canonical core.",
  ],
  providerMappedFields: [
    field({
      allowedValues: ["private", "public", "unlisted"],
      canonicalKey: "visibility",
      group: "provider_mapped",
      key: "privacy_status",
      label: "Privacy status",
      required: true,
      supportStatus: "supported",
    }),
    field({
      canonicalKey: "hashtags",
      group: "provider_mapped",
      key: "tags",
      label: "Tags",
      required: false,
      supportStatus: "supported",
    }),
    field({
      canonicalKey: "audienceClassification",
      group: "provider_mapped",
      key: "made_for_kids",
      label: "Made for kids",
      required: false,
      supportStatus: "conditional",
    }),
    field({
      canonicalKey: "audienceClassification",
      group: "provider_mapped",
      key: "self_declared_made_for_kids",
      label: "Self-declared made for kids",
      required: false,
      supportStatus: "conditional",
    }),
  ],
  providerSpecificFields: [
    field({
      group: "provider_specific",
      key: "category_id",
      label: "Category ID",
      required: false,
      supportStatus: "conditional",
    }),
    field({
      defaultValue: true,
      group: "provider_specific",
      key: "notify_subscribers",
      label: "Notify subscribers",
      required: false,
      supportStatus: "supported",
    }),
    field({
      defaultValue: "youtube",
      group: "provider_specific",
      key: "license",
      label: "License",
      required: false,
      supportStatus: "supported",
    }),
    field({
      group: "provider_specific",
      key: "playlist_id",
      label: "Playlist ID",
      required: false,
      supportStatus: "conditional",
    }),
    field({
      group: "provider_specific",
      key: "thumbnail_url",
      label: "Thumbnail URL",
      required: false,
      supportStatus: "conditional",
    }),
  ],
  providerSupportStatus: "supported",
  requiredScopes: ["https://www.googleapis.com/auth/youtube.upload"],
  targetPlatform: "youtube",
};

const TIKTOK_SUPPORT: PublicationCapabilityDefinition = {
  canonicalFields: [
    field({
      group: "canonical",
      key: "publishKind",
      label: "Publish kind",
      required: true,
      supportStatus: "supported",
    }),
    field({
      allowedValues: ["short_form"],
      group: "canonical",
      key: "formatProfile",
      label: "Format profile",
      notes: ["TikTok is modeled as a dynamic short-form publish target."],
      required: true,
      supportStatus: "conditional",
    }),
    field({
      group: "canonical",
      key: "title",
      label: "Title",
      required: true,
      supportStatus: "supported",
    }),
    field({
      group: "canonical",
      key: "description",
      label: "Description",
      required: true,
      supportStatus: "supported",
    }),
    field({
      group: "canonical",
      key: "hashtags",
      label: "Hashtags",
      required: true,
      supportStatus: "supported",
    }),
    field({
      allowedValues: CANONICAL_VISIBILITY_VALUES,
      group: "canonical",
      key: "visibility",
      label: "Visibility",
      required: true,
      supportStatus: "conditional",
    }),
    field({
      group: "canonical",
      key: "scheduledPublishAt",
      label: "Scheduled publish time",
      notes: ["TikTok scheduling is resolved dynamically against the account."],
      required: false,
      supportStatus: "conditional",
    }),
    field({
      group: "canonical",
      key: "disclosureIntent",
      label: "Disclosure intent",
      required: true,
      supportStatus: "supported",
    }),
    field({
      allowedValues: CANONICAL_AUDIENCE_CLASSIFICATIONS,
      group: "canonical",
      key: "audienceClassification",
      label: "Audience classification",
      required: true,
      supportStatus: "conditional",
    }),
    field({
      group: "canonical",
      key: "assetReference",
      label: "Asset reference",
      required: true,
      supportStatus: "supported",
    }),
  ],
  capabilityVersion: PUBLICATION_CAPABILITY_VERSION,
  dynamicCapabilityKeys: [
    "allowedCommentControls",
    "allowedDuetControls",
    "allowedStitchControls",
    "allowedVisibility",
    "maxVideoDurationSeconds",
    "schedulingAllowed",
  ],
  notes: [
    "TikTok remains supported, but target-account capabilities can narrow the usable publish surface.",
    "Dynamic account capabilities are read from the linked platform connection when available.",
  ],
  providerMappedFields: [
    field({
      canonicalKey: "description",
      group: "provider_mapped",
      key: "caption",
      label: "Caption",
      required: true,
      supportStatus: "supported",
    }),
    field({
      allowedValues: ["friends", "private", "public"],
      canonicalKey: "visibility",
      group: "provider_mapped",
      key: "privacy_level",
      label: "Privacy level",
      required: true,
      supportStatus: "conditional",
      dynamic: true,
    }),
    field({
      canonicalKey: "visibility",
      group: "provider_mapped",
      key: "comment_control",
      label: "Comment control",
      required: false,
      supportStatus: "conditional",
      dynamic: true,
    }),
    field({
      canonicalKey: "visibility",
      group: "provider_mapped",
      key: "duet_control",
      label: "Duet control",
      required: false,
      supportStatus: "conditional",
      dynamic: true,
    }),
    field({
      canonicalKey: "visibility",
      group: "provider_mapped",
      key: "stitch_control",
      label: "Stitch control",
      required: false,
      supportStatus: "conditional",
      dynamic: true,
    }),
  ],
  providerSpecificFields: [
    field({
      group: "provider_specific",
      key: "allow_comments",
      label: "Allow comments",
      required: false,
      supportStatus: "conditional",
    }),
    field({
      group: "provider_specific",
      key: "allow_duet",
      label: "Allow duet",
      required: false,
      supportStatus: "conditional",
    }),
    field({
      group: "provider_specific",
      key: "allow_stitch",
      label: "Allow stitch",
      required: false,
      supportStatus: "conditional",
    }),
    field({
      group: "provider_specific",
      key: "max_video_duration_seconds",
      label: "Maximum video duration",
      required: false,
      supportStatus: "conditional",
      dynamic: true,
    }),
  ],
  providerSupportStatus: "conditional",
  requiredScopes: [],
  targetPlatform: "tiktok",
};

const UNSUPPORTED_PROVIDER_NOTES = {
  kick: [
    "Kick publishing is currently unsupported by the publishing contract.",
  ],
  twitch: [
    "Twitch generic publishing is currently unsupported by the publishing contract.",
  ],
} satisfies Record<"kick" | "twitch", string[]>;

const UNSUPPORTED_MATRIX: Record<
  "kick" | "twitch",
  PublicationCapabilityDefinition
> = {
  kick: buildUnsupportedDefinition("kick", UNSUPPORTED_PROVIDER_NOTES.kick),
  twitch: buildUnsupportedDefinition(
    "twitch",
    UNSUPPORTED_PROVIDER_NOTES.twitch,
  ),
};

const PUBLISHING_MATRIX: Record<
  StreamPlatform,
  PublicationCapabilityDefinition
> = {
  kick: UNSUPPORTED_MATRIX.kick,
  tiktok: TIKTOK_SUPPORT,
  twitch: UNSUPPORTED_MATRIX.twitch,
  youtube: YOUTUBE_SUPPORT,
};

export function getPublicationCapabilityDefinition(
  targetPlatform: StreamPlatform,
): PublicationCapabilityDefinition {
  return PUBLISHING_MATRIX[targetPlatform];
}

export function buildCanonicalPublicationDraft({
  approvedBundle,
  contentJob,
  targetPlatform,
}: {
  approvedBundle: RepurposingPlanResult;
  contentJob: {
    id: string;
    queueJobId: string | null;
    streamId: string | null;
  };
  targetPlatform: StreamPlatform;
}): PublicationCanonicalDraft {
  const title = (firstNonEmpty(approvedBundle.title_suggestions) ??
    firstNonEmpty([approvedBundle.short_form_plan]) ??
    targetPlatform) as string;
  const description = (firstNonEmpty(approvedBundle.descriptions) ??
    firstNonEmpty([approvedBundle.short_form_plan]) ??
    title) as string;
  const hashtags = (firstNonEmpty(approvedBundle.hashtag_sets) ??
    []) as string[];

  return {
    assetReference: {
      contentJobId: approvedBundle.content_job_id,
      queueJobId: approvedBundle.queue_job_id,
      sourcePlatform: targetPlatform,
      streamId: contentJob.streamId,
    },
    audienceClassification: "general",
    description,
    disclosureIntent: {
      containsAffiliateLinks: false,
      containsAIGeneratedAssets: approvedBundle.provider === "openai",
      containsSponsoredContent: false,
      manualReviewRequired: true,
      warnings: [...approvedBundle.warnings],
    },
    formatProfile: targetPlatform === "tiktok" ? "short_form" : "long_form",
    hashtags,
    publishKind: "video",
    scheduledPublishAt: null,
    title,
    visibility: "public",
  };
}

export function extractPublicationAccountCapabilityOverlay(connection: {
  metadata?: unknown;
  platform: StreamPlatform;
  provider_profile?: unknown;
  scopes?: string[] | null;
}): PublicationAccountCapabilityOverlay {
  const rootMetadata = toRecord(connection.metadata);
  const providerProfile = toRecord(connection.provider_profile);
  const candidateSources = [
    rootMetadata.publish_capabilities,
    rootMetadata.publication_capabilities,
    rootMetadata.capabilities,
    providerProfile.publish_capabilities,
    providerProfile.publication_capabilities,
    providerProfile.capabilities,
  ];

  let candidate = candidateSources.find(isRecord);
  if (!candidate) {
    const platformCandidate = rootMetadata[connection.platform];
    candidate = isRecord(platformCandidate) ? platformCandidate : undefined;
  }
  if (!candidate) {
    const providerCandidate = providerProfile[connection.platform];
    candidate = isRecord(providerCandidate) ? providerCandidate : undefined;
  }

  const nestedCandidate =
    candidate && isRecord(candidate) && isRecord(candidate[connection.platform])
      ? candidate[connection.platform]
      : candidate;
  const normalized = toRecord(nestedCandidate);
  const supportStatus = parseSupportStatus(normalized.support_status);
  const allowedVisibility = parseStringArray(
    normalized.allowed_visibility ??
      normalized.allowedVisibility ??
      normalized.visibility_options ??
      normalized.privacy_options ??
      normalized.privacy_levels,
  );
  const allowedCommentControls = parseStringArray(
    normalized.allowed_comment_controls ??
      normalized.allowedCommentControls ??
      normalized.comment_controls ??
      normalized.comment_options,
  );
  const allowedDuetControls = parseStringArray(
    normalized.allowed_duet_controls ??
      normalized.allowedDuetControls ??
      normalized.duet_controls ??
      normalized.duet_options,
  );
  const allowedStitchControls = parseStringArray(
    normalized.allowed_stitch_controls ??
      normalized.allowedStitchControls ??
      normalized.stitch_controls ??
      normalized.stitch_options,
  );
  const maxVideoDurationSeconds = parsePositiveInteger(
    normalized.max_video_duration_seconds ??
      normalized.maxVideoDurationSeconds ??
      normalized.max_duration_seconds ??
      normalized.maxDurationSeconds,
  );
  const schedulingAllowed = parseBoolean(
    normalized.scheduling_allowed ??
      normalized.schedulingAllowed ??
      normalized.allow_scheduling ??
      normalized.allowScheduling,
  );
  const notes = parseStringArray(normalized.notes ?? normalized.warnings);

  const overlay: PublicationAccountCapabilityOverlay = {};

  if (supportStatus) {
    overlay.capabilityStatus = supportStatus;
  }
  if (allowedVisibility.length > 0) {
    overlay.allowedVisibility = allowedVisibility;
  }
  if (allowedCommentControls.length > 0) {
    overlay.allowedCommentControls = allowedCommentControls;
  }
  if (allowedDuetControls.length > 0) {
    overlay.allowedDuetControls = allowedDuetControls;
  }
  if (allowedStitchControls.length > 0) {
    overlay.allowedStitchControls = allowedStitchControls;
  }
  if (maxVideoDurationSeconds !== undefined) {
    overlay.maxVideoDurationSeconds = maxVideoDurationSeconds;
  }
  if (schedulingAllowed !== undefined) {
    overlay.schedulingAllowed = schedulingAllowed;
  }
  if (notes.length > 0) {
    overlay.notes = notes;
  }

  return overlay;
}

export function resolvePublicationCapabilities({
  accountCapabilities,
  canonicalDraft,
  capabilityVersion = PUBLICATION_CAPABILITY_VERSION,
  policy,
  providerOverrides = {},
  targetPlatform,
}: {
  accountCapabilities?: PublicationAccountCapabilityOverlay | null;
  canonicalDraft: PublicationCanonicalDraft;
  capabilityVersion?: string;
  policy?: PublicationCapabilityPolicy;
  providerOverrides?: PublicationProviderOverrides;
  targetPlatform: StreamPlatform;
}): PublicationCapabilityResolution {
  const definition = getPublicationCapabilityDefinition(targetPlatform);
  const blockingErrors: PublicationCapabilityIssue[] = [];
  const warnings: PublicationCapabilityIssue[] = [];
  const ignoredFields: string[] = [];
  const unsupportedFields: string[] = [];
  const resolvedDefaults: Record<string, unknown> = {};
  const normalizedAccountCapabilities = accountCapabilities ?? {};
  const normalizedCapabilityVersion =
    capabilityVersion.trim() || PUBLICATION_CAPABILITY_VERSION;
  const targetNamespaceOverrides = toRecord(providerOverrides[targetPlatform]);

  if (normalizedCapabilityVersion !== PUBLICATION_CAPABILITY_VERSION) {
    blockingErrors.push({
      code: "unsupported_capability_version",
      message: `Capability version ${normalizedCapabilityVersion} is not supported.`,
      provider: targetPlatform,
      severity: "blocking",
    });
  }

  if (policy?.blockedTargets?.includes(targetPlatform)) {
    blockingErrors.push({
      code: "policy_blocked",
      message: `Publishing to ${targetPlatform} is blocked by policy.`,
      provider: targetPlatform,
      severity: "blocking",
    });
  }

  if (
    policy?.allowedTargets &&
    policy.allowedTargets.length > 0 &&
    !policy.allowedTargets.includes(targetPlatform)
  ) {
    blockingErrors.push({
      code: "policy_blocked",
      message: `Publishing to ${targetPlatform} is not allowed by policy.`,
      provider: targetPlatform,
      severity: "blocking",
    });
  }

  if (definition.providerSupportStatus === "unsupported") {
    blockingErrors.push({
      code: "unsupported_target_platform",
      message: `Publishing to ${targetPlatform} is unsupported.`,
      provider: targetPlatform,
      severity: "blocking",
    });
  }

  const canonicalFieldRules = definition.canonicalFields.map((rule) =>
    cloneRule(rule),
  );
  const providerMappedFieldRules = definition.providerMappedFields.map((rule) =>
    cloneRule(rule),
  );
  const providerSpecificFieldRules = definition.providerSpecificFields.map(
    (rule) => cloneRule(rule),
  );

  applyOverlayToRules({
    accountCapabilities: normalizedAccountCapabilities,
    canonicalFieldRules,
    providerMappedFieldRules,
    providerSpecificFieldRules,
    targetPlatform,
  });

  const providerOverrideKeys = Object.keys(providerOverrides);

  for (const namespace of providerOverrideKeys) {
    if (namespace !== targetPlatform) {
      blockingErrors.push({
        code: "provider_override_mismatch",
        field: namespace,
        message: `Provider overrides must be namespaced to ${targetPlatform}.`,
        provider: targetPlatform,
        severity: "blocking",
      });
    }
  }

  const allowedOverrideKeys = new Set([
    ...providerMappedFieldRules.map((rule) => rule.key),
    ...providerSpecificFieldRules.map((rule) => rule.key),
  ]);
  const overrideEntries = Object.entries(targetNamespaceOverrides);
  const normalizedOverrides: Record<string, unknown> = {};

  for (const [key, value] of overrideEntries) {
    if (!allowedOverrideKeys.has(key)) {
      blockingErrors.push({
        code: "provider_override_unsupported_field",
        field: key,
        message: `Provider override field ${key} is not allowed for ${targetPlatform}.`,
        provider: targetPlatform,
        severity: "blocking",
      });
      continue;
    }

    const allowedValues = findAllowedValues(key, [
      ...providerMappedFieldRules,
      ...providerSpecificFieldRules,
    ]);

    if (
      allowedValues &&
      typeof value === "string" &&
      !allowedValues.includes(value)
    ) {
      blockingErrors.push({
        code: "invalid_provider_override_value",
        field: key,
        message: `Provider override field ${key} does not accept value ${value}.`,
        provider: targetPlatform,
        severity: "blocking",
      });
      continue;
    }

    normalizedOverrides[key] = value;
  }

  validateCanonicalDraft({
    blockingErrors,
    canonicalDraft,
    canonicalFieldRules,
    targetPlatform,
  });

  const providerPayloadPreview = buildProviderPayloadPreview({
    canonicalDraft,
    providerMappedFieldRules,
    providerSpecificFieldRules,
    providerOverrides: normalizedOverrides,
    targetPlatform,
  });

  if (definition.providerSupportStatus === "conditional") {
    if (normalizedAccountCapabilities.capabilityStatus === "unsupported") {
      blockingErrors.push({
        code: "account_capability_missing",
        message: `The ${targetPlatform} account currently reports the target as unsupported.`,
        provider: targetPlatform,
        severity: "blocking",
      });
    } else if (
      !normalizedAccountCapabilities.capabilityStatus &&
      targetPlatform === "tiktok"
    ) {
      warnings.push({
        code: "account_capability_missing",
        message:
          "TikTok target-account capabilities were not resolved; execution remains conditional.",
        provider: targetPlatform,
        severity: "warning",
      });
    }
  }

  if (normalizedAccountCapabilities.notes?.length) {
    warnings.push(
      ...normalizedAccountCapabilities.notes.map((note) => ({
        code: "conditional_field_unresolved" as const,
        message: note,
        provider: targetPlatform,
        severity: "warning" as const,
      })),
    );
  }

  if (!policy?.forbidAutoPublish) {
    warnings.push({
      code: "policy_blocked",
      message:
        "Publishing remains server-validated only; no auto-publish execution is enabled.",
      provider: targetPlatform,
      severity: "warning",
    });
  }

  for (const rule of canonicalFieldRules) {
    if (rule.supportStatus === "unsupported") {
      unsupportedFields.push(rule.key);
    }
    if (rule.supportStatus === "conditional") {
      resolvedDefaults[rule.key] ??= null;
    }
    if (rule.defaultValue !== undefined) {
      resolvedDefaults[rule.key] = rule.defaultValue;
    }
  }

  return {
    accountCapabilities: normalizedAccountCapabilities,
    blockingErrors,
    capabilityVersion: normalizedCapabilityVersion,
    canonicalDraft,
    canonicalFields: canonicalFieldRules,
    dynamicCapabilityKeys: definition.dynamicCapabilityKeys,
    ignoredFields,
    providerMappedFields: providerMappedFieldRules,
    providerOverrides: normalizedOverrides as PublicationProviderOverrides,
    providerPayloadPreview,
    providerSpecificFields: providerSpecificFieldRules,
    providerSupportStatus: definition.providerSupportStatus,
    resolvedDefaults,
    targetPlatform,
    unsupportedFields,
    warnings,
  };
}

function applyOverlayToRules({
  accountCapabilities,
  canonicalFieldRules,
  providerMappedFieldRules,
  providerSpecificFieldRules,
  targetPlatform,
}: {
  accountCapabilities: PublicationAccountCapabilityOverlay;
  canonicalFieldRules: PublicationCapabilityFieldRule[];
  providerMappedFieldRules: PublicationCapabilityFieldRule[];
  providerSpecificFieldRules: PublicationCapabilityFieldRule[];
  targetPlatform: StreamPlatform;
}) {
  if (accountCapabilities.capabilityStatus) {
    const status = accountCapabilities.capabilityStatus;
    for (const rule of [
      ...canonicalFieldRules,
      ...providerMappedFieldRules,
      ...providerSpecificFieldRules,
    ]) {
      if (status === "conditional" && rule.supportStatus === "supported") {
        rule.supportStatus = "conditional";
      }
      if (status === "experimental" && rule.supportStatus === "supported") {
        rule.supportStatus = "experimental";
      }
    }
  }

  if (targetPlatform === "tiktok") {
    const visibilityRule = providerMappedFieldRules.find(
      (rule) => rule.key === "privacy_level",
    );
    if (visibilityRule && accountCapabilities.allowedVisibility?.length) {
      visibilityRule.allowedValues = accountCapabilities.allowedVisibility;
    }

    const commentRule = providerMappedFieldRules.find(
      (rule) => rule.key === "comment_control",
    );
    if (commentRule && accountCapabilities.allowedCommentControls?.length) {
      commentRule.allowedValues = accountCapabilities.allowedCommentControls;
    }

    const duetRule = providerMappedFieldRules.find(
      (rule) => rule.key === "duet_control",
    );
    if (duetRule && accountCapabilities.allowedDuetControls?.length) {
      duetRule.allowedValues = accountCapabilities.allowedDuetControls;
    }

    const stitchRule = providerMappedFieldRules.find(
      (rule) => rule.key === "stitch_control",
    );
    if (stitchRule && accountCapabilities.allowedStitchControls?.length) {
      stitchRule.allowedValues = accountCapabilities.allowedStitchControls;
    }

    const durationRule = providerSpecificFieldRules.find(
      (rule) => rule.key === "max_video_duration_seconds",
    );
    if (durationRule && accountCapabilities.maxVideoDurationSeconds) {
      durationRule.defaultValue = accountCapabilities.maxVideoDurationSeconds;
    }
  }

  if (targetPlatform === "youtube") {
    const visibilityRule = providerMappedFieldRules.find(
      (rule) => rule.key === "privacy_status",
    );
    if (visibilityRule && accountCapabilities.allowedVisibility?.length) {
      visibilityRule.allowedValues = accountCapabilities.allowedVisibility;
    }
  }

  if (
    accountCapabilities.schedulingAllowed === false &&
    targetPlatform !== "kick" &&
    targetPlatform !== "twitch"
  ) {
    const scheduledRule = canonicalFieldRules.find(
      (rule) => rule.key === "scheduledPublishAt",
    );
    if (scheduledRule) {
      scheduledRule.supportStatus = "unsupported";
    }
  }
}

function buildProviderPayloadPreview({
  canonicalDraft,
  providerMappedFieldRules,
  providerOverrides,
  providerSpecificFieldRules,
  targetPlatform,
}: {
  canonicalDraft: PublicationCanonicalDraft;
  providerMappedFieldRules: PublicationCapabilityFieldRule[];
  providerOverrides: Record<string, unknown>;
  providerSpecificFieldRules: PublicationCapabilityFieldRule[];
  targetPlatform: StreamPlatform;
}): Record<string, unknown> {
  const preview: Record<string, unknown> = {
    asset_reference: canonicalDraft.assetReference,
    audience_classification: canonicalDraft.audienceClassification,
    disclosure_intent: canonicalDraft.disclosureIntent,
    format_profile: canonicalDraft.formatProfile,
    hashtags: canonicalDraft.hashtags,
    publish_kind: canonicalDraft.publishKind,
    scheduled_publish_at: canonicalDraft.scheduledPublishAt,
    target_platform: targetPlatform,
    title: canonicalDraft.title,
    visibility: canonicalDraft.visibility,
  };

  if (targetPlatform === "youtube") {
    preview.description = canonicalDraft.description;
    preview.privacy_status = canonicalDraft.visibility;
    preview.tags = canonicalDraft.hashtags;
    preview.notify_subscribers = true;
    preview.license = "youtube";
    preview.made_for_kids = false;
  }

  if (targetPlatform === "tiktok") {
    preview.caption = [canonicalDraft.title, canonicalDraft.description]
      .map((value) => value.trim())
      .filter(Boolean)
      .join("\n\n");
    preview.privacy_level = canonicalDraft.visibility;
    preview.comment_control = providerOverrides.comment_control ?? "allowed";
    preview.duet_control = providerOverrides.duet_control ?? "allowed";
    preview.stitch_control = providerOverrides.stitch_control ?? "allowed";
  }

  for (const rule of providerMappedFieldRules) {
    if (Object.hasOwn(providerOverrides, rule.key)) {
      preview[rule.key] = providerOverrides[rule.key];
      continue;
    }

    if (rule.defaultValue !== undefined) {
      preview[rule.key] = rule.defaultValue;
    }
  }

  for (const rule of providerSpecificFieldRules) {
    if (Object.hasOwn(providerOverrides, rule.key)) {
      preview[rule.key] = providerOverrides[rule.key];
      continue;
    }

    if (rule.defaultValue !== undefined) {
      preview[rule.key] = rule.defaultValue;
    }
  }

  return preview;
}

function validateCanonicalDraft({
  blockingErrors,
  canonicalDraft,
  canonicalFieldRules,
  targetPlatform,
}: {
  blockingErrors: PublicationCapabilityIssue[];
  canonicalDraft: PublicationCanonicalDraft;
  canonicalFieldRules: PublicationCapabilityFieldRule[];
  targetPlatform: StreamPlatform;
}) {
  for (const rule of canonicalFieldRules) {
    const value = canonicalDraft[rule.key as keyof PublicationCanonicalDraft];

    if (rule.required && isCanonicalValueEmpty(value)) {
      blockingErrors.push({
        code: "missing_required_canonical_field",
        field: rule.key,
        message: `Canonical field ${rule.key} is required for ${targetPlatform}.`,
        provider: targetPlatform,
        severity: "blocking",
      });
    }

    if (
      rule.allowedValues &&
      typeof value === "string" &&
      !rule.allowedValues.includes(value)
    ) {
      blockingErrors.push({
        code: "conditional_field_unresolved",
        field: rule.key,
        message: `Canonical field ${rule.key} does not accept value ${value} for ${targetPlatform}.`,
        provider: targetPlatform,
        severity: "blocking",
      });
    }
  }
}

function cloneRule(
  rule: PublicationCapabilityFieldRule,
): PublicationCapabilityFieldRule {
  return {
    ...rule,
    allowedValues: rule.allowedValues ? [...rule.allowedValues] : undefined,
    notes: rule.notes ? [...rule.notes] : undefined,
  };
}

function field(
  definition: Omit<PublicationCapabilityFieldRule, "allowedValues"> & {
    allowedValues?: readonly string[];
  },
): PublicationCapabilityFieldRule {
  return {
    ...definition,
    allowedValues: definition.allowedValues
      ? [...definition.allowedValues]
      : undefined,
    notes: definition.notes ? [...definition.notes] : undefined,
  };
}

function buildUnsupportedDefinition(
  targetPlatform: "kick" | "twitch",
  notes: string[],
): PublicationCapabilityDefinition {
  return {
    canonicalFields: PUBLICATION_CANONICAL_FIELD_KEYS.map((key) =>
      field({
        group: "canonical",
        key,
        label: key,
        required:
          key === "publishKind" ||
          key === "formatProfile" ||
          key === "title" ||
          key === "description" ||
          key === "hashtags" ||
          key === "visibility" ||
          key === "disclosureIntent" ||
          key === "audienceClassification" ||
          key === "assetReference",
        supportStatus: "unsupported",
      }),
    ),
    capabilityVersion: PUBLICATION_CAPABILITY_VERSION,
    dynamicCapabilityKeys: [],
    notes,
    providerMappedFields: [],
    providerSpecificFields: [],
    providerSupportStatus: "unsupported",
    requiredScopes: [],
    targetPlatform,
  };
}

function findAllowedValues(
  key: string,
  rules: PublicationCapabilityFieldRule[],
): readonly string[] | undefined {
  return rules.find((rule) => rule.key === key)?.allowedValues;
}

function firstNonEmpty(
  values: Array<string | string[]>,
): string | string[] | undefined {
  for (const value of values) {
    if (Array.isArray(value)) {
      const filtered = value.map((item) => item.trim()).filter(Boolean);
      if (filtered.length > 0) {
        return filtered;
      }
      continue;
    }

    if (value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

function isCanonicalValueEmpty(value: unknown): boolean {
  if (typeof value === "string") {
    return value.trim().length === 0;
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  if (value === null || value === undefined) {
    return true;
  }

  if (typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).length === 0;
  }

  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function parseSupportStatus(
  value: unknown,
): PublicationCapabilitySupportStatus | undefined {
  if (
    value === "supported" ||
    value === "conditional" ||
    value === "unsupported" ||
    value === "experimental"
  ) {
    return value;
  }

  return undefined;
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  return undefined;
}

function parsePositiveInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  return undefined;
}
