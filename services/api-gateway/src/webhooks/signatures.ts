import {
  verifyTwitchSignature,
  verifyYouTubeSignature,
} from "../lib/webhook-signatures.js";

export function verifyTwitchEventSubSignature({
  messageId,
  rawBody,
  receivedSignature,
  secret,
  timestamp,
}: {
  messageId: string;
  rawBody: Buffer;
  receivedSignature: string;
  secret: string;
  timestamp: string;
}): boolean {
  return verifyTwitchSignature(
    messageId,
    timestamp,
    rawBody,
    receivedSignature,
    secret,
  );
}

export function verifyWebSubSignature({
  rawBody,
  receivedSignature,
  secret,
}: {
  rawBody: Buffer;
  receivedSignature: string;
  secret: string;
}): boolean {
  return verifyYouTubeSignature(rawBody, receivedSignature, secret);
}
