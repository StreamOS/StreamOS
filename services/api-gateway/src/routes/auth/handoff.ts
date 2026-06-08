import { SignJWT, jwtVerify } from "jose";
import express from "express";
import type { Request, Response, Router } from "express";
import type {
  GatewayHandoffSessionResponse,
  GatewayHandoffTokenClaims,
} from "@streamos/types";

const HANDOFF_ISSUER = "streamos-web";
const HANDOFF_AUDIENCE = "streamos-api-gateway";
const GATEWAY_SESSION_ISSUER = "streamos-api-gateway";
const GATEWAY_SESSION_AUDIENCE = "streamos-gateway";
const GATEWAY_SESSION_TTL_SECONDS = 60 * 60;
const KEY_BYTE_LENGTH = 32;

type HandoffRequestBody = {
  token?: unknown;
};

type HandoffErrorCode =
  | "handoff_invalid"
  | "handoff_missing"
  | "handoff_setup_missing";

export function createAuthHandoffRouter(): Router {
  const router = express.Router();

  router.post("/handoff", async (request, response) => {
    await handleHandoff(getBodyToken(request), response);
  });

  router.get("/handoff", async (request, response) => {
    await handleHandoff(getQueryToken(request), response);
  });

  return router;
}

async function handleHandoff(
  token: string | undefined,
  response: Response,
): Promise<void> {
  if (!token) {
    sendHandoffError(response, 401, "handoff_missing", "Token is required.");
    return;
  }

  try {
    const handoffKey = getAppSigningKey();
    const { payload } = await jwtVerify<GatewayHandoffTokenClaims>(
      token,
      handoffKey,
      {
        algorithms: ["HS256"],
        audience: HANDOFF_AUDIENCE,
        issuer: HANDOFF_ISSUER,
      },
    );
    const userId = getUserId(payload);

    if (!userId) {
      sendHandoffError(
        response,
        401,
        "handoff_invalid",
        "Token is missing userid.",
      );
      return;
    }

    const issuedAt = Math.floor(Date.now() / 1000);
    const gatewaySessionToken = await new SignJWT({
      creator_id: payload.creator_id,
      user_id: userId,
      userid: userId,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer(GATEWAY_SESSION_ISSUER)
      .setAudience(GATEWAY_SESSION_AUDIENCE)
      .setSubject(userId)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + GATEWAY_SESSION_TTL_SECONDS)
      .setJti(crypto.randomUUID())
      .sign(getGatewaySessionSigningKey());

    const session: GatewayHandoffSessionResponse = {
      expires_in: GATEWAY_SESSION_TTL_SECONDS,
      gateway_session_token: gatewaySessionToken,
    };

    response.status(200).json(session);
  } catch (error) {
    logHandoffFailure(error);
    const isSetupError =
      error instanceof Error &&
      (error.message.includes("APP_ENCRYPTION_KEY") ||
        error.message.includes("API_GATEWAY_SECRET"));

    sendHandoffError(
      response,
      401,
      isSetupError ? "handoff_setup_missing" : "handoff_invalid",
      isSetupError
        ? "Gateway handoff is not configured."
        : "Token is invalid or expired.",
    );
  }
}

function getBodyToken(request: Request): string | undefined {
  const body = request.body as HandoffRequestBody | undefined;

  return typeof body?.token === "string" ? body.token : undefined;
}

function getQueryToken(request: Request): string | undefined {
  const token = request.query.token;
  const firstToken = Array.isArray(token) ? token[0] : token;

  return typeof firstToken === "string" ? firstToken : undefined;
}

function getUserId(payload: GatewayHandoffTokenClaims): string | undefined {
  if (typeof payload.userid === "string" && payload.userid.length > 0) {
    return payload.userid;
  }

  return typeof payload.user_id === "string" && payload.user_id.length > 0
    ? payload.user_id
    : undefined;
}

function sendHandoffError(
  response: Response,
  status: number,
  code: HandoffErrorCode,
  error: string,
) {
  response.status(status).json({ code, error });
}

function getAppSigningKey(): Uint8Array {
  const rawKey = process.env.APP_ENCRYPTION_KEY?.trim();

  if (!rawKey) {
    throw new Error("APP_ENCRYPTION_KEY is required for handoff verification.");
  }

  const key = decodeSecretKey(rawKey);

  if (key.byteLength !== KEY_BYTE_LENGTH) {
    throw new Error("APP_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  }

  return key;
}

function getGatewaySessionSigningKey(): Uint8Array {
  const rawSecret = process.env.API_GATEWAY_SECRET?.trim();

  if (!rawSecret) {
    throw new Error("API_GATEWAY_SECRET is required for gateway sessions.");
  }

  return new TextEncoder().encode(rawSecret);
}

function decodeSecretKey(value: string): Uint8Array {
  if (value.startsWith("base64:")) {
    return decodeBase64(value.slice("base64:".length));
  }

  if (value.startsWith("hex:")) {
    return decodeHex(value.slice("hex:".length));
  }

  return decodeBase64(value);
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function decodeHex(value: string): Uint8Array {
  if (value.length % 2 !== 0) {
    throw new Error("Hex encoded APP_ENCRYPTION_KEY has invalid length.");
  }

  const bytes = new Uint8Array(value.length / 2);

  for (let index = 0; index < value.length; index += 2) {
    const byte = Number.parseInt(value.slice(index, index + 2), 16);

    if (!Number.isFinite(byte)) {
      throw new Error("Hex encoded APP_ENCRYPTION_KEY is invalid.");
    }

    bytes[index / 2] = byte;
  }

  return bytes;
}

function logHandoffFailure(error: unknown) {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  const message = error instanceof Error ? error.message : "Unknown error";

  console.warn(
    JSON.stringify({
      error: message,
      event: "auth_handoff_failed",
      service: "api-gateway",
    }),
  );
}
