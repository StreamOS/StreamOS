import type { Request } from "express";
import { describe, expect, it } from "vitest";

import { createRateLimitKey, getRateLimitClientIp } from "./rate-limit-keys.js";

function createRequest({
  expressIp,
  expressIps = [],
  socketIp = "127.0.0.1",
}: {
  expressIp?: string;
  expressIps?: string[];
  socketIp?: string;
} = {}): Request {
  return {
    ip: expressIp,
    ips: expressIps,
    socket: {
      remoteAddress: socketIp,
    },
  } as unknown as Request;
}

describe("proxy-aware rate limit keys", () => {
  it("uses the socket source without X-Forwarded-For", () => {
    const request = createRequest();

    expect(getRateLimitClientIp(request)).toBe("127.0.0.1");
    expect(createRateLimitKey(request, "oauth", "connect", "kick")).toBe(
      "oauth:connect:kick:127.0.0.1",
    );
  });

  it("keeps the key stable for single X-Forwarded-For under trust proxy", () => {
    const request = createRequest({
      expressIp: "198.51.100.10",
      expressIps: ["198.51.100.10"],
    });

    expect(createRateLimitKey(request, "webhook", "provider")).toBe(
      "webhook:provider:127.0.0.1",
    );
  });

  it("keeps the key stable for rotating spoofed X-Forwarded-For values", () => {
    const firstRequest = createRequest({
      expressIp: "198.51.100.10",
      expressIps: ["198.51.100.10"],
    });
    const secondRequest = createRequest({
      expressIp: "198.51.100.11",
      expressIps: ["198.51.100.11"],
    });

    expect(createRateLimitKey(firstRequest, "youtube", "websub")).toBe(
      createRateLimitKey(secondRequest, "youtube", "websub"),
    );
  });

  it("ignores multi-hop X-Forwarded-For chains for the rate-limit key", () => {
    const request = createRequest({
      expressIp: "203.0.113.7",
      expressIps: ["203.0.113.7", "198.51.100.10"],
    });

    expect(createRateLimitKey(request, "twitch", "eventsub")).toBe(
      "twitch:eventsub:127.0.0.1",
    );
  });

  it("falls back conservatively when the socket address is unavailable", () => {
    const request = {
      ip: "198.51.100.10",
      ips: ["198.51.100.10"],
      socket: {},
    } as unknown as Request;

    expect(getRateLimitClientIp(request)).toBe("0.0.0.0");
    expect(createRateLimitKey(request, "fallback")).toBe("fallback:0.0.0.0");
  });
});
