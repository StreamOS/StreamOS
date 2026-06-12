import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

type CronUnauthorizedBody = {
  error: "unauthorized";
  ok: false;
};

export function requireCronAuth(request: NextRequest): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (!cronSecret) {
    return createUnauthorizedResponse();
  }

  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return createUnauthorizedResponse();
  }

  const receivedSecret = authorization.slice("Bearer ".length);

  if (!hasMatchingSecret(receivedSecret, cronSecret)) {
    return createUnauthorizedResponse();
  }

  return null;
}

function createUnauthorizedResponse(): NextResponse {
  const body: CronUnauthorizedBody = {
    error: "unauthorized",
    ok: false,
  };

  return NextResponse.json(body, { status: 401 });
}

function hasMatchingSecret(receivedSecret: string, expectedSecret: string) {
  const received = Buffer.from(receivedSecret, "utf8");
  const expected = Buffer.from(expectedSecret, "utf8");

  if (received.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(received, expected);
}
