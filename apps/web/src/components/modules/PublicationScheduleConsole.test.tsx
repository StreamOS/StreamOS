import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/dashboard/publications/schedule/actions", () => ({
  mutatePublicationScheduleAction: vi.fn(),
}));

import {
  buildPublicationScheduleDashboardModel,
  formatPublicationScheduleTimezone,
  getPublicationScheduleBlockReasonLabel,
  getPublicationScheduleFilterLabel,
  getPublicationScheduleStatusDescription,
  getPublicationScheduleStatusLabel,
  getPublicationScheduleStatusToneLabel,
  type PublicationChannelRow,
  type PublicationConnectionRow,
  type PublicationFanoutRow,
  type PublicationFanoutTargetRow,
  type PublicationJobRow,
  type PublicationRow,
} from "./PublicationScheduleConsole.utils";
import { PublicationScheduleConsole } from "./PublicationScheduleConsole";

describe("PublicationScheduleConsole", () => {
  it("renders grouped schedule entries, safe fallbacks, and read-only history links", () => {
    const model = buildPublicationScheduleDashboardModel({
      channels: [
        makeChannel({
          display_name: "Creator Channel",
          id: "channel-youtube",
          platform: "youtube",
        }),
      ],
      connections: [
        makeConnection({
          channel_id: "channel-youtube",
          id: "connection-youtube",
          platform: "youtube",
          provider_profile: {
            display_name: "Creator Channel",
          },
          status: "expired",
        }),
        makeConnection({
          id: "connection-twitch",
          platform: "twitch",
          provider_profile: {
            display_name: "Twitch Main",
          },
          status: "connected",
        }),
      ],
      contentJobs: [
        makeJob({
          id: "job-publication",
          result: {
            captions: ["Caption one"],
            confidence: 0.95,
            content_job_id: "job-publication",
            descriptions: ["Description one"],
            hashtag_sets: [["#streamos"]],
            hook_ideas: ["Hook one"],
            manual_review_required: true,
            model: "gpt-4o",
            provider: "openai",
            queue_job_id: "repurposing-plan-publication",
            review_notes: ["Approved."],
            short_form_plan: "Short-form plan",
            title_suggestions: ["Morning Highlights"],
            warnings: ["Watch the hook wording."],
          },
          review_status: "approved",
          status: "done",
          stream_id: "stream-publication",
        }),
        makeJob({
          id: "job-fanout",
          result: {
            captions: ["Caption two"],
            confidence: 0.88,
            content_job_id: "job-fanout",
            descriptions: ["Description two"],
            hashtag_sets: [["#fanout"]],
            hook_ideas: ["Hook two"],
            manual_review_required: false,
            model: "gpt-4o",
            provider: "openai",
            queue_job_id: "repurposing-plan-fanout",
            review_notes: ["Approved."],
            short_form_plan: "Fanout short form plan",
            title_suggestions: ["Fanout Title"],
            warnings: [],
          },
          review_status: "approved",
          status: "done",
          stream_id: "stream-fanout",
        }),
      ],
      fanoutTargets: [
        makeFanoutTarget({
          content_publication_fanout_id: "fanout-1",
          id: "fanout-target-1",
          platform_connection_id: "connection-twitch",
          target_platform: "twitch",
          target_status: "validated",
        }),
        makeFanoutTarget({
          content_publication_fanout_id: "fanout-1",
          id: "fanout-target-2",
          platform_connection_id: "connection-youtube",
          target_platform: "youtube",
          target_status: "blocked",
        }),
      ],
      fanouts: [
        makeFanout({
          blocked_target_count: 1,
          content_job_id: "job-fanout",
          fanout_status: "partially_validated",
          id: "fanout-1",
          scheduled_at_utc: "2026-06-22T18:30:00.000Z",
          scheduled_timezone: "Mars/Phobos",
          schedule_block_reason: "missing_publish_scopes",
          schedule_status: "schedule_blocked",
          target_count: 2,
          review_status_at_request: "approved",
          snapshot: {
            approvedBundle: {
              content_job_id: "job-fanout",
              manual_review_required: false,
              provider: "openai",
              queue_job_id: "repurposing-plan-fanout",
              short_form_plan: "Fanout short form plan",
              title_suggestions: ["Fanout Title"],
              warnings: [],
              captions: ["Caption two"],
              confidence: 0.88,
              descriptions: ["Description two"],
              hashtag_sets: [["#fanout"]],
              hook_ideas: ["Hook two"],
              model: "gpt-4o",
              review_notes: ["Approved."],
            },
          },
        }),
      ],
      initialFilters: {
        period: "upcoming",
        provider: "all",
        status: "all",
        type: "all",
      },
      initialSelectedItemId: "publication-1",
      publications: [
        makePublication({
          content_job_id: "job-publication",
          id: "publication-1",
          platform_connection_id: "connection-youtube",
          publication_status: "requested",
          review_status_at_request: "approved",
          schedule_source: "dashboard",
          scheduled_at_utc: "2026-06-21T18:30:00.000Z",
          scheduled_timezone: "Europe/Berlin",
          schedule_status: "scheduled",
          target_platform: "youtube",
        }),
      ],
    });

    expect(model.summary.sourceCount).toBe(2);
    expect(model.summary.totalCount).toBe(2);
    expect(model.summary.publicationCount).toBe(1);
    expect(model.summary.fanoutCount).toBe(1);
    expect(model.summary.readyCount).toBe(0);
    expect(model.summary.blockedCount).toBe(1);
    expect(model.summary.reauthRequiredCount).toBe(2);
    expect(model.summary.attentionCount).toBe(2);
    expect(model.selectedItemId).toBe("publication-1");
    expect(model.selectedItem?.safeSourceLabel).toBe("Morning Highlights");
    const publicationItem = model.items.find(
      (item) => item.id === "publication-1",
    );
    const fanoutItem = model.items.find((item) => item.id === "fanout-1");

    expect(publicationItem).toBeDefined();
    expect(fanoutItem).toBeDefined();
    expect(publicationItem!.safeSourceLabel).toBe("Morning Highlights");
    expect(fanoutItem!.safeSourceLabel).toBe("Approved parent fanout");
    expect(fanoutItem!.scheduledTimezone).toBe("UTC (Fallback)");
    expect(
      fanoutItem!.scheduleActionPolicy.actions.replace_schedule.allowed,
    ).toBe(false);
    expect(publicationItem!.targetPlatformSummary).toContain("YouTube");
    expect(fanoutItem!.fanoutTargetProviderSummary).toBe("Twitch · YouTube");
    expect(getPublicationScheduleFilterLabel("recent_7d")).toBe(
      "Letzte 7 Tage",
    );
    expect(getPublicationScheduleStatusLabel("schedule_ready")).toBe(
      "Bereit für spätere Ausführung",
    );
    expect(getPublicationScheduleStatusToneLabel("schedule_blocked")).toBe(
      "amber",
    );
    expect(getPublicationScheduleStatusDescription("schedule_ready")).toContain(
      "serverseitig",
    );
    expect(
      getPublicationScheduleBlockReasonLabel("missing_publish_scopes"),
    ).toBe("Publish-Scopes fehlen");
    expect(formatPublicationScheduleTimezone("Mars/Phobos")).toBe(
      "UTC (Fallback)",
    );

    const html = renderToStaticMarkup(
      <PublicationScheduleConsole model={model} />,
    );

    expect(html).toContain(
      "Calendar light for approved publications and parent fanouts",
    );
    expect(html).toContain("Publication history");
    expect(html).toContain("Fanout summary");
    expect(html).toContain("Schedule controls");
    expect(html).toContain("Update schedule");
    expect(html).toContain("Replace schedule");
    expect(html).toContain("Cancel schedule");
    expect(html).toContain("Confirmation required");
    expect(
      fanoutItem!.scheduleActionPolicy.actions.replace_schedule.blockReason,
    ).toBe("schedule_replace_not_supported");
    expect(html).toContain("Raw / Debug");
    expect(html).toContain("Schedule metadata");
    expect(html).toContain("UTC (Fallback)");
    expect(html).toContain("Needs re-auth");
    expect(html).toContain("Open publication history");
    expect(html).toContain("Open schedule permalink");
    expect(html).toContain("Review: Approved");
    expect(html).toContain("Manual review: Ja");
    expect(html).not.toContain("automation-service.railway.internal");
    expect(html).not.toContain("provider_secret");
  });

  it("renders an empty state when filters remove all visible schedule entries", () => {
    const model = buildPublicationScheduleDashboardModel({
      channels: [],
      connections: [],
      contentJobs: [],
      fanoutTargets: [],
      fanouts: [],
      initialFilters: {
        period: "all",
        provider: "kick",
        status: "all",
        type: "all",
      },
      publications: [
        makePublication({
          id: "publication-only",
          platform_connection_id: "connection-only",
          publication_status: "requested",
          review_status_at_request: "approved",
          schedule_source: "dashboard",
          scheduled_at_utc: "2026-06-21T18:30:00.000Z",
          scheduled_timezone: "Europe/Berlin",
          schedule_status: "scheduled",
          target_platform: "youtube",
        }),
      ],
    });

    expect(model.summary.sourceCount).toBe(1);
    expect(model.summary.totalCount).toBe(0);

    const html = renderToStaticMarkup(
      <PublicationScheduleConsole model={model} />,
    );

    expect(html).toContain("No schedule entries match the current filters");
    expect(html).toContain("Reset");
    expect(html).not.toContain("OpenAI");
  });

  it("disables schedule mutations for finalized or locked entries", () => {
    const model = buildPublicationScheduleDashboardModel({
      channels: [],
      connections: [],
      contentJobs: [],
      fanoutTargets: [],
      fanouts: [],
      publications: [
        makePublication({
          id: "publication-final",
          platform_connection_id: "connection-final",
          publication_status: "published",
          review_status_at_request: "approved",
          schedule_execution_claimed_at: "2026-06-21T12:00:00.000Z",
          schedule_execution_claimed_by: "scheduler-worker",
          schedule_execution_status: "claimed",
          schedule_source: "dashboard",
          schedule_status: "schedule_canceled",
          schedule_canceled_at: "2026-06-21T10:30:00.000Z",
          schedule_canceled_reason: "Canceled from dashboard.",
          scheduled_at_utc: "2026-06-22T18:30:00.000Z",
          scheduled_timezone: "Europe/Berlin",
          target_platform: "youtube",
        }),
      ],
    });

    const item = model.items[0];
    expect(item).toBeDefined();
    expect(item!.scheduleActionPolicy.actions.edit_schedule.allowed).toBe(
      false,
    );
    expect(item!.scheduleActionPolicy.actions.replace_schedule.allowed).toBe(
      false,
    );
    expect(item!.scheduleActionPolicy.actions.cancel_schedule.allowed).toBe(
      false,
    );

    const html = renderToStaticMarkup(
      <PublicationScheduleConsole model={model} />,
    );

    expect(html).toContain("Blocked");
    expect(html).toContain(
      "publication schedule is already final and cannot be changed anymore.",
    );
    expect(html).toContain("Block reason: publication_finalized.");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Update schedule<\/button>/);
    expect(html).toMatch(
      /<button[^>]*disabled[^>]*>Replace schedule<\/button>/,
    );
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Cancel schedule<\/button>/);
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
    schedule_status: "scheduled",
    scheduled_at_utc: null,
    scheduled_timezone: null,
    schedule_block_reason: null,
    schedule_canceled_at: null,
    schedule_canceled_reason: null,
    schedule_capability_snapshot: {},
    schedule_created_at: null,
    schedule_expired_at: null,
    schedule_replaced_at: null,
    schedule_source: "dashboard",
    schedule_updated_at: null,
    schedule_validation_metadata: {},
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

function makeFanout(
  overrides: Partial<PublicationFanoutRow> = {},
): PublicationFanoutRow {
  return {
    blocked_target_count: 0,
    content_job_id: "job-default",
    created_at: "2026-06-19T10:00:00.000Z",
    fanout_policy: "prepare_valid_targets",
    fanout_status: "requested",
    id: "fanout-default",
    last_action_at: null,
    last_action_key: null,
    last_action_result: null,
    last_aggregate_refreshed_at: null,
    requested_at: "2026-06-19T10:00:00.000Z",
    requested_by: "11111111-1111-4111-8111-111111111111",
    request_intent_hash:
      "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    review_status_at_request: "needs_review",
    scheduled_at_utc: null,
    scheduled_timezone: null,
    schedule_block_message: null,
    schedule_block_reason: null,
    schedule_canceled_at: null,
    schedule_canceled_reason: null,
    schedule_capability_snapshot: {},
    schedule_created_at: null,
    schedule_expired_at: null,
    schedule_replaced_at: null,
    schedule_source: "dashboard",
    schedule_status: "not_scheduled",
    schedule_updated_at: null,
    schedule_validation_metadata: {},
    snapshot: {},
    snapshot_hash:
      "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    target_count: 2,
    updated_at: "2026-06-19T10:00:00.000Z",
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
    created_at: "2026-06-19T10:00:00.000Z",
    id: "fanout-target-default",
    last_action_at: null,
    last_action_key: null,
    last_action_result: null,
    last_block_reason: null,
    last_rechecked_at: null,
    platform_connection_id: "connection-default",
    provider_overrides: {},
    request_intent_hash:
      "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    target_platform: "youtube",
    target_status: "validated",
    updated_at: "2026-06-19T10:00:00.000Z",
    user_id: "11111111-1111-4111-8111-111111111111",
    validated_at: null,
    ...overrides,
  } as PublicationFanoutTargetRow;
}
