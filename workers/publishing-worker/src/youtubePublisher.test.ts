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

const resolvingPublicCdnResolver = (hostname: string): readonly string[] => {
  if (hostname === "cdn.example.com") {
    return ["93.184.216.34"];
  }

  throw new Error(`Unexpected hostname ${hostname}`);
};

void test("publishYouTubeVideo downloads allowed public CDN asset URLs before upload", async () => {
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

void test("publishYouTubeVideo rejects unsafe publishable asset URLs before download", async (t) => {
  const cases = [
    {
      name: "http scheme",
      url: "http://cdn.example.com/videos/clip.mp4",
    },
    {
      name: "localhost hostname",
      url: "https://localhost/videos/clip.mp4",
    },
    {
      name: "loopback IPv4",
      url: "https://127.0.0.1/latest/meta-data",
    },
    {
      name: "private IPv4",
      url: "https://10.0.0.5/videos/clip.mp4",
    },
    {
      name: "link-local metadata IPv4",
      url: "https://169.254.169.254/latest/meta-data",
    },
    {
      name: "documentation IPv4",
      url: "https://192.0.2.1/videos/clip.mp4",
    },
    {
      name: "benchmark IPv4",
      url: "https://198.18.0.1/videos/clip.mp4",
    },
    {
      name: "test-net IPv4",
      url: "https://198.51.100.7/videos/clip.mp4",
    },
    {
      name: "reserved documentation IPv4",
      url: "https://203.0.113.9/videos/clip.mp4",
    },
    {
      name: "private IPv6",
      url: "https://[fc00::1]/videos/clip.mp4",
    },
    {
      name: "link-local IPv6",
      url: "https://[fe80::1]/videos/clip.mp4",
    },
    {
      name: "documentation IPv6",
      url: "https://[2001:db8::1]/videos/clip.mp4",
    },
    {
      name: "expanded documentation IPv6",
      url: "https://[3fff::1]/videos/clip.mp4",
    },
    {
      name: "reserved IPv6",
      url: "https://[2001::1]/videos/clip.mp4",
    },
    {
      name: "internal hostname",
      url: "https://assets.railway.internal/videos/clip.mp4",
    },
    {
      name: "local hostname",
      url: "https://assets.local/videos/clip.mp4",
    },
    {
      name: "URL credentials",
      url: "https://user:password@cdn.example.com/videos/clip.mp4",
    },
    {
      name: "unexpected port",
      url: "https://cdn.example.com:8443/videos/clip.mp4",
    },
  ] as const;

  for (const testCase of cases) {
    await t.test(testCase.name, async () => {
      const calls: FetchCall[] = [];
      const fetchFn: typeof fetch = async (input, init) => {
        calls.push({ init, url: input.toString() });
        return new Response(new Uint8Array([1]), { status: 200 });
      };

      await assertUnsafeAssetUrlRejection({
        assetUrl: testCase.url,
        fetchFn,
      });

      assert.deepEqual(calls, []);
    });
  }
});

void test("publishYouTubeVideo rejects redirects to unsafe publishable asset URLs", async (t) => {
  const cases = [
    {
      location: "https://10.0.0.5/admin",
      name: "private IPv4 redirect",
    },
    {
      location: "https://localhost/admin",
      name: "localhost redirect",
    },
  ] as const;

  for (const testCase of cases) {
    await t.test(testCase.name, async () => {
      const calls: FetchCall[] = [];
      const fetchFn: typeof fetch = async (input, init) => {
        const url = input.toString();
        calls.push({ init, url });

        if (url === "https://cdn.example.com/videos/clip.mp4") {
          return new Response(null, {
            headers: { location: testCase.location },
            status: 302,
          });
        }

        throw new Error(`Unexpected fetch URL ${url}`);
      };

      await assertUnsafeAssetUrlRejection({
        assetUrl: "https://cdn.example.com/videos/clip.mp4",
        assetUrlResolver: resolvingPublicCdnResolver,
        fetchFn,
      });

      assert.deepEqual(
        calls.map((call) => call.url),
        ["https://cdn.example.com/videos/clip.mp4"],
      );
      assert.equal(calls[0]?.init?.redirect, "manual");
    });
  }
});

void test("publishYouTubeVideo rejects redirect loops before upload", async () => {
  const calls: FetchCall[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    const url = input.toString();
    calls.push({ init, url });

    if (url === "https://cdn.example.com/videos/loop.mp4") {
      return new Response(null, {
        headers: { location: "https://cdn.example.com/videos/loop.mp4" },
        status: 302,
      });
    }

    throw new Error(`Unexpected fetch URL ${url}`);
  };

  await assertUnsafeAssetUrlRejection({
    assetUrl: "https://cdn.example.com/videos/loop.mp4",
    assetUrlResolver: resolvingPublicCdnResolver,
    fetchFn,
  });

  assert.equal(calls.length, 5);
  assert.ok(calls.every((call) => call.init?.redirect === "manual"));
});

void test("publishYouTubeVideo classifies asset fetch timeouts without upload", async () => {
  const calls: FetchCall[] = [];
  const fetchFn: typeof fetch = (async (input, init) => {
    const url = input.toString();
    calls.push({ init, url });

    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("Aborted", "AbortError"));
      });
    });
  }) as typeof fetch;

  await assertUnsafeAssetUrlRejection({
    assetFetchTimeoutMs: 5,
    assetUrl: "https://cdn.example.com/videos/clip.mp4",
    assetUrlResolver: resolvingPublicCdnResolver,
    fetchFn,
  });

  assert.deepEqual(
    calls.map((call) => call.url),
    ["https://cdn.example.com/videos/clip.mp4"],
  );
  assert.equal(calls[0]?.init?.redirect, "manual");
});

void test("publishYouTubeVideo times out when asset body never ends", async () => {
  const calls: FetchCall[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    const url = input.toString();
    calls.push({ init, url });

    if (url === "https://cdn.example.com/videos/never-ends.mp4") {
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([1]));
          },
        }),
        {
          headers: { "content-type": "video/mp4" },
          status: 200,
        },
      );
    }

    throw new Error(`Unexpected fetch URL ${url}`);
  };

  await assertUnsafeAssetUrlRejection({
    assetFetchTimeoutMs: 5,
    assetUrl: "https://cdn.example.com/videos/never-ends.mp4",
    assetUrlResolver: resolvingPublicCdnResolver,
    fetchFn,
  });

  assert.deepEqual(
    calls.map((call) => call.url),
    ["https://cdn.example.com/videos/never-ends.mp4"],
  );
  assert.equal(calls[0]?.init?.redirect, "manual");
});

void test("publishYouTubeVideo times out when asset body is too slow", async () => {
  const calls: FetchCall[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    const url = input.toString();
    calls.push({ init, url });

    if (url === "https://cdn.example.com/videos/slow-body.mp4") {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      return new Response(
        new ReadableStream<Uint8Array>({
          cancel() {
            if (timeoutId) {
              clearTimeout(timeoutId);
            }
          },
          start(controller) {
            timeoutId = setTimeout(() => {
              controller.enqueue(new Uint8Array([1]));
              controller.close();
            }, 50);
          },
        }),
        {
          headers: { "content-type": "video/mp4" },
          status: 200,
        },
      );
    }

    throw new Error(`Unexpected fetch URL ${url}`);
  };

  await assertUnsafeAssetUrlRejection({
    assetFetchTimeoutMs: 5,
    assetUrl: "https://cdn.example.com/videos/slow-body.mp4",
    assetUrlResolver: resolvingPublicCdnResolver,
    fetchFn,
  });

  assert.deepEqual(
    calls.map((call) => call.url),
    ["https://cdn.example.com/videos/slow-body.mp4"],
  );
  assert.equal(calls[0]?.init?.redirect, "manual");
});

void test("publishYouTubeVideo rejects oversized assets before reading the body", async () => {
  const calls: FetchCall[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    const url = input.toString();
    calls.push({ init, url });

    if (url === "https://cdn.example.com/videos/huge.mp4") {
      return new Response(new Uint8Array([1]), {
        headers: {
          "content-length": String(513 * 1024 * 1024),
          "content-type": "video/mp4",
        },
        status: 200,
      });
    }

    throw new Error(`Unexpected fetch URL ${url}`);
  };

  await assert.rejects(
    () =>
      publishYouTubeVideo({
        accessToken: "access-token",
        assetUrl: "https://cdn.example.com/videos/huge.mp4",
        assetUrlResolver: resolvingPublicCdnResolver,
        description: "Description",
        fetchFn,
        hashtags: [],
        title: "Title",
        visibility: "private",
      }),
    (error) =>
      error instanceof YouTubePublishError &&
      error.code === "publishable_asset_too_large" &&
      error.retryable === false,
  );

  assert.deepEqual(
    calls.map((call) => call.url),
    ["https://cdn.example.com/videos/huge.mp4"],
  );
  assert.equal(calls[0]?.init?.redirect, "manual");
});

void test("publishYouTubeVideo rejects assets that exceed the body read limit without content length", async () => {
  const calls: FetchCall[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    const url = input.toString();
    calls.push({ init, url });

    if (url === "https://cdn.example.com/videos/body-limit.mp4") {
      return new Response(new Uint8Array([1, 2]), {
        headers: { "content-type": "video/mp4" },
        status: 200,
      });
    }

    throw new Error(`Unexpected fetch URL ${url}`);
  };

  await assert.rejects(
    () =>
      publishYouTubeVideo({
        accessToken: "access-token",
        assetMaxBytes: 1,
        assetUrl: "https://cdn.example.com/videos/body-limit.mp4",
        assetUrlResolver: resolvingPublicCdnResolver,
        description: "Description",
        fetchFn,
        hashtags: [],
        title: "Title",
        visibility: "private",
      }),
    (error) =>
      error instanceof YouTubePublishError &&
      error.code === "publishable_asset_too_large" &&
      error.retryable === false,
  );

  assert.deepEqual(
    calls.map((call) => call.url),
    ["https://cdn.example.com/videos/body-limit.mp4"],
  );
  assert.equal(calls[0]?.init?.redirect, "manual");
});

async function assertUnsafeAssetUrlRejection({
  assetFetchTimeoutMs,
  assetUrl,
  assetUrlResolver,
  fetchFn,
}: {
  assetFetchTimeoutMs?: number;
  assetUrl: string;
  assetUrlResolver?: (hostname: string) => readonly string[];
  fetchFn: typeof fetch;
}): Promise<void> {
  await assert.rejects(
    () =>
      publishYouTubeVideo({
        accessToken: "access-token",
        assetFetchTimeoutMs,
        assetUrl,
        assetUrlResolver,
        description: "Description",
        fetchFn,
        hashtags: [],
        title: "Title",
        visibility: "private",
      }),
    (error) =>
      error instanceof YouTubePublishError &&
      error.code === "publishable_asset_url_unsafe" &&
      error.retryable === false &&
      !error.message.includes(assetUrl),
  );
}
