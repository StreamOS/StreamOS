import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_TWITCH_MAX_AGE_SECONDS = 600;

function timingSafeStringEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  return (
    leftBuffer.byteLength === rightBuffer.byteLength &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function hasExpectedSignatureFormat(
  signature: string,
  algorithm: "sha1" | "sha256",
): boolean {
  const digest = signature.slice(`${algorithm}=`.length);

  return (
    signature.startsWith(`${algorithm}=`) &&
    digest.length > 0 &&
    /^[0-9a-f]+$/iu.test(digest)
  );
}

export function verifyTwitchSignature(
  messageId: string,
  timestamp: string,
  rawBody: Buffer,
  signature: string,
  secret: string,
): boolean {
  if (
    !messageId ||
    !timestamp ||
    !secret ||
    !hasExpectedSignatureFormat(signature, "sha256")
  ) {
    return false;
  }

  const expectedSignature = `sha256=${createHmac("sha256", secret)
    .update(messageId)
    .update(timestamp)
    .update(rawBody)
    .digest("hex")}`;

  return timingSafeStringEqual(expectedSignature, signature);
}

export function verifyYouTubeSignature(
  rawBody: Buffer,
  signature: string,
  secret: string,
): boolean {
  if (!secret || !hasExpectedSignatureFormat(signature, "sha1")) {
    return false;
  }

  const expectedSignature = `sha1=${createHmac("sha1", secret)
    .update(rawBody)
    .digest("hex")}`;

  return timingSafeStringEqual(expectedSignature, signature);
}

export function isTwitchTimestampFresh(
  timestamp: string,
  maxAgeSeconds = DEFAULT_TWITCH_MAX_AGE_SECONDS,
): boolean {
  const timestampMs = Date.parse(timestamp);

  if (!Number.isFinite(timestampMs) || maxAgeSeconds <= 0) {
    return false;
  }

  return Math.abs(Date.now() - timestampMs) <= maxAgeSeconds * 1000;
}
