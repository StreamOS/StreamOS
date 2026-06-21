import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/dashboard/publications/actions", () => ({
  markPublicationFinalFailedAction: vi.fn(),
  reconcilePublicationAction: vi.fn(),
  retryPublicationAction: vi.fn(),
}));

import {
  buildPublicationDashboardModel,
  type PublicationChannelRow,
  type PublicationConnectionRow,
  type PublicationEventRow,
  type PublicationJobRow,
  type PublicationRow,
  type PublicationVodAssetRow,
} from "./PublicationStatusConsole.utils";
import { PublicationStatusConsole } from "./PublicationStatusConsole";

describe("PublicationStatusConsole", () => {
  it("renders a clear publication summary, selection, history, and sanitized debug state", () => {
    const selected = makePublication({
      capability_snapshot: {
        provider_secret: "do-not-leak",
        safe: "yes",
      },
      capability_version: "1.0.0",
      id: "publication-selected",
      content_job_id: "job-selected",
      desired_visibility: "public",
      effective_visibility: "private",
      external_post_id: "post-1234567890abcdef",
      external_url: "https://example.com/posts/123",
      last_reconciled_at: "2026-06-19T11:10:00.000Z",
      next_retry_at: "2026-06-19T12:10:00.000Z",
      platform_connection_id: "connection-selected",
      provider_failure_code: "provider_unauthorized",
      provider_failure_metadata: {
        access_token: "token-should-not-leak",
      },
      provider_failure_reason: "access_token=token-should-not-leak",
      provider_overrides: {
        client_secret: "client-secret-should-not-leak",
      },
      published_at: null,
      publication_status: "queued",
      reconciliation_status: "reconciling",
      reconcile_next_retry_at: "2026-06-19T12:30:00.000Z",
      reconcile_retry_count: 1,
      requested_at: "2026-06-19T10:05:00.000Z",
      requested_by: "11111111-1111-4111-8111-111111111111",
      remote_processing_status: "uploading",
      remote_state: {
        refresh_token: "refresh-token-should-not-leak",
      },
      remote_status: "missing",
      remote_upload_status: "uploading",
      review_status_at_request: "approved",
      snapshot: {
        api_gateway_secret: "snapshot-secret-should-not-leak",
      },
      snapshot_hash:
        "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      target_platform: "youtube",
      updated_at: "2026-06-19T11:30:00.000Z",
      validation_code: "missing_publish_scopes",
      validation_message: "api_gateway_secret=super-secret",
      validation_metadata: {
        webhook_secret: "webhook-secret-should-not-leak",
      },
    });
    const published = makePublication({
      id: "publication-published",
      content_job_id: "job-published",
      desired_visibility: "public",
      effective_visibility: "public",
      external_post_id: "post-abcdef1234567890",
      external_url: "https://example.com/posts/456",
      last_reconciled_at: "2026-06-19T11:00:00.000Z",
      platform_connection_id: "connection-published",
      published_at: "2026-06-19T11:05:00.000Z",
      publication_status: "published",
      reconciliation_status: "reconciled",
      requested_at: "2026-06-19T09:55:00.000Z",
      requested_by: "11111111-1111-4111-8111-111111111111",
      remote_status: "published",
      review_status_at_request: "approved",
      snapshot_hash:
        "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      target_platform: "tiktok",
      updated_at: "2026-06-19T11:20:00.000Z",
    });

    const selectedJob = makeJob({
      id: "job-selected",
      result: {
        confidence: 88,
        manual_review_required: true,
        reviewer_notes: "Need a shorter hook and api_gateway_secret=hidden",
        warnings: ["Double-check scope: refresh_token=hide-this"],
      },
      review_status: "approved",
      reviewer_notes:
        "Approved with notes: client_secret=still-hidden and safe follow-up.",
      reviewed_at: "2026-06-19T11:00:00.000Z",
      reviewed_by: "system",
      stream_id: "stream-selected",
    });
    const publishedJob = makeJob({
      id: "job-published",
      result: {
        confidence: 92,
        manual_review_required: false,
        warnings: [],
      },
      review_status: "approved",
      reviewed_at: "2026-06-19T10:50:00.000Z",
      reviewed_by: "11111111-1111-4111-8111-111111111111",
    });

    const model = buildPublicationDashboardModel({
      channels: [
        makeChannel({
          display_name: "NovaPlays Main",
          id: "channel-selected",
          platform: "youtube",
        }),
        makeChannel({
          display_name: "NovaPlays Clips",
          id: "channel-published",
          platform: "tiktok",
        }),
      ],
      connections: [
        makeConnection({
          channel_id: "channel-selected",
          id: "connection-selected",
          metadata: {
            redis_url: "redis://user:pass@host:6379/0",
          },
          platform: "youtube",
          provider_profile: {
            access_token: "access-token-should-not-leak",
          },
          scopes: ["publish:write"],
          status: "expired",
        }),
        makeConnection({
          channel_id: "channel-published",
          id: "connection-published",
          metadata: {},
          platform: "tiktok",
          provider_profile: {},
          scopes: ["publish:write"],
          status: "connected",
        }),
      ],
      contentJobs: [selectedJob, publishedJob],
      initialSelectedPublicationId: "publication-selected",
      publicationEvents: [
        makeEvent({
          actor_id: "11111111-1111-4111-8111-111111111111",
          content_publication_id: "publication-selected",
          event_type: "validated",
          id: "event-1",
          metadata: {
            api_gateway_secret: "event-secret-should-not-leak",
          },
          previous_publication_status: "requested",
          publication_status: "queued",
          source: "api-gateway",
        }),
      ],
      publications: [selected, published],
      vodAssets: [
        makeVodAsset({
          stream_id: "stream-selected",
          source_url: "https://cdn.example.com/vods/stream-selected.mp4",
        }),
      ],
    });

    expect(model.summary.total).toBe(2);
    expect(model.summary.published).toBe(1);
    expect(model.summary.reauthRequired).toBe(1);
    expect(model.summary.historyEvents).toBe(1);
    expect(model.selectedPublicationId).toBe("publication-selected");
    expect(model.selectedPublication?.deliveryStatus).toBe("re-auth required");
    expect(model.selectedPublication?.manualActions.canRetry).toBe(false);
    expect(model.selectedPublication?.manualActions.canReconcile).toBe(false);
    expect(model.selectedPublication?.manualActions.canMarkFinalFailed).toBe(
      false,
    );

    const html = renderToStaticMarkup(
      <PublicationStatusConsole model={model} />,
    );

    expect(html).toContain("Publications");
    expect(html).toContain("Publication status fuer approved Repurposing Jobs");
    expect(html).toContain("Manual intervention");
    expect(html).toContain("Safe retry controls for approved publications");
    expect(html).toContain("Retry publish");
    expect(html).toContain("Schedule view");
    expect(html).toContain("Crossposting summary");
    expect(html).toContain("Publishing analytics");
    expect(html).toContain("Reconcile now");
    expect(html).toContain("Mark final failed");
    expect(html).toContain("Blocked");
    expect(html).toContain("Review snapshot");
    expect(html).toContain("History timeline");
    expect(html).toContain("Publication status");
    expect(html).toContain("Lightweight analytics");
    expect(html).toContain("Raw / Debug");
    expect(html).toContain("Selected publication");
    expect(html).toContain("Needs re-auth");
    expect(html).toContain("YouTube reconnect");
    expect(html).toContain("Open remote post");
    expect(html).toContain("NovaPlays Main");
    expect(html).not.toContain("No history entries yet");
    expect(html).toContain("Normalized, append-only publication history");
    expect(html).toContain("Queued for publishing");
    expect(html).toContain("Provider");
    expect(html).toContain("Target channel");
    expect(html).toContain("Current UI status");
    expect(html).toContain("Latest safe error hint");
    expect(html).toContain("post-123...");
    expect(html).toContain("Approved");
    expect(html).toContain("Manual review required");
    expect(html).toContain("[REDACTED]");
    expect(html).not.toContain("token-should-not-leak");
    expect(html).not.toContain("client-secret-should-not-leak");
    expect(html).not.toContain("refresh-token-should-not-leak");
    expect(html).not.toContain("webhook-secret-should-not-leak");
    expect(html).not.toContain("access-token-should-not-leak");
    expect(html).not.toContain("redis://user:pass@host:6379/0");
    expect(html).not.toContain("automation-service.railway.internal");
    expect(html).not.toContain("OpenAI");
    expect(html).not.toContain("publish now");
  });

  it("renders a normalized history timeline with safe fallback labels", () => {
    const publication = makePublication({
      id: "publication-timeline",
      content_job_id: "job-timeline",
      platform_connection_id: "connection-timeline",
      publication_status: "failed_retryable",
      reconciliation_status: "queued",
      review_status_at_request: "approved",
      target_platform: "youtube",
      updated_at: "2026-06-19T12:15:00.000Z",
    });
    const job = makeJob({
      id: "job-timeline",
      result: {
        confidence: 91,
        manual_review_required: true,
        provider: "openai",
        warnings: ["safe warning"],
      },
      review_status: "approved",
      status: "done",
      stream_id: "stream-timeline",
    });
    const model = buildPublicationDashboardModel({
      channels: [
        makeChannel({
          display_name: "Timeline Channel",
          id: "channel-timeline",
          platform: "youtube",
        }),
      ],
      connections: [
        makeConnection({
          channel_id: "channel-timeline",
          id: "connection-timeline",
          platform: "youtube",
          scopes: ["publish:write"],
          status: "connected",
        }),
      ],
      contentJobs: [job],
      publicationEvents: [
        makeEvent({
          content_publication_id: "publication-timeline",
          created_at: "2026-06-19T12:00:00.000Z",
          event_type: "requested",
          id: "timeline-event-1",
          metadata: {
            target_platform: "youtube",
          },
          previous_publication_status: null,
          publication_status: "requested",
          source: "api-gateway",
        }),
        makeEvent({
          content_publication_id: "publication-timeline",
          created_at: "2026-06-19T12:08:00.000Z",
          event_type: "queued",
          id: "timeline-event-2",
          metadata: {
            manual_action: "retry_publish",
            queue_job_id: "publication-queue-job-1",
            retry_count: 1,
          },
          previous_publication_status: "requested",
          publication_status: "queued",
          source: "api-gateway",
        }),
        makeEvent({
          content_publication_id: "publication-timeline",
          created_at: "2026-06-19T12:05:00.000Z",
          event_type: "validated",
          id: "timeline-event-2b",
          metadata: {
            validation_code: "validated",
            validation_message:
              "Gateway accepted the frozen publication snapshot.",
          },
          previous_publication_status: "queued",
          publication_status: "queued",
          source: "api-gateway",
        }),
        makeEvent({
          content_publication_id: "publication-timeline",
          created_at: "2026-06-19T12:10:00.000Z",
          event_type: "failed_retryable",
          id: "timeline-event-3",
          metadata: {
            error_code: "provider_rate_limited",
            retry_after_seconds: 30,
            retry_owner: "bullmq",
            retryable: true,
            upstream_status: 429,
          },
          previous_publication_status: "queued",
          publication_status: "failed_retryable",
          source: "automation-service",
        }),
        makeEvent({
          content_publication_id: "publication-timeline",
          created_at: "2026-06-19T12:15:00.000Z",
          event_type:
            "worker_reported_failure" as unknown as PublicationEventRow["event_type"],
          id: "timeline-event-4",
          metadata: {
            queue_job_id: "reconcile-job-1",
            retry_owner: "manual",
            retry_count: 2,
          },
          previous_publication_status: "failed_retryable",
          publication_status: "queued",
          source: "custom-worker",
        }),
      ],
      publications: [publication],
      vodAssets: [
        makeVodAsset({
          source_url: "https://cdn.example.com/vods/stream-timeline.mp4",
          stream_id: "stream-timeline",
        }),
      ],
    });

    const timeline = model.selectedPublication?.history ?? [];
    const html = renderToStaticMarkup(
      <PublicationStatusConsole model={model} />,
    );

    expect(timeline[0]?.timelineLabel).toBe("Unknown event");
    expect(timeline[0]?.timelineDescription).toContain("safe fallback");
    expect(timeline[1]?.timelineLabel).toBe("Retry requested");
    expect(timeline[1]?.timelineTone).toBe("amber");
    expect(timeline[1]?.metadataSummary).toContain("upstream 429");
    expect(timeline[2]?.timelineLabel).toBe("Retry queued");
    expect(timeline[2]?.timelineDescription).toContain("queue");
    expect(timeline[2]?.metadataSummary).toContain("retry 1");
    expect(timeline[3]?.timelineLabel).toBe("Queued for publishing");
    expect(timeline[4]?.timelineLabel).toBe("Publication requested");
    expect(model.selectedPublication?.latestSafeErrorHint).toContain(
      "retryable outcome",
    );
    expect(html).toContain("History timeline");
    expect(html).toContain("Queued for publishing");
    expect(html).toContain("Retry requested");
    expect(html).toContain("Retry queued");
    expect(html).toContain("Unknown event");
    expect(html).toContain("Remote URL");
    expect(html).toContain("Not available");
    expect(html).toContain("Metadata summary");
    expect(html).toContain("Latest safe error hint");
  });

  it("renders a clear empty state when no publications exist", () => {
    const model = buildPublicationDashboardModel({
      channels: [],
      connections: [],
      contentJobs: [],
      publicationEvents: [],
      publications: [],
      vodAssets: [],
    });

    const html = renderToStaticMarkup(
      <PublicationStatusConsole model={model} />,
    );

    expect(model.summary.total).toBe(0);
    expect(html).toContain("No publications yet");
    expect(html).toContain("Approved repurposing jobs will appear here");
    expect(html).toContain("This view is read-only.");
    expect(html).toContain("Review jobs");
    expect(html).toContain("Content overview");
  });

  it("renders enabled manual actions for an eligible publication", () => {
    const publication = makePublication({
      content_job_id: "job-retryable",
      external_post_id: "post-eligible",
      id: "publication-eligible",
      max_retries: 3,
      platform_connection_id: "connection-eligible",
      publication_status: "failed_retryable",
      reconciliation_status: "idle",
      retry_count: 1,
      review_status_at_request: "approved",
      target_platform: "youtube",
      updated_at: "2026-06-19T12:15:00.000Z",
    });
    const model = buildPublicationDashboardModel({
      channels: [],
      connections: [
        makeConnection({
          id: "connection-eligible",
          platform: "youtube",
          scopes: ["https://www.googleapis.com/auth/youtube.upload"],
          status: "connected",
        }),
      ],
      contentJobs: [
        makeJob({
          id: "job-retryable",
          result: {
            captions: ["Caption one"],
            confidence: 0.95,
            content_job_id: "job-retryable",
            descriptions: ["Description one"],
            hashtag_sets: [["#streamos"]],
            hook_ideas: ["Hook one"],
            manual_review_required: true,
            model: "gpt-4o",
            provider: "openai",
            queue_job_id: "repurposing-plan-retryable",
            review_notes: ["Approved."],
            short_form_plan: "Short-form plan",
            title_suggestions: ["Title one"],
            warnings: [],
          },
          review_status: "approved",
          status: "done",
          stream_id: "stream-retryable",
        }),
      ],
      publicationEvents: [],
      publications: [publication],
      vodAssets: [
        makeVodAsset({
          source_url: "https://cdn.example.com/vods/stream-retryable.mp4",
          stream_id: "stream-retryable",
        }),
      ],
    });

    expect(model.selectedPublication?.manualActions.canRetry).toBe(true);
    expect(model.selectedPublication?.manualActions.nextAction).toBe(
      "retry_publish",
    );
    const html = renderToStaticMarkup(
      <PublicationStatusConsole model={model} />,
    );

    expect(html).toContain("Available");
    expect(html).toContain("Retry publish");
    expect(html).not.toContain("automation-service.railway.internal");
  });
});

function makePublication(
  overrides: Partial<PublicationRow> = {},
): PublicationRow {
  return {
    capability_snapshot: {},
    capability_version: "1.0.0",
    content_job_id: "job-default",
    created_at: "2026-06-19T10:00:00.000Z",
    desired_visibility: "public",
    effective_visibility: null,
    external_post_id: null,
    external_url: null,
    id: "publication-default",
    last_reconciled_at: null,
    max_retries: 3,
    next_retry_at: null,
    platform_connection_id: "connection-default",
    provider_failure_code: null,
    provider_failure_metadata: {},
    provider_failure_reason: null,
    provider_overrides: {},
    published_at: null,
    publication_status: "requested",
    reconciliation_status: "idle",
    reconcile_max_retries: 3,
    reconcile_next_retry_at: null,
    reconcile_retry_count: 0,
    request_intent_hash:
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    requested_at: "2026-06-19T10:00:00.000Z",
    requested_by: "11111111-1111-4111-8111-111111111111",
    retry_count: 0,
    review_status_at_request: "needs_review",
    remote_processing_status: null,
    remote_state: {},
    remote_status: null,
    remote_upload_status: null,
    snapshot: {},
    snapshot_hash:
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    target_platform: "youtube",
    updated_at: "2026-06-19T10:00:00.000Z",
    user_id: "11111111-1111-4111-8111-111111111111",
    validated_at: null,
    validation_code: null,
    validation_message: null,
    validation_metadata: {},
    ...overrides,
  } as PublicationRow;
}

function makeJob(
  overrides: Partial<PublicationJobRow> = {},
): PublicationJobRow {
  return {
    created_at: "2026-06-19T10:00:00.000Z",
    error_message: null,
    id: "job-default",
    job_type: "repurposing",
    type: "repurposing",
    channel_id: null,
    last_retried_at: null,
    max_retries: 3,
    next_retry_at: null,
    payload: {},
    queue_job_id: "repurposing-plan-default",
    result: null,
    retry_count: 0,
    reviewed_at: null,
    reviewed_by: null,
    reviewer_notes: "",
    review_status: "needs_review",
    started_at: null,
    status: "done",
    stream_id: null,
    updated_at: "2026-06-19T10:00:00.000Z",
    user_id: "11111111-1111-4111-8111-111111111111",
    completed_at: null,
    ...overrides,
  } as PublicationJobRow;
}

function makeConnection(
  overrides: Partial<PublicationConnectionRow> = {},
): PublicationConnectionRow {
  return {
    access_token_ciphertext: null,
    channel_id: null,
    connected_at: "2026-06-19T09:55:00.000Z",
    created_at: "2026-06-19T09:55:00.000Z",
    creator_id: "creator-1",
    id: "connection-default",
    metadata: {},
    platform: "youtube",
    provider_account_id: "provider-account-1",
    provider_profile: {},
    scopes: ["publish:write"],
    status: "connected",
    token_version: 1,
    updated_at: "2026-06-19T09:55:00.000Z",
    user_id: "11111111-1111-4111-8111-111111111111",
    expires_at: null,
    refresh_token_ciphertext: null,
    ...overrides,
  } as PublicationConnectionRow;
}

function makeChannel(
  overrides: Partial<PublicationChannelRow> = {},
): PublicationChannelRow {
  return {
    created_at: "2026-06-19T09:50:00.000Z",
    creator_id: "creator-1",
    display_name: "Creator Channel",
    external_channel_id: "external-channel-1",
    follower_count: 1000,
    id: "channel-default",
    platform: "youtube",
    updated_at: "2026-06-19T09:50:00.000Z",
    user_id: "11111111-1111-4111-8111-111111111111",
    ...overrides,
  } as PublicationChannelRow;
}

function makeEvent(
  overrides: Partial<PublicationEventRow> = {},
): PublicationEventRow {
  return {
    actor_id: "11111111-1111-4111-8111-111111111111",
    content_publication_id: "publication-default",
    created_at: "2026-06-19T10:05:00.000Z",
    event_type: "validated",
    id: "event-default",
    metadata: {},
    previous_publication_status: "requested",
    publication_status: "queued",
    source: "api-gateway",
    user_id: "11111111-1111-4111-8111-111111111111",
    ...overrides,
  } as PublicationEventRow;
}

function makeVodAsset(
  overrides: Partial<PublicationVodAssetRow> = {},
): PublicationVodAssetRow {
  return {
    created_at: "2026-06-19T10:00:00.000Z",
    duration_seconds: 3600,
    external_asset_id: null,
    id: "vod-asset-default",
    ingested_at: "2026-06-19T10:00:00.000Z",
    metadata: {},
    platform: "youtube",
    source_url: "https://cdn.example.com/vods/stream-default.mp4",
    status: "transcribed",
    stream_id: "stream-default",
    transcribed_at: null,
    updated_at: "2026-06-19T10:00:00.000Z",
    user_id: "11111111-1111-4111-8111-111111111111",
    ...overrides,
  } as PublicationVodAssetRow;
}
