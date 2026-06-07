import { randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";

const API_GATEWAY_SECRET = "test-api-gateway-secret-123";
const APP_ENCRYPTION_KEY = `base64:${randomBytes(32).toString("base64")}`;
const USER_ID = "11111111-1111-4111-8111-111111111111";
const CREATOR_ID = "22222222-2222-4222-8222-222222222222";

describe("POST /auth/handoff", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.API_GATEWAY_SECRET = API_GATEWAY_SECRET;
    process.env.APP_ENCRYPTION_KEY = APP_ENCRYPTION_KEY;
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns a signed gateway session for a valid web handoff token", async () => {
    const app = createApp({
      apiGatewaySecret: API_GATEWAY_SECRET,
      rateLimit: { enabled: false },
    });
    const token = await createWebHandoffToken();
    const response = await request(app)
      .post("/auth/handoff")
      .send({ token })
      .expect(200);

    expect(response.body).toMatchObject({
      expires_in: 3600,
    });
    expect(typeof response.body.gateway_session_token).toBe("string");

    const { payload } = await jwtVerify(
      response.body.gateway_session_token as string,
      new TextEncoder().encode(API_GATEWAY_SECRET),
      {
        audience: "streamos-gateway",
        issuer: "streamos-api-gateway",
      },
    );

    expect(payload.sub).toBe(USER_ID);
    expect(payload.user_id).toBe(USER_ID);
    expect(payload.creator_id).toBe(CREATOR_ID);
  });

  it("rejects requests without a token", async () => {
    const app = createApp({
      apiGatewaySecret: API_GATEWAY_SECRET,
      rateLimit: { enabled: false },
    });
    const response = await request(app)
      .post("/auth/handoff")
      .send({})
      .expect(401);

    expect(response.body).toEqual({
      code: "handoff_missing",
      error: "Token is required.",
    });
  });

  it("rejects tokens without the streamos-web issuer", async () => {
    const app = createApp({
      apiGatewaySecret: API_GATEWAY_SECRET,
      rateLimit: { enabled: false },
    });
    const token = await createWebHandoffToken({ issuer: "wrong-issuer" });
    const response = await request(app)
      .post("/auth/handoff")
      .send({ token })
      .expect(401);

    expect(response.body).toEqual({
      code: "handoff_invalid",
      error: "Token is invalid or expired.",
    });
  });
});

async function createWebHandoffToken({
  issuer = "streamos-web",
}: {
  issuer?: string;
} = {}) {
  const issuedAt = Math.floor(Date.now() / 1000);

  return new SignJWT({
    creator_id: CREATOR_ID,
    user_id: USER_ID,
    userid: USER_ID,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(issuer)
    .setAudience("streamos-api-gateway")
    .setSubject(USER_ID)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + 60)
    .sign(decodeAppEncryptionKey(APP_ENCRYPTION_KEY));
}

function decodeAppEncryptionKey(value: string): Uint8Array {
  const base64Value = value.startsWith("base64:")
    ? value.slice("base64:".length)
    : value;
  const binary = Buffer.from(base64Value, "base64");

  return new Uint8Array(binary.buffer, binary.byteOffset, binary.byteLength);
}
