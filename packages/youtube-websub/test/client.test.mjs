import assert from "node:assert/strict";
import test from "node:test";

import { subscribe } from "../dist/client.js";

function createCapturingFetch({ status = 202 } = {}) {
  let capturedBody;

  const fetchImpl = async (_input, init) => {
    assert.ok(init?.body instanceof globalThis.URLSearchParams);
    capturedBody = init.body;
    return new globalThis.Response(null, { status });
  };

  return {
    fetchImpl,
    getBody: () => {
      assert.ok(capturedBody);
      return capturedBody;
    },
  };
}

test("subscribe builds the canonical YouTube WebSub callback URL", async () => {
  const { fetchImpl, getBody } = createCapturingFetch();

  await subscribe("youtube-channel-1", {
    fetchImpl,
    secret: "websub-secret",
    streamOsPublicUrl: "https://streamos.example/",
  });

  assert.equal(
    getBody().get("hub.callback"),
    "https://streamos.example/api/webhooks/youtube/websub",
  );
});

test("subscribe handles repeated slashes in the public URL without regex backtracking", async () => {
  const { fetchImpl, getBody } = createCapturingFetch();
  const repeatedSlashUrl = `https://streamos.example/base${"/".repeat(512)}`;

  await subscribe("youtube-channel-1", {
    fetchImpl,
    secret: "websub-secret",
    streamOsPublicUrl: repeatedSlashUrl,
  });

  assert.equal(
    getBody().get("hub.callback"),
    "https://streamos.example/base/api/webhooks/youtube/websub",
  );
});

test("subscribe rejects very long public URLs with generic errors", async () => {
  const sensitiveInput = `https://streamos.example/${"/".repeat(4096)}?token=do-not-reflect`;

  await assert.rejects(
    () =>
      subscribe("youtube-channel-1", {
        fetchImpl: createCapturingFetch().fetchImpl,
        secret: "websub-secret",
        streamOsPublicUrl: sensitiveInput,
      }),
    (error) => {
      assert.ok(error instanceof Error);
      assert.equal(
        error.message,
        "STREAMOS_PUBLIC_URL is invalid for YouTube WebSub.",
      );
      assert.equal(error.message.includes("do-not-reflect"), false);
      assert.equal(error.message.includes(sensitiveInput), false);
      return true;
    },
  );
});

test("subscribe rejects public URLs with query strings without reflecting input", async () => {
  const sensitiveInput = "https://streamos.example?token=do-not-reflect";

  await assert.rejects(
    () =>
      subscribe("youtube-channel-1", {
        fetchImpl: createCapturingFetch().fetchImpl,
        secret: "websub-secret",
        streamOsPublicUrl: sensitiveInput,
      }),
    (error) => {
      assert.ok(error instanceof Error);
      assert.equal(
        error.message,
        "STREAMOS_PUBLIC_URL is invalid for YouTube WebSub.",
      );
      assert.equal(error.message.includes("do-not-reflect"), false);
      assert.equal(error.message.includes(sensitiveInput), false);
      return true;
    },
  );
});
