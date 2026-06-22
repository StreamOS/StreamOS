import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  buildCrosspostingSummaryDashboardModel,
  type PublicationFanoutRow,
  type PublicationFanoutTargetRow,
} from "./CrosspostingSummaryConsole.utils";
import { PublishingAnalyticsConsole } from "./PublishingAnalyticsConsole";
import {
  buildPublicationDashboardModel,
  type PublicationChannelRow,
  type PublicationConnectionRow,
  type PublicationEventRow,
  type PublicationJobRow,
  type PublicationRow,
  type PublicationVodAssetRow,
} from "./PublicationStatusConsole.utils";
import {
  buildPublishingAnalyticsDashboardModel,
  formatPublishingAnalyticsDuration,
  formatPublishingAnalyticsPeriodWindow,
  formatPublishingAnalyticsRate,
} from "./PublishingAnalyticsConsole.utils";

describe("PublishingAnalyticsConsole", () => {
  it("renders publishing analytics with safe filters, provider metrics, and partial fanout coverage", () => {
    const publishedJob = makeJob({
      id: "job-published",
      result: makeApprovedBundle({
        content_job_id: "job-published",
        queue_job_id: "queue-published",
        short_form_plan: "Published short-form plan",
        title_suggestions: ["Published title"],
      }),
      review_status: "approved",
      reviewed_at: "2026-06-20T09:55:00.000Z",
      reviewed_by: "system",
      status: "done",
      stream_id: "stream-published",
    });
    const failedJob = makeJob({
      id: "job-failed",
      result: makeApprovedBundle({
        content_job_id: "job-failed",
        queue_job_id: "queue-failed",
        short_form_plan: "Failed short-form plan",
        title_suggestions: ["Failed title"],
      }),
      review_status: "approved",
      reviewed_at: "2026-06-19T09:10:00.000Z",
      reviewed_by: "system",
      status: "done",
      stream_id: "stream-failed",
    });

    const publicationModel = buildPublicationDashboardModel({
      channels: [
        makeChannel({
          display_name: "YouTube Channel",
          id: "channel-youtube",
          platform: "youtube",
        }),
        makeChannel({
          display_name: "TikTok Channel",
          id: "channel-tiktok-failed",
          platform: "tiktok",
        }),
      ],
      connections: [
        makeConnection({
          channel_id: "channel-youtube",
          id: "connection-youtube",
          metadata: {
            refresh_token: "refresh-token-should-not-leak",
          },
          platform: "youtube",
          provider_profile: {
            display_name: "Creator YouTube",
          },
          scopes: ["https://www.googleapis.com/auth/youtube.upload"],
          status: "connected",
        }),
        makeConnection({
          channel_id: "channel-tiktok-failed",
          id: "connection-tiktok-failed",
          metadata: {
            access_token: "access-token-should-not-leak",
          },
          platform: "tiktok",
          provider_profile: {
            display_name: "Creator TikTok",
          },
          scopes: ["video.publish"],
          status: "connected",
        }),
      ],
      contentJobs: [publishedJob, failedJob],
      publicationEvents: [
        makeEvent({
          content_publication_id: "publication-youtube",
          created_at: "2026-06-20T10:10:00.000Z",
          event_type: "published",
          id: "event-youtube-provider",
          metadata: {
            api_gateway_secret: "event-secret-should-not-leak",
            external_post_id: "post-youtube-001",
          },
          previous_publication_status: "publishing",
          publication_status: "published",
          source: "automation-service",
        }),
      ],
      publications: [
        makePublication({
          content_job_id: "job-published",
          desired_visibility: "public",
          effective_visibility: "public",
          external_post_id: "post-youtube-001",
          external_url: "https://www.youtube.com/watch?v=published-safe",
          id: "publication-youtube",
          platform_connection_id: "connection-youtube",
          published_at: "2026-06-20T10:45:00.000Z",
          publication_status: "published",
          remote_status: "published",
          review_status_at_request: "approved",
          target_platform: "youtube",
          updated_at: "2026-06-20T10:50:00.000Z",
        }),
        makePublication({
          content_job_id: "job-failed",
          desired_visibility: "public",
          effective_visibility: "private",
          external_url: "https://user:pass@example.com/private",
          id: "publication-tiktok-failed",
          platform_connection_id: "connection-tiktok-failed",
          publication_status: "failed_permanent",
          remote_status: "missing",
          provider_failure_code: "provider_rate_limited",
          provider_failure_reason: "Rate limited by provider",
          review_status_at_request: "approved",
          target_platform: "tiktok",
          retry_count: 1,
          updated_at: "2026-06-19T10:00:00.000Z",
        }),
      ],
      vodAssets: [
        makeVodAsset({
          source_url: "https://cdn.example.com/vods/stream-published.mp4",
          stream_id: "stream-published",
        }),
        makeVodAsset({
          source_url: "https://cdn.example.com/vods/stream-failed.mp4",
          stream_id: "stream-failed",
        }),
      ],
    });

    const crosspostingModel = buildCrosspostingSummaryDashboardModel({
      channels: [
        makeChannel({
          display_name: "YouTube Channel",
          id: "channel-youtube",
          platform: "youtube",
        }),
        makeChannel({
          display_name: "TikTok Blocked",
          id: "channel-tiktok-blocked",
          platform: "tiktok",
        }),
        makeChannel({
          display_name: "TikTok Reauth",
          id: "channel-tiktok-reauth",
          platform: "tiktok",
        }),
      ],
      connections: [
        makeConnection({
          channel_id: "channel-youtube",
          id: "connection-youtube",
          platform: "youtube",
          provider_profile: {
            display_name: "Creator YouTube",
          },
          scopes: ["https://www.googleapis.com/auth/youtube.upload"],
          status: "connected",
        }),
        makeConnection({
          channel_id: "channel-tiktok-blocked",
          id: "connection-tiktok-blocked",
          platform: "tiktok",
          provider_profile: {
            display_name: "Creator TikTok Blocked",
          },
          scopes: ["video.publish"],
          status: "connected",
        }),
        makeConnection({
          channel_id: "channel-tiktok-reauth",
          id: "connection-tiktok-reauth",
          platform: "tiktok",
          provider_profile: {
            display_name: "Creator TikTok Reauth",
          },
          scopes: ["video.publish"],
          status: "expired",
        }),
      ],
      fanoutTargets: [
        makeFanoutTarget({
          content_publication_fanout_id: "fanout-1",
          content_publication_id: "publication-youtube",
          id: "fanout-target-youtube",
          platform_connection_id: "connection-youtube",
          target_platform: "youtube",
          target_status: "validated",
        }),
        makeFanoutTarget({
          block_reason: "missing_publish_scopes",
          content_publication_fanout_id: "fanout-1",
          content_publication_id: null,
          id: "fanout-target-blocked",
          platform_connection_id: "connection-tiktok-blocked",
          target_platform: "tiktok",
          target_status: "blocked",
        }),
        makeFanoutTarget({
          content_publication_fanout_id: "fanout-1",
          content_publication_id: null,
          id: "fanout-target-reauth",
          platform_connection_id: "connection-tiktok-reauth",
          target_platform: "tiktok",
          target_status: "validated",
        }),
      ],
      fanouts: [
        makeFanout({
          blocked_target_count: 1,
          content_job_id: "job-published",
          fanout_policy: "prepare_valid_targets",
          fanout_status: "partially_validated",
          id: "fanout-1",
          request_intent_hash:
            "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
          review_status_at_request: "approved",
          snapshot: {
            approvedBundle: makeApprovedBundle({
              content_job_id: "job-published",
              queue_job_id: "queue-published",
              short_form_plan: "Published short-form plan",
              title_suggestions: ["Published title"],
            }),
            contentJob: {
              id: "job-published",
              queueJobId: "queue-published",
              reviewStatus: "approved",
              status: "done",
              streamId: "stream-published",
            },
          },
          snapshot_hash:
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          target_count: 3,
          validated_target_count: 2,
          updated_at: "2026-06-20T10:55:00.000Z",
        }),
      ],
      publications: publicationModel.items,
      vodAssets: [
        makeVodAsset({
          source_url: "https://cdn.example.com/vods/stream-published.mp4",
          stream_id: "stream-published",
        }),
        makeVodAsset({
          source_url: "https://cdn.example.com/vods/stream-failed.mp4",
          stream_id: "stream-failed",
        }),
      ],
    });

    const allModel = buildPublishingAnalyticsDashboardModel({
      fanouts: crosspostingModel.items,
      initialPeriod: "last_30_days",
      initialProvider: "all",
      now: new Date("2026-06-21T12:00:00.000Z"),
      publications: publicationModel.items,
    });

    const youtubeModel = buildPublishingAnalyticsDashboardModel({
      fanouts: crosspostingModel.items,
      initialPeriod: "last_30_days",
      initialProvider: "youtube",
      now: new Date("2026-06-21T12:00:00.000Z"),
      publications: publicationModel.items,
    });

    expect(allModel.summary.totalPublications).toBe(2);
    expect(allModel.summary.totalFanouts).toBe(1);
    expect(allModel.summary.successRate).toBeCloseTo(0.5);
    expect(allModel.summary.failureRate).toBeCloseTo(0.5);
    expect(allModel.summary.blockedTargetCount).toBe(1);
    expect(allModel.summary.retryAttemptedCount).toBe(1);
    expect(allModel.summary.retryFailureCount).toBe(1);
    expect(allModel.summary.partialFanoutCount).toBe(1);
    expect(allModel.scopeSummary.fanoutChildPublicationCount).toBe(1);
    expect(allModel.scopeSummary.singlePublicationCount).toBe(1);
    expect(allModel.providerBreakdown[0]?.provider).toBe("youtube");
    expect(allModel.providerBreakdown[1]?.provider).toBe("tiktok");
    expect(allModel.providerBreakdown[0]?.label).toBe("YouTube");
    expect(allModel.providerBreakdown[1]?.label).toBe("TikTok");
    expect(allModel.providerBreakdown[0]?.totalPublications).toBe(1);
    expect(allModel.providerBreakdown[1]?.totalPublications).toBe(1);
    expect(allModel.providerBreakdown[0]?.topFailureReasons).toHaveLength(0);
    expect(
      allModel.providerBreakdown[1]?.topFailureReasons.map(
        (reason) => reason.reason,
      ),
    ).toEqual(
      expect.arrayContaining([
        "provider_policy",
        "missing_scope",
        "reauth_required",
      ]),
    );
    expect(allModel.reasonBreakdown.map((reason) => reason.reason)).toEqual(
      expect.arrayContaining([
        "provider_policy",
        "missing_scope",
        "reauth_required",
      ]),
    );
    expect(formatPublishingAnalyticsRate(allModel.summary.successRate)).toBe(
      "50.0%",
    );
    expect(
      formatPublishingAnalyticsDuration(
        allModel.summary.averageTimeToPublishMs,
      ),
    ).toBe("45m");
    expect(
      formatPublishingAnalyticsPeriodWindow(
        allModel.filters.period,
        allModel.summary.periodStart,
      ),
    ).toContain("Last 30 days");

    expect(youtubeModel.summary.totalPublications).toBe(1);
    expect(youtubeModel.summary.totalAnalyzedTargets).toBe(2);
    expect(youtubeModel.providerBreakdown[0]?.totalPublications).toBe(1);
    expect(youtubeModel.providerBreakdown[1]?.totalPublications).toBe(0);
    expect(youtubeModel.summary.partialFanoutCount).toBe(0);
    expect(youtubeModel.fanoutSummary.publishedCount).toBe(1);

    const html = renderToStaticMarkup(
      <PublishingAnalyticsConsole model={allModel} />,
    );

    expect(html).toContain("Publishing analytics");
    expect(html).toContain("Period and provider scope");
    expect(html).toContain("Scope and window");
    expect(html).toContain("Provider breakdown");
    expect(html).toContain("Failure reasons");
    expect(html).toContain("Fanout outcomes");
    expect(html).toContain("Success rate");
    expect(html).toContain("Average time to publish");
    expect(html).toContain("Partial fanout rate");
    expect(html).toContain("YouTube");
    expect(html).toContain("TikTok");
    expect(html).toContain("missing_scope");
    expect(html).toContain("reauth_required");
    expect(html).toContain("provider_policy");
    expect(html).toContain("Read-only summary");
    expect(html).toContain("Publication history");
    expect(html).toContain("Schedule view");
    expect(html).toContain("Crossposting summary");
    expect(html).toContain("Repurposing review");
    expect(html).not.toContain("super-secret");
    expect(html).not.toContain("access-token-should-not-leak");
    expect(html).not.toContain("refresh-token-should-not-leak");
    expect(html).not.toContain("api_gateway_secret");
    expect(html).not.toContain("redis://");
    expect(html).not.toContain("automation-service.railway.internal");
    expect(html).not.toContain("OpenAI");
  });

  it("renders a clear empty state when no publishing analytics exist for the selected scope", () => {
    const model = buildPublishingAnalyticsDashboardModel({
      fanouts: [],
      initialPeriod: "last_7_days",
      initialProvider: "all",
      now: new Date("2026-06-21T12:00:00.000Z"),
      publications: [],
    });

    const html = renderToStaticMarkup(
      <PublishingAnalyticsConsole model={model} />,
    );

    expect(model.summary.totalPublications).toBe(0);
    expect(model.summary.totalFanouts).toBe(0);
    expect(html).toContain("No publishing analytics yet");
    expect(html).toContain(
      "No approved publications matched the selected scope",
    );
    expect(html).toContain("Period");
    expect(html).toContain("Provider");
    expect(html).toContain("Coverage");
    expect(html).toContain("Publication history");
    expect(html).toContain("Crossposting summary");
    expect(html).not.toContain("api_gateway_secret");
    expect(html).not.toContain("access-token");
    expect(html).not.toContain("refresh-token");
  });
});

function makePublication(
  overrides: Partial<PublicationRow> = {},
): PublicationRow {
  return {
    capability_snapshot: {},
    capability_version: "1.0.0",
    content_job_id: "job-default",
    created_at: "2026-06-20T10:00:00.000Z",
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
    requested_at: "2026-06-20T10:00:00.000Z",
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
    updated_at: "2026-06-20T10:00:00.000Z",
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
    created_at: "2026-06-20T09:55:00.000Z",
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
    updated_at: "2026-06-20T09:55:00.000Z",
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
    connected_at: "2026-06-20T09:50:00.000Z",
    created_at: "2026-06-20T09:50:00.000Z",
    creator_id: "creator-1",
    id: "connection-default",
    metadata: {},
    platform: "youtube",
    provider_account_id: "provider-account-1",
    provider_profile: {},
    scopes: ["publish:write"],
    status: "connected",
    token_version: 1,
    updated_at: "2026-06-20T09:50:00.000Z",
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
    created_at: "2026-06-20T09:45:00.000Z",
    creator_id: "creator-1",
    display_name: "Creator Channel",
    external_channel_id: "external-channel-1",
    follower_count: 1000,
    id: "channel-default",
    platform: "youtube",
    updated_at: "2026-06-20T09:45:00.000Z",
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
    created_at: "2026-06-20T10:05:00.000Z",
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
    created_at: "2026-06-20T10:00:00.000Z",
    duration_seconds: 3600,
    external_asset_id: null,
    id: "vod-asset-default",
    ingested_at: "2026-06-20T10:00:00.000Z",
    metadata: {},
    platform: "youtube",
    source_url: "https://cdn.example.com/vods/default.mp4",
    status: "transcribed",
    stream_id: "stream-default",
    transcribed_at: null,
    updated_at: "2026-06-20T10:00:00.000Z",
    user_id: "11111111-1111-4111-8111-111111111111",
    ...overrides,
  } as PublicationVodAssetRow;
}

function makeFanout(
  overrides: Partial<PublicationFanoutRow> = {},
): PublicationFanoutRow {
  return {
    blocked_target_count: 0,
    content_job_id: "job-default",
    created_at: "2026-06-20T10:10:00.000Z",
    fanout_policy: "prepare_valid_targets",
    fanout_status: "requested",
    id: "fanout-default",
    requested_at: "2026-06-20T10:10:00.000Z",
    requested_by: "11111111-1111-4111-8111-111111111111",
    request_intent_hash:
      "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    review_status_at_request: "approved",
    snapshot: {},
    snapshot_hash:
      "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    target_count: 0,
    updated_at: "2026-06-20T10:10:00.000Z",
    user_id: "11111111-1111-4111-8111-111111111111",
    validated_at: null,
    validated_target_count: 0,
    ...overrides,
  } as PublicationFanoutRow;
}

function makeFanoutTarget(
  overrides: Partial<PublicationFanoutTargetRow> = {},
): PublicationFanoutTargetRow {
  return {
    block_message: null,
    block_reason: null,
    capability_snapshot: {},
    capability_version: "1.0.0",
    content_publication_fanout_id: "fanout-default",
    content_publication_id: null,
    created_at: "2026-06-20T10:10:00.000Z",
    id: "fanout-target-default",
    platform_connection_id: "connection-default",
    provider_overrides: {},
    request_intent_hash:
      "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    target_platform: "youtube",
    target_status: "validated",
    updated_at: "2026-06-20T10:10:00.000Z",
    user_id: "11111111-1111-4111-8111-111111111111",
    validated_at: null,
    ...overrides,
  } as PublicationFanoutTargetRow;
}

function makeApprovedBundle(
  overrides: Partial<{
    captions: string[];
    confidence: number;
    content_job_id: string;
    descriptions: string[];
    generated_at: string;
    hashtag_sets: string[][];
    hook_ideas: string[];
    manual_review_required: true;
    model: string;
    provider: string;
    queue_job_id: string;
    review_notes: string[];
    short_form_plan: string;
    title_suggestions: string[];
    warnings: string[];
  }> = {},
) {
  return {
    captions: ["Caption one"],
    confidence: 0.96,
    content_job_id: "job-default",
    descriptions: ["Description one"],
    generated_at: "2026-06-20T10:00:00.000Z",
    hashtag_sets: [["#streamos"]],
    hook_ideas: ["Hook one"],
    manual_review_required: true,
    model: "gpt-4o",
    provider: "openai",
    queue_job_id: "queue-default",
    review_notes: ["Approved."],
    short_form_plan: "Short form plan",
    title_suggestions: ["Title one"],
    warnings: [],
    ...overrides,
  };
}
