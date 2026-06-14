import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ensureCreatorForUser } from "@/lib/supabase/creator";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/creator", () => ({
  ensureCreatorForUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

const mockCreateClient = vi.mocked(createClient);
const mockEnsureCreatorForUser = vi.mocked(ensureCreatorForUser);
const API_GATEWAY_SECRET = "test-api-gateway-secret-123";
const API_GATEWAY_URL = "https://gateway.streamos.test";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const CREATOR_ID = "22222222-2222-4222-8222-222222222222";

describe("GET /api/gateway-connect", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-08T10:00:00.000Z"));

    process.env.API_GATEWAY_SECRET = API_GATEWAY_SECRET;
    process.env.API_GATEWAY_URL = `${API_GATEWAY_URL}/`;

    mockCreateClient.mockResolvedValue(createSupabaseClientMock() as never);
    mockEnsureCreatorForUser.mockResolvedValue({
      avatar_url: null,
      display_name: "Creator",
      handle: null,
      id: CREATOR_ID,
      niche: null,
      onboarding_completed: true,
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.useRealTimers();
  });

  it("returns a provider-specific Kick connect URL with signed handoff claims", async () => {
    const { GET } = await import("./route");
    const response = await GET(createRequest("kick"));
    const payload = await response.json();
    const connectUrl = new URL(payload.connect_url);
    const handoffToken = connectUrl.searchParams.get("handoff");

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      connect_url: expect.any(String),
      gateway_url: API_GATEWAY_URL,
      handoff_token: expect.any(String),
      provider: "kick",
    });
    expect(connectUrl.origin).toBe(API_GATEWAY_URL);
    expect(connectUrl.pathname).toBe("/api/auth/kick/connect");
    expect(handoffToken).toBe(payload.handoff_token);
    expect(verifyHandoffToken(payload.handoff_token)).toMatchObject({
      creator_id: CREATOR_ID,
      exp: new Date("2026-06-08T10:01:00.000Z").getTime(),
      return_to: "https://app.streamos.test/dashboard/platforms",
      user_id: USER_ID,
    });
  });

  it("defaults to YouTube when provider is omitted", async () => {
    const { GET } = await import("./route");
    const response = await GET(createRequest());
    const payload = await response.json();
    const connectUrl = new URL(payload.connect_url);

    expect(response.status).toBe(200);
    expect(payload.provider).toBe("youtube");
    expect(connectUrl.pathname).toBe("/api/auth/youtube/connect");
  });

  it("returns 400 for unsupported gateway OAuth providers", async () => {
    const { GET } = await import("./route");
    const response = await GET(createRequest("instagram"));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      code: "provider_not_supported",
      error: "Gateway OAuth provider is not supported.",
    });
    expect(mockCreateClient).not.toHaveBeenCalled();
    expect(mockEnsureCreatorForUser).not.toHaveBeenCalled();
  });

  it("returns 401 when the Supabase session is missing", async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        user: null,
      }) as never,
    );

    const { GET } = await import("./route");
    const response = await GET(createRequest("kick"));
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toEqual({
      code: "unauthorized",
      error: "An authenticated Supabase session is required.",
    });
    expect(mockEnsureCreatorForUser).not.toHaveBeenCalled();
  });

  it("returns 500 when gateway configuration is missing", async () => {
    delete process.env.API_GATEWAY_URL;

    const { GET } = await import("./route");
    const response = await GET(createRequest("kick"));
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({
      code: "gateway_not_configured",
      error: "API_GATEWAY_URL is not configured.",
    });
  });
});

function createRequest(provider?: string): NextRequest {
  const url = new URL("https://app.streamos.test/api/gateway-connect");

  if (provider) {
    url.searchParams.set("provider", provider);
  }

  return new NextRequest(url);
}

function createSupabaseClientMock({
  user = {
    email: "creator@example.com",
    id: USER_ID,
    user_metadata: {
      name: "Creator",
    },
  },
}: {
  user?: {
    email: string;
    id: string;
    user_metadata: Record<string, unknown>;
  } | null;
} = {}) {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user },
        error: null,
      })),
    },
  };
}

function verifyHandoffToken(token: string) {
  const [encodedPayload, signature] = token.split(".");
  const expectedSignature = createHmac("sha256", API_GATEWAY_SECRET)
    .update(encodedPayload ?? "")
    .digest("base64url");

  expect(signature).toBe(expectedSignature);

  return JSON.parse(
    Buffer.from(encodedPayload ?? "", "base64url").toString("utf8"),
  ) as Record<string, unknown>;
}
