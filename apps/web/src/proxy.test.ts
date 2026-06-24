import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import type { NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config, proxy } from "./proxy";
import { getSupabaseConfig } from "@/lib/supabase/config";

vi.mock("@/lib/supabase/config", () => ({
  getSupabaseConfig: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(),
}));

const mockGetSupabaseConfig = vi.mocked(getSupabaseConfig);
const mockCreateServerClient = vi.mocked(createServerClient);

type CookieSetOptions = Parameters<NextResponse["cookies"]["set"]>[2];

type CookieToSet = {
  name: string;
  options?: CookieSetOptions;
  value: string;
};

type ServerClientOptions = {
  cookies: {
    getAll(): { name: string; value: string }[];
    setAll(cookiesToSet: CookieToSet[]): void;
  };
};

const testUser = {
  id: "11111111-1111-4111-8111-111111111111",
} as User;

function mockAuthResult({
  error = null,
  onCreate,
  user,
}: {
  error?: Error | null;
  onCreate?: (options: ServerClientOptions) => void;
  user: User | null;
}) {
  mockCreateServerClient.mockImplementation(((
    _url: string,
    _key: string,
    options: ServerClientOptions,
  ) => {
    onCreate?.(options);

    return {
      auth: {
        getUser: vi.fn(async () => ({
          data: { user },
          error,
        })),
      },
    };
  }) as never);
}

describe("proxy auth guards", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSupabaseConfig.mockReturnValue({
      anonKey: "anon-key",
      url: "http://supabase.local",
    });
  });

  it("redirects unauthenticated dashboard requests to login with next path", async () => {
    mockAuthResult({ user: null });

    const response = await proxy(
      new NextRequest("http://localhost/dashboard/clips?status=failed"),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost/auth/login?error=unauthorized&next=%2Fdashboard%2Fclips%3Fstatus%3Dfailed",
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("redirects authenticated auth-page requests to dashboard", async () => {
    mockAuthResult({ user: testUser });

    const response = await proxy(
      new NextRequest("http://localhost/auth/login"),
    );

    expect(response.headers.get("location")).toBe("http://localhost/dashboard");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("allows update-password for authenticated recovery sessions", async () => {
    mockAuthResult({ user: testUser });

    const response = await proxy(
      new NextRequest("http://localhost/auth/update-password"),
    );

    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("allows verify-email for authenticated unconfirmed sessions", async () => {
    mockAuthResult({ user: testUser });

    const response = await proxy(
      new NextRequest("http://localhost/auth/verify-email"),
    );

    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("sets refreshed Supabase session cookies with production-safe attributes", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mockAuthResult({
      onCreate: (options) => {
        options.cookies.setAll([
          {
            name: "sb-test-auth-token",
            options: { path: "/" },
            value: "fresh-token",
          },
        ]);
      },
      user: testUser,
    });

    const response = await proxy(new NextRequest("http://localhost/dashboard"));
    const setCookieHeader = response.headers.get("set-cookie") ?? "";

    expect(response.headers.get("location")).toBeNull();
    expect(setCookieHeader).toContain("sb-test-auth-token=fresh-token");
    expect(setCookieHeader.toLowerCase()).toContain("samesite=lax");
    expect(setCookieHeader).toContain("Secure");
  });

  it("clears stale Supabase auth cookies and redirects expired sessions to login", async () => {
    mockAuthResult({
      error: new Error("Invalid Refresh Token"),
      user: null,
    });

    const response = await proxy(
      new NextRequest("http://localhost/dashboard", {
        headers: {
          cookie: "sb-test-auth-token=stale-token; unrelated=value",
        },
      }),
    );
    const setCookieHeader = response.headers.get("set-cookie") ?? "";

    expect(response.headers.get("location")).toBe(
      "http://localhost/auth/login?error=session_expired&next=%2Fdashboard",
    );
    expect(setCookieHeader).toContain("sb-test-auth-token=");
    expect(setCookieHeader.toLowerCase()).toContain("max-age=0");
    expect(setCookieHeader).not.toContain("unrelated=");
  });

  it("excludes Next internals, API auth routes, and static assets from the matcher", () => {
    expect(config.matcher).toEqual([
      "/((?!_next/|api/auth/|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml|json|woff|woff2|ttf)$).*)",
    ]);
  });
});
