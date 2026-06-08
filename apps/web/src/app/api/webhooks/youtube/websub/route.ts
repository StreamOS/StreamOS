import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { type WebSubSubscription } from "@streamos/youtube-websub";
import {
  getWebSubMetadata,
  mergeWebSubMetadata,
  updateConnectionWebSubMetadata,
  upsertSubscription,
} from "@/lib/integrations/youtube-websub";
import { createServiceRoleAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const topic = request.nextUrl.searchParams.get("hub.topic");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");
  const verifyToken = request.nextUrl.searchParams.get("hub.verify_token");
  const leaseSeconds = parseLeaseSeconds(
    request.nextUrl.searchParams.get("hub.lease_seconds"),
  );

  if (mode !== "subscribe" && mode !== "unsubscribe") {
    return NextResponse.json(
      {
        error: "invalid_youtube_websub_mode",
        message: "hub.mode must be subscribe or unsubscribe.",
      },
      { status: 400 },
    );
  }

  if (!topic || !challenge) {
    return NextResponse.json(
      {
        error: "invalid_youtube_websub_challenge",
        message: "hub.topic and hub.challenge are required.",
      },
      { status: 400 },
    );
  }

  if (!hasValidVerifyToken(verifyToken)) {
    return NextResponse.json(
      {
        error: "invalid_youtube_websub_verify_token",
        message: "YouTube WebSub verify token is invalid.",
      },
      { status: 403 },
    );
  }

  try {
    await updateChallengeTracking({
      leaseSeconds,
      mode,
      topic,
    });
  } catch (trackingError) {
    console.error("YouTube WebSub challenge tracking update failed.", {
      topic,
      trackingError,
    });
  }

  return new NextResponse(challenge, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
    status: 200,
  });
}

export async function POST(request: NextRequest) {
  const secret = process.env.YOUTUBE_WEBSUB_SECRET?.trim();

  if (!secret) {
    return NextResponse.json(
      {
        error: "youtube_websub_secret_missing",
        message: "YOUTUBE_WEBSUB_SECRET is required.",
      },
      { status: 503 },
    );
  }

  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get("x-hub-signature");

  if (!signature || !verifyWebSubSignature({ rawBody, secret, signature })) {
    return NextResponse.json(
      {
        error: "invalid_youtube_websub_signature",
        message: "YouTube WebSub signature is invalid.",
      },
      { status: 401 },
    );
  }

  return NextResponse.json(
    {
      received: true,
    },
    { status: 202 },
  );
}

async function updateChallengeTracking({
  leaseSeconds,
  mode,
  topic,
}: {
  leaseSeconds: number;
  mode: "subscribe" | "unsubscribe";
  topic: string;
}) {
  const serviceSupabase = createServiceRoleAdminClient();
  const { data, error } = await serviceSupabase
    .from("youtube_websub_subscriptions")
    .select("channel_connection_id,user_id")
    .eq("topic_url", topic);

  if (error) {
    throw new Error(`WebSub lookup failed: ${error.message}`);
  }

  const subscribedAt = new Date().toISOString();
  const expiresAt = new Date(
    Date.parse(subscribedAt) + leaseSeconds * 1000,
  ).toISOString();
  const status = mode === "subscribe" ? "active" : "unsubscribed";

  const { error: updateError } = await serviceSupabase
    .from("youtube_websub_subscriptions")
    .update({
      expires_at: expiresAt,
      failed_renewals: 0,
      lease_seconds: leaseSeconds,
      status,
      subscribed_at: subscribedAt,
    })
    .eq("topic_url", topic);

  if (updateError) {
    throw new Error(`WebSub tracking update failed: ${updateError.message}`);
  }

  for (const row of data ?? []) {
    const connectionResult = await serviceSupabase
      .from("platform_connections")
      .select("id,user_id,provider_account_id,metadata,status")
      .eq("id", row.channel_connection_id)
      .eq("user_id", row.user_id)
      .maybeSingle();

    if (connectionResult.error || !connectionResult.data) {
      continue;
    }

    const connection = connectionResult.data;
    const websub = getWebSubMetadata(connection.metadata);
    const subscription: WebSubSubscription = {
      expiresAt,
      leaseSeconds,
      status,
      subscribedAt,
      topicUrl: topic,
    };

    await updateConnectionWebSubMetadata({
      connection,
      metadata: mergeWebSubMetadata({
        metadata: connection.metadata,
        patch: {
          failedRenewals: 0,
          lastRenewedAt:
            status === "active" ? subscribedAt : websub.lastRenewedAt,
          subscriptions: upsertSubscription(websub.subscriptions, subscription),
        },
      }),
      serviceSupabase,
    });
  }
}

function parseLeaseSeconds(value: string | null): number {
  const parsed = value ? Number.parseInt(value, 10) : 864_000;

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return 864_000;
  }

  return Math.min(parsed, 864_000);
}

function hasValidVerifyToken(receivedToken: string | null): boolean {
  const expectedToken = process.env.YOUTUBE_WEBSUB_VERIFY_TOKEN?.trim();

  return !expectedToken || receivedToken === expectedToken;
}

function verifyWebSubSignature({
  rawBody,
  secret,
  signature,
}: {
  rawBody: Buffer;
  secret: string;
  signature: string;
}): boolean {
  const [algorithm, receivedDigest] = signature.split("=");

  if (!algorithm || !receivedDigest) {
    return false;
  }

  if (!["sha1", "sha256", "sha384", "sha512"].includes(algorithm)) {
    return false;
  }

  const expectedDigest = createHmac(algorithm, secret)
    .update(rawBody)
    .digest("hex");
  const expected = Buffer.from(expectedDigest, "hex");
  const received = Buffer.from(receivedDigest, "hex");

  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}
