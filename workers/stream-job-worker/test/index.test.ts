import assert from "node:assert/strict";
import test from "node:test";

import {
  REPURPOSING_NOT_IMPLEMENTED_MESSAGE,
  processStreamJob,
} from "../src/index.js";
import {
  TRANSCRIPTION_TRIGGER_JOB_NAME,
  getTranscriptionTriggerJobId,
  type StreamOSJob,
} from "@streamos/queue";

const CHANNEL_ID = "11111111-1111-4111-8111-111111111111";
const CREATOR_ID = "22222222-2222-4222-8222-222222222222";
const STREAM_ID = "33333333-3333-4333-8333-333333333333";
const USER_ID = "44444444-4444-4444-8444-444444444444";

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

function createStore(overrides: Record<string, unknown> = {}) {
  const calls = {
    markStreamEnded: [] as Array<Record<string, unknown>>,
    upsertContentJob: [] as Array<Record<string, unknown>>,
    updateContentJobByQueueId: [] as Array<Record<string, unknown>>,
  };
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
      touchChannel: async () => undefined,
      updateStreamDetails: async () => undefined,
      updateContentJobByQueueId: async (input: Record<string, unknown>) => {
        calls.updateContentJobByQueueId.push(input);
      },
      upsertContentJob: async (input: Record<string, unknown>) => {
        calls.upsertContentJob.push(input);
      },
      upsertStream: async () => stream,
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

test("stream.offline with vodAssetUrl upserts the canonical transcription job and enqueues downstream work", async () => {
  const { calls, store } = createStore();
  const queued: Array<Record<string, unknown>> = [];
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

  await processStreamJob(createJob(event), {
    store,
    transcriptionQueue: {
      async add(name, data, opts) {
        queued.push({
          data,
          jobId: String(opts.jobId),
          name,
        });
        return { id: String(opts.jobId) };
      },
    },
  });

  assert.equal(calls.markStreamEnded.length, 1);
  assert.equal(calls.upsertContentJob.length, 1);
  assert.equal(queued.length, 1);
  assert.equal(queued[0].name, TRANSCRIPTION_TRIGGER_JOB_NAME);
  assert.equal(queued[0].jobId, getTranscriptionTriggerJobId(STREAM_ID));
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

test("stream.offline with missing internalStreamId fails permanently and does not fall back", async () => {
  const { calls, store } = createStore({
    findStreamByInternalId: async () => null,
    resolveChannelByExternalId: async () => {
      throw new Error("Fallback channel lookup should not run.");
    },
  });
  let queueCalls = 0;
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
    () =>
      processStreamJob(job, {
        store,
        transcriptionQueue: {
          async add() {
            queueCalls += 1;
            return { id: "unexpected" };
          },
        },
      }),
    /No stream found for internalStreamId=/,
  );

  assert.equal(job.discardCount, 1);
  assert.equal(calls.markStreamEnded.length, 0);
  assert.equal(calls.upsertContentJob.length, 0);
  assert.equal(queueCalls, 0);
});

test("stream.offline without vodAssetUrl materializes stream state but does not enqueue transcription", async () => {
  const { calls, store } = createStore();
  let queueCalls = 0;
  const event: StreamOSJob = {
    id: "media-job-2",
    type: "stream.offline",
    provider: "twitch",
    internalStreamId: STREAM_ID,
    raw: { source: "provider-webhook" },
    receivedAt: "2026-06-17T11:00:00.000Z",
  };

  await processStreamJob(createJob(event), {
    store,
    transcriptionQueue: {
      async add() {
        queueCalls += 1;
        return { id: "unexpected" };
      },
    },
  });

  assert.equal(calls.markStreamEnded.length, 1);
  assert.equal(calls.upsertContentJob.length, 0);
  assert.equal(queueCalls, 0);
});

test("video.published persists a failed repurposing job without downstream queueing", async () => {
  const { calls, store } = createStore();
  let queueCalls = 0;
  const event: StreamOSJob = {
    id: "media-job-3",
    type: "video.published",
    provider: "youtube",
    channelId: "youtube-channel-1",
    raw: { source: "youtube-websub" },
    receivedAt: "2026-06-17T12:00:00.000Z",
    title: "New VOD",
    videoId: "video-123",
  };

  await processStreamJob(createJob(event), {
    store,
    transcriptionQueue: {
      async add() {
        queueCalls += 1;
        return { id: "unexpected" };
      },
    },
  });

  assert.equal(queueCalls, 0);
  assert.equal(calls.upsertContentJob.length, 1);
  assert.equal(calls.upsertContentJob[0].jobType, "repurposing");
  assert.equal(
    calls.upsertContentJob[0].errorMessage,
    REPURPOSING_NOT_IMPLEMENTED_MESSAGE,
  );
  assert.deepEqual(calls.upsertContentJob[0].result, {
    error: REPURPOSING_NOT_IMPLEMENTED_MESSAGE,
  });
});
