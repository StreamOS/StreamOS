import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isTwitchTimestampFresh,
  verifyTwitchSignature,
  verifyYouTubeSignature,
} from "./webhook-signatures.js";

describe("webhook signatures", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("verifies valid Twitch EventSub HMAC-SHA256 signatures", () => {
    const messageId = "message-1";
    const timestamp = "2026-06-06T10:00:00.000Z";
    const rawBody = Buffer.from('{"challenge":"abc"}');
    const secret = "twitch-webhook-secret";
    const signature = `sha256=${createHmac("sha256", secret)
      .update(messageId)
      .update(timestamp)
      .update(rawBody)
      .digest("hex")}`;

    expect(
      verifyTwitchSignature(messageId, timestamp, rawBody, signature, secret),
    ).toBe(true);
  });

  it("rejects invalid Twitch EventSub signatures", () => {
    expect(
      verifyTwitchSignature(
        "message-1",
        "2026-06-06T10:00:00.000Z",
        Buffer.from('{"ok":true}'),
        "sha256=bad",
        "twitch-webhook-secret",
      ),
    ).toBe(false);
  });

  it("checks Twitch timestamp staleness", () => {
    vi.setSystemTime(new Date("2026-06-06T10:00:00.000Z"));

    expect(isTwitchTimestampFresh("2026-06-06T09:59:00.000Z")).toBe(true);
    expect(isTwitchTimestampFresh("2026-06-06T09:49:00.000Z")).toBe(false);
    expect(isTwitchTimestampFresh("not-a-date")).toBe(false);
  });

  it("verifies valid YouTube WebSub HMAC-SHA1 signatures", () => {
    const rawBody = Buffer.from("<feed><entry /></feed>");
    const secret = "youtube-webhook-secret";
    const signature = `sha1=${createHmac("sha1", secret)
      .update(rawBody)
      .digest("hex")}`;

    expect(verifyYouTubeSignature(rawBody, signature, secret)).toBe(true);
  });

  it("rejects invalid YouTube WebSub signatures and algorithms", () => {
    const rawBody = Buffer.from("<feed><entry /></feed>");
    const secret = "youtube-webhook-secret";
    const sha256Signature = `sha256=${createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex")}`;

    expect(verifyYouTubeSignature(rawBody, "sha1=bad", secret)).toBe(false);
    expect(verifyYouTubeSignature(rawBody, sha256Signature, secret)).toBe(
      false,
    );
  });
});
