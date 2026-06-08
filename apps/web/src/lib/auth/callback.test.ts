import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleAuthCallback, handleEmailConfirmation } from "./callback";
import { GET as confirmRouteGET } from "@/app/auth/confirm/route";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ensureCreatorForUser } from "@/lib/supabase/creator";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/config", () => ({
  isSupabaseConfigured: vi.fn(),
}));

vi.mock("@/lib/supabase/creator", () => ({
  ensureCreatorForUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

const mockIsSupabaseConfigured = vi.mocked(isSupabaseConfigured);
const mockEnsureCreatorForUser = vi.mocked(ensureCreatorForUser);
const mockCreateClient = vi.mocked(createClient);

function createSupabaseMock() {
  return {
    auth: {
      exchangeCodeForSession: vi.fn(async () => ({
        error: null as Error | null,
      })),
      getUser: vi.fn(async () => ({
        data: {
          user: {
            email: "creator@example.com",
            id: "11111111-1111-4111-8111-111111111111",
            user_metadata: { name: "Creator" },
          },
        },
        error: null as Error | null,
      })),
      verifyOtp: vi.fn(async () => ({ error: null as Error | null })),
    },
  };
}

describe("handleAuthCallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsSupabaseConfigured.mockReturnValue(true);
    mockEnsureCreatorForUser.mockResolvedValue({
      display_name: "Creator",
      handle: null,
      id: "22222222-2222-4222-8222-222222222222",
      niche: null,
      onboarding_completed: false,
    });
  });

  it("exchanges a PKCE code and redirects to dashboard", async () => {
    const supabase = createSupabaseMock();
    mockCreateClient.mockResolvedValue(supabase as never);

    const response = await handleAuthCallback(
      new NextRequest("http://localhost/auth/callback?code=auth-code"),
    );

    expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledWith(
      "auth-code",
    );
    expect(mockEnsureCreatorForUser).toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "http://localhost/dashboard?message=email-confirmed",
    );
  });

  it("verifies token_hash email confirmations through the route handler", async () => {
    const supabase = createSupabaseMock();
    mockCreateClient.mockResolvedValue(supabase as never);

    const response = await confirmRouteGET(
      new NextRequest(
        "http://localhost/auth/confirm?token_hash=token-hash&type=email",
      ),
    );

    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({
      token_hash: "token-hash",
      type: "email",
    });
    expect(response.headers.get("location")).toBe("http://localhost/dashboard");
  });

  it("redirects failed email confirmations to auth login with typed error", async () => {
    const supabase = createSupabaseMock();
    supabase.auth.verifyOtp.mockResolvedValueOnce({
      error: new Error("expired token"),
    });
    mockCreateClient.mockResolvedValue(supabase as never);

    const response = await handleEmailConfirmation(
      new NextRequest(
        "http://localhost/auth/confirm?token_hash=expired-token&type=email",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost/auth/login?error=confirmation_failed",
    );
  });

  it("rejects non-email tokens on the email confirmation route", async () => {
    const supabase = createSupabaseMock();
    mockCreateClient.mockResolvedValue(supabase as never);

    const response = await handleEmailConfirmation(
      new NextRequest(
        "http://localhost/auth/confirm?token_hash=token-hash&type=recovery",
      ),
    );

    expect(supabase.auth.verifyOtp).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "http://localhost/auth/login?error=confirmation_failed",
    );
  });

  it("redirects recovery links to reset-password without creator bootstrap", async () => {
    const supabase = createSupabaseMock();
    mockCreateClient.mockResolvedValue(supabase as never);

    const response = await handleAuthCallback(
      new NextRequest(
        "http://localhost/auth/confirm?token_hash=token-hash&type=recovery",
      ),
    );

    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({
      token_hash: "token-hash",
      type: "recovery",
    });
    expect(mockEnsureCreatorForUser).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "http://localhost/auth/update-password",
    );
  });

  it("redirects invalid callbacks with typed errors", async () => {
    const response = await handleAuthCallback(
      new NextRequest("http://localhost/auth/callback"),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost/auth/login?error=missing_callback_params",
    );
  });
});
