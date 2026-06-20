import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCanonicalPublicationDraft,
  buildPublicationFanoutRequestIntentHash,
  buildPublicationManualActionPolicy,
  extractPublicationAccountCapabilityOverlay,
  getPublicationCapabilityDefinition,
  PUBLICATION_CAPABILITY_VERSION,
  resolvePublicationCapabilities,
} from "../src/publications.js";

const APPROVED_BUNDLE = {
  captions: ["Clip caption one"],
  confidence: 0.91,
  content_job_id: "22222222-2222-4222-8222-222222222222",
  descriptions: ["First description"],
  hashtag_sets: [["#streamos", "#repurposing"]],
  hook_ideas: ["Hook one"],
  manual_review_required: true as const,
  model: "gpt-4o",
  provider: "openai",
  queue_job_id: "repurposing-plan-33333333-3333-4333-8333-333333333333",
  review_notes: ["Reviewed and approved."],
  short_form_plan: "Short-form plan",
  title_suggestions: ["Video title one"],
  warnings: ["Sanitized and review-ready."],
};

void test("publication capability registry keeps canonical and provider-specific fields separated", () => {
  const youtube = getPublicationCapabilityDefinition("youtube");
  const tiktok = getPublicationCapabilityDefinition("tiktok");
  const twitch = getPublicationCapabilityDefinition("twitch");

  assert.equal(youtube.providerSupportStatus, "supported");
  assert.ok(youtube.canonicalFields.some((field) => field.key === "title"));
  assert.ok(
    youtube.providerMappedFields.some(
      (field) => field.key === "privacy_status",
    ),
  );
  assert.ok(
    youtube.providerSpecificFields.some(
      (field) => field.key === "notify_subscribers",
    ),
  );
  assert.ok(
    !youtube.canonicalFields.some((field) => field.key === "privacy_status"),
  );

  assert.equal(tiktok.providerSupportStatus, "conditional");
  assert.ok(tiktok.requiredScopes.includes("video.publish"));
  assert.ok(
    tiktok.providerMappedFields.some((field) => field.key === "caption"),
  );
  assert.ok(
    tiktok.providerSpecificFields.some((field) => field.key === "allow_duet"),
  );
  assert.ok(!tiktok.canonicalFields.some((field) => field.key === "caption"));

  assert.equal(twitch.providerSupportStatus, "unsupported");
});

void test("canonical draft stays provider-neutral and keeps Shorts as a format profile", () => {
  const youtubeDraft = buildCanonicalPublicationDraft({
    approvedBundle: APPROVED_BUNDLE,
    contentJob: {
      id: APPROVED_BUNDLE.content_job_id,
      queueJobId: APPROVED_BUNDLE.queue_job_id,
      streamId: "33333333-3333-4333-8333-333333333333",
    },
    targetPlatform: "youtube",
  });
  const tiktokDraft = buildCanonicalPublicationDraft({
    approvedBundle: APPROVED_BUNDLE,
    contentJob: {
      id: APPROVED_BUNDLE.content_job_id,
      queueJobId: APPROVED_BUNDLE.queue_job_id,
      streamId: "33333333-3333-4333-8333-333333333333",
    },
    targetPlatform: "tiktok",
  });

  assert.equal(youtubeDraft.publishKind, "video");
  assert.equal(youtubeDraft.formatProfile, "long_form");
  assert.equal(youtubeDraft.title, "Video title one");
  assert.equal(youtubeDraft.description, "First description");
  assert.deepEqual(youtubeDraft.hashtags, ["#streamos", "#repurposing"]);
  assert.equal(
    youtubeDraft.assetReference.queueJobId,
    APPROVED_BUNDLE.queue_job_id,
  );
  assert.equal(youtubeDraft.assetReference.sourcePlatform, "youtube");
  assert.ok(
    !Object.prototype.hasOwnProperty.call(youtubeDraft, "privacyStatus"),
  );

  assert.equal(tiktokDraft.formatProfile, "short_form");
  assert.equal(tiktokDraft.assetReference.sourcePlatform, "tiktok");
});

void test("resolvePublicationCapabilities resolves TikTok privacy preview and keeps the payload structured", () => {
  const tiktokDraft = buildCanonicalPublicationDraft({
    approvedBundle: APPROVED_BUNDLE,
    contentJob: {
      id: APPROVED_BUNDLE.content_job_id,
      queueJobId: APPROVED_BUNDLE.queue_job_id,
      streamId: "33333333-3333-4333-8333-333333333333",
    },
    targetPlatform: "tiktok",
  });
  const resolution = resolvePublicationCapabilities({
    canonicalDraft: tiktokDraft,
    targetPlatform: "tiktok",
  });

  assert.equal(
    resolution.providerPayloadPreview.privacy_level,
    "PUBLIC_TO_EVERYONE",
  );
  assert.equal(resolution.providerPayloadPreview.format_profile, "short_form");
  assert.equal(resolution.providerPayloadPreview.target_platform, "tiktok");
  assert.equal(resolution.providerPayloadPreview.title, "Video title one");
});

void test("extractPublicationAccountCapabilityOverlay resolves dynamic target-account capabilities from metadata", () => {
  const overlay = extractPublicationAccountCapabilityOverlay({
    metadata: {
      publish_capabilities: {
        tiktok: {
          allowed_comment_controls: ["everyone", "followers"],
          allowed_duet_controls: ["allowed"],
          allowed_stitch_controls: ["allowed"],
          allowed_visibility: ["public", "friends"],
          max_video_duration_seconds: 180,
          notes: ["Dynamic TikTok capabilities loaded."],
          scheduling_allowed: true,
          support_status: "conditional",
        },
      },
    },
    platform: "tiktok",
    provider_profile: {
      publish_capabilities: {
        tiktok: {
          allowed_visibility: ["public"],
        },
      },
    },
    scopes: [],
  });

  assert.equal(overlay.capabilityStatus, "conditional");
  assert.deepEqual(overlay.allowedVisibility, ["public", "friends"]);
  assert.deepEqual(overlay.allowedCommentControls, ["everyone", "followers"]);
  assert.equal(overlay.maxVideoDurationSeconds, 180);
  assert.deepEqual(overlay.notes, ["Dynamic TikTok capabilities loaded."]);
  assert.equal(overlay.schedulingAllowed, true);
});

void test("resolvePublicationCapabilities accepts YouTube overrides and resolves provider payload previews", () => {
  const canonicalDraft = buildCanonicalPublicationDraft({
    approvedBundle: APPROVED_BUNDLE,
    contentJob: {
      id: APPROVED_BUNDLE.content_job_id,
      queueJobId: APPROVED_BUNDLE.queue_job_id,
      streamId: "33333333-3333-4333-8333-333333333333",
    },
    targetPlatform: "youtube",
  });
  const resolution = resolvePublicationCapabilities({
    accountCapabilities: {
      allowedVisibility: ["public", "unlisted"],
      schedulingAllowed: true,
    },
    canonicalDraft,
    capabilityVersion: PUBLICATION_CAPABILITY_VERSION,
    providerOverrides: {
      youtube: {
        category_id: "22",
        notify_subscribers: false,
      },
    },
    targetPlatform: "youtube",
  });

  assert.equal(resolution.providerSupportStatus, "supported");
  assert.deepEqual(resolution.blockingErrors, []);
  assert.equal(resolution.providerPayloadPreview.privacy_status, "public");
  assert.equal(resolution.providerPayloadPreview.category_id, "22");
  assert.equal(resolution.providerPayloadPreview.notify_subscribers, false);
  assert.deepEqual(resolution.providerPayloadPreview.tags, [
    "#streamos",
    "#repurposing",
  ]);
  assert.equal(resolution.capabilityVersion, PUBLICATION_CAPABILITY_VERSION);
});

void test("buildPublicationFanoutRequestIntentHash stays stable across target order and hides secret-like payloads", () => {
  const hashA = buildPublicationFanoutRequestIntentHash({
    contentJobId: APPROVED_BUNDLE.content_job_id,
    requestedBy: "11111111-1111-4111-8111-111111111111",
    targets: [
      {
        platformConnectionId: "33333333-3333-4333-8333-333333333333",
        providerOverrides: {
          youtube: {
            notify_subscribers: false,
          },
        },
        targetPlatform: "youtube",
      },
      {
        platformConnectionId: "44444444-4444-4444-8444-444444444444",
        providerOverrides: {
          tiktok: {
            allow_comments: true,
          },
        },
        targetPlatform: "tiktok",
      },
    ],
    userId: "11111111-1111-4111-8111-111111111111",
  });
  const hashB = buildPublicationFanoutRequestIntentHash({
    contentJobId: APPROVED_BUNDLE.content_job_id,
    requestedBy: "11111111-1111-4111-8111-111111111111",
    targets: [
      {
        platformConnectionId: "44444444-4444-4444-8444-444444444444",
        providerOverrides: {
          tiktok: {
            allow_comments: true,
          },
        },
        targetPlatform: "tiktok",
      },
      {
        platformConnectionId: "33333333-3333-4333-8333-333333333333",
        providerOverrides: {
          youtube: {
            notify_subscribers: false,
          },
        },
        targetPlatform: "youtube",
      },
    ],
    userId: "11111111-1111-4111-8111-111111111111",
  });

  assert.equal(hashA, hashB);
  assert.match(hashA, /^[a-f0-9]{64}$/);
});

void test("resolvePublicationCapabilities rejects provider override namespace mismatches", () => {
  const canonicalDraft = buildCanonicalPublicationDraft({
    approvedBundle: APPROVED_BUNDLE,
    contentJob: {
      id: APPROVED_BUNDLE.content_job_id,
      queueJobId: APPROVED_BUNDLE.queue_job_id,
      streamId: "33333333-3333-4333-8333-333333333333",
    },
    targetPlatform: "youtube",
  });
  const resolution = resolvePublicationCapabilities({
    canonicalDraft,
    providerOverrides: {
      tiktok: {
        privacy_level: "public",
      },
      youtube: {
        category_id: "22",
      },
    },
    targetPlatform: "youtube",
  });

  assert.ok(
    resolution.blockingErrors.some(
      (issue) => issue.code === "provider_override_mismatch",
    ),
  );
});

void test("resolvePublicationCapabilities marks unsupported providers explicitly", () => {
  const canonicalDraft = buildCanonicalPublicationDraft({
    approvedBundle: APPROVED_BUNDLE,
    contentJob: {
      id: APPROVED_BUNDLE.content_job_id,
      queueJobId: APPROVED_BUNDLE.queue_job_id,
      streamId: "33333333-3333-4333-8333-333333333333",
    },
    targetPlatform: "kick",
  });
  const resolution = resolvePublicationCapabilities({
    canonicalDraft,
    targetPlatform: "kick",
  });

  assert.equal(resolution.providerSupportStatus, "unsupported");
  assert.ok(
    resolution.blockingErrors.some(
      (issue) => issue.code === "unsupported_target_platform",
    ),
  );
});

void test("publication manual action policy supports TikTok retry and reconciliation contracts", () => {
  const retryPolicy = buildPublicationManualActionPolicy({
    connectionScopes: ["video.publish"],
    connectionStatus: "connected",
    contentJobReviewStatus: "approved",
    contentJobStatus: "done",
    externalPostId: null,
    hasApprovedBundle: true,
    hasPublishableAsset: true,
    maxRetries: 3,
    publicationStatus: "failed_retryable",
    reconcileMaxRetries: 3,
    reconcileRetryCount: 0,
    reconciliationStatus: "idle",
    remotePublishId: "publish-123",
    retryCount: 0,
    targetPlatform: "tiktok",
  });

  assert.equal(retryPolicy.canRetry, true);
  assert.equal(retryPolicy.nextAction, "retry_publish");

  const reconcilePolicy = buildPublicationManualActionPolicy({
    connectionScopes: ["video.publish"],
    connectionStatus: "connected",
    contentJobReviewStatus: "approved",
    contentJobStatus: "done",
    externalPostId: null,
    hasApprovedBundle: true,
    hasPublishableAsset: true,
    maxRetries: 3,
    publicationStatus: "published",
    reconcileMaxRetries: 3,
    reconcileRetryCount: 0,
    reconciliationStatus: "idle",
    remotePublishId: "publish-123",
    retryCount: 0,
    targetPlatform: "tiktok",
  });

  assert.equal(reconcilePolicy.canReconcile, true);
  assert.equal(reconcilePolicy.actions.reconcile_now.allowed, true);
});
