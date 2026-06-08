import "server-only";

import { decryptSecret, encryptSecret } from "@/lib/security/encryption";

export function encryptToken(plaintext: string): string {
  return encryptSecret(plaintext);
}

export function decryptToken(encrypted: string): string {
  return decryptSecret(encrypted);
}
