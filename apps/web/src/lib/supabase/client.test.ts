import { createBrowserClient } from "@supabase/ssr";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient, createOptionalBrowserClient } from "./client";

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: vi.fn((url: string, anonKey: string) => ({
    anonKey,
    url,
  })),
}));

const originalEnv = { ...process.env };

describe("supabase browser client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.STREAMOS_DEMO_MODE;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns null when browser Supabase env vars are missing", () => {
    expect(createOptionalBrowserClient()).toBeNull();
    expect(createBrowserClient).not.toHaveBeenCalled();
  });

  it("keeps createClient fail-fast for callers that require Supabase", () => {
    expect(() => createClient()).toThrow(
      "Missing browser Supabase environment variables.",
    );
  });

  it("creates a browser client when Supabase env vars are present", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-key";

    expect(createOptionalBrowserClient()).toEqual({
      anonKey: "publishable-key",
      url: "https://project.supabase.co",
    });
    expect(createBrowserClient).toHaveBeenCalledWith(
      "https://project.supabase.co",
      "publishable-key",
    );
  });

  it("keeps legacy anon key support for existing local environments", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

    expect(createOptionalBrowserClient()).toEqual({
      anonKey: "anon-key",
      url: "https://project.supabase.co",
    });
    expect(createBrowserClient).toHaveBeenCalledWith(
      "https://project.supabase.co",
      "anon-key",
    );
  });

  it("falls back to the legacy anon key when publishable key is blank", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "   ";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

    expect(createOptionalBrowserClient()).toEqual({
      anonKey: "anon-key",
      url: "https://project.supabase.co",
    });
    expect(createBrowserClient).toHaveBeenCalledWith(
      "https://project.supabase.co",
      "anon-key",
    );
  });

  it("does not create a browser client in demo mode", () => {
    process.env.STREAMOS_DEMO_MODE = "true";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-key";

    expect(createOptionalBrowserClient()).toBeNull();
    expect(createBrowserClient).not.toHaveBeenCalled();
  });
});
