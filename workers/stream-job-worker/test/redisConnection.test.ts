import assert from "node:assert/strict";
import test from "node:test";

import { createRedisConnectionOptions } from "../src/redisConnection.js";

test("createRedisConnectionOptions parses Upstash TLS URLs for BullMQ", () => {
  const connection = createRedisConnectionOptions(
    "rediss://default:secret@example.upstash.io:6379",
  );

  assert.deepEqual(connection, {
    db: undefined,
    host: "example.upstash.io",
    password: "secret",
    port: 6379,
    tls: {},
    username: "default",
  });
});

test("createRedisConnectionOptions rejects non-Redis protocols", () => {
  assert.throws(
    () => createRedisConnectionOptions("https://example.upstash.io"),
    /REDIS_URL must use the redis:\/\/ or rediss:\/\/ protocol/,
  );
});
