import assert from "node:assert/strict";
import { test } from "node:test";

import type { Job } from "bullmq";

import { encryptSecretWithKey, getEncryptionKey } from "./encryption.js";
import type {
  PublicationConnectionRow,
  PublicationContentJobRow,
  PublicationRow,
  PublicationStore,
  PublicationVodAssetRow,
} from "./publicationStore.js";
import {
  PermanentPublicationExecutionError,
  PermanentPublicationReconciliationError,
  type PublishingWorkerConfig,
  processPublicationExecutionJob,
  processPublicationReconciliationJob,
} from "./worker.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const REQUESTED_BY = "22222222-2222-4222-8222-222222222222";
const PUBLICATION_ID = "33333333-3333-4333-8333-333333333333";
const FANOUT_ID = "88888888-8888-4888-8888-888888888888";
const CHILD_PUBLICATION_ID = "99999999-9999-4999-8999-999999999999";
const CONTENT_JOB_ID = "44444444-4444-4444-8444-444444444444";
const CONNECTION_ID = "55555555-5555-4555-8555-555555555555";
const STREAM_ID = "66666666-6666-4666-8666-666666666666";
const ASSET_ID = "77777777-7777-4777-8777-777777777777";
const APP_ENCRYPTION_KEY =
  "base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
const TEST_ACCESS_TOKEN = "test-access-token";
const TEST_REFRESH_TOKEN = "test-refresh-token";
const TEST_REFRESHED_ACCESS_TOKEN = "test-refreshed-access-token";
const TEST_ROTATED_REFRESH_TOKEN = "test-rotated-refresh-token";
const TEST_CLIENT_SECRET = "test-client-secret";
const TEST_SUPABASE_SERVICE_ROLE = "test-service-role";

type FakeJob = Pick<
  Job,
  "attemptsMade" | "data" | "discard" | "id" | "opts"
> & {
  discarded: boolean;
};

type PatchCall = {
  payload: Record<string, unknown>;
  publicationId: string;
  userId: string;
};

type EventCall = Parameters<PublicationStore["appendEvent"]>[0];

type StoreOverrides = {
  contentJob?: PublicationContentJobRow | null;
  connection?: PublicationConnectionRow | null;
  patchPublicationErrorAtCall?: number;
  publication?: PublicationRow | null;
  vodAsset?: PublicationVodAssetRow | null;
};

class FakePublicationStore implements PublicationStore {
  contentJob: PublicationContentJobRow | null;
  connection: PublicationConnectionRow | null;
  events: EventCall[] = [];
  loadContentJobCalls: Parameters<PublicationStore["loadContentJobById"]>[0][] =
    [];
  loadConnectionCalls: Parameters<
    PublicationStore["loadPlatformConnectionById"]
  >[0][] = [];
  loadPublicationCalls: Parameters<
    PublicationStore["loadPublicationById"]
  >[0][] = [];
  loadVodAssetCalls: Parameters<
    PublicationStore["loadVodAssetByStreamId"]
  >[0][] = [];
  patchPublicationErrorAtCall: number | null;
  patchConnectionCalls: Parameters<
    PublicationStore["patchPlatformConnection"]
  >[0][] = [];
  patchPublicationCalls: PatchCall[] = [];
  publication: PublicationRow | null;
  vodAsset: PublicationVodAssetRow | null;

  constructor(overrides: StoreOverrides = {}) {
    this.publication =
      overrides.publication === undefined
        ? buildPublication()
        : overrides.publication;
    this.contentJob =
      overrides.contentJob === undefined
        ? buildContentJob()
        : overrides.contentJob;
    this.connection =
      overrides.connection === undefined
        ? buildConnection()
        : overrides.connection;
    this.vodAsset =
      overrides.vodAsset === undefined ? buildVodAsset() : overrides.vodAsset;
    this.patchPublicationErrorAtCall =
      overrides.patchPublicationErrorAtCall ?? null;
  }

  async appendEvent(input: EventCall): Promise<void> {
    this.events.push(input);
  }

  async loadContentJobById(
    input: Parameters<PublicationStore["loadContentJobById"]>[0],
  ): Promise<PublicationContentJobRow | null> {
    this.loadContentJobCalls.push(input);
    return this.contentJob;
  }

  async loadPlatformConnectionById(
    input: Parameters<PublicationStore["loadPlatformConnectionById"]>[0],
  ): Promise<PublicationConnectionRow | null> {
    this.loadConnectionCalls.push(input);
    return this.connection;
  }

  async loadPublicationById(
    input: Parameters<PublicationStore["loadPublicationById"]>[0],
  ): Promise<PublicationRow | null> {
    this.loadPublicationCalls.push(input);
    return this.publication;
  }

  async loadVodAssetByStreamId(
    input: Parameters<PublicationStore["loadVodAssetByStreamId"]>[0],
  ): Promise<PublicationVodAssetRow | null> {
    this.loadVodAssetCalls.push(input);
    return this.vodAsset;
  }

  async patchPlatformConnection(
    input: Parameters<PublicationStore["patchPlatformConnection"]>[0],
  ): Promise<void> {
    this.patchConnectionCalls.push(input);
  }

  async patchPublicationById(input: PatchCall): Promise<void> {
    this.patchPublicationCalls.push(input);
    if (
      this.patchPublicationCalls.length === this.patchPublicationErrorAtCall
    ) {
      throw new Error("simulated publication persistence failure");
    }
    if (this.publication) {
      this.publication = {
        ...this.publication,
        ...input.payload,
      } as PublicationRow;
    }
  }
}

void test("publication.publish publishes YouTube video, persists state, and writes audit events", async () => {
  const store = new FakePublicationStore();
  const fetchCalls: string[] = [];
  const fetchFn = buildYouTubePublishFetch(fetchCalls);
  const job = buildExecutionJob();

  const result = await processPublicationExecutionJob(job, {
    fetchFn,
    publicationStore: store,
    workerConfig: buildWorkerConfig(),
  });

  assert.deepEqual(result, {
    externalPostId: "youtube-video-123",
    externalUrl: "https://www.youtube.com/watch?v=youtube-video-123",
  });
  assert.equal(job.discarded, false);
  assert.deepEqual(fetchCalls, [
    "https://93.184.216.34/videos/source.mp4",
    "https://www.googleapis.com/upload/youtube/v3/videos?part=snippet%2Cstatus&uploadType=resumable",
    "https://upload.youtube.test/session",
  ]);
  assert.equal(store.patchPublicationCalls.length, 2);
  assert.equal(
    store.patchPublicationCalls[0]?.payload.publication_status,
    "publishing",
  );
  assert.equal(
    store.patchPublicationCalls[1]?.payload.publication_status,
    "published",
  );
  assert.equal(
    store.patchPublicationCalls[1]?.payload.external_post_id,
    "youtube-video-123",
  );
  assert.equal(store.events.length, 2);
  assert.equal(store.events[0]?.eventType, "publishing");
  assert.equal(store.events[1]?.eventType, "published");
  assert.equal(store.events[1]?.metadata.external_url, result.externalUrl);
  assertNoSecrets(store.events);
  assertNoSecrets(store.patchPublicationCalls);
});

void test("publication.publish refreshes expired provider tokens before publishing", async () => {
  const store = new FakePublicationStore({
    connection: buildConnection({
      expires_at: "2000-01-01T00:00:00.000Z",
      status: "expired",
    }),
  });
  const fetchCalls: string[] = [];
  const publishFetch = buildYouTubePublishFetch(fetchCalls);
  const fetchFn: typeof fetch = async (input, init) => {
    const url = input.toString();

    if (url === "https://oauth2.googleapis.com/token") {
      fetchCalls.push(url);
      const body = init?.body?.toString() ?? "";
      assert.match(body, /grant_type=refresh_token/);
      return Response.json({
        access_token: TEST_REFRESHED_ACCESS_TOKEN,
        expires_in: 3600,
        refresh_token: TEST_ROTATED_REFRESH_TOKEN,
        scope: "youtube.upload",
      });
    }

    return publishFetch(input, init);
  };

  const result = await processPublicationExecutionJob(buildExecutionJob(), {
    fetchFn,
    publicationStore: store,
    workerConfig: buildWorkerConfig(),
  });

  assert.equal(result.externalPostId, "youtube-video-123");
  assert.deepEqual(fetchCalls, [
    "https://oauth2.googleapis.com/token",
    "https://93.184.216.34/videos/source.mp4",
    "https://www.googleapis.com/upload/youtube/v3/videos?part=snippet%2Cstatus&uploadType=resumable",
    "https://upload.youtube.test/session",
  ]);
  assert.equal(store.patchConnectionCalls.length, 1);
  assert.equal(store.patchConnectionCalls[0]?.payload.status, "connected");
  assert.deepEqual(store.patchConnectionCalls[0]?.payload.scopes, [
    "youtube.upload",
  ]);
  assertNoSecrets(store.patchConnectionCalls);
  assertNoSecrets(store.patchPublicationCalls);
  assertNoSecrets(store.events);
});

void test("publication.publish publishes TikTok video without YouTube upload calls", async () => {
  const store = new FakePublicationStore({
    connection: buildConnection({
      platform: "tiktok",
      scopes: ["video.publish"],
    }),
    publication: buildPublication({
      snapshot: buildSnapshot("tiktok"),
      target_platform: "tiktok",
    }),
  });
  const fetchCalls: string[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    const url = input.toString();
    fetchCalls.push(url);

    if (url === "https://open.tiktokapis.com/v2/post/publish/video/init/") {
      assert.match(init?.body?.toString() ?? "", /PULL_FROM_URL/);
      return Response.json({ data: { publish_id: "tiktok-publish-123" } });
    }

    throw new Error(`Unexpected fetch URL ${url}`);
  };

  const result = await processPublicationExecutionJob(
    buildExecutionJob({
      data: {
        content_publication_id: PUBLICATION_ID,
        target_platform: "tiktok",
        user_id: USER_ID,
      },
    }),
    {
      fetchFn,
      publicationStore: store,
      workerConfig: buildWorkerConfig(),
    },
  );

  assert.deepEqual(result, {
    externalPostId: "tiktok-publish-123",
    externalUrl: null,
  });
  assert.deepEqual(fetchCalls, [
    "https://open.tiktokapis.com/v2/post/publish/video/init/",
  ]);
  assert.equal(
    last(store.patchPublicationCalls).payload.publication_status,
    "published",
  );
  assert.equal(last(store.events).eventType, "published");
  assertNoSecrets(store.events);
});

void test("publication.publish is idempotent when already published", async () => {
  const store = new FakePublicationStore({
    publication: buildPublication({
      external_post_id: "existing-video-id",
      external_url: "https://www.youtube.com/watch?v=existing-video-id",
      publication_status: "published",
    }),
  });
  const fetchFn = failOnFetch();
  const job = buildExecutionJob();

  const result = await processPublicationExecutionJob(job, {
    fetchFn,
    publicationStore: store,
    workerConfig: buildWorkerConfig(),
  });

  assert.deepEqual(result, {
    externalPostId: "existing-video-id",
    externalUrl: "https://www.youtube.com/watch?v=existing-video-id",
  });
  assert.equal(store.patchPublicationCalls.length, 0);
  assert.equal(store.events.length, 0);
  assert.equal(job.discarded, false);
});

void test("publication.publish executes a fanout child using the queued child publication id", async () => {
  const store = new FakePublicationStore({
    publication: buildPublication({ id: CHILD_PUBLICATION_ID }),
  });
  const fetchCalls: string[] = [];
  const job = buildExecutionJob({
    data: {
      content_publication_id: CHILD_PUBLICATION_ID,
      target_platform: "youtube",
      user_id: USER_ID,
    },
    id: getFanoutChildQueueJobId(CHILD_PUBLICATION_ID),
  });

  const result = await processPublicationExecutionJob(job, {
    fetchFn: buildYouTubePublishFetch(fetchCalls),
    publicationStore: store,
    workerConfig: buildWorkerConfig(),
  });

  assert.equal(result.externalPostId, "youtube-video-123");
  assert.deepEqual(store.loadPublicationCalls, [
    {
      publicationId: CHILD_PUBLICATION_ID,
      userId: USER_ID,
    },
  ]);
  assert.deepEqual(
    store.patchPublicationCalls.map((call) => call.publicationId),
    [CHILD_PUBLICATION_ID, CHILD_PUBLICATION_ID],
  );
  assert.deepEqual(
    store.events.map((event) => event.publicationId),
    [CHILD_PUBLICATION_ID, CHILD_PUBLICATION_ID],
  );
  assert.ok(
    store.patchPublicationCalls.every(
      (call) => call.publicationId !== FANOUT_ID,
    ),
  );
  assert.ok(store.events.every((event) => event.publicationId !== FANOUT_ID));
  assert.equal(job.discarded, false);
  assertNoSecrets(store.patchPublicationCalls);
  assertNoSecrets(store.events);
});

void test("publication.publish treats duplicate fanout child jobs as idempotent after child publish", async () => {
  const store = new FakePublicationStore({
    publication: buildPublication({
      external_post_id: "existing-child-video-id",
      external_url: "https://www.youtube.com/watch?v=existing-child-video-id",
      id: CHILD_PUBLICATION_ID,
      publication_status: "published",
    }),
  });
  const job = buildExecutionJob({
    data: {
      content_publication_id: CHILD_PUBLICATION_ID,
      target_platform: "youtube",
      user_id: USER_ID,
    },
    id: getFanoutChildQueueJobId(CHILD_PUBLICATION_ID),
  });

  const result = await processPublicationExecutionJob(job, {
    fetchFn: failOnFetch(),
    publicationStore: store,
    workerConfig: buildWorkerConfig(),
  });

  assert.deepEqual(result, {
    externalPostId: "existing-child-video-id",
    externalUrl: "https://www.youtube.com/watch?v=existing-child-video-id",
  });
  assert.deepEqual(store.loadPublicationCalls, [
    {
      publicationId: CHILD_PUBLICATION_ID,
      userId: USER_ID,
    },
  ]);
  assert.equal(store.patchPublicationCalls.length, 0);
  assert.equal(store.events.length, 0);
  assert.equal(job.discarded, false);
});

void test("publication.publish does not call providers for stale final fanout child statuses", async (t) => {
  for (const status of ["failed_permanent", "canceled", "rejected"] as const) {
    await t.test(status, async () => {
      const store = new FakePublicationStore({
        publication: buildPublication({
          id: CHILD_PUBLICATION_ID,
          publication_status: status,
        }),
      });
      const job = buildExecutionJob({
        data: {
          content_publication_id: CHILD_PUBLICATION_ID,
          target_platform: "youtube",
          user_id: USER_ID,
        },
        id: getFanoutChildQueueJobId(CHILD_PUBLICATION_ID),
      });

      await assert.rejects(
        () =>
          processPublicationExecutionJob(job, {
            fetchFn: failOnFetch(),
            publicationStore: store,
            workerConfig: buildWorkerConfig(),
          }),
        PermanentPublicationExecutionError,
      );

      assert.equal(
        last(store.patchPublicationCalls).payload.publication_status,
        "failed_permanent",
      );
      assert.equal(
        last(store.patchPublicationCalls).payload.provider_failure_code,
        "publication_not_ready",
      );
      assert.equal(last(store.events).publicationId, CHILD_PUBLICATION_ID);
      assert.equal(job.discarded, true);
      assertNoSecrets(store.patchPublicationCalls);
      assertNoSecrets(store.events);
    });
  }
});

void test("publication.publish fails a fanout child permanently when its connection is disconnected", async () => {
  const store = new FakePublicationStore({
    connection: buildConnection({ status: "disconnected" }),
    publication: buildPublication({ id: CHILD_PUBLICATION_ID }),
  });
  const job = buildExecutionJob({
    data: {
      content_publication_id: CHILD_PUBLICATION_ID,
      target_platform: "youtube",
      user_id: USER_ID,
    },
    id: getFanoutChildQueueJobId(CHILD_PUBLICATION_ID),
  });

  await assert.rejects(
    () =>
      processPublicationExecutionJob(job, {
        fetchFn: failOnFetch(),
        publicationStore: store,
        workerConfig: buildWorkerConfig(),
      }),
    /Platform connection is not valid for publication execution/,
  );

  assert.equal(
    last(store.patchPublicationCalls).payload.publication_status,
    "failed_permanent",
  );
  assert.equal(
    last(store.patchPublicationCalls).payload.provider_failure_code,
    "publication_not_ready",
  );
  assert.deepEqual(store.loadConnectionCalls, [
    {
      connectionId: CONNECTION_ID,
      userId: USER_ID,
    },
  ]);
  assert.equal(job.discarded, true);
  assertNoSecrets(store.patchPublicationCalls);
  assertNoSecrets(store.events);
});

void test("publication.publish rejects fanout child jobs whose queued target platform does not match the child", async () => {
  const store = new FakePublicationStore({
    publication: buildPublication({ id: CHILD_PUBLICATION_ID }),
  });
  const job = buildExecutionJob({
    data: {
      content_publication_id: CHILD_PUBLICATION_ID,
      target_platform: "tiktok",
      user_id: USER_ID,
    },
    id: getFanoutChildQueueJobId(CHILD_PUBLICATION_ID),
  });

  await assert.rejects(
    () =>
      processPublicationExecutionJob(job, {
        fetchFn: failOnFetch(),
        publicationStore: store,
        workerConfig: buildWorkerConfig(),
      }),
    /does not match the queued execution job/,
  );

  assert.equal(
    last(store.patchPublicationCalls).payload.publication_status,
    "failed_permanent",
  );
  assert.equal(job.discarded, true);
  assert.deepEqual(
    store.patchPublicationCalls.map((call) => call.publicationId),
    [CHILD_PUBLICATION_ID],
  );
  assertNoSecrets(store.patchPublicationCalls);
  assertNoSecrets(store.events);
});

void test("publication.publish isolates retryable provider failures to the queued fanout child", async () => {
  const store = new FakePublicationStore({
    publication: buildPublication({ id: CHILD_PUBLICATION_ID }),
  });
  const job = buildExecutionJob({
    attempts: 3,
    data: {
      content_publication_id: CHILD_PUBLICATION_ID,
      target_platform: "youtube",
      user_id: USER_ID,
    },
    id: getFanoutChildQueueJobId(CHILD_PUBLICATION_ID),
  });

  await assert.rejects(() =>
    processPublicationExecutionJob(job, {
      fetchFn: buildFailingYouTubeUploadInitFetch(503),
      publicationStore: store,
      workerConfig: buildWorkerConfig(),
    }),
  );

  const failurePatch = last(store.patchPublicationCalls);
  assert.equal(failurePatch.publicationId, CHILD_PUBLICATION_ID);
  assert.equal(failurePatch.payload.publication_status, "failed_retryable");
  assert.equal(
    failurePatch.payload.provider_failure_code,
    "upload_initiation_failed_retryable",
  );
  assert.equal(last(store.events).publicationId, CHILD_PUBLICATION_ID);
  assert.equal(last(store.events).metadata.retryable, true);
  assert.equal(job.discarded, false);
  assert.ok(
    store.patchPublicationCalls.every(
      (call) => call.publicationId !== FANOUT_ID,
    ),
  );
  assertNoSecrets(store.patchPublicationCalls);
  assertNoSecrets(store.events);
});

void test("publication.publish does not retry a fanout child after provider success when published-state persistence fails", async () => {
  const store = new FakePublicationStore({
    patchPublicationErrorAtCall: 2,
    publication: buildPublication({ id: CHILD_PUBLICATION_ID }),
  });
  const fetchCalls: string[] = [];
  const job = buildExecutionJob({
    attempts: 3,
    data: {
      content_publication_id: CHILD_PUBLICATION_ID,
      target_platform: "youtube",
      user_id: USER_ID,
    },
    id: getFanoutChildQueueJobId(CHILD_PUBLICATION_ID),
  });

  await assert.rejects(
    () =>
      processPublicationExecutionJob(job, {
        fetchFn: buildYouTubePublishFetch(fetchCalls),
        publicationStore: store,
        workerConfig: buildWorkerConfig(),
      }),
    /published by the provider, but StreamOS could not persist/,
  );

  assert.deepEqual(fetchCalls, [
    "https://93.184.216.34/videos/source.mp4",
    "https://www.googleapis.com/upload/youtube/v3/videos?part=snippet%2Cstatus&uploadType=resumable",
    "https://upload.youtube.test/session",
  ]);
  assert.equal(store.patchPublicationCalls.length, 3);
  assert.equal(
    store.patchPublicationCalls[1]?.payload.publication_status,
    "published",
  );
  const failurePatch = last(store.patchPublicationCalls);
  assert.equal(failurePatch.publicationId, CHILD_PUBLICATION_ID);
  assert.equal(failurePatch.payload.publication_status, "failed_permanent");
  assert.equal(
    failurePatch.payload.provider_failure_code,
    "publication_execution_failed",
  );
  assert.equal(failurePatch.payload.external_post_id, "youtube-video-123");
  assert.equal(
    (failurePatch.payload.provider_failure_metadata as Record<string, unknown>)
      .provider_write_completed,
    true,
  );
  assert.equal(last(store.events).publicationId, CHILD_PUBLICATION_ID);
  assert.equal(last(store.events).eventType, "failed_permanent");
  assert.equal(last(store.events).metadata.provider_write_completed, true);
  assert.equal(last(store.events).metadata.retryable, false);
  assert.equal(job.discarded, true);
  assertNoSecrets(store.patchPublicationCalls);
  assertNoSecrets(store.events);
});

void test("publication.publish fails non-retryable fanout child contract mismatches before provider execution", async () => {
  const store = new FakePublicationStore({
    publication: buildPublication({
      id: CHILD_PUBLICATION_ID,
      snapshot: {
        ...buildSnapshot(),
        targetPlatform: "tiktok",
      },
    }),
  });
  const job = buildExecutionJob({
    data: {
      content_publication_id: CHILD_PUBLICATION_ID,
      target_platform: "youtube",
      user_id: USER_ID,
    },
    id: getFanoutChildQueueJobId(CHILD_PUBLICATION_ID),
  });

  await assert.rejects(
    () =>
      processPublicationExecutionJob(job, {
        fetchFn: failOnFetch(),
        publicationStore: store,
        workerConfig: buildWorkerConfig(),
      }),
    /snapshot target platform is unsupported/,
  );

  assert.equal(
    last(store.patchPublicationCalls).payload.publication_status,
    "failed_permanent",
  );
  assert.equal(
    last(store.patchPublicationCalls).payload.provider_failure_code,
    "publication_not_ready",
  );
  assert.equal(job.discarded, true);
  assertNoSecrets(store.patchPublicationCalls);
  assertNoSecrets(store.events);
});

void test("publication.publish fails permanently when publishable asset is missing", async () => {
  const store = new FakePublicationStore({ vodAsset: null });
  const job = buildExecutionJob();

  await assert.rejects(
    () =>
      processPublicationExecutionJob(job, {
        fetchFn: failOnFetch(),
        publicationStore: store,
        workerConfig: buildWorkerConfig(),
      }),
    PermanentPublicationExecutionError,
  );

  const failurePatch = last(store.patchPublicationCalls);
  assert.equal(failurePatch.payload.publication_status, "failed_permanent");
  assert.equal(
    failurePatch.payload.provider_failure_code,
    "publication_not_ready",
  );
  assert.equal(job.discarded, true);
  assert.equal(last(store.events).eventType, "failed_permanent");
  assertNoSecrets(store.events);
});

void test("publication.publish fails permanently when platform connection is missing", async () => {
  const store = new FakePublicationStore({ connection: null });
  const job = buildExecutionJob();

  await assert.rejects(
    () =>
      processPublicationExecutionJob(job, {
        fetchFn: failOnFetch(),
        publicationStore: store,
        workerConfig: buildWorkerConfig(),
      }),
    PermanentPublicationExecutionError,
  );

  assert.equal(
    last(store.patchPublicationCalls).payload.publication_status,
    "failed_permanent",
  );
  assert.equal(job.discarded, true);
  assert.equal(store.events.length, 1);
  assertNoSecrets(store.patchPublicationCalls);
});

void test("publication.publish fails permanently when required provider scope is missing", async () => {
  const store = new FakePublicationStore({
    connection: buildConnection({ scopes: ["youtube.readonly"] }),
  });
  const job = buildExecutionJob();

  await assert.rejects(
    () =>
      processPublicationExecutionJob(job, {
        fetchFn: failOnFetch(),
        publicationStore: store,
        workerConfig: buildWorkerConfig(),
      }),
    /missing the required publication scope/,
  );

  const failurePatch = last(store.patchPublicationCalls);
  assert.equal(failurePatch.payload.publication_status, "failed_permanent");
  assert.equal(
    failurePatch.payload.provider_failure_code,
    "publication_not_ready",
  );
  assert.equal(job.discarded, true);
  assertNoSecrets(store.events);
});

void test("publication.publish fails permanently when access token cannot be decrypted", async () => {
  const store = new FakePublicationStore({
    connection: buildConnection({
      access_token_ciphertext: "not-an-encrypted-token",
    }),
  });
  const job = buildExecutionJob();

  await assert.rejects(
    () =>
      processPublicationExecutionJob(job, {
        fetchFn: failOnFetch(),
        publicationStore: store,
        workerConfig: buildWorkerConfig(),
      }),
    /Could not decrypt platform access token/,
  );

  const failurePatch = last(store.patchPublicationCalls);
  assert.equal(failurePatch.payload.publication_status, "failed_permanent");
  assert.equal(job.discarded, true);
  assertNoSecrets(failurePatch);
});

void test("publication.publish stores retryable provider failures without leaking tokens or query strings", async () => {
  const store = new FakePublicationStore();
  const job = buildExecutionJob({ attempts: 3 });
  const fetchFn: typeof fetch = async (input) => {
    const url = input.toString();

    if (url === "https://93.184.216.34/videos/source.mp4") {
      return new Response(new Uint8Array([1]), {
        headers: { "content-type": "video/mp4" },
        status: 200,
      });
    }

    if (url.startsWith("https://www.googleapis.com/upload/youtube/v3/videos")) {
      return new Response(JSON.stringify({ error: "server unavailable" }), {
        status: 503,
      });
    }

    throw new Error(`Unexpected fetch URL ${url}`);
  };

  await assert.rejects(() =>
    processPublicationExecutionJob(job, {
      fetchFn,
      publicationStore: store,
      workerConfig: buildWorkerConfig(),
    }),
  );

  const failurePatch = last(store.patchPublicationCalls);
  assert.equal(failurePatch.payload.publication_status, "failed_retryable");
  assert.equal(
    failurePatch.payload.provider_failure_code,
    "upload_initiation_failed_retryable",
  );
  assert.equal(job.discarded, false);
  assert.equal(last(store.events).metadata.retryable, true);
  assertNoSecrets(store.patchPublicationCalls);
  assertNoSecrets(store.events);
});

void test("publication.publish classifies provider authorization, conflict, rate-limit, and malformed failures", async (t) => {
  const cases = [
    {
      expectedCode: "upload_initiation_failed_unauthorized",
      expectedStatus: "failed_permanent",
      httpStatus: 401,
      retryable: false,
    },
    {
      expectedCode: "upload_initiation_failed_unauthorized",
      expectedStatus: "failed_permanent",
      httpStatus: 403,
      retryable: false,
    },
    {
      expectedCode: "upload_initiation_failed",
      expectedStatus: "failed_permanent",
      httpStatus: 409,
      retryable: false,
    },
    {
      expectedCode: "provider_rate_limited",
      expectedStatus: "failed_retryable",
      httpStatus: 429,
      retryable: true,
    },
  ] as const;

  for (const testCase of cases) {
    await t.test(String(testCase.httpStatus), async () => {
      const store = new FakePublicationStore();
      const job = buildExecutionJob({ attempts: 3 });
      const fetchFn = buildFailingYouTubeUploadInitFetch(testCase.httpStatus);

      await assert.rejects(() =>
        processPublicationExecutionJob(job, {
          fetchFn,
          publicationStore: store,
          workerConfig: buildWorkerConfig(),
        }),
      );

      const failurePatch = last(store.patchPublicationCalls);
      assert.equal(
        failurePatch.payload.publication_status,
        testCase.expectedStatus,
      );
      assert.equal(
        failurePatch.payload.provider_failure_code,
        testCase.expectedCode,
      );
      assert.equal(last(store.events).metadata.retryable, testCase.retryable);
      assert.equal(job.discarded, !testCase.retryable);
      assertNoSecrets(store.patchPublicationCalls);
      assertNoSecrets(store.events);
    });
  }
});

void test("publication.publish does not persist sensitive provider response bodies", async () => {
  const store = new FakePublicationStore();
  const job = buildExecutionJob();
  const sensitiveProviderBody = {
    access_token: TEST_ACCESS_TOKEN,
    refresh_token: TEST_REFRESH_TOKEN,
    url: "https://example.invalid/callback?token=abc",
  };
  const fetchFn: typeof fetch = async (input) => {
    const url = input.toString();

    if (url === "https://93.184.216.34/videos/source.mp4") {
      return new Response(new Uint8Array([1]), {
        headers: { "content-type": "video/mp4" },
        status: 200,
      });
    }

    if (url.startsWith("https://www.googleapis.com/upload/youtube/v3/videos")) {
      return new Response(JSON.stringify(sensitiveProviderBody), {
        status: 400,
      });
    }

    throw new Error(`Unexpected fetch URL ${url}`);
  };

  await assert.rejects(() =>
    processPublicationExecutionJob(job, {
      fetchFn,
      publicationStore: store,
      workerConfig: buildWorkerConfig(),
    }),
  );

  assert.equal(
    last(store.patchPublicationCalls).payload.publication_status,
    "failed_permanent",
  );
  assertNoSecrets(store.patchPublicationCalls);
  assertNoSecrets(store.events);
});

void test("publication.publish treats malformed provider upload responses as retryable worker failures", async () => {
  const store = new FakePublicationStore();
  const job = buildExecutionJob({ attempts: 3 });
  const fetchFn: typeof fetch = async (input) => {
    const url = input.toString();

    if (url === "https://93.184.216.34/videos/source.mp4") {
      return new Response(new Uint8Array([1]), {
        headers: { "content-type": "video/mp4" },
        status: 200,
      });
    }

    if (url.startsWith("https://www.googleapis.com/upload/youtube/v3/videos")) {
      return new Response(null, {
        headers: { location: "https://upload.youtube.test/session" },
        status: 200,
      });
    }

    if (url === "https://upload.youtube.test/session") {
      return Response.json({ unexpected: "shape" });
    }

    throw new Error(`Unexpected fetch URL ${url}`);
  };

  await assert.rejects(() =>
    processPublicationExecutionJob(job, {
      fetchFn,
      publicationStore: store,
      workerConfig: buildWorkerConfig(),
    }),
  );

  const failurePatch = last(store.patchPublicationCalls);
  assert.equal(failurePatch.payload.publication_status, "failed_retryable");
  assert.equal(
    failurePatch.payload.provider_failure_code,
    "publication_execution_failed",
  );
  assert.equal(job.discarded, false);
  assertNoSecrets(store.events);
});

void test("publication.publish treats provider aborts as retryable without leaking request details", async () => {
  const store = new FakePublicationStore();
  const job = buildExecutionJob({ attempts: 3 });
  const fetchFn: typeof fetch = async (input) => {
    const url = input.toString();

    if (url === "https://93.184.216.34/videos/source.mp4") {
      return new Response(new Uint8Array([1]), {
        headers: { "content-type": "video/mp4" },
        status: 200,
      });
    }

    if (url.startsWith("https://www.googleapis.com/upload/youtube/v3/videos")) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }

    throw new Error(`Unexpected fetch URL ${url}`);
  };

  await assert.rejects(() =>
    processPublicationExecutionJob(job, {
      fetchFn,
      publicationStore: store,
      workerConfig: buildWorkerConfig(),
    }),
  );

  const failurePatch = last(store.patchPublicationCalls);
  assert.equal(failurePatch.payload.publication_status, "failed_retryable");
  assert.equal(
    failurePatch.payload.provider_failure_code,
    "publication_execution_failed",
  );
  assert.equal(job.discarded, false);
  assertNoSecrets(store.patchPublicationCalls);
});

void test("publication.publish keeps asset URL query strings out of persisted failures", async () => {
  const store = new FakePublicationStore({
    vodAsset: buildVodAsset({
      source_url: "https://93.184.216.34/videos/source.mp4?token=abc",
    }),
  });
  const fetchFn: typeof fetch = async (input) => {
    if (
      input.toString() === "https://93.184.216.34/videos/source.mp4?token=abc"
    ) {
      return new Response("missing", { status: 404 });
    }

    throw new Error(`Unexpected fetch URL ${input.toString()}`);
  };

  await assert.rejects(() =>
    processPublicationExecutionJob(buildExecutionJob(), {
      fetchFn,
      publicationStore: store,
      workerConfig: buildWorkerConfig(),
    }),
  );

  assert.equal(
    last(store.patchPublicationCalls).payload.publication_status,
    "failed_permanent",
  );
  assertNoSecrets(store.patchPublicationCalls);
  assertNoSecrets(store.events);
});

void test("publication.reconcile updates remote state and writes audit without publishing again", async () => {
  const store = new FakePublicationStore({
    publication: buildPublication({
      external_post_id: "youtube-video-123",
      external_url: "https://www.youtube.com/watch?v=youtube-video-123",
      publication_status: "published",
      reconciliation_status: "queued",
    }),
  });
  const fetchCalls: string[] = [];
  const fetchFn: typeof fetch = async (input) => {
    const url = input.toString();
    fetchCalls.push(url);

    if (url.startsWith("https://www.googleapis.com/youtube/v3/videos")) {
      return Response.json({
        items: [
          {
            id: "youtube-video-123",
            processingDetails: { processingStatus: "succeeded" },
            status: { privacyStatus: "public", uploadStatus: "processed" },
          },
        ],
      });
    }

    throw new Error(`Unexpected fetch URL ${url}`);
  };

  const result = await processPublicationReconciliationJob(
    buildReconciliationJob(),
    {
      fetchFn,
      publicationStore: store,
      workerConfig: buildWorkerConfig(),
    },
  );

  assert.equal(result.remotePostId, "youtube-video-123");
  assert.equal(result.remoteStatus, "published");
  assert.equal(fetchCalls.length, 1);
  assert.ok(
    fetchCalls[0]?.startsWith("https://www.googleapis.com/youtube/v3/videos"),
  );
  assert.equal(
    last(store.patchPublicationCalls).payload.reconciliation_status,
    "reconciled",
  );
  assert.equal(last(store.events).eventType, "reconciled");
  assert.equal(last(store.events).metadata.remote_url, result.remoteUrl);
  assertNoSecrets(store.events);
});

void test("publication.reconcile fails permanently when remote id is missing", async () => {
  const store = new FakePublicationStore({
    publication: buildPublication({
      external_post_id: null,
      remote_state: {},
      publication_status: "published",
      reconciliation_status: "queued",
    }),
  });
  const job = buildReconciliationJob();

  await assert.rejects(
    () =>
      processPublicationReconciliationJob(job, {
        fetchFn: failOnFetch(),
        publicationStore: store,
        workerConfig: buildWorkerConfig(),
      }),
    PermanentPublicationReconciliationError,
  );

  const failurePatch = last(store.patchPublicationCalls);
  assert.equal(failurePatch.payload.reconciliation_status, "failed_permanent");
  assert.equal(
    failurePatch.payload.provider_failure_code,
    "remote_state_unavailable",
  );
  assert.equal(job.discarded, true);
  assertNoSecrets(store.events);
});

void test("publication.reconcile classifies provider not found and rate limits", async (t) => {
  const cases = [
    {
      expectedCode: "provider_unauthorized",
      expectedStatus: "failed_permanent",
      httpStatus: 401,
      retryable: false,
    },
    {
      expectedCode: "remote_post_missing",
      expectedStatus: "failed_permanent",
      httpStatus: 404,
      retryable: false,
    },
    {
      expectedCode: "provider_rate_limited",
      expectedStatus: "failed_retryable",
      httpStatus: 429,
      retryable: true,
    },
    {
      expectedCode: "provider_unavailable",
      expectedStatus: "failed_retryable",
      httpStatus: 500,
      retryable: true,
    },
  ] as const;

  for (const testCase of cases) {
    await t.test(String(testCase.httpStatus), async () => {
      const store = new FakePublicationStore({
        publication: buildPublication({
          external_post_id: "youtube-video-123",
          publication_status: "published",
          reconciliation_status: "queued",
        }),
      });
      const job = buildReconciliationJob({ attempts: 3 });
      const fetchFn: typeof fetch = async () =>
        new Response(JSON.stringify({ error: "provider error" }), {
          headers:
            testCase.httpStatus === 429 ? { "retry-after": "30" } : undefined,
          status: testCase.httpStatus,
        });

      await assert.rejects(() =>
        processPublicationReconciliationJob(job, {
          fetchFn,
          publicationStore: store,
          workerConfig: buildWorkerConfig(),
        }),
      );

      const failurePatch = last(store.patchPublicationCalls);
      assert.equal(
        failurePatch.payload.reconciliation_status,
        testCase.expectedStatus,
      );
      assert.equal(
        failurePatch.payload.provider_failure_code,
        testCase.expectedCode,
      );
      assert.equal(last(store.events).metadata.retryable, testCase.retryable);
      assert.equal(job.discarded, !testCase.retryable);
      assertNoSecrets(store.events);
    });
  }
});

void test("publication.reconcile respects final states without provider reads", async () => {
  const store = new FakePublicationStore({
    publication: buildPublication({
      external_post_id: "youtube-video-123",
      publication_status: "canceled",
      reconciliation_status: "queued",
    }),
  });
  const job = buildReconciliationJob();

  await assert.rejects(
    () =>
      processPublicationReconciliationJob(job, {
        fetchFn: failOnFetch(),
        publicationStore: store,
        workerConfig: buildWorkerConfig(),
      }),
    PermanentPublicationReconciliationError,
  );

  assert.equal(
    last(store.patchPublicationCalls).payload.reconciliation_status,
    "failed_permanent",
  );
  assert.equal(job.discarded, true);
});

function buildWorkerConfig(): PublishingWorkerConfig {
  return {
    appEncryptionKey: APP_ENCRYPTION_KEY,
    concurrency: 1,
    publicationQueueName: "streamos-publishing",
    redisUrl: "redis://localhost:6379/0",
    supabaseServiceRoleKey: TEST_SUPABASE_SERVICE_ROLE,
    supabaseUrl: "https://supabase.example.com",
    tiktokClientKey: "test-tiktok-client-key",
    tiktokClientSecret: TEST_CLIENT_SECRET,
    youtubeClientId: "test-youtube-client-id",
    youtubeClientSecret: TEST_CLIENT_SECRET,
  };
}

function buildExecutionJob(
  options: {
    attempts?: number;
    attemptsMade?: number;
    data?: unknown;
    id?: string;
  } = {},
): FakeJob {
  return {
    attemptsMade: options.attemptsMade ?? 0,
    data: options.data ?? {
      content_publication_id: PUBLICATION_ID,
      target_platform: "youtube",
      user_id: USER_ID,
    },
    discard() {
      this.discarded = true;
    },
    discarded: false,
    id: options.id ?? `publish:${PUBLICATION_ID}`,
    opts: {
      attempts: options.attempts ?? 1,
      backoff: { delay: 1_000, type: "fixed" },
    },
  };
}

function getFanoutChildQueueJobId(childPublicationId: string): string {
  return `publish:${childPublicationId}`;
}

function buildReconciliationJob(
  options: { attempts?: number; attemptsMade?: number; data?: unknown } = {},
): FakeJob {
  return {
    ...buildExecutionJob({
      attempts: options.attempts,
      attemptsMade: options.attemptsMade,
      data: options.data,
    }),
    id: `reconcile:${PUBLICATION_ID}`,
  };
}

function buildPublication(
  overrides: Partial<PublicationRow> = {},
): PublicationRow {
  return {
    capability_snapshot: {},
    capability_version: "v1",
    content_job_id: CONTENT_JOB_ID,
    desired_visibility: "public",
    effective_visibility: null,
    external_post_id: null,
    external_url: null,
    id: PUBLICATION_ID,
    last_reconciled_at: null,
    max_retries: 3,
    next_retry_at: null,
    platform_connection_id: CONNECTION_ID,
    publication_status: "queued",
    provider_failure_code: null,
    provider_failure_metadata: {},
    provider_failure_reason: null,
    provider_overrides: {},
    published_at: null,
    reconciliation_status: "idle",
    reconcile_max_retries: 3,
    reconcile_next_retry_at: null,
    reconcile_retry_count: 0,
    remote_processing_status: null,
    remote_state: {},
    remote_status: "unknown",
    remote_upload_status: null,
    request_intent_hash: "request-intent-hash",
    requested_at: "2026-06-25T08:00:00.000Z",
    requested_by: REQUESTED_BY,
    retry_count: 0,
    review_status_at_request: "approved",
    snapshot: buildSnapshot(),
    snapshot_hash: "snapshot-hash",
    target_platform: "youtube",
    user_id: USER_ID,
    validated_at: "2026-06-25T08:00:00.000Z",
    validation_code: null,
    validation_message: null,
    validation_metadata: {},
    ...overrides,
  };
}

function buildSnapshot(
  targetPlatform: "tiktok" | "youtube" = "youtube",
): Record<string, unknown> {
  return {
    approvedBundle: {
      content_job_id: CONTENT_JOB_ID,
      manual_review_required: true,
      provider: targetPlatform,
      queue_job_id: "repurpose-queue-job",
      warnings: [],
    },
    capability: {
      canonicalDraft: {
        assetReference: {
          contentJobId: CONTENT_JOB_ID,
          queueJobId: "repurpose-queue-job",
          sourcePlatform: targetPlatform,
          streamId: STREAM_ID,
        },
        audienceClassification: "general",
        description: "Description",
        disclosureIntent: {
          containsAffiliateLinks: false,
          containsAIGeneratedAssets: false,
          containsSponsoredContent: false,
          manualReviewRequired: true,
          warnings: [],
        },
        formatProfile: "long_form",
        hashtags: ["streamos"],
        publishKind: "video",
        scheduledPublishAt: null,
        title: "Title",
        visibility: "public",
      },
    },
    contentJob: {
      id: CONTENT_JOB_ID,
      queueJobId: "repurpose-queue-job",
      reviewStatus: "approved",
      status: "done",
      streamId: STREAM_ID,
    },
    platformConnection: {
      id: CONNECTION_ID,
      platform: targetPlatform,
      scopes: ["youtube.upload"],
    },
    providerOverrides: {},
    targetPlatform,
  };
}

function buildContentJob(
  overrides: Partial<PublicationContentJobRow> = {},
): PublicationContentJobRow {
  return {
    id: CONTENT_JOB_ID,
    job_type: "repurposing",
    queue_job_id: "repurpose-queue-job",
    result: {},
    review_status: "approved",
    status: "done",
    stream_id: STREAM_ID,
    type: "repurposing",
    user_id: USER_ID,
    ...overrides,
  };
}

function buildConnection(
  overrides: Partial<PublicationConnectionRow> = {},
): PublicationConnectionRow {
  const key = getEncryptionKey(APP_ENCRYPTION_KEY);
  return {
    access_token_ciphertext: encryptSecretWithKey(TEST_ACCESS_TOKEN, key),
    expires_at: "2999-01-01T00:00:00.000Z",
    id: CONNECTION_ID,
    metadata: {},
    platform: "youtube",
    provider_profile: {},
    refresh_token_ciphertext: encryptSecretWithKey(TEST_REFRESH_TOKEN, key),
    scopes: ["youtube.upload"],
    status: "connected",
    user_id: USER_ID,
    ...overrides,
  };
}

function buildVodAsset(
  overrides: Partial<PublicationVodAssetRow> = {},
): PublicationVodAssetRow {
  return {
    id: ASSET_ID,
    source_url: "https://93.184.216.34/videos/source.mp4",
    status: "ready",
    ...overrides,
  };
}

function buildYouTubePublishFetch(calls: string[]): typeof fetch {
  return (async (input, _init) => {
    const url = input.toString();
    calls.push(url);

    if (url === "https://93.184.216.34/videos/source.mp4") {
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: { "content-type": "video/mp4" },
        status: 200,
      });
    }

    if (url.startsWith("https://www.googleapis.com/upload/youtube/v3/videos")) {
      return new Response(null, {
        headers: { location: "https://upload.youtube.test/session" },
        status: 200,
      });
    }

    if (url === "https://upload.youtube.test/session") {
      return Response.json({ id: "youtube-video-123" });
    }

    throw new Error(`Unexpected fetch URL ${url}`);
  }) as typeof fetch;
}

function buildFailingYouTubeUploadInitFetch(httpStatus: number): typeof fetch {
  return (async (input) => {
    const url = input.toString();

    if (url === "https://93.184.216.34/videos/source.mp4") {
      return new Response(new Uint8Array([1]), {
        headers: { "content-type": "video/mp4" },
        status: 200,
      });
    }

    if (url.startsWith("https://www.googleapis.com/upload/youtube/v3/videos")) {
      return new Response(JSON.stringify({ error: "provider error" }), {
        headers: httpStatus === 429 ? { "retry-after": "30" } : undefined,
        status: httpStatus,
      });
    }

    throw new Error(`Unexpected fetch URL ${url}`);
  }) as typeof fetch;
}

function failOnFetch(): typeof fetch {
  return (async (input) => {
    throw new Error(`Unexpected fetch URL ${input.toString()}`);
  }) as typeof fetch;
}

function last<T>(values: T[]): T {
  const value = values.at(-1);
  assert.ok(value);
  return value;
}

function assertNoSecrets(value: unknown): void {
  const serialized = JSON.stringify(value);
  assert.ok(!serialized.includes(TEST_ACCESS_TOKEN));
  assert.ok(!serialized.includes(TEST_REFRESH_TOKEN));
  assert.ok(!serialized.includes(TEST_REFRESHED_ACCESS_TOKEN));
  assert.ok(!serialized.includes(TEST_ROTATED_REFRESH_TOKEN));
  assert.ok(!serialized.includes(TEST_CLIENT_SECRET));
  assert.ok(!serialized.includes(TEST_SUPABASE_SERVICE_ROLE));
  assert.ok(!serialized.includes("token=abc"));
  assert.ok(!serialized.includes("railway.internal"));
}
