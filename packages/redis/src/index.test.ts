import { describe, expect, it } from "vitest";

import {
  assertRedisTls,
  parseRedisConnectionOptions,
  redactRedisUrl,
  RedisTlsError,
} from "./index.js";

describe("assertRedisTls", () => {
  it("allows rediss:// in production", () => {
    expect(() =>
      assertRedisTls("rediss://default:token@example.upstash.io:6379", {
        nodeEnv: "production",
      }),
    ).not.toThrow();
  });

  it("rejects redis:// in production", () => {
    expect(() =>
      assertRedisTls("redis://default:token@localhost:6379", {
        nodeEnv: "production",
      }),
    ).toThrow(RedisTlsError);
  });

  it("rejects missing Redis URLs in production", () => {
    expect(() => assertRedisTls(undefined, { nodeEnv: "production" })).toThrow(
      RedisTlsError,
    );
  });

  it("allows redis:// in development and test", () => {
    expect(() =>
      assertRedisTls("redis://localhost:6379", { nodeEnv: "development" }),
    ).not.toThrow();
    expect(() =>
      assertRedisTls("redis://localhost:6379", { nodeEnv: "test" }),
    ).not.toThrow();
  });

  it("redacts Redis credentials in error output", () => {
    const redactedUrl = redactRedisUrl(
      "redis://default:supersecret@example.upstash.io:6379",
    );

    expect(redactedUrl).toContain("***");
    expect(redactedUrl).not.toContain("supersecret");
  });
});

describe("parseRedisConnectionOptions", () => {
  it("parses rediss:// URLs into BullMQ-compatible options", () => {
    expect(
      parseRedisConnectionOptions(
        "rediss://default:secret@example.upstash.io:6379/0",
        { nodeEnv: "production" },
      ),
    ).toEqual({
      db: 0,
      host: "example.upstash.io",
      password: "secret",
      port: 6379,
      tls: {},
      username: "default",
    });
  });

  it("rejects non-Redis protocols", () => {
    expect(() =>
      parseRedisConnectionOptions("https://example.upstash.io", {
        nodeEnv: "test",
      }),
    ).toThrow("REDIS_URL must use the redis:// or rediss:// protocol.");
  });
});
