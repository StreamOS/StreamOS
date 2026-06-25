import assert from "node:assert/strict";
import test from "node:test";

import {
  createSupabaseStreamJobStore,
  processStreamJob,
} from "../src/index.js";
import {
  REPURPOSING_PLAN_JOB_NAME,
  TRANSCRIPTION_TRIGGER_JOB_NAME,
  getRepurposingPlanJobId,
  getTranscriptionTriggerJobId,
  type StreamOSJob,
} from "@streamos/queue";
import type { SupabaseClient } from "@supabase/supabase-js";

const CHANNEL_ID = "11111111-1111-4111-8111-111111111111";
const CREATOR_ID = "22222222-2222-4222-8222-222222222222";
const STREAM_ID = "33333333-3333-4333-8333-333333333333";
const USER_ID = "44444444-4444-4444-8444-444444444444";
const publicAssetResolver = () => ["93.184.216.34"];

function createChannel() {
  return {
    id: CHANNEL_ID,
    user_id: USER_ID,
    creator_id: CREATOR_ID,
    platform: "twitch",
    external_channel_id: "twitch-channel-1",
    display_name: "StreamOS Test",
  };
}

function createStream() {
  return {
    id: STREAM_ID,
    user_id: USER_ID,
    channel_id: CHANNEL_ID,
    platform_stream_id: "twitch-stream-1",
  };
}

function createPlatformConnection(
  metadata: Record<string, unknown> = {},
  overrides: Record<string, unknown> = {},
) {
  return {
    channel_id: CHANNEL_ID,
    creator_id: CREATOR_ID,
    display_name: "StreamOS Test",
    external_channel_id: "youtube-channel-1",
    id: "connection-1",
    metadata,
    platform: "youtube",
    user_id: USER_ID,
    ...overrides,
  };
}

function createStore(overrides: Record<string, unknown> = {}) {
  const calls = {
    markStreamEnded: [] as Array<Record<string, unknown>>,
    upsertContentJob: [] as Array<Record<string, unknown>>,
    updateContentJobByQueueId: [] as Array<Record<string, unknown>>,
    upsertStream: [] as Array<Record<string, unknown>>,
  };
  const contentJobsByQueueId = new Map<
    string,
    { id: string; queue_job_id: string; status: string }
  >();
  const channel = createChannel();
  const stream = createStream();

  return {
    calls,
    store: {
      findStreamByInternalId: async () => ({ ...stream, channel }),
      findStreamForChannelEvent: async () => stream,
      markStreamEnded: async (input: Record<string, unknown>) => {
        calls.markStreamEnded.push(input);
      },
      resolveChannelByExternalId: async () => channel,
      resolvePlatformConnectionByExternalId: async () => null,
      touchChannel: async () => undefined,
      updateStreamDetails: async () => undefined,
      updateContentJobByQueueId: async (input: Record<string, unknown>) => {
        calls.updateContentJobByQueueId.push(input);
      },
      upsertContentJob: async (input: Record<string, unknown>) => {
        calls.upsertContentJob.push(input);
        const queueJobId = String(input.queueJobId);
        const existing = contentJobsByQueueId.get(queueJobId);

        if (existing) {
          return existing;
        }

        const record = {
          id: `content-job-${contentJobsByQueueId.size + 1}`,
          queue_job_id: queueJobId,
          status: String(input.status),
        };

        contentJobsByQueueId.set(queueJobId, record);
        return record;
      },
      upsertStream: async (input: Record<string, unknown>) => {
        calls.upsertStream.push(input);
        return stream;
      },
      ...overrides,
    },
  };
}

function createJob(event: StreamOSJob) {
  let discarded = 0;

  return {
    data: event,
    discard: async () => {
      discarded += 1;
    },
    get discardCount() {
      return discarded;
    },
    id: event.id,
    name: event.type,
  };
}

function createDependencies(overrides: Record<string, unknown> = {}) {
  const calls = {
    repurposingQueue: [] as Array<Record<string, unknown>>,
    transcriptionQueue: [] as Array<Record<string, unknown>>,
  };

  return {
    assetUrlResolver: publicAssetResolver,
    calls,
    repurposingQueue: {
      async add(
        name: string,
        data: Record<string, unknown>,
        opts: Record<string, unknown>,
      ) {
        calls.repurposingQueue.push({
          data,
          jobId: String(opts.jobId),
          name,
        });
        return { id: String(opts.jobId) };
      },
    },
    transcriptionQueue: {
      async add(
        name: string,
        data: Record<string, unknown>,
        opts: Record<string, unknown>,
      ) {
        calls.transcriptionQueue.push({
          data,
          jobId: String(opts.jobId),
          name,
        });
        return { id: String(opts.jobId) };
      },
    },
    ...overrides,
  };
}

void test("stream.offline with vodAssetUrl upserts the canonical transcription job and enqueues downstream work", async () => {
  const { calls, store } = createStore();
  const dependencies = createDependencies();
  const event: StreamOSJob = {
    id: "media-job-1",
    type: "stream.offline",
    provider: "twitch",
    internalStreamId: STREAM_ID,
    language: "en",
    raw: { source: "ended-webhook" },
    receivedAt: "2026-06-17T10:00:00.000Z",
    userId: USER_ID,
    vodAssetUrl: "https://cdn.example.com/vods/test.mp4",
  };

  await processStreamJob(createJob(event), { store, ...dependencies });

  assert.equal(calls.markStreamEnded.length, 1);
  assert.equal(calls.upsertContentJob.length, 1);
  assert.equal(dependencies.calls.transcriptionQueue.length, 1);
  assert.equal(
    dependencies.calls.transcriptionQueue[0].name,
    TRANSCRIPTION_TRIGGER_JOB_NAME,
  );
  assert.equal(
    dependencies.calls.transcriptionQueue[0].jobId,
    getTranscriptionTriggerJobId(STREAM_ID),
  );
  assert.deepEqual(calls.upsertContentJob[0], {
    channelId: CHANNEL_ID,
    jobType: "transcription",
    payload: {
      user_id: USER_ID,
      stream_id: STREAM_ID,
      platform: "twitch",
      creator_id: CREATOR_ID,
      channel_id: CHANNEL_ID,
      vod_asset_url: "https://cdn.example.com/vods/test.mp4",
      ended_at: "2026-06-17T10:00:00.000Z",
      language: "en",
      trigger: "stream_ended",
    },
    queueJobId: getTranscriptionTriggerJobId(STREAM_ID),
    status: "pending",
    streamId: STREAM_ID,
    userId: USER_ID,
  });
});

void test("stream.offline rejects unsafe vodAssetUrl before persisting transcription work", async () => {
  const { calls, store } = createStore();
  const dependencies = createDependencies();
  const event: StreamOSJob = {
    id: "media-job-unsafe-vod",
    type: "stream.offline",
    provider: "twitch",
    internalStreamId: STREAM_ID,
    raw: { source: "ended-webhook" },
    receivedAt: "2026-06-17T10:05:00.000Z",
    userId: USER_ID,
    vodAssetUrl: "https://10.0.0.5/vods/test.mp4",
  };
  const job = createJob(event);

  await assert.rejects(
    () => processStreamJob(job, { store, ...dependencies }),
    /Asset URL resolves to a non-public IP address\./,
  );

  assert.equal(job.discardCount, 1);
  assert.equal(calls.markStreamEnded.length, 1);
  assert.equal(calls.upsertContentJob.length, 0);
  assert.equal(dependencies.calls.transcriptionQueue.length, 0);
});

void test("stream.offline with missing internalStreamId fails permanently and does not fall back", async () => {
  const { calls, store } = createStore({
    findStreamByInternalId: async () => null,
    resolveChannelByExternalId: async () => {
      throw new Error("Fallback channel lookup should not run.");
    },
  });
  const dependencies = createDependencies();
  const event: StreamOSJob = {
    id: "media-job-missing-stream",
    type: "stream.offline",
    provider: "twitch",
    internalStreamId: STREAM_ID,
    raw: { source: "ended-webhook" },
    receivedAt: "2026-06-17T10:30:00.000Z",
    userId: USER_ID,
    vodAssetUrl: "https://cdn.example.com/vods/test.mp4",
  };
  const job = createJob(event);

  await assert.rejects(
    () => processStreamJob(job, { store, ...dependencies }),
    /No stream found for internalStreamId=/,
  );

  assert.equal(job.discardCount, 1);
  assert.equal(calls.markStreamEnded.length, 0);
  assert.equal(calls.upsertContentJob.length, 0);
  assert.equal(dependencies.calls.transcriptionQueue.length, 0);
});

void test("stream.offline without vodAssetUrl materializes stream state but does not enqueue transcription", async () => {
  const { calls, store } = createStore();
  const dependencies = createDependencies();
  const event: StreamOSJob = {
    id: "media-job-2",
    type: "stream.offline",
    provider: "twitch",
    internalStreamId: STREAM_ID,
    raw: { source: "provider-webhook" },
    receivedAt: "2026-06-17T11:00:00.000Z",
  };

  await processStreamJob(createJob(event), { store, ...dependencies });

  assert.equal(calls.markStreamEnded.length, 1);
  assert.equal(calls.upsertContentJob.length, 0);
  assert.equal(dependencies.calls.transcriptionQueue.length, 0);
});

void test("video.published materializes stream state without downstream queueing", async () => {
  const { calls, store } = createStore();
  const dependencies = createDependencies();
  const event: StreamOSJob = {
    id: "media-job-3",
    type: "video.published",
    provider: "youtube",
    channelId: "youtube-channel-1",
    enrichmentStatus: "enrichment_required",
    raw: { source: "youtube-websub" },
    receivedAt: "2026-06-17T12:00:00.000Z",
    title: "New VOD",
    videoId: "video-123",
  };

  await processStreamJob(createJob(event), { store, ...dependencies });

  assert.equal(dependencies.calls.transcriptionQueue.length, 0);
  assert.equal(dependencies.calls.repurposingQueue.length, 0);
  assert.equal(calls.upsertStream.length, 1);
  assert.equal(calls.upsertContentJob.length, 0);
  assert.equal(calls.markStreamEnded.length, 0);
  assert.equal(calls.updateContentJobByQueueId.length, 0);
});

void test("video.published with asset_available and explicit repurposing opt-in creates a durable repurposing plan job", async () => {
  const { calls, store } = createStore({
    resolvePlatformConnectionByExternalId: async () =>
      createPlatformConnection({
        repurposing: {
          auto_repurpose_enabled: true,
          brand_profile_id: "brand-profile-1",
          content_policy_profile: "short-form-safe",
          target_platforms: ["youtube", "tiktok"],
        },
      }),
  });
  const dependencies = createDependencies();
  const event: StreamOSJob = {
    id: "media-job-4",
    type: "video.published",
    provider: "youtube",
    channelId: "youtube-channel-1",
    enrichmentStatus: "asset_available",
    raw: { source: "youtube-websub" },
    receivedAt: "2026-06-17T12:10:00.000Z",
    title: "New VOD",
    videoId: "video-123",
    vodAssetUrl: "https://cdn.example.com/vods/test.mp4",
  };

  await processStreamJob(createJob(event), { store, ...dependencies });

  assert.equal(dependencies.calls.transcriptionQueue.length, 0);
  assert.equal(dependencies.calls.repurposingQueue.length, 1);
  assert.equal(
    dependencies.calls.repurposingQueue[0].name,
    REPURPOSING_PLAN_JOB_NAME,
  );
  assert.equal(calls.upsertStream.length, 1);
  assert.equal(calls.upsertContentJob.length, 1);
  assert.deepEqual(calls.upsertContentJob[0], {
    channelId: CHANNEL_ID,
    jobType: "repurposing",
    payload: {
      auto_repurpose_enabled: true,
      brand_profile_id: "brand-profile-1",
      channel_id: CHANNEL_ID,
      content_policy_profile: "short-form-safe",
      creator_id: CREATOR_ID,
      enrichment_status: "asset_available",
      manual_review_required: true,
      published_at: "2026-06-17T12:10:00.000Z",
      source_event_type: "video.published",
      source_provider: "youtube",
      source_video_id: "video-123",
      source_video_title: "New VOD",
      stream_id: STREAM_ID,
      target_platforms: ["youtube", "tiktok"],
      updated_at: "2026-06-17T12:10:00.000Z",
      user_id: USER_ID,
      vod_asset_url: "https://cdn.example.com/vods/test.mp4",
      workflow: "repurposing_plan",
    },
    queueJobId: getRepurposingPlanJobId(STREAM_ID),
    status: "pending",
    streamId: STREAM_ID,
    userId: USER_ID,
  });
  assert.deepEqual(dependencies.calls.repurposingQueue[0], {
    data: {
      asset_reference: {
        kind: "vod",
        status: "asset_available",
        url: "https://cdn.example.com/vods/test.mp4",
      },
      brand_context: {
        brand_profile_id: "brand-profile-1",
      },
      content_job_id: "content-job-1",
      content_policy_hints: {
        content_policy_profile: "short-form-safe",
      },
      language: undefined,
      locale: undefined,
      manual_review_required: true,
      provider: "youtube",
      provider_video_id: "video-123",
      queue_job_id: getRepurposingPlanJobId(STREAM_ID),
      source_event_type: "video.published",
      source_metadata: {
        auto_repurpose_enabled: true,
        brand_profile_id: "brand-profile-1",
        channel_id: CHANNEL_ID,
        content_policy_profile: "short-form-safe",
        creator_id: CREATOR_ID,
        enrichment_status: "asset_available",
        manual_review_required: true,
        published_at: "2026-06-17T12:10:00.000Z",
        source_event_type: "video.published",
        source_provider: "youtube",
        source_video_id: "video-123",
        source_video_title: "New VOD",
        stream_id: STREAM_ID,
        target_platforms: ["youtube", "tiktok"],
        updated_at: "2026-06-17T12:10:00.000Z",
        user_id: USER_ID,
        vod_asset_url: "https://cdn.example.com/vods/test.mp4",
        workflow: "repurposing_plan",
      },
      target_platforms: ["youtube", "tiktok"],
      transcript_reference: undefined,
      user_id: USER_ID,
    },
    jobId: getRepurposingPlanJobId(STREAM_ID),
    name: REPURPOSING_PLAN_JOB_NAME,
  });
});

void test("video.published rejects unsafe vodAssetUrl before repurposing persistence", async () => {
  const { calls, store } = createStore({
    resolvePlatformConnectionByExternalId: async () =>
      createPlatformConnection({
        repurposing: {
          auto_repurpose_enabled: true,
          target_platforms: ["youtube"],
        },
      }),
  });
  const dependencies = createDependencies();
  const event: StreamOSJob = {
    id: "media-job-unsafe-published",
    type: "video.published",
    provider: "youtube",
    channelId: "youtube-channel-1",
    enrichmentStatus: "asset_available",
    raw: { source: "youtube-websub" },
    receivedAt: "2026-06-17T12:15:00.000Z",
    title: "New VOD",
    videoId: "video-123",
    vodAssetUrl: "https://169.254.169.254/latest/meta-data",
  };
  const job = createJob(event);

  await assert.rejects(
    () => processStreamJob(job, { store, ...dependencies }),
    /Asset URL resolves to a non-public IP address\./,
  );

  assert.equal(job.discardCount, 1);
  assert.equal(calls.upsertStream.length, 1);
  assert.equal(calls.upsertContentJob.length, 0);
  assert.equal(dependencies.calls.repurposingQueue.length, 0);
});

void test("video.published repurposing plan queue id is deterministic across duplicate events", async () => {
  const { calls, store } = createStore({
    resolvePlatformConnectionByExternalId: async () =>
      createPlatformConnection({
        repurposing: {
          auto_repurpose_enabled: true,
          target_platforms: ["youtube"],
        },
      }),
  });
  const dependencies = createDependencies();
  const event: StreamOSJob = {
    id: "media-job-5",
    type: "video.published",
    provider: "youtube",
    channelId: "youtube-channel-1",
    enrichmentStatus: "asset_available",
    raw: { source: "youtube-websub" },
    receivedAt: "2026-06-17T13:00:00.000Z",
    title: "New VOD",
    videoId: "video-123",
    vodAssetUrl: "https://cdn.example.com/vods/test.mp4",
  };

  await processStreamJob(createJob(event), { store, ...dependencies });
  await processStreamJob(createJob(event), { store, ...dependencies });

  assert.equal(calls.upsertContentJob.length, 2);
  assert.equal(
    calls.upsertContentJob[0].queueJobId,
    calls.upsertContentJob[1].queueJobId,
  );
  assert.equal(
    calls.upsertContentJob[0].queueJobId,
    getRepurposingPlanJobId(STREAM_ID),
  );
  assert.equal(dependencies.calls.repurposingQueue.length, 2);
});

void test("video.published repurposing queue failures mark the durable job failed", async () => {
  const { calls, store } = createStore({
    resolvePlatformConnectionByExternalId: async () =>
      createPlatformConnection({
        repurposing: {
          auto_repurpose_enabled: true,
          target_platforms: ["youtube"],
        },
      }),
  });
  const dependencies = createDependencies({
    repurposingQueue: {
      async add() {
        throw new Error("Repurposing queue unavailable.");
      },
    },
  });
  const event: StreamOSJob = {
    id: "media-job-9",
    type: "video.published",
    provider: "youtube",
    channelId: "youtube-channel-1",
    enrichmentStatus: "asset_available",
    raw: { source: "youtube-websub" },
    receivedAt: "2026-06-17T13:10:00.000Z",
    title: "New VOD",
    videoId: "video-123",
    vodAssetUrl: "https://cdn.example.com/vods/test.mp4",
  };

  await assert.rejects(
    () => processStreamJob(createJob(event), { store, ...dependencies }),
    /Repurposing queue unavailable\./,
  );

  assert.equal(calls.upsertContentJob.length, 1);
  assert.equal(calls.updateContentJobByQueueId.length, 1);
  assert.equal(calls.updateContentJobByQueueId[0].status, "failed");
  assert.equal(
    calls.updateContentJobByQueueId[0].queueJobId,
    getRepurposingPlanJobId(STREAM_ID),
  );
});

for (const enrichmentStatus of [
  "unsupported",
  "enrichment_required",
  "enrichment_retryable",
  "enrichment_failed",
] as const) {
  void test(`video.published with ${enrichmentStatus} enrichment does not create a repurposing plan job`, async () => {
    const { calls, store } = createStore({
      resolvePlatformConnectionByExternalId: async () =>
        createPlatformConnection({
          repurposing: {
            auto_repurpose_enabled: true,
            target_platforms: ["youtube"],
          },
        }),
    });
    const dependencies = createDependencies();
    const event: StreamOSJob = {
      id: "media-job-6",
      type: "video.published",
      provider: "youtube",
      channelId: "youtube-channel-1",
      enrichmentStatus,
      raw: { source: "youtube-websub" },
      receivedAt: "2026-06-17T14:00:00.000Z",
      title: "New VOD",
      videoId: "video-123",
    };

    await processStreamJob(createJob(event), { store, ...dependencies });

    assert.equal(calls.upsertStream.length, 1);
    assert.equal(calls.upsertContentJob.length, 0);
    assert.equal(dependencies.calls.repurposingQueue.length, 0);
    assert.equal(dependencies.calls.transcriptionQueue.length, 0);
  });
}

void test("video.published with asset_available but missing repurposing opt-in does not create a repurposing plan job", async () => {
  const { calls, store } = createStore({
    resolvePlatformConnectionByExternalId: async () =>
      createPlatformConnection({
        repurposing: {
          target_platforms: ["youtube"],
        },
      }),
  });
  const dependencies = createDependencies();
  const event: StreamOSJob = {
    id: "media-job-7",
    type: "video.published",
    provider: "youtube",
    channelId: "youtube-channel-1",
    enrichmentStatus: "asset_available",
    raw: { source: "youtube-websub" },
    receivedAt: "2026-06-17T15:00:00.000Z",
    title: "New VOD",
    videoId: "video-123",
    vodAssetUrl: "https://cdn.example.com/vods/test.mp4",
  };

  await processStreamJob(createJob(event), { store, ...dependencies });

  assert.equal(calls.upsertStream.length, 1);
  assert.equal(calls.upsertContentJob.length, 0);
  assert.equal(dependencies.calls.repurposingQueue.length, 0);
  assert.equal(dependencies.calls.transcriptionQueue.length, 0);
});

void test("video.published with invalid repurposing target platforms does not create a repurposing plan job", async () => {
  const { calls, store } = createStore({
    resolvePlatformConnectionByExternalId: async () =>
      createPlatformConnection({
        repurposing: {
          auto_repurpose_enabled: true,
          target_platforms: ["youtube", "not-a-platform"],
        },
      }),
  });
  const dependencies = createDependencies();
  const event: StreamOSJob = {
    id: "media-job-8",
    type: "video.published",
    provider: "youtube",
    channelId: "youtube-channel-1",
    enrichmentStatus: "asset_available",
    raw: { source: "youtube-websub" },
    receivedAt: "2026-06-17T16:00:00.000Z",
    title: "New VOD",
    videoId: "video-123",
    vodAssetUrl: "https://cdn.example.com/vods/test.mp4",
  };

  await processStreamJob(createJob(event), { store, ...dependencies });

  assert.equal(calls.upsertStream.length, 1);
  assert.equal(calls.upsertContentJob.length, 0);
  assert.equal(dependencies.calls.repurposingQueue.length, 0);
  assert.equal(dependencies.calls.transcriptionQueue.length, 0);
});

function createSupabaseStub(
  handlers: Partial<{
    onContentJobsUpdate: () => Promise<{ data: unknown; error: unknown }>;
    onContentJobsUpsert: () => Promise<{ data: unknown; error: unknown }>;
    onStreamsUpdate: () => Promise<{ data: unknown; error: unknown }>;
  }>,
): SupabaseClient {
  return {
    from(table: string) {
      if (table === "streams") {
        return {
          update() {
            return {
              eq() {
                return this;
              },
              maybeSingle: async () =>
                handlers.onStreamsUpdate?.() ?? { data: null, error: null },
              select() {
                return this;
              },
            };
          },
        };
      }

      if (table === "content_jobs") {
        return {
          update() {
            return {
              eq() {
                return this;
              },
              maybeSingle: async () =>
                handlers.onContentJobsUpdate?.() ?? {
                  data: null,
                  error: null,
                },
              select() {
                return this;
              },
            };
          },
          upsert() {
            return {
              maybeSingle: async () =>
                handlers.onContentJobsUpsert?.() ?? {
                  data: null,
                  error: null,
                },
              select() {
                return this;
              },
            };
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  } as unknown as SupabaseClient;
}

void test("markStreamEnded fails closed when no stream row was updated", async () => {
  const store = createSupabaseStreamJobStore(
    createSupabaseStub({
      onStreamsUpdate: async () => ({ data: null, error: null }),
    }),
  );

  await assert.rejects(
    () =>
      store.markStreamEnded({
        endedAt: "2026-06-18T10:00:00.000Z",
        stream: createStream(),
        userId: USER_ID,
      }),
    /matched no rows/,
  );
});

void test("upsertContentJob fails closed when Supabase returns no durable row", async () => {
  const store = createSupabaseStreamJobStore(
    createSupabaseStub({
      onContentJobsUpsert: async () => ({ data: null, error: null }),
    }),
  );

  await assert.rejects(
    () =>
      store.upsertContentJob({
        channelId: CHANNEL_ID,
        jobType: "transcription",
        payload: { stream_id: STREAM_ID },
        queueJobId: getTranscriptionTriggerJobId(STREAM_ID),
        status: "pending",
        streamId: STREAM_ID,
        userId: USER_ID,
      }),
    /returned no row/,
  );
});

void test("updateContentJobByQueueId fails closed when no content job row matched", async () => {
  const store = createSupabaseStreamJobStore(
    createSupabaseStub({
      onContentJobsUpdate: async () => ({ data: null, error: null }),
    }),
  );

  await assert.rejects(
    () =>
      store.updateContentJobByQueueId({
        queueJobId: getTranscriptionTriggerJobId(STREAM_ID),
        status: "failed",
      }),
    /matched no rows/,
  );
});
