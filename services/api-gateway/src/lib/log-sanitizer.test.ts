import { describe, expect, it } from "vitest";

import {
  sanitizeErrorForLog,
  sanitizeLogMetadata,
  sanitizeUrlForLog,
} from "./log-sanitizer.js";

class ProviderError extends Error {
  code = "provider_failed";
  status = 503;
  statusCode = 502;
}

describe("gateway log sanitizer", () => {
  it("keeps safe error metadata and removes stack/token-like details", () => {
    const error = new ProviderError(
      "provider failed access_token=secret-token bearer sk-secret-key",
    );
    error.stack =
      "ProviderError: provider failed\n    at https://provider.example/callback?token=secret";

    const payload = sanitizeErrorForLog(error);
    const serialized = JSON.stringify(payload);

    expect(payload).toMatchObject({
      code: "provider_failed",
      name: "Error",
      status: 503,
      statusCode: 502,
    });
    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain("sk-secret-key");
    expect(serialized).not.toContain("provider.example");
    expect(serialized).not.toContain("callback?token");
    expect(serialized).not.toContain(" at ");
  });

  it("removes querystrings and fragments from URL/topic metadata", () => {
    const payload = sanitizeUrlForLog(
      "https://example.com/path/to/feed?access_token=secret#fragment",
    );
    const serialized = JSON.stringify(payload);

    expect(payload).toEqual({
      host: "example.com",
      pathname: "/path/to/feed",
      protocol: "https:",
    });
    expect(serialized).not.toContain("access_token");
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("fragment");
  });

  it("returns a placeholder for invalid URLs or topics", () => {
    expect(sanitizeUrlForLog("not a url with token=secret")).toBe(
      "[invalid-url]",
    );
  });

  it("sanitizes providerRoutes best-effort tracking metadata", () => {
    const error = new Error(
      "Supabase request failed https://db.example/rest/v1?apikey=secret",
    );
    const payload = sanitizeLogMetadata({
      error,
      provider: "youtube",
      reason: "tracking_failed",
      route: "websub_challenge",
      topic:
        "https://www.youtube.com/feeds/videos.xml?channel_id=secret-channel&hub.verify_token=secret",
    });
    const serialized = JSON.stringify(payload);

    expect(payload).toMatchObject({
      provider: "youtube",
      reason: "tracking_failed",
      route: "websub_challenge",
    });
    expect(serialized).toContain("www.youtube.com");
    expect(serialized).toContain("/feeds/videos.xml");
    expect(serialized).not.toContain("secret-channel");
    expect(serialized).not.toContain("hub.verify_token");
    expect(serialized).not.toContain("apikey");
  });

  it("sanitizes OAuth and platform connection failure metadata", () => {
    const payload = sanitizeLogMetadata({
      error: new ProviderError(
        "callback failed refresh_token=secret-token https://oauth.example/cb?code=secret",
      ),
      hasChannelId: true,
      hasConnectionId: true,
      hasUserId: true,
      provider: "youtube",
      reason: "registration_failed",
      route: "oauth_connect",
    });
    const serialized = JSON.stringify(payload);

    expect(payload).toMatchObject({
      hasChannelId: true,
      hasConnectionId: true,
      hasUserId: true,
      provider: "youtube",
      reason: "registration_failed",
      route: "oauth_connect",
    });
    expect(serialized).toContain("provider_failed");
    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain("oauth.example");
    expect(serialized).not.toContain("code=secret");
  });
});
