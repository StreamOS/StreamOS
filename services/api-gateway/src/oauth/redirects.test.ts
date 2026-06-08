import { describe, expect, it } from "vitest";

import {
  resolveOAuthErrorRedirect,
  resolveOAuthRedirectTarget,
  resolveYouTubeOAuthErrorRedirect,
} from "./redirects.js";

describe("OAuth redirect resolution", () => {
  it("allows relative return_to paths", () => {
    expect(
      resolveOAuthRedirectTarget({
        allowedOrigins: [],
        returnTo: "/dashboard/platforms",
      }),
    ).toBe("/dashboard/platforms");
  });

  it("allows absolute return_to URLs with an allowlisted origin", () => {
    expect(
      resolveOAuthRedirectTarget({
        allowedOrigins: ["https://app.streamos.test"],
        returnTo: "https://app.streamos.test/dashboard/platforms",
      }),
    ).toBe("https://app.streamos.test/dashboard/platforms");
  });

  it("falls back for unsafe absolute or protocol-relative return_to URLs", () => {
    expect(
      resolveOAuthRedirectTarget({
        allowedOrigins: ["https://app.streamos.test"],
        fallbackPath: "/dashboard/integrations",
        returnTo: "https://evil.example/phishing",
      }),
    ).toBe("/dashboard/integrations");

    expect(
      resolveOAuthRedirectTarget({
        allowedOrigins: ["https://app.streamos.test"],
        fallbackPath: "/dashboard/integrations",
        returnTo: "//evil.example/phishing",
      }),
    ).toBe("/dashboard/integrations");
  });

  it("adds the YouTube error marker to the fallback redirect", () => {
    expect(
      resolveYouTubeOAuthErrorRedirect({
        allowedOrigins: [],
        fallbackPath: "/dashboard/integrations",
      }),
    ).toBe("/dashboard/integrations?error=youtube_connect_failed");
  });

  it("adds provider-specific error markers to generic OAuth redirects", () => {
    expect(
      resolveOAuthErrorRedirect({
        allowedOrigins: [],
        fallbackPath: "/dashboard/integrations",
        provider: "tiktok",
      }),
    ).toBe("/dashboard/integrations?error=tiktok_oauth_failed");

    expect(
      resolveOAuthErrorRedirect({
        allowedOrigins: [],
        fallbackPath: "/dashboard/integrations",
        provider: "kick",
      }),
    ).toBe("/dashboard/integrations?error=kick_oauth_failed");
  });

  it("preserves safe absolute fallback URLs for OAuth errors", () => {
    expect(
      resolveOAuthErrorRedirect({
        allowedOrigins: ["https://app.streamos.test"],
        fallbackPath: "https://app.streamos.test/dashboard/platforms",
        provider: "tiktok",
      }),
    ).toBe(
      "https://app.streamos.test/dashboard/platforms?error=tiktok_oauth_failed",
    );
  });
});
