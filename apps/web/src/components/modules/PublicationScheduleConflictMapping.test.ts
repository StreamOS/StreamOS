import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildPublicationScheduleDashboardModel,
  type PublicationConnectionRow,
  type PublicationFanoutRow,
  type PublicationFanoutTargetRow,
  type PublicationJobRow,
  type PublicationRow,
} from "./PublicationScheduleConsole.utils";

describe("PublicationScheduleConflictMapping", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("surfaces expired schedules, re-auth, and provider notes for a publication", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-21T12:00:00.000Z"));

    const model = buildPublicationScheduleDashboardModel({
      channels: [],
      connections: [
        makeConnection({
          id: "connection-youtube",
          platform: "youtube",
          provider_profile: {
            display_name: "Creator Channel",
          },
          scopes: ["https://www.googleapis.com/auth/youtube.upload"],
          status: "expired",
        }),
      ],
      contentJobs: [
        makeJob({
          id: "job-publication",
          result: makeApprovedBundle({
            queue_job_id: "repurposing-plan-publication",
          }),
          review_status: "approved",
          status: "done",
          stream_id: "stream-publication",
        }),
      ],
      fanoutTargets: [],
      fanouts: [],
      initialFilters: {
        period: "all",
        provider: "all",
        status: "all",
        type: "all",
      },
      publications: [
        makePublication({
          content_job_id: "job-publication",
          id: "publication-claimed",
          platform_connection_id: "connection-youtube",
          schedule_source: "dashboard",
          schedule_status: "scheduled",
          scheduled_at_utc: "2026-06-21T10:30:00.000Z",
          scheduled_timezone: "Europe/Berlin",
          target_platform: "youtube",
        }),
      ],
    });

    const item = model.items[0];

    expect(item).toBeDefined();
    expect(item?.conflictSummary.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          conflictKey: "schedule_expired",
        }),
        expect.objectContaining({
          conflictKey: "reauth_required",
        }),
        expect.objectContaining({
          conflictKey: "provider_native_scheduling_unused",
        }),
      ]),
    );
    expect(item?.conflictSummary.hasBlockingConflict).toBe(true);
    expect(item?.conflictSummary.hasInfoConflict).toBe(true);
    expect(item?.conflictSummary.topHint).toContain("Choose a new time");
    expect(item?.conflictSummary.topHint).not.toContain("secret");
  });

  it("flags invalid timezone and future horizon drift without exposing secrets", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-21T12:00:00.000Z"));

    const model = buildPublicationScheduleDashboardModel({
      channels: [],
      connections: [
        makeConnection({
          id: "connection-youtube",
          platform: "tiktok",
          provider_profile: {
            display_name: "Creator Channel",
          },
          scopes: ["video.publish"],
          status: "connected",
        }),
      ],
      contentJobs: [
        makeJob({
          id: "job-publication",
          result: makeApprovedBundle({
            queue_job_id: "repurposing-plan-publication",
          }),
          review_status: "approved",
          status: "done",
          stream_id: "stream-publication",
        }),
      ],
      fanoutTargets: [],
      fanouts: [],
      initialFilters: {
        period: "all",
        provider: "all",
        status: "all",
        type: "all",
      },
      publications: [
        makePublication({
          content_job_id: "job-publication",
          id: "publication-timezone",
          platform_connection_id: "connection-youtube",
          schedule_source: "dashboard",
          schedule_status: "scheduled",
          scheduled_at_utc: "2026-06-21T18:30:00.000Z",
          scheduled_timezone: "Mars/Phobos",
          schedule_validation_metadata: {
            has_approved_bundle: true,
            has_publishable_asset: true,
            has_required_scopes: true,
            scheduling_allowed: true,
          },
          target_platform: "tiktok",
        }),
      ],
    });

    const item = model.items[0];

    expect(item).toBeDefined();
    expect(item?.scheduledTimezone).toBe("UTC (Fallback)");
    expect(item?.conflictSummary.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          conflictKey: "timezone_invalid",
          severity: "blocking",
        }),
      ]),
    );
    expect(item?.conflictSummary.hasBlockingConflict).toBe(true);
    expect(item?.conflictSummary.topHint).toContain("valid timezone");
  });

  it("groups fanout target blockers and reauth requirements safely", () => {
    const model = buildPublicationScheduleDashboardModel({
      channels: [],
      connections: [
        makeConnection({
          id: "connection-twitch",
          platform: "twitch",
          provider_profile: {
            display_name: "Twitch Main",
          },
          status: "connected",
        }),
        makeConnection({
          id: "connection-youtube",
          platform: "youtube",
          provider_profile: {
            display_name: "Creator Channel",
          },
          status: "expired",
        }),
      ],
      contentJobs: [
        makeJob({
          id: "job-fanout",
          result: makeApprovedBundle({
            queue_job_id: "repurposing-plan-fanout",
          }),
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
          block_message: "Target connection is stale.",
          block_reason: "missing_publish_scopes",
          content_publication_fanout_id: "fanout-1",
          id: "fanout-target-2",
          last_block_reason: "missing_publish_scopes",
          platform_connection_id: "connection-youtube",
          target_platform: "youtube",
          target_status: "blocked",
        }),
      ],
      fanouts: [
        makeFanout({
          blocked_target_count: 1,
          content_job_id: "job-fanout",
          fanout_policy: "all_or_nothing_preflight",
          fanout_status: "partially_validated",
          id: "fanout-1",
          review_status_at_request: "approved",
          schedule_block_reason: "missing_publish_scopes",
          schedule_status: "schedule_blocked",
          scheduled_at_utc: "2026-06-22T18:30:00.000Z",
          scheduled_timezone: "Europe/Berlin",
          snapshot: {
            approvedBundle: makeApprovedBundle({
              queue_job_id: "repurposing-plan-fanout",
            }),
          },
          target_count: 2,
        }),
      ],
      publications: [],
    });

    const item = model.items[0];

    expect(item).toBeDefined();
    expect(item?.itemType).toBe("fanout");
    expect(item?.conflictSummary.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          conflictKey: "fanout_target_blocked",
        }),
        expect.objectContaining({
          conflictKey: "reauth_required",
        }),
        expect.objectContaining({
          conflictKey: "missing_scope",
        }),
      ]),
    );
    expect(item?.fanoutTargetProviderSummary).toBe("Twitch / YouTube");
    expect(item?.conflictSummary.topHint).toContain("Reconnect");
    expect(item?.conflictSummary.topHint).not.toContain("token");
  });
});

function makeApprovedBundle({
  queue_job_id,
}: {
  queue_job_id: string;
}): PublicationJobRow["result"] {
  return {
    captions: ["Caption one"],
    confidence: 0.95,
    content_job_id: "job-default",
    descriptions: ["Description one"],
    hashtag_sets: [["#streamos"]],
    hook_ideas: ["Hook one"],
    manual_review_required: true,
    model: "gpt-4o",
    provider: "openai",
    queue_job_id,
    review_notes: ["Approved."],
    short_form_plan: "Short-form plan",
    title_suggestions: ["Morning Highlights"],
    warnings: ["Watch the hook wording."],
  };
}

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
