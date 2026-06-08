import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./encryption";

describe("token encryption", () => {
  const originalEncryptionKey = process.env.APP_ENCRYPTION_KEY;

  afterEach(() => {
    process.env.APP_ENCRYPTION_KEY = originalEncryptionKey;
  });

  it("round-trips encrypted secrets without storing plaintext", () => {
    process.env.APP_ENCRYPTION_KEY = `base64:${randomBytes(32).toString("base64")}`;
    const secret = "twitch-refresh-token";

    const encrypted = encryptSecret(secret);

    expect(encrypted).not.toContain(secret);
    expect(decryptSecret(encrypted)).toBe(secret);
  });
});
