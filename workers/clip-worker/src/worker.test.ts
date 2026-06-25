import { describe, expect, it, vi } from "vitest";

import { processClipGenerationJob } from "./worker.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const STREAM_ID = "22222222-2222-4222-8222-222222222222";
const publicAssetResolver = () => ["93.184.216.34"];

const jobData = {
  creator_id: "33333333-3333-4333-8333-333333333333",
  requested_by: USER_ID,
  source_platform: "twitch" as const,
  source_url: "https://www.twitch.tv/videos/123",
  stream_id: STREAM_ID,
  transcript: "Huge comeback after a risky play in the final round.",
};

function createJob({
  attempts = 1,
  attemptsMade = 0,
  data,
  id,
}: {
  attempts?: number;
  attemptsMade?: number;
  data: Record<string, unknown>;
  id: string;
}) {
  return {
    attemptsMade,
    data,
    id,
    opts: {
      attempts,
    },
  };
}

describe("processClipGenerationJob", () => {
  it("marks a valid BullMQ clip job as completed", async () => {
    const statusStore = {
      update: vi.fn().mockResolvedValue(undefined),
    };
    const automationClient = {
      analyzeClip: vi.fn().mockResolvedValue({
        asset_id: STREAM_ID,
        highlights: ["Strong opening hook"],
        provider: "test",
        recommended_formats: ["shorts", "tiktok"],
        repurpose_summary: "A high-energy clip for short-form distribution.",
        source_platform: "twitch",
        title_suggestions: ["The Comeback Nobody Expected"],
        virality_score: 84,
      }),
    };

    await expect(
      processClipGenerationJob(
        createJob({
          id: "clip-job-1",
          data: jobData,
        }),
        {
          assetUrlResolver: publicAssetResolver,
          automationClient,
          statusStore,
        },
      ),
    ).resolves.toMatchObject({
      virality_score: 84,
    });

    expect(automationClient.analyzeClip).toHaveBeenCalledWith({
      asset_id: STREAM_ID,
      source_platform: "twitch",
      transcript: jobData.transcript,
    });
    expect(statusStore.update).toHaveBeenNthCalledWith(
      1,
      "clip-job-1",
      expect.objectContaining({ stream_id: STREAM_ID, requested_by: USER_ID }),
      { status: "running" },
    );
    expect(statusStore.update).toHaveBeenNthCalledWith(
      2,
      "clip-job-1",
      expect.objectContaining({ stream_id: STREAM_ID, requested_by: USER_ID }),
      {
        result: {
          asset_id: STREAM_ID,
          highlights: ["Strong opening hook"],
          provider: "test",
          recommended_formats: ["shorts", "tiktok"],
          repurpose_summary: "A high-energy clip for short-form distribution.",
          source_platform: "twitch",
          title_suggestions: ["The Comeback Nobody Expected"],
          virality_score: 84,
        },
        status: "done",
      },
    );
  });

  it("marks the job as failed when automation-service fails", async () => {
    const statusStore = {
      update: vi.fn().mockResolvedValue(undefined),
    };
    const automationClient = {
      analyzeClip: vi
        .fn()
        .mockRejectedValue(new Error("automation unavailable")),
    };

    await expect(
      processClipGenerationJob(
        createJob({
          id: "clip-job-2",
          data: jobData,
        }),
        {
          assetUrlResolver: publicAssetResolver,
          automationClient,
          statusStore,
        },
      ),
    ).rejects.toThrow("automation unavailable");

    expect(statusStore.update).toHaveBeenLastCalledWith(
      "clip-job-2",
      expect.objectContaining({ stream_id: STREAM_ID, requested_by: USER_ID }),
      {
        error_message: "automation unavailable",
        result: {
          error: "automation unavailable",
        },
        status: "failed",
      },
    );
  });

  it("keeps the job pending while BullMQ still has attempts left", async () => {
    const statusStore = {
      update: vi.fn().mockResolvedValue(undefined),
    };
    const automationClient = {
      analyzeClip: vi
        .fn()
        .mockRejectedValue(new Error("temporary automation failure")),
    };

    await expect(
      processClipGenerationJob(
        createJob({
          attempts: 3,
          attemptsMade: 0,
          id: "clip-job-3",
          data: jobData,
        }),
        {
          assetUrlResolver: publicAssetResolver,
          automationClient,
          statusStore,
        },
      ),
    ).rejects.toThrow("temporary automation failure");

    expect(statusStore.update).toHaveBeenLastCalledWith(
      "clip-job-3",
      expect.objectContaining({ stream_id: STREAM_ID, requested_by: USER_ID }),
      {
        error_message: "temporary automation failure",
        result: undefined,
        status: "pending",
      },
    );
  });

  it.each([
    ["HTTP scheme", "http://www.twitch.tv/videos/123"],
    ["localhost", "https://localhost/videos/123"],
    ["private IPv4", "https://10.0.0.5/videos/123"],
    ["link-local IPv4", "https://169.254.169.254/latest/meta-data"],
    ["reserved IPv4", "https://192.0.2.1/videos/123"],
    ["credentials", "https://user:pass@www.twitch.tv/videos/123"],
    ["non-default port", "https://www.twitch.tv:8443/videos/123"],
  ])("rejects unsafe source URLs before automation: %s", async (_name, url) => {
    const statusStore = {
      update: vi.fn().mockResolvedValue(undefined),
    };
    const automationClient = {
      analyzeClip: vi.fn(),
    };

    await expect(
      processClipGenerationJob(
        createJob({
          id: "clip-job-unsafe",
          data: {
            ...jobData,
            source_url: url,
          },
        }),
        {
          assetUrlResolver: publicAssetResolver,
          automationClient,
          statusStore,
        },
      ),
    ).rejects.toThrow(/Asset URL/);

    expect(automationClient.analyzeClip).not.toHaveBeenCalled();
    expect(statusStore.update).toHaveBeenCalledWith(
      "clip-job-unsafe",
      expect.objectContaining({ stream_id: STREAM_ID, requested_by: USER_ID }),
      expect.objectContaining({
        error_message: expect.stringContaining("Asset URL"),
        status: "failed",
      }),
    );
  });

  it("rejects source URLs that resolve to private IPs before automation", async () => {
    const statusStore = {
      update: vi.fn().mockResolvedValue(undefined),
    };
    const automationClient = {
      analyzeClip: vi.fn(),
    };

    await expect(
      processClipGenerationJob(
        createJob({
          id: "clip-job-private-dns",
          data: jobData,
        }),
        {
          assetUrlResolver: () => ["10.0.0.5"],
          automationClient,
          statusStore,
        },
      ),
    ).rejects.toThrow("Asset URL resolves to a non-public IP address.");

    expect(automationClient.analyzeClip).not.toHaveBeenCalled();
  });
});
