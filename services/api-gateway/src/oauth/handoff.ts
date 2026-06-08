import { createHmac, timingSafeEqual } from "node:crypto";

export type OAuthHandoffPayload = {
  creator_id: string;
  exp: number;
  return_to?: string;
  user_id: string;
};

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.byteLength === rightBuffer.byteLength &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function createOAuthHandoffToken(
  payload: OAuthHandoffPayload,
  secret: string,
): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  const signature = signPayload(encodedPayload, secret);

  return `${encodedPayload}.${signature}`;
}

export function verifyOAuthHandoffToken({
  now,
  secret,
  token,
}: {
  now: () => number;
  secret: string | undefined;
  token: string | undefined;
}): OAuthHandoffPayload {
  if (!secret || !token) {
    throw new Error("OAuth user handoff token is required.");
  }

  const [encodedPayload, receivedSignature] = token.split(".");

  if (!encodedPayload || !receivedSignature) {
    throw new Error("OAuth user handoff token is malformed.");
  }

  const expectedSignature = signPayload(encodedPayload, secret);

  if (!constantTimeEqual(receivedSignature, expectedSignature)) {
    throw new Error("OAuth user handoff signature is invalid.");
  }

  const payload = JSON.parse(
    Buffer.from(encodedPayload, "base64url").toString("utf8"),
  ) as Partial<OAuthHandoffPayload>;

  if (
    !payload.user_id ||
    !payload.creator_id ||
    !payload.exp ||
    payload.exp <= now()
  ) {
    throw new Error("OAuth user handoff token is expired or incomplete.");
  }

  return {
    creator_id: payload.creator_id,
    exp: payload.exp,
    return_to: payload.return_to,
    user_id: payload.user_id,
  };
}
