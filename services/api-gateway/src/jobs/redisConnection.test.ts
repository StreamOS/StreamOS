import { describe, expect, it } from "vitest";

import {
  createRedisConnectionOptions,
  getDeterministicJobId,
} from "./redisConnection.js";

describe("redisConnection", () => {
  it("parses Upstash rediss URLs into BullMQ connection options", () => {
    const connection = createRedisConnectionOptions(
      "rediss://default:secret@example.upstash.io:6379",
    );

    expect(connection).toEqual({
      host: "example.upstash.io",
      port: 6379,
      username: "default",
      password: "secret",
      db: undefined,
      tls: {},
    });
  });

  it("rejects non-Redis URLs", () => {
    expect(() =>
      createRedisConnectionOptions("https://example.upstash.io"),
    ).toThrow("REDIS_URL must use the redis:// or rediss:// protocol.");
  });

  it("creates deterministic BullMQ-safe job IDs", () => {
    const firstJobId = getDeterministicJobId("transcription-trigger", "s-1");
    const secondJobId = getDeterministicJobId("transcription-trigger", "s-1");

    expect(firstJobId).toBe(secondJobId);
    expect(firstJobId).toMatch(/^transcription-trigger-/);
    expect(firstJobId).not.toContain(":");
  });
});
