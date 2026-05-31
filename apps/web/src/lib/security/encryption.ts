import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ENCRYPTION_VERSION = "v1";
const KEY_BYTE_LENGTH = 32;
const IV_BYTE_LENGTH = 12;

function decodeKey(value: string): Buffer {
  if (value.startsWith("base64:")) {
    return Buffer.from(value.slice("base64:".length), "base64");
  }

  if (value.startsWith("hex:")) {
    return Buffer.from(value.slice("hex:".length), "hex");
  }

  return Buffer.from(value, "base64");
}

export function assertEncryptionConfigured() {
  getEncryptionKey();
}

export function encryptSecret(value: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_BYTE_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    ENCRYPTION_VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptSecret(payload: string): string {
  const [version, iv, authTag, ciphertext] = payload.split(":");

  if (version !== ENCRYPTION_VERSION || !iv || !authTag || !ciphertext) {
    throw new Error("Invalid encrypted secret payload.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(authTag, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function getEncryptionKey(): Buffer {
  const rawKey = process.env.APP_ENCRYPTION_KEY?.trim();

  if (!rawKey) {
    throw new Error("APP_ENCRYPTION_KEY is required to store platform tokens.");
  }

  const key = decodeKey(rawKey);

  if (key.length !== KEY_BYTE_LENGTH) {
    throw new Error("APP_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  }

  return key;
}
