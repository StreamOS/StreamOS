import { describe, expect, it, vi } from "vitest";

import { processClipGenerationJob } from "./worker.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const STREAM_ID = "22222222-2222-4222-8222-222222222222";

const jobData = {
  creator_id: "33333333-3333-4333-8333-333333333333",
  requested_by: USER_ID,
  source_platform: "twitch" as const,
  source_url: "https://www.twitch.tv/videos/123",
  stream_id: STREAM_ID,
  transcript: "Huge comeback after a risky play in the final round.",
};

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
        {
          id: "clip-job-1",
          data: jobData,
        },
        { automationClient, statusStore },
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
        {
          id: "clip-job-2",
          data: jobData,
        },
        { automationClient, statusStore },
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
});
