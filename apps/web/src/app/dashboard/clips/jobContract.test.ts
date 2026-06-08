import { describe, expect, it } from "vitest";
import {
  buildClipGenerationQueuePayload,
  getClipGenerationQueueJobId,
  getClipPlatformStreamId,
  parseClipAnalysisFormData,
} from "./jobContract";

describe("clip job contract", () => {
  it("normalizes clip analysis form values", () => {
    const formData = new FormData();
    formData.set("vodUrl", "https://www.twitch.tv/videos/123");
    formData.set("category", "Valorant");
    formData.set("chatActivity", "high");
    formData.set("sourcePlatform", "twitch");
    formData.set("transcript", "Final round comeback.");

    expect(parseClipAnalysisFormData(formData)).toEqual({
      category: "Valorant",
      chatActivity: "high",
      sourcePlatform: "twitch",
      sourceUrl: "https://www.twitch.tv/videos/123",
      transcript: "Final round comeback.",
    });
  });

  it("falls back to medium chat activity for unknown values", () => {
    const formData = new FormData();
    formData.set("vodUrl", "https://www.twitch.tv/videos/123");
    formData.set("chatActivity", "loud");
    formData.set("transcript", "Final round comeback.");

    expect(parseClipAnalysisFormData(formData).chatActivity).toBe("medium");
  });

  it("rejects non-http media URLs", () => {
    const formData = new FormData();
    formData.set("vodUrl", "file:///tmp/local.mp4");
    formData.set("transcript", "Final round comeback.");

    expect(() => parseClipAnalysisFormData(formData)).toThrow(
      "VOD URL must use http or https.",
    );
  });

  it("uses deterministic stream and queue identifiers", () => {
    const sourceUrl = "https://www.twitch.tv/videos/123";
    const streamId = getClipPlatformStreamId(sourceUrl);

    expect(streamId).toBe(getClipPlatformStreamId(sourceUrl));
    expect(streamId).toMatch(/^vod-/);
    expect(getClipGenerationQueueJobId("stream-1")).toBe(
      getClipGenerationQueueJobId("stream-1"),
    );
  });

  it("builds the API gateway payload", () => {
    expect(
      buildClipGenerationQueuePayload({
        creatorId: "creator-1",
        requestedBy: "user-1",
        sourcePlatform: "twitch",
        sourceUrl: "https://cdn.example.com/vod.mp4",
        streamId: "stream-1",
        transcript: "A strong opening hook.",
      }),
    ).toEqual({
      creator_id: "creator-1",
      requested_by: "user-1",
      source_platform: "twitch",
      source_url: "https://cdn.example.com/vod.mp4",
      stream_id: "stream-1",
      transcript: "A strong opening hook.",
    });
  });
});
