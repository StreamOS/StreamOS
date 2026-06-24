import type { Response } from "express";

export const WEBHOOK_CHALLENGE_MAX_LENGTH = 2048;

export function validateWebhookChallenge(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  if (value.length === 0 || value.length > WEBHOOK_CHALLENGE_MAX_LENGTH) {
    return undefined;
  }

  if (value.includes("\r") || value.includes("\n")) {
    return undefined;
  }

  return value;
}

export function sendPlainTextWebhookChallenge(
  response: Response,
  challenge: string,
) {
  response
    .status(200)
    .set("Content-Type", "text/plain; charset=utf-8")
    .set("X-Content-Type-Options", "nosniff")
    .end(Buffer.from(challenge, "utf8"));
}
