import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createRedisClientOptions,
  createRedisConnectionOptions,
} from "./redisConnection.js";

describe("transcription-worker redis connection", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("parses rediss URLs into BullMQ and ioredis-compatible options", () => {
    const redisUrl = "rediss://default:secret@example.upstash.io:6379/0";

    expect(createRedisConnectionOptions(redisUrl)).toEqual({
      db: 0,
      host: "example.upstash.io",
      password: "secret",
      port: 6379,
      tls: {},
      username: "default",
    });

    expect(createRedisClientOptions(redisUrl)).toEqual({
      db: 0,
      enableReadyCheck: true,
      host: "example.upstash.io",
      maxRetriesPerRequest: null,
      password: "secret",
      port: 6379,
      tls: {},
      username: "default",
    });
  });

  it("rejects redis URLs in production for both worker connection paths", () => {
    const redisUrl = "redis://default:secret@example.upstash.io:6379";
    vi.stubEnv("NODE_ENV", "production");
    const expectedMessage =
      "[StreamOS] Redis TLS is required in production. Got: redis://default:***@example.upstash.io:6379 Expected: rediss:// scheme, for example rediss://default:<token>@<host>:6379";

    expect(() => createRedisConnectionOptions(redisUrl)).toThrow(
      expectedMessage,
    );
    expect(() => createRedisClientOptions(redisUrl)).toThrow(expectedMessage);
  });
});
