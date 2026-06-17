import { describe, expect, it, vi } from "vitest";

import { createAutomationClient } from "./automationClient.js";

describe("createAutomationClient", () => {
  it("posts the canonical transcription payload to /transcriptions/process", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          job_id: "job-123",
          language: "en",
          model: "gpt-4o-transcribe",
          provider: "openai",
          segments: [{ end: 1.5, start: 0, text: "A clean transcript." }],
          stream_id: "stream-123",
          transcript: "A clean transcript.",
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200,
        },
      ),
    );
    const client = createAutomationClient({
      automationServiceUrl: "http://automation-service.railway.internal:8000",
      fetchFn,
    });

    const result = await client.processTranscription({
      asset_url: "https://cdn.example.com/audio.mp4",
      job_id: "job-123",
      language: "en",
      source_platform: "twitch",
      stream_id: "stream-123",
    });

    expect(fetchFn).toHaveBeenCalledWith(
      new URL(
        "/transcriptions/process",
        "http://automation-service.railway.internal:8000",
      ),
      {
        body: JSON.stringify({
          asset_url: "https://cdn.example.com/audio.mp4",
          job_id: "job-123",
          language: "en",
          source_platform: "twitch",
          stream_id: "stream-123",
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    );
    expect(result).toEqual({
      job_id: "job-123",
      language: "en",
      model: "gpt-4o-transcribe",
      provider: "openai",
      segments: [{ end: 1.5, start: 0, text: "A clean transcript." }],
      stream_id: "stream-123",
      transcript: "A clean transcript.",
    });
  });

  it("surfaces automation-service transcription failures with status and body", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "OpenAI transcription failed." }), {
        headers: { "Content-Type": "application/json" },
        status: 502,
      }),
    );
    const client = createAutomationClient({
      automationServiceUrl: "http://automation-service.railway.internal:8000",
      fetchFn,
    });

    await expect(
      client.processTranscription({
        asset_url: "https://cdn.example.com/audio.mp4",
        job_id: "job-123",
        language: "auto",
        source_platform: "youtube",
        stream_id: "stream-123",
      }),
    ).rejects.toThrow(
      'automation-service transcription failed with 502: {"detail":"OpenAI transcription failed."}',
    );
  });
});
