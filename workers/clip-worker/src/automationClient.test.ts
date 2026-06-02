import { describe, expect, it, vi } from "vitest";

import { createAutomationClient } from "./automationClient.js";

describe("createAutomationClient", () => {
  it("posts clip analysis payloads to automation-service", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          asset_id: "stream-1",
          highlights: ["Strong hook"],
          provider: "test",
          recommended_formats: ["shorts"],
          repurpose_summary: "Lead with the hook.",
          source_platform: "twitch",
          title_suggestions: ["The Hook"],
          virality_score: 80,
        }),
        { status: 200 },
      ),
    );
    const client = createAutomationClient({
      automationServiceUrl: "http://automation-service:8000",
      fetchFn,
    });

    await expect(
      client.analyzeClip({
        asset_id: "stream-1",
        source_platform: "twitch",
        transcript: "A strong opening hook.",
      }),
    ).resolves.toMatchObject({
      virality_score: 80,
    });

    expect(fetchFn).toHaveBeenCalledWith(
      new URL("/clips/analyze", "http://automation-service:8000"),
      expect.objectContaining({
        body: JSON.stringify({
          asset_id: "stream-1",
          source_platform: "twitch",
          transcript: "A strong opening hook.",
        }),
        method: "POST",
      }),
    );
  });

  it("throws when automation-service rejects clip analysis", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("bad request", { status: 422 }));
    const client = createAutomationClient({
      automationServiceUrl: "http://automation-service:8000",
      fetchFn,
    });

    await expect(
      client.analyzeClip({
        asset_id: "stream-1",
        source_platform: "twitch",
        transcript: "A strong opening hook.",
      }),
    ).rejects.toThrow(
      "automation-service clip analysis failed with 422: bad request",
    );
  });
});
