import { createHmac, timingSafeEqual } from "node:crypto";

type WebSubAlgorithm = "sha1" | "sha256" | "sha384" | "sha512";

const SUPPORTED_WEBSUB_ALGORITHMS = new Set<WebSubAlgorithm>([
  "sha1",
  "sha256",
  "sha384",
  "sha512",
]);

function timingSafeStringEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.byteLength === rightBuffer.byteLength &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

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
  const expectedSignature = `sha256=${createHmac("sha256", secret)
    .update(messageId)
    .update(timestamp)
    .update(rawBody)
    .digest("hex")}`;

  return timingSafeStringEqual(expectedSignature, receivedSignature);
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
  const [algorithm, digest] = receivedSignature.split("=");

  if (
    !algorithm ||
    !digest ||
    !SUPPORTED_WEBSUB_ALGORITHMS.has(algorithm as WebSubAlgorithm)
  ) {
    return false;
  }

  const expectedSignature = `${algorithm}=${createHmac(algorithm, secret)
    .update(rawBody)
    .digest("hex")}`;

  return timingSafeStringEqual(expectedSignature, receivedSignature);
}
