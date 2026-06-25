import { describe, expect, it, vi } from "vitest";

import { AutomationServiceError } from "./automationClient.js";
import { processTranscriptionJob } from "./worker.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const STREAM_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_STREAM_ID = "33333333-3333-4333-8333-333333333333";
const publicAssetResolver = () => ["93.184.216.34"];

function createJob({
  attempts = 1,
  attemptsMade = 0,
  backoff,
  data,
  id,
}: {
  attempts?: number;
  attemptsMade?: number;
  backoff?: number | { delay: number; type: "exponential" | "fixed" };
  data: Record<string, unknown>;
  id: string;
}) {
  return {
    attemptsMade,
    data,
    id,
    opts: {
      attempts,
      backoff,
    },
  };
}

describe("processTranscriptionJob", () => {
  it("marks a valid BullMQ transcription job as completed", async () => {
    const statusStore = {
      update: vi.fn().mockResolvedValue(undefined),
    };
    const automationClient = {
      processTranscription: vi.fn().mockResolvedValue({
        job_id: "job-1",
        language: "en",
        model: "gpt-4o-transcribe",
        provider: "openai",
        segments: [{ end: 1.5, start: 0, text: "A clean transcript." }],
        stream_id: STREAM_ID,
        transcript: "A clean transcript.",
      }),
    };

    await expect(
      processTranscriptionJob(
        createJob({
          id: "job-1",
          data: {
            user_id: USER_ID,
            language: "en",
            platform: "twitch",
            stream_id: STREAM_ID,
            trigger: "stream_ended",
            vod_asset_url: "https://cdn.example.com/audio.mp4",
          },
        }),
        {
          assetUrlResolver: publicAssetResolver,
          automationClient,
          statusStore,
        },
      ),
    ).resolves.toMatchObject({
      transcript: "A clean transcript.",
    });

    expect(statusStore.update).toHaveBeenNthCalledWith(
      1,
      "job-1",
      expect.objectContaining({ stream_id: STREAM_ID, user_id: USER_ID }),
      {
        last_retried_at: undefined,
        max_retries: 1,
        retry_count: 0,
        status: "running",
      },
    );
    expect(statusStore.update).toHaveBeenNthCalledWith(
      2,
      "job-1",
      expect.objectContaining({ stream_id: STREAM_ID, user_id: USER_ID }),
      {
        last_retried_at: undefined,
        max_retries: 1,
        result: {
          model: "gpt-4o-transcribe",
          provider: "openai",
          segments: [{ end: 1.5, start: 0, text: "A clean transcript." }],
          transcript: "A clean transcript.",
        },
        retry_count: 0,
        status: "done",
      },
    );
  });

  it("queues clip generation after a successful transcription", async () => {
    const statusStore = {
      enqueueClipGeneration: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    };
    const clipGenerationQueue = {
      add: vi.fn().mockResolvedValue({ id: "clip-job-1" }),
    };
    const automationClient = {
      processTranscription: vi.fn().mockResolvedValue({
        job_id: "job-1",
        language: "en",
        model: "gpt-4o-transcribe",
        provider: "openai",
        segments: [{ end: 1.5, start: 0, text: "A clean transcript." }],
        stream_id: STREAM_ID,
        transcript: "A clean transcript.",
      }),
    };

    await processTranscriptionJob(
      createJob({
        id: "job-1",
        data: {
          user_id: USER_ID,
          language: "en",
          platform: "twitch",
          stream_id: STREAM_ID,
          trigger: "stream_ended",
          vod_asset_url: "https://cdn.example.com/audio.mp4",
        },
      }),
      {
        assetUrlResolver: publicAssetResolver,
        automationClient,
        clipGenerationQueue,
        statusStore,
      },
    );

    expect(clipGenerationQueue.add).toHaveBeenCalledWith(
      "clip.generate",
      {
        requested_by: USER_ID,
        source_platform: "twitch",
        source_url: "https://cdn.example.com/audio.mp4",
        stream_id: STREAM_ID,
        transcript: "A clean transcript.",
      },
      expect.objectContaining({
        attempts: 3,
        jobId: `clip-generation-${STREAM_ID}`,
      }),
    );
    expect(statusStore.enqueueClipGeneration).toHaveBeenCalledWith(
      `clip-generation-${STREAM_ID}`,
      {
        requested_by: USER_ID,
        source_platform: "twitch",
        source_url: "https://cdn.example.com/audio.mp4",
        stream_id: STREAM_ID,
        transcript: "A clean transcript.",
      },
    );
  });

  it("marks the job as failed when automation-service fails", async () => {
    const statusStore = {
      update: vi.fn().mockResolvedValue(undefined),
    };
    const automationClient = {
      processTranscription: vi
        .fn()
        .mockRejectedValue(new Error("automation unavailable")),
    };

    await expect(
      processTranscriptionJob(
        createJob({
          id: "job-2",
          data: {
            user_id: USER_ID,
            language: "auto",
            platform: "youtube",
            stream_id: OTHER_STREAM_ID,
            trigger: "stream_ended",
            vod_asset_url: "https://cdn.example.com/audio.webm",
          },
        }),
        {
          assetUrlResolver: publicAssetResolver,
          automationClient,
          statusStore,
        },
      ),
    ).rejects.toThrow("automation unavailable");

    expect(statusStore.update).toHaveBeenLastCalledWith(
      "job-2",
      expect.objectContaining({ stream_id: OTHER_STREAM_ID, user_id: USER_ID }),
      {
        error_message: "automation unavailable",
        last_retried_at: expect.any(String),
        max_retries: 1,
        next_retry_at: null,
        result: {
          error: "automation unavailable",
          error_code: "automation_service_error",
          max_retries: 1,
          next_attempt_in_ms: null,
          retry_count: 1,
          retry_owner: null,
          retryable: false,
        },
        retry_count: 1,
        status: "failed",
      },
    );
  });

  it("keeps the job pending while BullMQ still has attempts left", async () => {
    const statusStore = {
      update: vi.fn().mockResolvedValue(undefined),
    };
    const automationClient = {
      processTranscription: vi
        .fn()
        .mockRejectedValue(new Error("temporary automation failure")),
    };

    await expect(
      processTranscriptionJob(
        createJob({
          attempts: 3,
          attemptsMade: 0,
          backoff: {
            delay: 60_000,
            type: "exponential",
          },
          id: "job-3",
          data: {
            user_id: USER_ID,
            language: "auto",
            platform: "youtube",
            stream_id: OTHER_STREAM_ID,
            trigger: "stream_ended",
            vod_asset_url: "https://cdn.example.com/audio.webm",
          },
        }),
        {
          assetUrlResolver: publicAssetResolver,
          automationClient,
          statusStore,
        },
      ),
    ).rejects.toThrow("temporary automation failure");

    expect(statusStore.update).toHaveBeenLastCalledWith(
      "job-3",
      expect.objectContaining({ stream_id: OTHER_STREAM_ID, user_id: USER_ID }),
      {
        error_message: "temporary automation failure",
        last_retried_at: expect.any(String),
        max_retries: 3,
        next_retry_at: null,
        result: {
          error: "temporary automation failure",
          error_code: "automation_service_error",
          max_retries: 3,
          next_attempt_in_ms: 60_000,
          retry_count: 1,
          retry_owner: "bullmq",
          retryable: true,
        },
        retry_count: 1,
        status: "pending",
      },
    );
  });

  it("persists structured provider rate limits while BullMQ owns retries", async () => {
    const statusStore = {
      update: vi.fn().mockResolvedValue(undefined),
    };
    const automationClient = {
      processTranscription: vi.fn().mockRejectedValue(
        new AutomationServiceError(
          "provider_rate_limited: Upstream transcription provider rate limited the request. (provider=openai, upstream_status=429, retry_after_seconds=120)",
          {
            code: "provider_rate_limited",
            httpStatus: 503,
            provider: "openai",
            retryAfterSeconds: 120,
            retryable: true,
            upstreamStatus: 429,
          },
        ),
      ),
    };

    await expect(
      processTranscriptionJob(
        createJob({
          attempts: 5,
          attemptsMade: 1,
          backoff: {
            delay: 60_000,
            type: "exponential",
          },
          id: "job-4",
          data: {
            user_id: USER_ID,
            language: "auto",
            platform: "youtube",
            stream_id: OTHER_STREAM_ID,
            trigger: "stream_ended",
            vod_asset_url: "https://cdn.example.com/audio.webm",
          },
        }),
        {
          assetUrlResolver: publicAssetResolver,
          automationClient,
          statusStore,
        },
      ),
    ).rejects.toThrow("provider_rate_limited");

    expect(statusStore.update).toHaveBeenLastCalledWith(
      "job-4",
      expect.objectContaining({ stream_id: OTHER_STREAM_ID, user_id: USER_ID }),
      {
        error_message:
          "provider_rate_limited: Upstream transcription provider rate limited the request. (provider=openai, upstream_status=429, retry_after_seconds=120)",
        last_retried_at: expect.any(String),
        max_retries: 5,
        next_retry_at: null,
        result: {
          error:
            "provider_rate_limited: Upstream transcription provider rate limited the request. (provider=openai, upstream_status=429, retry_after_seconds=120)",
          error_code: "provider_rate_limited",
          http_status: 503,
          max_retries: 5,
          next_attempt_in_ms: 120_000,
          provider: "openai",
          retry_after_seconds: 120,
          retry_count: 2,
          retry_owner: "bullmq",
          retryable: true,
          upstream_status: 429,
        },
        retry_count: 2,
        status: "pending",
      },
    );
  });

  it.each([
    ["HTTP scheme", "http://cdn.example.com/audio.mp4"],
    ["localhost", "https://localhost/audio.mp4"],
    ["private IPv4", "https://10.0.0.5/audio.mp4"],
    ["link-local IPv4", "https://169.254.169.254/latest/meta-data"],
    ["reserved IPv4", "https://192.0.2.1/audio.mp4"],
    ["credentials", "https://user:pass@cdn.example.com/audio.mp4"],
    ["non-default port", "https://cdn.example.com:8443/audio.mp4"],
  ])(
    "rejects unsafe VOD asset URLs before automation: %s",
    async (_name, url) => {
      const statusStore = {
        update: vi.fn().mockResolvedValue(undefined),
      };
      const automationClient = {
        processTranscription: vi.fn(),
      };

      await expect(
        processTranscriptionJob(
          createJob({
            id: "job-unsafe",
            data: {
              user_id: USER_ID,
              language: "en",
              platform: "twitch",
              stream_id: STREAM_ID,
              trigger: "stream_ended",
              vod_asset_url: url,
            },
          }),
          {
            assetUrlResolver: publicAssetResolver,
            automationClient,
            statusStore,
          },
        ),
      ).rejects.toThrow(/Asset URL/);

      expect(automationClient.processTranscription).not.toHaveBeenCalled();
      expect(statusStore.update).toHaveBeenCalledWith(
        "job-unsafe",
        expect.objectContaining({ stream_id: STREAM_ID, user_id: USER_ID }),
        expect.objectContaining({
          error_message: expect.stringContaining("Asset URL"),
          status: "failed",
        }),
      );
    },
  );

  it("rejects VOD asset URLs that resolve to private IPs before automation", async () => {
    const statusStore = {
      update: vi.fn().mockResolvedValue(undefined),
    };
    const automationClient = {
      processTranscription: vi.fn(),
    };

    await expect(
      processTranscriptionJob(
        createJob({
          id: "job-private-dns",
          data: {
            user_id: USER_ID,
            language: "en",
            platform: "twitch",
            stream_id: STREAM_ID,
            trigger: "stream_ended",
            vod_asset_url: "https://cdn.example.com/audio.mp4",
          },
        }),
        {
          assetUrlResolver: () => ["10.0.0.5"],
          automationClient,
          statusStore,
        },
      ),
    ).rejects.toThrow("Asset URL resolves to a non-public IP address.");

    expect(automationClient.processTranscription).not.toHaveBeenCalled();
  });
});
