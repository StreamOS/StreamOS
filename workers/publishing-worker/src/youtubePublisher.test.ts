import assert from "node:assert/strict";
import { test } from "node:test";

import {
  publishYouTubeVideo,
  YouTubePublishError,
} from "./youtubePublisher.js";

type FetchCall = {
  init?: RequestInit;
  url: string;
};

const publicCdnResolver = (hostname: string): readonly string[] => {
  assert.equal(hostname, "cdn.example.com");
  return ["93.184.216.34"];
};

test("publishYouTubeVideo downloads allowed public CDN asset URLs before upload", async () => {
  const calls: FetchCall[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    const url = input.toString();
    calls.push({ init, url });

    if (url === "https://cdn.example.com/videos/clip.mp4") {
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
  };

  const result = await publishYouTubeVideo({
    accessToken: "access-token",
    assetUrl: "https://cdn.example.com/videos/clip.mp4",
    assetUrlResolver: publicCdnResolver,
    description: "Description",
    fetchFn,
    hashtags: ["streamos"],
    title: "Title",
    visibility: "private",
  });

  assert.deepEqual(result, {
    externalPostId: "youtube-video-123",
    externalUrl: "https://www.youtube.com/watch?v=youtube-video-123",
  });
  assert.equal(calls[0]?.url, "https://cdn.example.com/videos/clip.mp4");
  assert.equal(calls[0]?.init?.redirect, "manual");
  assert.equal(calls.length, 3);
});

test("publishYouTubeVideo rejects direct private publishable asset URLs before download", async () => {
  const calls: FetchCall[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    calls.push({ init, url: input.toString() });
    return new Response(new Uint8Array([1]), { status: 200 });
  };

  await assert.rejects(
    () =>
      publishYouTubeVideo({
        accessToken: "access-token",
        assetUrl: "https://127.0.0.1/latest/meta-data",
        description: "Description",
        fetchFn,
        hashtags: [],
        title: "Title",
        visibility: "private",
      }),
    (error) =>
      error instanceof YouTubePublishError &&
      error.code === "publishable_asset_url_unsafe" &&
      error.retryable === false,
  );

  assert.deepEqual(calls, []);
});

test("publishYouTubeVideo rejects redirects to private publishable asset URLs", async () => {
  const calls: FetchCall[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    const url = input.toString();
    calls.push({ init, url });

    if (url === "https://cdn.example.com/videos/clip.mp4") {
      return new Response(null, {
        headers: { location: "https://10.0.0.5/admin" },
        status: 302,
      });
    }

    throw new Error(`Unexpected fetch URL ${url}`);
  };

  await assert.rejects(
    () =>
      publishYouTubeVideo({
        accessToken: "access-token",
        assetUrl: "https://cdn.example.com/videos/clip.mp4",
        assetUrlResolver: publicCdnResolver,
        description: "Description",
        fetchFn,
        hashtags: [],
        title: "Title",
        visibility: "private",
      }),
    (error) =>
      error instanceof YouTubePublishError &&
      error.code === "publishable_asset_url_unsafe" &&
      error.retryable === false,
  );

  assert.deepEqual(
    calls.map((call) => call.url),
    ["https://cdn.example.com/videos/clip.mp4"],
  );
  assert.equal(calls[0]?.init?.redirect, "manual");
});
