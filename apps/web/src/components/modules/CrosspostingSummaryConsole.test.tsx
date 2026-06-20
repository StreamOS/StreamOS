import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildPublicationDashboardModel,
  type PublicationChannelRow,
  type PublicationConnectionRow,
  type PublicationJobRow,
  type PublicationRow,
  type PublicationVodAssetRow,
} from "./PublicationStatusConsole.utils";
import { CrosspostingSummaryConsole } from "./CrosspostingSummaryConsole";
import {
  buildCrosspostingSummaryDashboardModel,
  type PublicationFanoutRow,
  type PublicationFanoutTargetRow,
} from "./CrosspostingSummaryConsole.utils";

describe("CrosspostingSummaryConsole", () => {
  it("derives safe parent statuses and renders child links without exposing secrets", () => {
    const publicationModel = buildPublicationDashboardModel({
      channels: [
        makeChannel({
          display_name: "Live Channel",
          id: "channel-live",
          platform: "youtube",
        }),
        makeChannel({
          display_name: "Queued Channel",
          id: "channel-queued",
          platform: "tiktok",
        }),
        makeChannel({
          display_name: "Failed Channel",
          id: "channel-failed",
          platform: "youtube",
        }),
        makeChannel({
          display_name: "Blocked Channel",
          id: "channel-blocked",
          platform: "youtube",
        }),
        makeChannel({
          display_name: "Expired Channel",
          id: "channel-expired",
          platform: "youtube",
        }),
        makeChannel({
          display_name: "Unknown Channel",
          id: "channel-unknown",
          platform: "youtube",
        }),
      ],
      connections: [
        makeConnection({
          channel_id: "channel-live",
          id: "connection-live",
          platform: "youtube",
          provider_profile: {
            display_name: "Live Creator",
          },
          scopes: ["https://www.googleapis.com/auth/youtube.upload"],
          status: "connected",
        }),
        makeConnection({
          channel_id: "channel-queued",
          id: "connection-queued",
          platform: "tiktok",
          provider_profile: {
            display_name: "Queued Creator",
          },
          scopes: ["video.publish"],
          status: "connected",
        }),
        makeConnection({
          channel_id: "channel-failed",
          id: "connection-failed",
          platform: "youtube",
          provider_profile: {
            display_name: "Failed Creator",
          },
          scopes: ["https://www.googleapis.com/auth/youtube.upload"],
          status: "connected",
        }),
        makeConnection({
          channel_id: "channel-blocked",
          id: "connection-blocked",
          platform: "youtube",
          provider_profile: {
            display_name: "Blocked Creator",
          },
          scopes: ["https://www.googleapis.com/auth/youtube.upload"],
          status: "connected",
        }),
        makeConnection({
          channel_id: "channel-expired",
          id: "connection-expired",
          platform: "youtube",
          provider_profile: {
            display_name: "Expired Creator",
          },
          scopes: ["https://www.googleapis.com/auth/youtube.upload"],
          status: "expired",
        }),
        makeConnection({
          channel_id: "channel-unknown",
          id: "connection-unknown",
          platform: "youtube",
          provider_profile: {
            display_name: "Unknown Creator",
          },
          scopes: ["https://www.googleapis.com/auth/youtube.upload"],
          status: "pending",
        }),
      ],
      contentJobs: [
        makeJob({
          id: "job-live",
          result: makeApprovedBundle({
            content_job_id: "job-live",
            queue_job_id: "queue-live",
            short_form_plan: "Live short-form plan",
            title_suggestions: ["Live title"],
          }),
          review_status: "approved",
          status: "done",
          stream_id: "stream-live",
        }),
        makeJob({
          id: "job-queued",
          result: makeApprovedBundle({
            content_job_id: "job-queued",
            queue_job_id: "queue-queued",
            short_form_plan: "Queued short-form plan",
            title_suggestions: ["Queued title"],
          }),
          review_status: "approved",
          status: "done",
          stream_id: "stream-queued",
        }),
        makeJob({
          id: "job-failed",
          result: makeApprovedBundle({
            content_job_id: "job-failed",
            queue_job_id: "queue-failed",
            short_form_plan: "Failed short-form plan",
            title_suggestions: ["Failed title"],
          }),
          review_status: "approved",
          status: "done",
          stream_id: "stream-failed",
        }),
      ],
      initialSelectedPublicationId: "publication-live",
      publicationEvents: [],
      publications: [
        makePublication({
          content_job_id: "job-live",
          desired_visibility: "public",
          effective_visibility: "public",
          external_url: "https://www.youtube.com/watch?v=live-safe",
          id: "publication-live",
          platform_connection_id: "connection-live",
          published_at: "2026-06-20T10:30:00.000Z",
          publication_status: "published",
          remote_status: "published",
          review_status_at_request: "approved",
          target_platform: "youtube",
          updated_at: "2026-06-20T10:35:00.000Z",
        }),
        makePublication({
          content_job_id: "job-queued",
          desired_visibility: "public",
          effective_visibility: "private",
          external_url: "https://www.tiktok.com/@streamos/video/queued",
          id: "publication-queued",
          platform_connection_id: "connection-queued",
          publication_status: "requested",
          remote_status: "missing",
          review_status_at_request: "approved",
          target_platform: "tiktok",
          updated_at: "2026-06-20T10:25:00.000Z",
        }),
        makePublication({
          content_job_id: "job-failed",
          desired_visibility: "public",
          effective_visibility: "private",
          external_url: "https://user:pass@example.com/private",
          id: "publication-failed",
          platform_connection_id: "connection-failed",
          provider_failure_code: "provider_rate_limited",
          provider_failure_reason: "Retry after rate limit",
          publication_status: "failed_retryable",
          remote_status: "missing",
          review_status_at_request: "approved",
          target_platform: "youtube",
          updated_at: "2026-06-20T10:20:00.000Z",
        }),
      ],
      vodAssets: [
        makeVodAsset({
          source_url: "https://cdn.example.com/vods/live.mp4",
          stream_id: "stream-live",
        }),
        makeVodAsset({
          source_url: "https://cdn.example.com/vods/queued.mp4",
          stream_id: "stream-queued",
        }),
        makeVodAsset({
          source_url: "https://cdn.example.com/vods/failed.mp4",
          stream_id: "stream-failed",
        }),
      ],
    });

    const model = buildCrosspostingSummaryDashboardModel({
      channels:
        publicationModel.items.length > 0
          ? [
              makeChannel({
                display_name: "Live Channel",
                id: "channel-live",
                platform: "youtube",
              }),
              makeChannel({
                display_name: "Queued Channel",
                id: "channel-queued",
                platform: "tiktok",
              }),
              makeChannel({
                display_name: "Failed Channel",
                id: "channel-failed",
                platform: "youtube",
              }),
              makeChannel({
                display_name: "Blocked Channel",
                id: "channel-blocked",
                platform: "youtube",
              }),
              makeChannel({
                display_name: "Expired Channel",
                id: "channel-expired",
                platform: "youtube",
              }),
              makeChannel({
                display_name: "Unknown Channel",
                id: "channel-unknown",
                platform: "youtube",
              }),
            ]
          : [],
      connections: [
        makeConnection({
          channel_id: "channel-live",
          id: "connection-live",
          platform: "youtube",
          provider_profile: {
            display_name: "Live Creator",
          },
          scopes: ["https://www.googleapis.com/auth/youtube.upload"],
          status: "connected",
        }),
        makeConnection({
          channel_id: "channel-queued",
          id: "connection-queued",
          platform: "tiktok",
          provider_profile: {
            display_name: "Queued Creator",
          },
          scopes: ["video.publish"],
          status: "connected",
        }),
        makeConnection({
          channel_id: "channel-failed",
          id: "connection-failed",
          platform: "youtube",
          provider_profile: {
            display_name: "Failed Creator",
          },
          scopes: ["https://www.googleapis.com/auth/youtube.upload"],
          status: "connected",
        }),
        makeConnection({
          channel_id: "channel-blocked",
          id: "connection-blocked",
          platform: "youtube",
          provider_profile: {
            display_name: "Blocked Creator",
          },
          scopes: ["https://www.googleapis.com/auth/youtube.upload"],
          status: "connected",
        }),
        makeConnection({
          channel_id: "channel-expired",
          id: "connection-expired",
          platform: "youtube",
          provider_profile: {
            display_name: "Expired Creator",
          },
          scopes: ["https://www.googleapis.com/auth/youtube.upload"],
          status: "expired",
        }),
        makeConnection({
          channel_id: "channel-unknown",
          id: "connection-unknown",
          platform: "youtube",
          provider_profile: {
            display_name: "Unknown Creator",
          },
          scopes: ["https://www.googleapis.com/auth/youtube.upload"],
          status: "pending",
        }),
      ],
      fanoutTargets: [
        makeFanoutTarget({
          content_publication_fanout_id: "fanout-published",
          content_publication_id: "publication-live",
          id: "fanout-target-published",
          platform_connection_id: "connection-live",
          request_intent_hash: "intent-published",
          target_platform: "youtube",
          target_status: "validated",
        }),
        makeFanoutTarget({
          content_publication_fanout_id: "fanout-partially-published",
          content_publication_id: "publication-live",
          id: "fanout-target-live-repeat",
          platform_connection_id: "connection-live",
          request_intent_hash: "intent-partially-published-live",
          target_platform: "youtube",
          target_status: "validated",
        }),
        makeFanoutTarget({
          content_publication_fanout_id: "fanout-partially-published",
          content_publication_id: "publication-queued",
          id: "fanout-target-queued",
          platform_connection_id: "connection-queued",
          request_intent_hash: "intent-partially-published-queued",
          target_platform: "tiktok",
          target_status: "validated",
        }),
        makeFanoutTarget({
          block_message: "Missing publish scopes",
          block_reason: "missing_publish_scopes",
          content_publication_fanout_id: "fanout-partially-failed",
          content_publication_id: "publication-live",
          id: "fanout-target-failed-live",
          platform_connection_id: "connection-live",
          request_intent_hash: "intent-partially-failed-live",
          target_platform: "youtube",
          target_status: "validated",
        }),
        makeFanoutTarget({
          content_publication_fanout_id: "fanout-partially-failed",
          content_publication_id: "publication-failed",
          id: "fanout-target-failed",
          platform_connection_id: "connection-failed",
          request_intent_hash: "intent-partially-failed",
          target_platform: "youtube",
          target_status: "validated",
        }),
        makeFanoutTarget({
          content_publication_fanout_id: "fanout-partially-blocked",
          content_publication_id: "publication-live",
          id: "fanout-target-blocked-live",
          platform_connection_id: "connection-live",
          request_intent_hash: "intent-partially-blocked-live",
          target_platform: "youtube",
          target_status: "validated",
        }),
        makeFanoutTarget({
          block_message: "Missing publish scopes",
          block_reason: "missing_publish_scopes",
          content_publication_fanout_id: "fanout-partially-blocked",
          content_publication_id: null,
          id: "fanout-target-blocked",
          platform_connection_id: "connection-blocked",
          request_intent_hash: "intent-partially-blocked",
          target_platform: "youtube",
          target_status: "blocked",
        }),
        makeFanoutTarget({
          content_publication_fanout_id: "fanout-requires-action",
          content_publication_id: null,
          id: "fanout-target-requires-action",
          platform_connection_id: "connection-expired",
          request_intent_hash: "intent-requires-action",
          target_platform: "youtube",
          target_status: "validated",
        }),
        makeFanoutTarget({
          content_publication_fanout_id: "fanout-unknown",
          content_publication_id: null,
          id: "fanout-target-unknown",
          platform_connection_id: "connection-unknown",
          request_intent_hash: "intent-unknown",
          target_platform: "youtube",
          target_status: "validated",
        }),
      ],
      fanouts: [
        makeFanout({
          content_job_id: "job-live",
          fanout_policy: "prepare_valid_targets",
          fanout_status: "validated",
          id: "fanout-published",
          request_intent_hash: "fanout-intent-published",
          review_status_at_request: "approved",
          snapshot: {
            approvedBundle: makeApprovedBundle({
              content_job_id: "job-live",
              queue_job_id: "queue-live",
              short_form_plan: "Live short-form plan",
              title_suggestions: ["Live title"],
            }),
            contentJob: { streamId: "stream-live" },
          },
          snapshot_hash:
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          target_count: 1,
          validated_target_count: 1,
          blocked_target_count: 0,
          updated_at: "2026-06-20T10:40:00.000Z",
        }),
        makeFanout({
          content_job_id: "job-live",
          fanout_policy: "prepare_valid_targets",
          fanout_status: "validated",
          id: "fanout-partially-published",
          request_intent_hash: "fanout-intent-partially-published",
          review_status_at_request: "approved",
          snapshot: {
            approvedBundle: makeApprovedBundle({
              content_job_id: "job-live",
              queue_job_id: "queue-live",
              short_form_plan: "Live short-form plan",
              title_suggestions: ["Live title"],
            }),
            contentJob: { streamId: "stream-live" },
          },
          snapshot_hash:
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          target_count: 2,
          validated_target_count: 2,
          blocked_target_count: 0,
          updated_at: "2026-06-20T10:39:00.000Z",
        }),
        makeFanout({
          content_job_id: "job-failed",
          fanout_policy: "prepare_valid_targets",
          fanout_status: "validated",
          id: "fanout-partially-failed",
          request_intent_hash: "fanout-intent-partially-failed",
          review_status_at_request: "approved",
          snapshot: {
            approvedBundle: makeApprovedBundle({
              content_job_id: "job-failed",
              queue_job_id: "queue-failed",
              short_form_plan: "Failed short-form plan",
              title_suggestions: ["Failed title"],
            }),
            contentJob: { streamId: "stream-failed" },
          },
          snapshot_hash:
            "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
          target_count: 2,
          validated_target_count: 1,
          blocked_target_count: 0,
          updated_at: "2026-06-20T10:38:00.000Z",
        }),
        makeFanout({
          content_job_id: "job-live",
          fanout_policy: "all_or_nothing_preflight",
          fanout_status: "partially_validated",
          id: "fanout-partially-blocked",
          request_intent_hash: "fanout-intent-partially-blocked",
          review_status_at_request: "approved",
          snapshot: {
            approvedBundle: makeApprovedBundle({
              content_job_id: "job-live",
              queue_job_id: "queue-live",
              short_form_plan: "Live short-form plan",
              title_suggestions: ["Live title"],
            }),
            contentJob: { streamId: "stream-live" },
          },
          snapshot_hash:
            "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
          target_count: 2,
          validated_target_count: 1,
          blocked_target_count: 1,
          updated_at: "2026-06-20T10:37:00.000Z",
        }),
        makeFanout({
          content_job_id: "job-unknown",
          fanout_policy: "prepare_valid_targets",
          fanout_status: "requested",
          id: "fanout-requires-action",
          request_intent_hash: "fanout-intent-requires-action",
          review_status_at_request: "approved",
          snapshot: {
            approvedBundle: makeApprovedBundle({
              content_job_id: "job-queued",
              queue_job_id: "queue-queued",
              short_form_plan: "Queued short-form plan",
              title_suggestions: ["Queued title"],
            }),
            contentJob: { streamId: "stream-queued" },
          },
          snapshot_hash:
            "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
          target_count: 1,
          validated_target_count: 1,
          blocked_target_count: 0,
          updated_at: "2026-06-20T10:36:00.000Z",
        }),
        makeFanout({
          content_job_id: "job-unknown",
          fanout_policy: "prepare_valid_targets",
          fanout_status:
            "mystery" as unknown as PublicationFanoutRow["fanout_status"],
          id: "fanout-unknown",
          request_intent_hash: "fanout-intent-unknown",
          review_status_at_request: "approved",
          snapshot: {
            approvedBundle: makeApprovedBundle({
              content_job_id: "job-live",
              queue_job_id: "queue-live",
              short_form_plan: "Live short-form plan",
              title_suggestions: ["Live title"],
            }),
            contentJob: { streamId: "stream-live" },
          },
          snapshot_hash:
            "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
          target_count: 1,
          validated_target_count: 1,
          blocked_target_count: 0,
          updated_at: "2026-06-20T10:35:00.000Z",
        }),
      ],
      initialSelectedFanoutId: "fanout-partially-blocked",
      publications: publicationModel.items,
    });

    const html = renderToStaticMarkup(
      <CrosspostingSummaryConsole
        model={buildCrosspostingSummaryDashboardModel({
          channels: [
            makeChannel({
              display_name: "Live Channel",
              id: "channel-live",
              platform: "youtube",
            }),
            makeChannel({
              display_name: "Queued Channel",
              id: "channel-queued",
              platform: "tiktok",
            }),
            makeChannel({
              display_name: "Failed Channel",
              id: "channel-failed",
              platform: "youtube",
            }),
            makeChannel({
              display_name: "Blocked Channel",
              id: "channel-blocked",
              platform: "youtube",
            }),
            makeChannel({
              display_name: "Expired Channel",
              id: "channel-expired",
              platform: "youtube",
            }),
            makeChannel({
              display_name: "Unknown Channel",
              id: "channel-unknown",
              platform: "youtube",
            }),
          ],
          connections: [
            makeConnection({
              channel_id: "channel-live",
              id: "connection-live",
              platform: "youtube",
              provider_profile: {
                display_name: "Live Creator",
              },
              scopes: ["https://www.googleapis.com/auth/youtube.upload"],
              status: "connected",
            }),
            makeConnection({
              channel_id: "channel-queued",
              id: "connection-queued",
              platform: "tiktok",
              provider_profile: {
                display_name: "Queued Creator",
              },
              scopes: ["video.publish"],
              status: "connected",
            }),
            makeConnection({
              channel_id: "channel-failed",
              id: "connection-failed",
              platform: "youtube",
              provider_profile: {
                display_name: "Failed Creator",
              },
              scopes: ["https://www.googleapis.com/auth/youtube.upload"],
              status: "connected",
            }),
            makeConnection({
              channel_id: "channel-blocked",
              id: "connection-blocked",
              platform: "youtube",
              provider_profile: {
                display_name: "Blocked Creator",
              },
              scopes: ["https://www.googleapis.com/auth/youtube.upload"],
              status: "connected",
            }),
            makeConnection({
              channel_id: "channel-expired",
              id: "connection-expired",
              platform: "youtube",
              provider_profile: {
                display_name: "Expired Creator",
              },
              scopes: ["https://www.googleapis.com/auth/youtube.upload"],
              status: "expired",
            }),
            makeConnection({
              channel_id: "channel-unknown",
              id: "connection-unknown",
              platform: "youtube",
              provider_profile: {
                display_name: "Unknown Creator",
              },
              scopes: ["https://www.googleapis.com/auth/youtube.upload"],
              status: "pending",
            }),
          ],
          fanoutTargets: [
            makeFanoutTarget({
              content_publication_fanout_id: "fanout-published",
              content_publication_id: "publication-live",
              id: "fanout-target-published",
              platform_connection_id: "connection-live",
              request_intent_hash: "intent-published",
              target_platform: "youtube",
              target_status: "validated",
            }),
            makeFanoutTarget({
              content_publication_fanout_id: "fanout-partially-published",
              content_publication_id: "publication-live",
              id: "fanout-target-live-repeat",
              platform_connection_id: "connection-live",
              request_intent_hash: "intent-partially-published-live",
              target_platform: "youtube",
              target_status: "validated",
            }),
            makeFanoutTarget({
              content_publication_fanout_id: "fanout-partially-published",
              content_publication_id: "publication-queued",
              id: "fanout-target-queued",
              platform_connection_id: "connection-queued",
              request_intent_hash: "intent-partially-published-queued",
              target_platform: "tiktok",
              target_status: "validated",
            }),
            makeFanoutTarget({
              block_message: "Missing publish scopes",
              block_reason: "missing_publish_scopes",
              content_publication_fanout_id: "fanout-partially-failed",
              content_publication_id: "publication-live",
              id: "fanout-target-failed-live",
              platform_connection_id: "connection-live",
              request_intent_hash: "intent-partially-failed-live",
              target_platform: "youtube",
              target_status: "validated",
            }),
            makeFanoutTarget({
              content_publication_fanout_id: "fanout-partially-failed",
              content_publication_id: "publication-failed",
              id: "fanout-target-failed",
              platform_connection_id: "connection-failed",
              request_intent_hash: "intent-partially-failed",
              target_platform: "youtube",
              target_status: "validated",
            }),
            makeFanoutTarget({
              content_publication_fanout_id: "fanout-partially-blocked",
              content_publication_id: "publication-live",
              id: "fanout-target-blocked-live",
              platform_connection_id: "connection-live",
              request_intent_hash: "intent-partially-blocked-live",
              target_platform: "youtube",
              target_status: "validated",
            }),
            makeFanoutTarget({
              block_message: "Missing publish scopes",
              block_reason: "missing_publish_scopes",
              content_publication_fanout_id: "fanout-partially-blocked",
              content_publication_id: null,
              id: "fanout-target-blocked",
              platform_connection_id: "connection-blocked",
              request_intent_hash: "intent-partially-blocked",
              target_platform: "youtube",
              target_status: "blocked",
            }),
            makeFanoutTarget({
              content_publication_fanout_id: "fanout-requires-action",
              content_publication_id: null,
              id: "fanout-target-requires-action",
              platform_connection_id: "connection-expired",
              request_intent_hash: "intent-requires-action",
              target_platform: "youtube",
              target_status: "validated",
            }),
            makeFanoutTarget({
              content_publication_fanout_id: "fanout-unknown",
              content_publication_id: null,
              id: "fanout-target-unknown",
              platform_connection_id: "connection-unknown",
              request_intent_hash: "intent-unknown",
              target_platform: "youtube",
              target_status: "validated",
            }),
          ],
          fanouts: [
            makeFanout({
              content_job_id: "job-live",
              fanout_policy: "prepare_valid_targets",
              fanout_status: "validated",
              id: "fanout-published",
              request_intent_hash: "fanout-intent-published",
              review_status_at_request: "approved",
              snapshot: {
                approvedBundle: makeApprovedBundle({
                  content_job_id: "job-live",
                  queue_job_id: "queue-live",
                  short_form_plan: "Live short-form plan",
                  title_suggestions: ["Live title"],
                }),
                contentJob: {
                  reviewStatus: "needs_review",
                  status: "running",
                  streamId: "stream-live",
                },
              },
              snapshot_hash:
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              target_count: 1,
              validated_target_count: 1,
              blocked_target_count: 0,
              updated_at: "2026-06-20T10:40:00.000Z",
            }),
            makeFanout({
              content_job_id: "job-live",
              fanout_policy: "prepare_valid_targets",
              fanout_status: "validated",
              id: "fanout-partially-published",
              request_intent_hash: "fanout-intent-partially-published",
              review_status_at_request: "approved",
              snapshot: {
                approvedBundle: makeApprovedBundle({
                  content_job_id: "job-live",
                  queue_job_id: "queue-live",
                  short_form_plan: "Live short-form plan",
                  title_suggestions: ["Live title"],
                }),
                contentJob: { streamId: "stream-live" },
              },
              snapshot_hash:
                "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
              target_count: 2,
              validated_target_count: 2,
              blocked_target_count: 0,
              updated_at: "2026-06-20T10:39:00.000Z",
            }),
            makeFanout({
              content_job_id: "job-failed",
              fanout_policy: "prepare_valid_targets",
              fanout_status: "validated",
              id: "fanout-partially-failed",
              request_intent_hash: "fanout-intent-partially-failed",
              review_status_at_request: "approved",
              snapshot: {
                approvedBundle: makeApprovedBundle({
                  content_job_id: "job-failed",
                  queue_job_id: "queue-failed",
                  short_form_plan: "Failed short-form plan",
                  title_suggestions: ["Failed title"],
                }),
                contentJob: { streamId: "stream-failed" },
              },
              snapshot_hash:
                "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
              target_count: 2,
              validated_target_count: 1,
              blocked_target_count: 0,
              updated_at: "2026-06-20T10:38:00.000Z",
            }),
            makeFanout({
              content_job_id: "job-live",
              fanout_policy: "all_or_nothing_preflight",
              fanout_status: "partially_validated",
              id: "fanout-partially-blocked",
              request_intent_hash: "fanout-intent-partially-blocked",
              review_status_at_request: "approved",
              snapshot: {
                approvedBundle: makeApprovedBundle({
                  content_job_id: "job-live",
                  queue_job_id: "queue-live",
                  short_form_plan: "Live short-form plan",
                  title_suggestions: ["Live title"],
                }),
                contentJob: { streamId: "stream-live" },
              },
              snapshot_hash:
                "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
              target_count: 2,
              validated_target_count: 1,
              blocked_target_count: 1,
              updated_at: "2026-06-20T10:37:00.000Z",
            }),
            makeFanout({
              content_job_id: "job-unknown",
              fanout_policy: "prepare_valid_targets",
              fanout_status: "requested",
              id: "fanout-requires-action",
              request_intent_hash: "fanout-intent-requires-action",
              review_status_at_request: "approved",
              snapshot: {
                approvedBundle: makeApprovedBundle({
                  content_job_id: "job-queued",
                  queue_job_id: "queue-queued",
                  short_form_plan: "Queued short-form plan",
                  title_suggestions: ["Queued title"],
                }),
                contentJob: { streamId: "stream-queued" },
              },
              snapshot_hash:
                "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
              target_count: 1,
              validated_target_count: 1,
              blocked_target_count: 0,
              updated_at: "2026-06-20T10:36:00.000Z",
            }),
            makeFanout({
              content_job_id: "job-unknown",
              fanout_policy: "prepare_valid_targets",
              fanout_status:
                "mystery" as unknown as PublicationFanoutRow["fanout_status"],
              id: "fanout-unknown",
              request_intent_hash: "fanout-intent-unknown",
              review_status_at_request: "approved",
              snapshot: {
                approvedBundle: makeApprovedBundle({
                  content_job_id: "job-live",
                  queue_job_id: "queue-live",
                  short_form_plan: "Live short-form plan",
                  title_suggestions: ["Live title"],
                }),
                contentJob: { streamId: "stream-live" },
              },
              snapshot_hash:
                "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
              target_count: 1,
              validated_target_count: 1,
              blocked_target_count: 0,
              updated_at: "2026-06-20T10:35:00.000Z",
            }),
          ],
          initialSelectedFanoutId: "fanout-partially-blocked",
          publications: publicationModel.items,
        })}
      />,
    );

    const statuses = new Map(
      publicationModel.items.map((publication) => [
        publication.id,
        publication.deliveryStatus,
      ]),
    );

    expect(model.summary.fanoutCount).toBe(6);
    expect(model.summary.targetCount).toBe(9);
    expect(model.summary.publishedCount).toBe(4);
    expect(model.summary.failedCount).toBe(1);
    expect(model.summary.blockedCount).toBe(1);
    expect(model.summary.requiresActionCount).toBe(3);
    expect(
      model.items.find((item) => item.id === "fanout-published")?.status,
    ).toBe("published");
    expect(
      model.items.find((item) => item.id === "fanout-partially-published")
        ?.status,
    ).toBe("partially_published");
    expect(
      model.items.find((item) => item.id === "fanout-partially-failed")?.status,
    ).toBe("partially_failed");
    expect(
      model.items.find((item) => item.id === "fanout-partially-blocked")
        ?.status,
    ).toBe("partially_blocked");
    expect(
      model.items.find((item) => item.id === "fanout-requires-action")?.status,
    ).toBe("requires_action");
    expect(
      model.items.find((item) => item.id === "fanout-unknown")?.status,
    ).toBe("unknown_fallback");
    expect(model.selectedFanoutId).toBe("fanout-partially-blocked");
    expect(statuses.get("publication-live")).toBe("published");
    expect(html).toContain(
      "Crossposting summary for approved repurposing jobs",
    );
    expect(html).toContain("Parent fanouts");
    expect(html).toContain("Selected parent fanout");
    expect(html).toContain("Target publications");
    expect(html).toContain("Historie ansehen");
    expect(html).toContain("Open remote post");
    expect(html).toContain("Fanout controls");
    expect(html).toContain("Status aktualisieren");
    expect(html).toContain("Erneut prüfen");
    expect(html).toContain("No child publication exists for this target yet");
    expect(html).toContain("disabled");
    expect(html).toContain("Requested visibility");
    expect(html).toContain("Effective visibility");
    expect(html).toContain("Re-auth required");
    expect(html).toContain("Manual intervention");
    expect(html).toContain("No child history yet");
    expect(html).toContain("Policy");
    expect(html).toContain("All Or Nothing Preflight");
    expect(html).toContain(
      "Browser-Code startet keine Provider-Write- oder Automation-Calls.",
    );
    expect(html).not.toContain("Raw / Debug");
    expect(html).not.toContain("api_gateway_secret");
    expect(html).not.toContain("refresh_token");
    expect(html).not.toContain("access_token");
    expect(html).not.toContain("user:pass@example.com");
    expect(html).not.toContain("automation-service.railway.internal");
    expect(html).not.toContain("OpenAI");
  });

  it("renders a retry action for a retryable child publication without exposing unsafe data", () => {
    const publicationModel = buildPublicationDashboardModel({
      channels: [
        makeChannel({
          display_name: "Retry Channel",
          id: "channel-retry",
          platform: "youtube",
        }),
      ],
      connections: [
        makeConnection({
          channel_id: "channel-retry",
          id: "connection-retry",
          platform: "youtube",
          provider_profile: {
            display_name: "Retry Creator",
          },
          scopes: ["https://www.googleapis.com/auth/youtube.upload"],
          status: "connected",
        }),
      ],
      contentJobs: [
        makeJob({
          id: "job-retryable",
          result: makeApprovedBundle({
            content_job_id: "job-retryable",
            queue_job_id: "queue-retryable",
            short_form_plan: "Retry short-form plan",
            title_suggestions: ["Retry title"],
          }),
          review_status: "approved",
          status: "done",
          stream_id: "stream-retryable",
        }),
      ],
      publicationEvents: [],
      publications: [
        makePublication({
          content_job_id: "job-retryable",
          desired_visibility: "public",
          effective_visibility: "public",
          external_url: "https://www.youtube.com/watch?v=retry-safe",
          id: "publication-retryable",
          platform_connection_id: "connection-retry",
          publication_status: "failed_retryable",
          remote_status: "missing",
          review_status_at_request: "approved",
          target_platform: "youtube",
          updated_at: "2026-06-20T11:25:00.000Z",
        }),
      ],
      vodAssets: [
        makeVodAsset({
          source_url: "https://cdn.example.com/vods/retry.mp4",
          stream_id: "stream-retryable",
        }),
      ],
    });

    const model = buildCrosspostingSummaryDashboardModel({
      channels: [
        makeChannel({
          display_name: "Retry Channel",
          id: "channel-retry",
          platform: "youtube",
        }),
      ],
      connections: [
        makeConnection({
          channel_id: "channel-retry",
          id: "connection-retry",
          platform: "youtube",
          provider_profile: {
            display_name: "Retry Creator",
          },
          scopes: ["https://www.googleapis.com/auth/youtube.upload"],
          status: "connected",
        }),
      ],
      fanoutTargets: [
        makeFanoutTarget({
          content_publication_fanout_id: "fanout-retry",
          content_publication_id: "publication-retryable",
          id: "fanout-target-retry",
          platform_connection_id: "connection-retry",
          request_intent_hash: "intent-retry",
          target_platform: "youtube",
          target_status: "validated",
        }),
      ],
      fanouts: [
        makeFanout({
          blocked_target_count: 0,
          content_job_id: "job-retryable",
          fanout_policy: "prepare_valid_targets",
          fanout_status: "validated",
          id: "fanout-retry",
          request_intent_hash: "fanout-intent-retry",
          review_status_at_request: "approved",
          snapshot: {
            approvedBundle: makeApprovedBundle({
              content_job_id: "job-retryable",
              queue_job_id: "queue-retryable",
              short_form_plan: "Retry short-form plan",
              title_suggestions: ["Retry title"],
            }),
            contentJob: {
              id: "job-retryable",
              queueJobId: "queue-retryable",
              reviewStatus: "approved",
              status: "done",
              streamId: "stream-retryable",
            },
          },
          snapshot_hash:
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          target_count: 1,
          validated_target_count: 1,
          updated_at: "2026-06-20T11:20:00.000Z",
        }),
      ],
      initialSelectedFanoutId: "fanout-retry",
      publications: publicationModel.items,
    });

    const html = renderToStaticMarkup(
      <CrosspostingSummaryConsole model={model} />,
    );

    expect(html).toContain("Erneut versuchen");
    expect(html).toContain("Retries exactly this child publication");
    expect(html).toContain("Status aktualisieren");
    expect(html).not.toContain("Raw / Debug");
    expect(html).not.toContain("access_token");
    expect(html).not.toContain("automation-service.railway.internal");
  });

  it("renders a clear empty state when no fanouts exist", () => {
    const model = buildCrosspostingSummaryDashboardModel({
      channels: [],
      connections: [],
      fanoutTargets: [],
      fanouts: [],
      publications: [],
    });

    const html = renderToStaticMarkup(
      <CrosspostingSummaryConsole model={model} />,
    );

    expect(model.summary.fanoutCount).toBe(0);
    expect(html).toContain("No crossposting fanouts yet");
    expect(html).toContain("Approved parent fanouts will appear here");
    expect(html).toContain("No provider writes happen in the browser.");
    expect(html).toContain("Back to publications");
    expect(html).toContain("Review jobs");
  });
});

function makePublication(
  overrides: Partial<PublicationRow> = {},
): PublicationRow {
  return {
    capability_snapshot: {},
    capability_version: "1.0.0",
    content_job_id: "job-default",
    created_at: "2026-06-20T09:50:00.000Z",
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
    requested_at: "2026-06-20T09:50:00.000Z",
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
    updated_at: "2026-06-20T09:50:00.000Z",
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
    created_at: "2026-06-20T09:45:00.000Z",
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
    updated_at: "2026-06-20T09:45:00.000Z",
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
    connected_at: "2026-06-20T09:40:00.000Z",
    created_at: "2026-06-20T09:40:00.000Z",
    creator_id: "creator-1",
    id: "connection-default",
    metadata: {},
    platform: "youtube",
    provider_account_id: "provider-account-1",
    provider_profile: {},
    scopes: ["publish:write"],
    status: "connected",
    token_version: 1,
    updated_at: "2026-06-20T09:40:00.000Z",
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
    created_at: "2026-06-20T09:35:00.000Z",
    creator_id: "creator-1",
    display_name: "Creator Channel",
    external_channel_id: "external-channel-1",
    follower_count: 1000,
    id: "channel-default",
    platform: "youtube",
    updated_at: "2026-06-20T09:35:00.000Z",
    user_id: "11111111-1111-4111-8111-111111111111",
    ...overrides,
  } as PublicationChannelRow;
}

function makeFanout(
  overrides: Partial<PublicationFanoutRow> = {},
): PublicationFanoutRow {
  return {
    blocked_target_count: 0,
    content_job_id: "job-default",
    created_at: "2026-06-20T10:00:00.000Z",
    fanout_policy: "prepare_valid_targets",
    fanout_status: "requested",
    id: "fanout-default",
    requested_at: "2026-06-20T10:00:00.000Z",
    requested_by: "11111111-1111-4111-8111-111111111111",
    request_intent_hash:
      "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    review_status_at_request: "approved",
    snapshot: {},
    snapshot_hash:
      "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    target_count: 0,
    updated_at: "2026-06-20T10:00:00.000Z",
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
    created_at: "2026-06-20T10:00:00.000Z",
    id: "fanout-target-default",
    platform_connection_id: "connection-default",
    provider_overrides: {},
    request_intent_hash:
      "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    target_platform: "youtube",
    target_status: "validated",
    updated_at: "2026-06-20T10:00:00.000Z",
    user_id: "11111111-1111-4111-8111-111111111111",
    validated_at: null,
    ...overrides,
  } as PublicationFanoutTargetRow;
}

function makeVodAsset(
  overrides: Partial<PublicationVodAssetRow> = {},
): PublicationVodAssetRow {
  return {
    created_at: "2026-06-20T09:55:00.000Z",
    duration_seconds: 3600,
    external_asset_id: null,
    id: "vod-asset-default",
    ingested_at: "2026-06-20T09:55:00.000Z",
    metadata: {},
    platform: "youtube",
    source_url: "https://cdn.example.com/vods/default.mp4",
    status: "transcribed",
    stream_id: "stream-default",
    transcribed_at: null,
    updated_at: "2026-06-20T09:55:00.000Z",
    user_id: "11111111-1111-4111-8111-111111111111",
    ...overrides,
  } as PublicationVodAssetRow;
}

function makeApprovedBundle(
  overrides: Partial<{
    captions: string[];
    confidence: number;
    content_job_id: string;
    descriptions: string[];
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
